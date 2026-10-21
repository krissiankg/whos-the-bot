-- Additive remote milestone. Apply once after guest_lobbies; retain lobby data.
alter function public.lobby_command(text,jsonb,text,text) rename to lobby_command_v1;
alter function game.snapshot(uuid,uuid) rename to snapshot_lobby;
alter table game.rounds add column practice boolean not null default false,
  add column pause_until timestamptz, add column remaining_seconds double precision,
  add column cancelled_reason text, add column next_bot_at timestamptz default now();
create table game.participants (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references game.rounds(id) on delete cascade,
  player_id uuid references game.players(id) on delete cascade,
  alias_index smallint not null check (alias_index between 1 and 7),
  position double precision not null default random(),
  unique(round_id,player_id), unique(round_id,alias_index)
);
create unique index participants_one_bot_idx on game.participants(round_id) where player_id is null;
create index participants_player_idx on game.participants(player_id);
alter table game.messages alter column author_id drop not null;
alter table game.messages add column participant_id uuid references game.participants(id) on delete cascade,
  add column request_id uuid;
create unique index messages_request_idx on game.messages(round_id, request_id);
create index messages_participant_idx on game.messages(participant_id);
create table game.ballots (
  round_id uuid not null references game.rounds(id) on delete cascade,
  voter_id uuid not null references game.participants(id) on delete cascade,
  target_id uuid not null references game.participants(id) on delete cascade,
  primary key(round_id,voter_id), check(voter_id <> target_id)
);
create index ballots_voter_idx on game.ballots(voter_id);
create index ballots_target_idx on game.ballots(target_id);
create table game.bot_jobs (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references game.rounds(id) on delete cascade,
  capability uuid not null default gen_random_uuid(),
  status text not null default 'queued' check(status in ('queued','sent','generating','ready','posted','failed')),
  created_at timestamptz not null default now(), started_at timestamptz,
  publish_at timestamptz, body text check(char_length(body) <= 180)
);
create unique index bot_jobs_active_idx on game.bot_jobs(round_id) where status in ('queued','sent','generating','ready');
create index bot_jobs_due_idx on game.bot_jobs(status, publish_at);
alter table game.participants enable row level security;
alter table game.ballots enable row level security;
alter table game.bot_jobs enable row level security;
grant select, insert, update, delete on game.participants,game.ballots,game.bot_jobs to service_role;
revoke all on game.participants,game.ballots,game.bot_jobs from public,anon,authenticated;

-- Basic EN/FR filter, not a substitute for human reporting. Applied inside the
-- authoritative gateway to both humans and generated output.
create function game.safe_message(p_text text) returns boolean
language sql immutable security invoker set search_path='' as $$
  select char_length(btrim(p_text)) between 1 and 280
    and p_text !~ '[[:cntrl:]]'
    and lower(p_text) !~ '(https?://|www\.|@|[0-9]{7,})'
    and lower(translate(p_text,'àâäéèêëîïôöùûüç','aaaeeeeiioouuuc'))
      !~ '\m(fuck\w*|shit|bitch\w*|asshole\w*|cunt\w*|nigg\w*|fagg\w*|kill yourself|kys|suicide|rape|porn\w*|sex\w*|merde|putain|salope\w*|connard\w*|encul\w*|pute\w*|va te tuer)\M';
$$;

create function game.safe_bot_message(p_text text) returns boolean
language sql immutable security invoker set search_path='' as $$
  select game.safe_message(p_text) and char_length(p_text)<=180
    and lower(p_text) !~ '\m(ai|ia|bot|robot|assistant|model|prompt|openai|gpt|artificial intelligence)\M'
    and lower(p_text) !~ '(i am (an? |the )?human|i.m (an? |the )?human)';
$$;

create function game.cancel_round(p_round uuid) returns void
language plpgsql security invoker set search_path='' as $$
begin
  update game.rounds set phase='cancelled',cancelled_reason='round_interrupted',pause_until=null where id=p_round;
  update game.bot_jobs set status='failed',body=null where round_id=p_round and status not in ('posted','failed');
  update game.rooms set phase='reveal',phase_deadline=null,version=version+1
    where id=(select room_id from game.rounds where id=p_round);
end;
$$;

create function game.advance_round(p_room uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare r game.rounds%rowtype; v_online integer; j game.bot_jobs%rowtype;
begin
  perform 1 from game.rooms where id=p_room and expires_at>now() for update;
  if not found then return; end if;
  select * into r from game.rounds where room_id=p_room order by number desc limit 1 for update;
  if not found or r.phase not in ('chat','vote') then return; end if;
  perform game.elect_host(p_room);
  select count(*) into v_online from game.participants s join game.players p on p.id=s.player_id
    where s.round_id=r.id and p.status='active' and p.last_seen>now()-interval '25 seconds';
  if r.pause_until is not null and r.pause_until<=now() then perform game.cancel_round(r.id); return; end if;
  if v_online<2 then
    if r.pause_until is null then
      update game.rounds set pause_until=now()+interval '60 seconds',remaining_seconds=greatest(0,extract(epoch from deadline-now())) where id=r.id;
      update game.rooms set version=version+1 where id=p_room;
    end if;
    return;
  elsif r.pause_until is not null then
    update game.rounds set deadline=now()+make_interval(secs=>r.remaining_seconds),pause_until=null,remaining_seconds=null where id=r.id returning * into r;
    update game.rooms set phase_deadline=r.deadline,version=version+1 where id=p_room;
  end if;
  if r.deadline<=now() then
    if r.phase='chat' then
      update game.rounds set phase='vote',deadline=r.deadline+interval '30 seconds' where id=r.id returning * into r;
      update game.bot_jobs set status='failed',body=null where round_id=r.id and status not in ('posted','failed');
      update game.rooms set phase='vote',phase_deadline=r.deadline,version=version+1 where id=p_room;
    end if;
    if r.phase='vote' and r.deadline<=now() then
      update game.rounds set phase='reveal' where id=r.id;
      update game.rooms set phase='reveal',phase_deadline=null,version=version+1 where id=p_room;
    end if;
  end if;
  if r.phase='chat' and r.deadline>now() then
    for j in select * from game.bot_jobs where round_id=r.id and status='ready' and publish_at<=now() for update loop
      insert into game.messages(room_id,round_id,participant_id,body,request_id)
        select p_room,r.id,id,j.body,j.id from game.participants where round_id=r.id and player_id is null;
      update game.bot_jobs set status='posted',body=null where id=j.id;
      update game.rounds set next_bot_at=now()+make_interval(secs=>18+random()*10) where id=r.id returning * into r;
      update game.rooms set version=version+1 where id=p_room;
    end loop;
    if exists(select 1 from game.bot_jobs where round_id=r.id and status='failed')
       or exists(select 1 from game.bot_jobs where round_id=r.id and status='queued' and created_at<now()-interval '50 seconds')
       or exists(select 1 from game.bot_jobs where round_id=r.id and status in ('sent','generating') and started_at<now()-interval '50 seconds') then
      perform game.cancel_round(r.id); return;
    end if;
    if r.next_bot_at<=now() and r.deadline>now()+interval '15 seconds'
      and (select count(*) from game.bot_jobs where round_id=r.id)<6
      and not exists(select 1 from game.bot_jobs where round_id=r.id and status in ('queued','sent','generating','ready')) then
      insert into game.bot_jobs(round_id) values(r.id);
    end if;
  end if;
end;
$$;

create function game.snapshot(p_room uuid,p_player uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare r game.rooms%rowtype; t game.rounds%rowtype; v_me uuid; v_result jsonb;
begin
  select * into r from game.rooms where id=p_room and expires_at>now();
  if not found then return null; end if;
  if r.phase='lobby' then return game.snapshot_lobby(p_room,p_player); end if;
  select * into t from game.rounds where room_id=p_room order by number desc limit 1;
  select id into v_me from game.participants where round_id=t.id and player_id=p_player;
  v_result:=jsonb_build_object(
    'room',jsonb_build_object('id',r.id,'code',r.code,'hostId',null,'language',r.language,'phase',r.phase,
      'deadline',r.phase_deadline,'version',r.version,'createdAt',r.created_at,'expiresAt',r.expires_at),
    'meId',v_me,'isHost',r.host_id=p_player,'serverNow',now(),
    'players',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,
      'name',(array['Orange Fox','Lilac Cat','Mint Frog','Pink Rabbit','Blue Bear','Golden Bird','Sky Owl'])[s.alias_index],
      'animal',(array['fox','cat','frog','rabbit','bear','bird','owl'])[s.alias_index],
      'color',(array['#ffad70','#c9b1ff','#9cddba','#f3b2c8','#99c6ef','#e7cf83','#9ecfe0'])[s.alias_index],
      'ready',true,'online',true) order by s.position) from game.participants s where s.round_id=t.id),'[]'::jsonb),
    'round',jsonb_build_object('id',t.id,'topic',t.topic,'phase',t.phase,'practice',t.practice,
      'pausedUntil',t.pause_until,'myVote',(select target_id from game.ballots where round_id=t.id and voter_id=v_me),
      'messages',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'playerId',m.participant_id,'text',m.body,'createdAt',m.created_at) order by m.created_at,m.id) from game.messages m where m.round_id=t.id),'[]'::jsonb),
      'reportedIds',coalesce((select jsonb_agg(x.message_id) from game.reports x join game.messages m on m.id=x.message_id where m.round_id=t.id and x.reporter_id=p_player),'[]'::jsonb),
      'hostReportIds',case when r.host_id=p_player then coalesce((select jsonb_agg(distinct x.message_id) from game.reports x join game.messages m on m.id=x.message_id where m.round_id=t.id),'[]'::jsonb) else '[]'::jsonb end));
  if t.phase='reveal' then
    v_result:=jsonb_set(v_result,'{round,reveal}',jsonb_build_object(
      'botId',(select id from game.participants where round_id=t.id and player_id is null),
      'votes',coalesce((select jsonb_agg(jsonb_build_object('voterId',s.id,'targetId',b.target_id) order by s.position)
        from game.participants s left join game.ballots b on b.round_id=s.round_id and b.voter_id=s.id
        where s.round_id=t.id and s.player_id is not null),'[]'::jsonb)));
  end if;
  return v_result;
end;
$$;

create function public.lobby_command(p_action text,p_args jsonb,p_session_hash text,p_ip_hash text) returns jsonb
language plpgsql security invoker set search_path='' set statement_timeout='5s' as $$
declare r game.rooms%rowtype; p game.players%rowtype; t game.rounds%rowtype;
  s game.participants%rowtype; target game.participants%rowtype; v_round uuid; v_slots integer[]; v_index integer:=0;
  v_count integer; v_request uuid; v_body text; v_result jsonb; v_message uuid;
begin
  if p_session_hash is null or p_session_hash !~ '^[a-f0-9]{64}$' or p_ip_hash is null or p_ip_hash !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('error','INVALID_SESSION','status',401);
  end if;
  if p_action='create' then return public.lobby_command_v1(p_action,p_args,p_session_hash,p_ip_hash); end if;
  select * into r from game.rooms where code=upper(p_args->>'code') and expires_at>now() for update;
  if not found then return public.lobby_command_v1(p_action,p_args,p_session_hash,p_ip_hash); end if;
  select * into p from game.players where room_id=r.id and session_hash=p_session_hash;
  if p.id is null or p.status<>'active' then
    if p_action='join' and r.phase='lobby' then return public.lobby_command_v1(p_action,p_args,p_session_hash,p_ip_hash); end if;
    return jsonb_build_object('error',case when p.status='kicked' then 'KICKED' else 'NOT_A_MEMBER' end,'status',403);
  end if;
  -- Reconnects restore the same seat during a round; newcomers may not enter.
  if p_action='join' and r.phase<>'lobby' then p_action:='state'; end if;
  if r.phase='lobby' and p_action in ('join','ready','kick','leave','state') then
    return public.lobby_command_v1(p_action,p_args,p_session_hash,p_ip_hash);
  end if;
  if not game.take_limit('requests:'||p.id,120,60) then return jsonb_build_object('error','RATE_LIMITED','status',429); end if;
  update game.players set last_seen=now() where id=p.id;
  perform game.elect_host(r.id);
  perform game.advance_round(r.id);
  select * into r from game.rooms where id=r.id;
  select * into t from game.rounds where room_id=r.id order by number desc limit 1;
  select * into s from game.participants where round_id=t.id and player_id=p.id;
  if p_action='start' then
    if r.host_id is distinct from p.id then return jsonb_build_object('error','HOST_ONLY','status',403); end if;
    if r.phase<>'lobby' then return jsonb_build_object('error','ROUND_IN_PROGRESS','status',409); end if;
    select count(*) into v_count from game.players where room_id=r.id and status='active';
    if v_count<2 or exists(select 1 from game.players where room_id=r.id and status='active' and (not ready or last_seen<=now()-interval '25 seconds')) then
      return jsonb_build_object('error','NOT_READY','status',409);
    end if;
    if v_count=2 and p_args->'practice' is distinct from 'true'::jsonb then return jsonb_build_object('error','PRACTICE_REQUIRED','status',409); end if;
    -- This flag is overwritten by the Edge Function, never trusted from users.
    if p_args->'_aiReady' is distinct from 'true'::jsonb then return jsonb_build_object('error','AI_NOT_CONFIGURED','status',503); end if;
    if not game.take_limit('round-ip:'||p_ip_hash,20,3600) or not game.take_limit('round-guest:'||p_session_hash,6,3600)
       or not game.take_limit('round-room:'||r.id,6,3600) then return jsonb_build_object('error','RATE_LIMITED','status',429); end if;
    insert into game.rounds(room_id,number,topic,deadline,practice) values(r.id,1,
      (array['Describe your perfect weekend.','Which harmless invention should exist?','What unusual food combination do you enjoy?','Which fictional place would you visit?','What tiny thing makes your day better?'])[1+floor(random()*5)::integer],
      now()+interval '180 seconds',v_count=2) returning id into v_round;
    select array_agg(x order by random()) into v_slots from generate_series(1,7) x;
    for p in select * from game.players where room_id=r.id and status='active' order by random() loop
      v_index:=v_index+1;
      insert into game.participants(round_id,player_id,alias_index) values(v_round,p.id,v_slots[v_index]);
    end loop;
    insert into game.participants(round_id,alias_index) values(v_round,v_slots[v_index+1]);
    update game.rooms set phase='chat',phase_deadline=now()+interval '180 seconds',version=version+1 where id=r.id;
    perform game.advance_round(r.id);
    -- Restore caller after the participant-allocation loop.
    select * into p from game.players where room_id=r.id and session_hash=p_session_hash;
  elsif p_action='message' then
    if r.phase<>'chat' or t.pause_until is not null then return jsonb_build_object('error','CHAT_CLOSED','status',409); end if;
    v_request:=(p_args->>'requestId')::uuid; v_body:=btrim(p_args->>'text');
    if v_request is null or v_body is null or not game.safe_message(v_body) then return jsonb_build_object('error','MESSAGE_REJECTED','status',400); end if;
    if exists(select 1 from game.messages where round_id=t.id and request_id=v_request and author_id=p.id) then return game.snapshot(r.id,p.id); end if;
    if exists(select 1 from game.messages where round_id=t.id and participant_id=s.id and created_at>now()-interval '2 seconds')
      or not game.take_limit('chat:'||s.id,15,60) then return jsonb_build_object('error','RATE_LIMITED','status',429); end if;
    if (select count(*) from game.messages where round_id=t.id and participant_id=s.id)>=40 then return jsonb_build_object('error','RATE_LIMITED','status',429); end if;
    insert into game.messages(room_id,round_id,author_id,participant_id,body,request_id) values(r.id,t.id,p.id,s.id,v_body,v_request);
    update game.rooms set version=version+1 where id=r.id;
  elsif p_action='vote' then
    if r.phase<>'vote' or t.pause_until is not null then return jsonb_build_object('error','VOTE_CLOSED','status',409); end if;
    select * into target from game.participants where round_id=t.id and id=(p_args->>'targetId')::uuid;
    if target.id is null or target.id=s.id then return jsonb_build_object('error','INVALID_TARGET','status',400); end if;
    if exists(select 1 from game.ballots where round_id=t.id and voter_id=s.id and target_id<>target.id) then return jsonb_build_object('error','VOTE_LOCKED','status',409); end if;
    insert into game.ballots values(t.id,s.id,target.id) on conflict do nothing;
    -- Keep the full fixed voting window; no count/progress hint exposes the bot.
    update game.rooms set version=version+1 where id=r.id;
  elsif p_action='report' then
    v_message:=(p_args->>'messageId')::uuid;
    if not exists(select 1 from game.messages where id=v_message and round_id=t.id) then return jsonb_build_object('error','INVALID_TARGET','status',400); end if;
    if not game.take_limit('reports:'||p.id,10,60) then return jsonb_build_object('error','RATE_LIMITED','status',429); end if;
    insert into game.reports(message_id,reporter_id) values(v_message,p.id) on conflict do nothing;
    update game.rooms set version=version+1 where id=r.id;
  elsif p_action='kick' then
    if r.host_id is distinct from p.id then return jsonb_build_object('error','HOST_ONLY','status',403); end if;
    select * into target from game.participants where round_id=t.id and id=(p_args->>'playerId')::uuid;
    if target.id is null or target.id=s.id then return jsonb_build_object('error','INVALID_TARGET','status',400); end if;
    -- Same response for humans and bot: stop without revealing identities.
    if target.player_id is not null then update game.players set status='kicked',ready=false where id=target.player_id; end if;
    perform game.cancel_round(t.id);
  elsif p_action='leave' then
    if t.phase in ('chat','vote') then perform game.cancel_round(t.id); end if;
    update game.players set status='left',ready=false where id=p.id;
    perform game.elect_host(r.id);
    return jsonb_build_object('ok',true,'roomId',r.id);
  elsif p_action<>'state' then return jsonb_build_object('error','INVALID_REQUEST','status',400);
  end if;
  return game.snapshot(r.id,p.id);
exception when invalid_text_representation or unique_violation then
  return jsonb_build_object('error','INVALID_REQUEST','status',400);
end;
$$;

-- A single-use capability authorizes each worker invocation. No browser can
-- claim work, supply context, select a model, or access bot membership.
create function public.bot_job_command(p_job uuid,p_capability uuid,p_action text,p_body text default null) returns jsonb
language plpgsql security invoker set search_path='' set statement_timeout='5s' as $$
declare j game.bot_jobs%rowtype; r game.rounds%rowtype; v_room uuid;
begin
  select t.room_id into v_room from game.bot_jobs b join game.rounds t on t.id=b.round_id where b.id=p_job and b.capability=p_capability;
  perform 1 from game.rooms where id=v_room and expires_at>now() for update;
  if not found then return null; end if;
  select * into j from game.bot_jobs where id=p_job for update;
  select * into r from game.rounds where id=j.round_id;
  if r.phase<>'chat' or r.pause_until is not null or r.deadline<=now()+interval '10 seconds' then return null; end if;
  if p_action='claim' then
    if j.status<>'sent' or j.started_at<now()-interval '40 seconds' then return null; end if;
    -- Conservative $0.005 reservation per bounded gpt-4.1-mini call, $1/24h
    -- fixed 24h window. Never refund failures or automatically retry generation.
    if not game.take_limit('ai-budget-reservations',200,86400) then
      perform game.cancel_round(r.id); return null;
    end if;
    update game.bot_jobs set status='generating' where id=j.id;
    return jsonb_build_object('topic',r.topic,'nickname',(select (array['Orange Fox','Lilac Cat','Mint Frog','Pink Rabbit','Blue Bear','Golden Bird','Sky Owl'])[alias_index] from game.participants where round_id=r.id and player_id is null),
      'messages',coalesce((select jsonb_agg(jsonb_build_object('nickname',(array['Orange Fox','Lilac Cat','Mint Frog','Pink Rabbit','Blue Bear','Golden Bird','Sky Owl'])[s.alias_index],'text',m.body) order by m.created_at)
        from (select * from game.messages where round_id=r.id order by created_at desc,id desc limit 12) m join game.participants s on s.id=m.participant_id),'[]'::jsonb));
  elsif p_action='finish' and j.status='generating' then
    if p_body is null or not game.safe_bot_message(p_body) then
      perform game.cancel_round(r.id);
    else
      update game.bot_jobs set status='ready',body=p_body,publish_at=now()+make_interval(secs=>2+random()*6) where id=j.id;
    end if;
    return jsonb_build_object('ok',true);
  end if;
  return null;
end;
$$;

create extension if not exists pg_net;
create or replace function game.maintain_lobbies() returns void
language plpgsql security invoker set search_path='' set statement_timeout='5s' as $$
declare v_id uuid; j game.bot_jobs%rowtype;
begin
  delete from game.rooms where expires_at<=now();
  delete from game.rate_limits where expires_at<=now();
  for v_id in select id from game.rooms where expires_at>now() for update skip locked loop
    perform game.elect_host(v_id); perform game.advance_round(v_id);
  end loop;
  -- At most four invocations/tick, none while idle. Jobs are committed before
  -- pg_net sends HTTP. Lost deliveries cancel safely; generation is never retried.
  for j in select b.* from game.bot_jobs b join game.rounds r on r.id=b.round_id join game.rooms g on g.id=r.room_id
    where b.status='queued' and r.phase='chat' and r.pause_until is null and g.expires_at>now()
    order by b.created_at limit 4 for update of b skip locked loop
    update game.bot_jobs set status='sent',started_at=now() where id=j.id;
    perform net.http_post(url:='https://ayvfdycfkavoeqbkplex.supabase.co/functions/v1/game-bot',
      body:=jsonb_build_object('jobId',j.id,'capability',j.capability),timeout_milliseconds:=35000);
  end loop;
end;
$$;

revoke all on all functions in schema game from public,anon,authenticated;
grant execute on all functions in schema game to service_role;
revoke all on function public.lobby_command(text,jsonb,text,text),public.lobby_command_v1(text,jsonb,text,text),public.bot_job_command(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.lobby_command(text,jsonb,text,text),public.bot_job_command(uuid,uuid,text,text) to service_role;
-- Existing 10-second maintenance schedule now calls the expanded routine.
