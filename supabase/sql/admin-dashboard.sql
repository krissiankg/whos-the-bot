-- Singleton owner administration. Players remain accountless. Provider keys
-- are encrypted by Supabase Vault, never stored in ordinary game rows.
create table game.admin_control (
  singleton boolean primary key default true check(singleton),
  bridge_hash text check(bridge_hash ~ '^[a-f0-9]{64}$'),
  setup_hash text check(setup_hash ~ '^[a-f0-9]{64}$'),
  setup_expires_at timestamptz,
  password_hash text,
  active_provider text not null default 'environment' check(active_provider in ('environment','nvidia','openai','disabled')),
  updated_at timestamptz not null default now()
);
insert into game.admin_control(singleton) values(true);
create table game.admin_sessions (
  token_hash text primary key check(token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null default now()+interval '8 hours'
);
create index admin_sessions_expiry_idx on game.admin_sessions(expires_at);
create table game.provider_keys (
  provider text primary key check(provider in ('nvidia','openai')),
  secret_id uuid,
  model text not null,
  last_test_at timestamptz,
  last_test_ok boolean,
  updated_at timestamptz not null default now()
);
insert into game.provider_keys(provider,model) values
  ('nvidia','nvidia/nemotron-3.5-lightning-30b-a3b'),('openai','gpt-4.1-mini-2025-04-14');
alter table game.admin_control enable row level security;
alter table game.admin_sessions enable row level security;
alter table game.provider_keys enable row level security;
revoke all on game.admin_control,game.admin_sessions,game.provider_keys from public,anon,authenticated;
grant select,insert,update,delete on game.admin_control,game.admin_sessions,game.provider_keys to service_role;

-- Internal Edge-only runtime access, intentionally distinct from the admin
-- status DTO. Never forward this RPC result to Next.js or to a browser.
create function public.provider_runtime(p_provider text default null) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare v_provider text; v_config game.provider_keys%rowtype; v_key text;
begin
  select active_provider into v_provider from game.admin_control where singleton;
  if p_provider is not null then
    if p_provider not in ('nvidia','openai') then return null; end if;
    v_provider:=p_provider;
  end if;
  if v_provider='environment' then return jsonb_build_object('managed',false); end if;
  if v_provider='disabled' then return jsonb_build_object('managed',true,'provider',null); end if;
  select * into v_config from game.provider_keys where provider=v_provider;
  if not found then return null; end if;
  if v_config.secret_id is not null then
    select decrypted_secret into v_key from vault.decrypted_secrets where id=v_config.secret_id;
  end if;
  return jsonb_build_object('managed',true,'provider',v_provider,'model',v_config.model,
    'apiKey',v_key,'hasStoredKey',v_config.secret_id is not null);
end;
$$;

create function game.admin_status() returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('initialized',c.password_hash is not null,
    'activeProvider',c.active_provider,'updatedAt',c.updated_at,
    'providers',(select jsonb_agg(jsonb_build_object('provider',p.provider,'saved',p.secret_id is not null,
      'model',p.model,'lastTestAt',p.last_test_at,'lastTestOk',p.last_test_ok) order by p.provider) from game.provider_keys p),
    'usage',jsonb_build_object('reservedCalls',coalesce((select least(hits,200) from game.rate_limits where bucket='ai-budget-reservations' and expires_at>now()),0),
      'callLimit',200,'resetsAt',(select expires_at from game.rate_limits where bucket='ai-budget-reservations' and expires_at>now()),
      'activeRooms',(select count(*) from game.rooms where expires_at>now() and phase in ('chat','vote'))))
  from game.admin_control c where singleton;
$$;

create function public.admin_command(p_bridge_hash text,p_session_hash text,p_action text,p_args jsonb,p_ip_hash text) returns jsonb
language plpgsql security invoker set search_path='' set statement_timeout='8s' as $$
declare c game.admin_control%rowtype; k game.provider_keys%rowtype;
  v_password text; v_provider text; v_key text; v_model text; v_secret uuid;
begin
  select * into c from game.admin_control where singleton for update;
  if c.bridge_hash is null or p_bridge_hash is distinct from c.bridge_hash then return jsonb_build_object('error','ADMIN_FORBIDDEN','status',403); end if;
  if p_action='bootstrap_status' then return jsonb_build_object('initialized',c.password_hash is not null); end if;
  if p_session_hash is null or p_session_hash !~ '^[a-f0-9]{64}$' then return jsonb_build_object('error','ADMIN_UNAUTHORIZED','status',401); end if;
  delete from game.admin_sessions where expires_at<=now();
  if p_action in ('setup','login') then
    if p_ip_hash is null or p_ip_hash !~ '^[a-f0-9]{64}$' then return jsonb_build_object('error','INVALID_REQUEST','status',400); end if;
    if not game.take_limit('admin-login:'||p_ip_hash,8,900) then return jsonb_build_object('error','ADMIN_RATE_LIMITED','status',429); end if;
    v_password:=p_args->>'password';
    if v_password is null or char_length(v_password) not between 12 and 128 then return jsonb_build_object('error','ADMIN_PASSWORD_LENGTH','status',400); end if;
    if p_action='setup' then
      if c.password_hash is not null or c.setup_expires_at is null or c.setup_expires_at<=now() or c.setup_hash is null
        or c.setup_hash is distinct from p_args->>'setupHash' then return jsonb_build_object('error','ADMIN_SETUP_REJECTED','status',403); end if;
      -- SHA-256 before bcrypt avoids bcrypt's 72-byte truncation with Unicode.
      update game.admin_control set password_hash=extensions.crypt(encode(extensions.digest(v_password,'sha256'),'hex'),extensions.gen_salt('bf',12)),
        setup_hash=null,setup_expires_at=null,updated_at=now() where singleton;
    elsif c.password_hash is null or extensions.crypt(encode(extensions.digest(v_password,'sha256'),'hex'),c.password_hash) is distinct from c.password_hash then
      return jsonb_build_object('error','ADMIN_BAD_PASSWORD','status',401);
    end if;
    if (select count(*) from game.admin_sessions)>=10 then delete from game.admin_sessions where token_hash=(select token_hash from game.admin_sessions order by expires_at limit 1); end if;
    insert into game.admin_sessions(token_hash) values(p_session_hash);
    return game.admin_status();
  end if;
  if not exists(select 1 from game.admin_sessions where token_hash=p_session_hash and expires_at>now()) then return jsonb_build_object('error','ADMIN_UNAUTHORIZED','status',401); end if;
  if not game.take_limit('admin-requests:'||p_session_hash,60,60) then return jsonb_build_object('error','ADMIN_RATE_LIMITED','status',429); end if;
  if p_action='logout' then
    delete from game.admin_sessions where token_hash=p_session_hash;
    return jsonb_build_object('ok',true);
  elsif p_action='activate' then
    v_provider:=p_args->>'provider';
    if v_provider is null or v_provider not in ('nvidia','openai','disabled') then return jsonb_build_object('error','INVALID_REQUEST','status',400); end if;
    update game.admin_control set active_provider=v_provider,updated_at=now() where singleton;
  elsif p_action in ('save','test','test_result') then
    v_provider:=p_args->>'provider';
    select * into k from game.provider_keys where provider=v_provider;
    if not found then return jsonb_build_object('error','INVALID_REQUEST','status',400); end if;
    if p_action='save' then
      v_model:=coalesce(p_args->>'model',k.model);
      if (v_provider='nvidia' and v_model<>'nvidia/nemotron-3.5-lightning-30b-a3b')
        or (v_provider='openai' and v_model not in ('gpt-4.1-mini-2025-04-14','gpt-4.1-mini')) then return jsonb_build_object('error','INVALID_REQUEST','status',400); end if;
      v_key:=btrim(p_args->>'apiKey');
      if v_key is not null and v_key<>'' then
        if char_length(v_key) not between 20 and 512 or v_key !~ '^[!-~]+$' then return jsonb_build_object('error','ADMIN_INVALID_KEY','status',400); end if;
        if k.secret_id is null then
          select vault.create_secret(v_key,'wtb-provider-'||v_provider||'-'||gen_random_uuid()::text,'Who''s the Bot server-only provider key') into v_secret;
        else
          perform vault.update_secret(k.secret_id,v_key); v_secret:=k.secret_id;
        end if;
      else v_secret:=k.secret_id;
      end if;
      update game.provider_keys set secret_id=v_secret,model=v_model,updated_at=now(),last_test_at=null,last_test_ok=null where provider=v_provider;
    elsif p_action='test' then
      if not game.take_limit('admin-tests:'||p_session_hash,5,60) or not game.take_limit('ai-budget-reservations',200,86400) then return jsonb_build_object('error','ADMIN_RATE_LIMITED','status',429); end if;
      -- Internal response only: Edge consumes the encrypted-key runtime DTO.
      return public.provider_runtime(v_provider);
    else
      if jsonb_typeof(p_args->'ok') is distinct from 'boolean' then return jsonb_build_object('error','INVALID_REQUEST','status',400); end if;
      update game.provider_keys set last_test_at=now(),last_test_ok=(p_args->>'ok')::boolean where provider=v_provider;
    end if;
  elsif p_action<>'status' then return jsonb_build_object('error','INVALID_REQUEST','status',400);
  end if;
  return game.admin_status();
end;
$$;

revoke all on function game.admin_status(),public.provider_runtime(text),public.admin_command(text,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function game.admin_status(),public.provider_runtime(text),public.admin_command(text,text,text,jsonb,text) to service_role;

-- Keep admin-session expiry under the same existing low-frequency sweep.
select cron.schedule('game-lobby-maintenance','10 seconds','select game.maintain_lobbies(); delete from game.admin_sessions where expires_at<=now();');
