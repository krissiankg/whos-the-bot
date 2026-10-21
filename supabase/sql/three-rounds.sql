-- Additive upgrade after bilingual.sql. No existing room/chat data is removed.
begin;
alter table game.rounds add column if not exists scored_at timestamptz,
  add column if not exists ai_won boolean;
create table if not exists game.round_scores (
  round_id uuid not null references game.rounds(id) on delete cascade,
  player_id uuid not null references game.players(id) on delete cascade,
  delta smallint not null check(delta between -1 and 1),
  found_bot boolean not null,
  accusations smallint not null check(accusations between 0 and 6),
  primary key(round_id,player_id)
);
create index if not exists round_scores_player_idx on game.round_scores(player_id);
alter table game.round_scores enable row level security;
revoke all on game.round_scores from public,anon,authenticated;
grant select,insert,update,delete on game.round_scores to service_role;

create or replace function game.score_round(p_round uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare r game.rounds%rowtype; room uuid; bot uuid; eligible integer; human_votes integer; most integer; ai_wins boolean;
begin
  select room_id into room from game.rounds where id=p_round;
  perform 1 from game.rooms where id=room and expires_at>now() for update;
  if not found then return; end if;
  select * into r from game.rounds where id=p_round for update;
  if r.phase<>'reveal' or r.scored_at is not null then return; end if;
  select id into bot from game.participants where round_id=r.id and player_id is null;
  select count(*) into eligible from game.participants where round_id=r.id and player_id is not null;
  select count(*) into human_votes from game.ballots b join game.participants target on target.id=b.target_id
    where b.round_id=r.id and target.player_id is not null;
  ai_wins:=human_votes*2>eligible;
  select coalesce(max(n),0) into most from (
    select count(b.voter_id) n from game.participants s left join game.ballots b on b.round_id=s.round_id and b.target_id=s.id
    where s.round_id=r.id and s.player_id is not null group by s.id
  ) counts;
  insert into game.round_scores(round_id,player_id,delta,found_bot,accusations)
    select r.id,s.player_id,
      case when r.practice then 0 else
        (case when mine.target_id=bot then 1 else 0 end)-
        (case when ai_wins and most>0 and count(accusers.voter_id)=most then 1 else 0 end) end,
      coalesce(mine.target_id=bot,false),count(accusers.voter_id)
    from game.participants s
    left join game.ballots mine on mine.round_id=s.round_id and mine.voter_id=s.id
    left join game.ballots accusers on accusers.round_id=s.round_id and accusers.target_id=s.id
    where s.round_id=r.id and s.player_id is not null
    group by s.id,s.player_id,mine.target_id;
  update game.rounds set scored_at=now(),ai_won=ai_wins where id=r.id;
  update game.rooms set phase=case when r.number=3 then 'finished' else 'reveal' end,
    phase_deadline=null,version=version+1 where id=room;
end;
$$;

-- Keep existing authorization, moderation and AI dispatch code intact.
do $$
declare definition text;
begin
  if to_regprocedure('game.advance_round_core(uuid)') is null then
    alter function game.advance_round(uuid) rename to advance_round_core;
  end if;
  if to_regprocedure('game.snapshot_core(uuid,uuid)') is null then
    alter function game.snapshot(uuid,uuid) rename to snapshot_core;
  end if;
  if to_regprocedure('public.lobby_command_core(text,jsonb,text,text)') is null then
    alter function public.lobby_command(text,jsonb,text,text) rename to lobby_command_core;
  end if;
  select pg_get_functiondef('public.lobby_command_core(text,jsonb,text,text)'::regprocedure) into definition;
  if position('values(r.id,1,' in definition)>0 then
    definition:=replace(definition,'values(r.id,1,','values(r.id,coalesce(t.number,0)+1,');
    execute definition;
  elsif position('values(r.id,coalesce(t.number,0)+1,' in definition)=0 then
    raise exception 'Unexpected start-round implementation';
  end if;
end;
$$;

create or replace function game.advance_round(p_room uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare latest uuid;
begin
  perform game.advance_round_core(p_room);
  select id into latest from game.rounds where room_id=p_room order by number desc limit 1;
  if latest is not null then perform game.score_round(latest); end if;
end;
$$;

create or replace function game.snapshot(p_room uuid,p_player uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb; r game.rooms%rowtype; t game.rounds%rowtype; standings jsonb;
begin
  result:=game.snapshot_core(p_room,p_player);
  if result is null or result->'round' is null then return result; end if;
  select * into r from game.rooms where id=p_room;
  select * into t from game.rounds where room_id=p_room order by number desc limit 1;
  result:=jsonb_set(result,'{round,number}',to_jsonb(t.number));
  result:=jsonb_set(result,'{match}',jsonb_build_object('totalRounds',3,'finished',r.phase='finished','practice',t.practice));
  if t.phase='reveal' and t.scored_at is not null then
    result:=jsonb_set(result,'{round,result}',jsonb_build_object('aiWon',t.ai_won,'scores',coalesce((
      select jsonb_agg(jsonb_build_object('participantId',s.id,'delta',points.delta,'foundBot',points.found_bot,'accusations',points.accusations) order by s.position)
      from game.participants s join game.round_scores points on points.round_id=s.round_id and points.player_id=s.player_id where s.round_id=t.id
    ),'[]'::jsonb)));
  end if;
  -- Persistent player IDs and cross-round totals are revealed only once all
  -- three rounds are over. No identity mapping or bot score leaks during chat.
  if r.phase='finished' then
    select coalesce(jsonb_agg(jsonb_build_object('id',ranked.id,'name',ranked.name,'animal',ranked.animal,'color',ranked.color,'score',ranked.score,'found',ranked.found,'me',ranked.id=p_player,'rank',ranked.rank) order by ranked.rank,ranked.name),'[]'::jsonb)
      into standings from (
        select totals.*,dense_rank() over(order by score desc) as rank from (
          select p.id,game.localized_name(p.alias_index,r.language) as name,
            (array['fox','cat','frog','rabbit','bear','bird','owl'])[p.alias_index] as animal,
            (array['#ffad70','#c9b1ff','#9cddba','#f3b2c8','#99c6ef','#e7cf83','#9ecfe0'])[p.alias_index] as color,
            coalesce(sum(sc.delta),0)::integer as score,count(*) filter(where sc.found_bot)::integer as found
          from game.players p join game.participants first on first.player_id=p.id
          join game.rounds first_round on first_round.id=first.round_id and first_round.number=1
          left join game.round_scores sc on sc.player_id=p.id
          where p.room_id=p_room group by p.id
        ) totals
      ) ranked;
    result:=jsonb_set(result,'{leaderboard}',standings);
  end if;
  return result;
end;
$$;

create or replace function public.lobby_command(p_action text,p_args jsonb,p_session_hash text,p_ip_hash text) returns jsonb
language plpgsql security invoker set search_path='' set statement_timeout='5s' as $$
declare result jsonb; r game.rooms%rowtype; t game.rounds%rowtype; previous game.rounds%rowtype; first_round uuid;
begin
  if p_action<>'next' then return public.lobby_command_core(p_action,p_args,p_session_hash,p_ip_hash); end if;
  -- Core state command reauthorizes guest membership, heartbeat, host election
  -- and lazy deadlines under the same room lock before any continuation.
  result:=public.lobby_command_core('state',p_args,p_session_hash,p_ip_hash);
  if result->>'error' is not null then return result; end if;
  select * into r from game.rooms where id=(result#>>'{room,id}')::uuid for update;
  if result->>'isHost' is distinct from 'true' then return jsonb_build_object('error','HOST_ONLY','status',403); end if;
  select * into t from game.rounds where room_id=r.id order by number desc limit 1 for update;
  select * into previous from game.rounds where id=(p_args->>'roundId')::uuid and room_id=r.id;
  if previous.id is null then return jsonb_build_object('error','INVALID_REQUEST','status',400); end if;
  if previous.number<t.number then return result; end if; -- idempotent retry
  if r.phase='finished' then return jsonb_build_object('error','GAME_FINISHED','status',409); end if;
  if t.phase<>'reveal' or t.scored_at is null then return jsonb_build_object('error','ROUND_IN_PROGRESS','status',409); end if;
  select id into first_round from game.rounds where room_id=r.id and number=1;
  if exists(select 1 from game.participants original join game.players p on p.id=original.player_id
      where original.round_id=first_round and (p.status<>'active' or p.last_seen<=now()-interval '25 seconds'))
    or (select count(*) from game.players where room_id=r.id and status='active')<>(select count(*) from game.participants where round_id=first_round and player_id is not null) then
    return jsonb_build_object('error','NOT_READY','status',409);
  end if;
  -- Lobby is an internal transactional transition only. Never broadcast it,
  -- allow new joiners or return it if starting the next round is rejected.
  begin
    update game.rooms set phase='lobby' where id=r.id;
    result:=public.lobby_command_core('start',p_args||jsonb_build_object('practice',t.practice),p_session_hash,p_ip_hash);
    if result->>'error' is not null then
      update game.rooms set phase='reveal',phase_deadline=null where id=r.id;
    end if;
    return result;
  end;
exception when invalid_text_representation then return jsonb_build_object('error','INVALID_REQUEST','status',400);
end;
$$;

revoke all on function game.score_round(uuid),game.advance_round(uuid),game.advance_round_core(uuid),game.snapshot(uuid,uuid),game.snapshot_core(uuid,uuid),public.lobby_command(text,jsonb,text,text),public.lobby_command_core(text,jsonb,text,text) from public,anon,authenticated;
grant execute on function game.score_round(uuid),game.advance_round(uuid),game.advance_round_core(uuid),game.snapshot(uuid,uuid),game.snapshot_core(uuid,uuid),public.lobby_command(text,jsonb,text,text),public.lobby_command_core(text,jsonb,text,text) to service_role;
do $fix$ declare definition text; begin
 select pg_get_functiondef('public.lobby_command_core(text,jsonb,text,text)'::regprocedure) into definition;
 if position('-- match-moderation' in definition)=0 then
  definition:=replace(definition,'elsif p_action=''kick'' then',$replacement$elsif p_action='kick' then
    -- match-moderation: completed reveals and final scores are immutable.
    if t.phase not in ('chat','vote') then return jsonb_build_object('error','INVALID_REQUEST','status',400); end if;$replacement$);
  execute definition;
 end if;
end; $fix$;
commit;
