-- Schema source for the remote `guest_lobbies` migration. No browser role can
-- read these tables or invoke the command RPC. Only the Edge Function may do so.
create schema game;
revoke all on schema game from public, anon, authenticated;
grant usage on schema game to service_role;

create table game.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z]{4}$'),
  creator_hash text not null check (creator_hash ~ '^[a-f0-9]{64}$'),
  request_id uuid not null,
  host_id uuid,
  language text not null default 'en' check (language in ('en', 'fr')),
  phase text not null default 'lobby' check (phase in ('lobby', 'chat', 'vote', 'reveal', 'finished')),
  phase_deadline timestamptz,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  unique (creator_hash, request_id)
);
create index rooms_expiry_idx on game.rooms (expires_at);

create table game.players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references game.rooms(id) on delete cascade,
  session_hash text not null check (session_hash ~ '^[a-f0-9]{64}$'),
  alias_index smallint not null check (alias_index between 1 and 7),
  status text not null default 'active' check (status in ('active', 'left', 'kicked')),
  ready boolean not null default false,
  joined_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  unique (room_id, session_hash)
);
create unique index players_active_alias_idx on game.players (room_id, alias_index) where status = 'active';
create index players_session_idx on game.players (session_hash, room_id);
create index players_room_presence_idx on game.players (room_id, last_seen) where status = 'active';
alter table game.rooms add constraint rooms_host_fk foreign key (host_id) references game.players(id) on delete set null;
create index rooms_host_idx on game.rooms(host_id);

-- The play loop will populate these private tables in the following milestone.
create table game.rounds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references game.rooms(id) on delete cascade,
  number smallint not null check (number between 1 and 3),
  topic text not null,
  phase text not null default 'chat' check (phase in ('chat', 'vote', 'reveal', 'cancelled')),
  deadline timestamptz not null,
  unique (room_id, number)
);
create table game.messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references game.rooms(id) on delete cascade,
  round_id uuid not null references game.rounds(id) on delete cascade,
  author_id uuid not null references game.players(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 280),
  created_at timestamptz not null default now()
);
create index messages_room_idx on game.messages(room_id, created_at);
create index messages_round_idx on game.messages(round_id);
create index messages_author_idx on game.messages(author_id);
create table game.votes (
  round_id uuid not null references game.rounds(id) on delete cascade,
  voter_id uuid not null references game.players(id) on delete cascade,
  target_id uuid not null references game.players(id) on delete cascade,
  primary key (round_id, voter_id),
  check (voter_id <> target_id)
);
create index votes_voter_idx on game.votes(voter_id);
create index votes_target_idx on game.votes(target_id);
create table game.reports (
  message_id uuid not null references game.messages(id) on delete cascade,
  reporter_id uuid not null references game.players(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, reporter_id)
);
create index reports_reporter_idx on game.reports(reporter_id);
create table game.rate_limits (
  bucket text primary key,
  hits integer not null default 1,
  expires_at timestamptz not null
);
create index rate_limits_expiry_idx on game.rate_limits(expires_at);

alter table game.rooms enable row level security;
alter table game.players enable row level security;
alter table game.rounds enable row level security;
alter table game.messages enable row level security;
alter table game.votes enable row level security;
alter table game.reports enable row level security;
alter table game.rate_limits enable row level security;
grant select, insert, update, delete on all tables in schema game to service_role;
revoke all on all tables in schema game from public, anon, authenticated;

create function game.take_limit(p_bucket text, p_max integer, p_seconds integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_hits integer;
begin
  insert into game.rate_limits as limits (bucket, hits, expires_at)
  values (p_bucket, 1, now() + make_interval(secs => p_seconds))
  on conflict (bucket) do update set
    hits = case when limits.expires_at <= now() then 1 else least(limits.hits + 1, p_max + 1) end,
    expires_at = case when limits.expires_at <= now() then excluded.expires_at else limits.expires_at end
  returning hits into v_hits;
  return v_hits <= p_max;
end;
$$;

create function game.elect_host(p_room uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare v_host uuid; v_next uuid;
begin
  select host_id into v_host from game.rooms where id = p_room for update;
  if exists (select 1 from game.players where id = v_host and room_id = p_room and status = 'active' and last_seen > now() - interval '40 seconds') then return; end if;
  select id into v_next from game.players
    where room_id = p_room and status = 'active' and last_seen > now() - interval '25 seconds'
    order by joined_at, id limit 1;
  if v_next is distinct from v_host then
    update game.rooms set host_id = v_next, version = version + 1 where id = p_room;
  end if;
end;
$$;

create function game.snapshot(p_room uuid, p_player uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'room', jsonb_build_object('id', r.id, 'code', r.code, 'hostId', r.host_id,
      'language', r.language, 'phase', r.phase, 'deadline', r.phase_deadline,
      'version', r.version, 'createdAt', r.created_at, 'expiresAt', r.expires_at),
    'meId', p_player,
    'players', coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id,
      'name', (array['Orange Fox','Lilac Cat','Mint Frog','Pink Rabbit','Blue Bear','Golden Bird','Sky Owl'])[p.alias_index],
      'animal', (array['fox','cat','frog','rabbit','bear','bird','owl'])[p.alias_index],
      'color', (array['#ffad70','#c9b1ff','#9cddba','#f3b2c8','#99c6ef','#e7cf83','#9ecfe0'])[p.alias_index],
      'ready', p.ready, 'online', p.last_seen > now() - interval '25 seconds'
    ) order by p.joined_at, p.id) from game.players p where p.room_id = r.id and p.status = 'active'), '[]'::jsonb),
    'serverNow', now()
  ) from game.rooms r where r.id = p_room and r.expires_at > now();
$$;

create function public.lobby_command(p_action text, p_args jsonb, p_session_hash text, p_ip_hash text)
returns jsonb language plpgsql security invoker set search_path = '' set statement_timeout = '5s' as $$
declare
  v_room game.rooms%rowtype;
  v_player game.players%rowtype;
  v_target game.players%rowtype;
  v_slot smallint;
  v_code text;
  v_request uuid;
  v_attempt integer;
begin
  if p_session_hash is null or p_session_hash !~ '^[a-f0-9]{64}$' or p_ip_hash is null or p_ip_hash !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('error', 'INVALID_SESSION', 'status', 401);
  end if;
  if p_action not in ('create','join','state','ready','kick','leave') then
    return jsonb_build_object('error', 'INVALID_ACTION', 'status', 400);
  end if;
  if p_action = 'create' then
    v_request := (p_args->>'requestId')::uuid;
    if v_request is null then return jsonb_build_object('error', 'INVALID_REQUEST', 'status', 400); end if;
    -- Serializes retries from one guest, including concurrent create requests.
    perform pg_advisory_xact_lock(hashtextextended(p_session_hash, 0));
    select * into v_room from game.rooms where creator_hash = p_session_hash and request_id = v_request and expires_at > now() for update;
    if found then
      select * into v_player from game.players where room_id = v_room.id and session_hash = p_session_hash and status = 'active';
      if not found then return jsonb_build_object('error', 'SESSION_REVOKED', 'status', 403); end if;
      return game.snapshot(v_room.id, v_player.id);
    end if;
    if not game.take_limit('create-ip:' || p_ip_hash, 20, 3600) or not game.take_limit('create-guest:' || p_session_hash, 3, 3600) then
      return jsonb_build_object('error', 'RATE_LIMITED', 'status', 429);
    end if;
    for v_attempt in 1..20 loop
      v_code := '';
      for v_slot in 1..4 loop v_code := v_code || substr('ABCDEFGHJKLMNPQRSTUVWXYZ', 1 + floor(random()*24)::integer, 1); end loop;
      begin
        insert into game.rooms (code, creator_hash, request_id) values (v_code, p_session_hash, v_request) returning * into v_room;
        exit;
      exception when unique_violation then
        if v_attempt = 20 then return jsonb_build_object('error', 'ROOM_UNAVAILABLE', 'status', 503); end if;
      end;
    end loop;
    v_slot := 1 + floor(random()*7)::integer;
    insert into game.players(room_id, session_hash, alias_index) values (v_room.id, p_session_hash, v_slot) returning * into v_player;
    update game.rooms set host_id = v_player.id where id = v_room.id;
    return game.snapshot(v_room.id, v_player.id);
  end if;

  v_code := upper(coalesce(p_args->>'code',''));
  if v_code !~ '^[A-Z]{4}$' then return jsonb_build_object('error', 'INVALID_CODE', 'status', 400); end if;
  -- Rate-limit attempted code discovery as well as valid joins.
  if p_action = 'join' and (not game.take_limit('join-ip:' || p_ip_hash, 100, 3600) or not game.take_limit('join-guest:' || p_session_hash, 20, 60)) then
    return jsonb_build_object('error', 'RATE_LIMITED', 'status', 429);
  end if;
  select * into v_room from game.rooms where code = v_code and expires_at > now() for update;
  if not found then return jsonb_build_object('error', 'ROOM_NOT_FOUND', 'status', 404); end if;
  select * into v_player from game.players where room_id = v_room.id and session_hash = p_session_hash;

  if p_action = 'join' then
    if v_player.status = 'kicked' then return jsonb_build_object('error', 'KICKED', 'status', 403); end if;
    if v_room.phase <> 'lobby' then return jsonb_build_object('error', 'ROUND_IN_PROGRESS', 'status', 409); end if;
    if v_player.id is null or v_player.status = 'left' then
      if (select count(*) from game.players where room_id = v_room.id and status = 'active') >= 6 then
        return jsonb_build_object('error', 'ROOM_FULL', 'status', 409);
      end if;
      select s into v_slot from generate_series(1,7) s
        where not exists (select 1 from game.players where room_id = v_room.id and status = 'active' and alias_index = s)
        order by random() limit 1;
      insert into game.players(room_id,session_hash,alias_index) values(v_room.id,p_session_hash,v_slot)
        on conflict (room_id,session_hash) do update set status='active',ready=false,last_seen=now(),alias_index=excluded.alias_index
        returning * into v_player;
      update game.rooms set version = version + 1 where id = v_room.id;
    end if;
  elsif v_player.id is null or v_player.status <> 'active' then
    return jsonb_build_object('error', case when v_player.status = 'kicked' then 'KICKED' else 'NOT_A_MEMBER' end, 'status', 403);
  end if;

  if not game.take_limit('requests:' || v_player.id::text, 120, 60) then return jsonb_build_object('error', 'RATE_LIMITED', 'status', 429); end if;
  update game.players set last_seen = now() where id = v_player.id;
  perform game.elect_host(v_room.id);
  select * into v_room from game.rooms where id = v_room.id;

  if p_action = 'ready' then
    if jsonb_typeof(p_args->'ready') is distinct from 'boolean' then return jsonb_build_object('error', 'INVALID_REQUEST', 'status', 400); end if;
    update game.players set ready = (p_args->>'ready')::boolean where id = v_player.id;
    update game.rooms set version = version + 1 where id = v_room.id;
  elsif p_action = 'kick' then
    if v_room.host_id is distinct from v_player.id then return jsonb_build_object('error','HOST_ONLY','status',403); end if;
    if v_room.phase <> 'lobby' then return jsonb_build_object('error','ROUND_IN_PROGRESS','status',409); end if;
    select * into v_target from game.players where id = (p_args->>'playerId')::uuid and room_id = v_room.id and status = 'active';
    if not found or v_target.id = v_player.id then return jsonb_build_object('error','INVALID_TARGET','status',400); end if;
    update game.players set status = 'kicked', ready = false where id = v_target.id;
    update game.rooms set version = version + 1 where id = v_room.id;
  elsif p_action = 'leave' then
    update game.players set status = 'left', ready = false where id = v_player.id;
    perform game.elect_host(v_room.id);
    update game.rooms set version = version + 1 where id = v_room.id;
    return jsonb_build_object('ok',true,'roomId',v_room.id);
  end if;
  return game.snapshot(v_room.id, v_player.id);
end;
$$;

create function game.maintain_lobbies() returns void
language plpgsql security invoker set search_path = '' set statement_timeout = '5s' as $$
declare v_id uuid;
begin
  delete from game.rooms where expires_at <= now();
  delete from game.rate_limits where expires_at <= now();
  for v_id in select r.id from game.rooms r
    where r.phase = 'lobby' and not exists (select 1 from game.players p where p.id = r.host_id and p.status = 'active' and p.last_seen > now() - interval '40 seconds')
    for update of r skip locked
  loop perform game.elect_host(v_id); end loop;
end;
$$;

revoke all on all functions in schema game from public, anon, authenticated;
grant execute on all functions in schema game to service_role;
revoke all on function public.lobby_command(text,jsonb,text,text) from public, anon, authenticated;
grant execute on function public.lobby_command(text,jsonb,text,text) to service_role;

-- No HTTP invocations when idle; one database-only sweep every 10 seconds.
create extension if not exists pg_cron;
select cron.schedule('game-lobby-maintenance','10 seconds','select game.maintain_lobbies()');
