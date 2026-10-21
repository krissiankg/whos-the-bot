-- Additive remote upgrade after three-rounds.sql. No user data or keys removed.
begin;
alter table game.bot_jobs add column if not exists failure_code text,
  add column if not exists finished_at timestamptz;
create index if not exists bot_jobs_round_created_idx on game.bot_jobs(round_id,created_at desc,id desc);

create or replace function game.interrupt_round(p_round uuid,p_reason text) returns void
language plpgsql security invoker set search_path='' as $$
begin
  perform game.cancel_round(p_round);
  update game.rounds set cancelled_reason=case when p_reason in
    ('ai_configuration','ai_budget','ai_service','players_disconnected') then p_reason else 'round_interrupted' end
    where id=p_round;
end;
$$;

create or replace function game.fail_bot_job(p_job uuid,p_code text) returns void
language plpgsql security invoker set search_path='' as $$
declare j game.bot_jobs%rowtype; r game.rounds%rowtype; room uuid; code text; failures integer;
begin
  select t.room_id into room from game.bot_jobs b join game.rounds t on t.id=b.round_id where b.id=p_job;
  -- Same lock order as the gateway/cron: room, round, job. Never wait on a model here.
  perform 1 from game.rooms where id=room and expires_at>now() for update;
  if not found then return; end if;
  select * into j from game.bot_jobs where id=p_job;
  select * into r from game.rounds where id=j.round_id for update;
  if r.phase<>'chat' or j.status not in ('queued','sent','generating') then return; end if;
  code:=case when p_code in ('provider_auth','provider_rate_limit','provider_unavailable','provider_request',
    'provider_timeout','output_invalid','output_incomplete','output_filtered','configuration','worker_error','worker_timeout','budget')
    then p_code else 'worker_error' end;
  update game.bot_jobs set status='failed',body=null,failure_code=code,finished_at=now() where id=p_job;
  update game.rounds set next_bot_at=now()+case when code='provider_rate_limit' then interval '20 seconds' else interval '8 seconds' end where id=r.id;
  if code in ('provider_auth','provider_request','configuration','budget') then
    perform game.interrupt_round(r.id,case when code='budget' then 'ai_budget' else 'ai_configuration' end);
    return;
  end if;
  select count(*) filter(where recent.status='failed') into failures from
    (select b.status from game.bot_jobs b where b.round_id=r.id order by b.created_at desc,b.id desc limit 3) recent;
  if failures>=3 then perform game.interrupt_round(r.id,'ai_service'); end if;
end;
$$;

create or replace function public.bot_job_command(p_job uuid,p_capability uuid,p_action text,p_body text default null) returns jsonb
language plpgsql security invoker set search_path='' set statement_timeout='5s' as $$
declare j game.bot_jobs%rowtype; r game.rounds%rowtype; room uuid;
begin
  select t.room_id into room from game.bot_jobs b join game.rounds t on t.id=b.round_id where b.id=p_job and b.capability=p_capability;
  perform 1 from game.rooms where id=room and expires_at>now() for update;
  if not found then return null; end if;
  select * into j from game.bot_jobs where id=p_job for update;
  select * into r from game.rounds where id=j.round_id;
  if r.phase<>'chat' or r.pause_until is not null or r.deadline<=now()+interval '10 seconds' then return null; end if;
  if p_action='claim' then
    if j.status<>'sent' or j.started_at<now()-interval '40 seconds' then return null; end if;
    if not game.take_limit('ai-budget-reservations',200,86400) then
      perform game.fail_bot_job(j.id,'budget'); return null;
    end if;
    update game.bot_jobs set status='generating' where id=j.id;
    return jsonb_build_object('language',(select language from game.rooms where id=room),'topic',r.topic,
      'nickname',(select game.localized_name(alias_index,(select language from game.rooms where id=room)) from game.participants where round_id=r.id and player_id is null),
      'messages',coalesce((select jsonb_agg(jsonb_build_object('nickname',game.localized_name(s.alias_index,(select language from game.rooms where id=room)),'text',m.body) order by m.created_at)
        from (select * from game.messages where round_id=r.id order by created_at desc,id desc limit 12) m
        join game.participants s on s.id=m.participant_id),'[]'::jsonb));
  elsif p_action='fail' and j.status='generating' then
    perform game.fail_bot_job(j.id,p_body);
    return jsonb_build_object('ok',true,'accepted',false);
  elsif p_action='finish' and j.status='generating' then
    if p_body is null or not game.safe_bot_message(p_body) then
      perform game.fail_bot_job(j.id,case when p_body is null then 'worker_error' else 'output_filtered' end);
      return jsonb_build_object('ok',true,'accepted',false);
    end if;
    update game.bot_jobs set status='ready',body=p_body,failure_code=null,finished_at=now(),
      publish_at=now()+make_interval(secs=>2+random()*6) where id=j.id;
    return jsonb_build_object('ok',true,'accepted',true);
  end if;
  return null;
end;
$$;

revoke all on function game.interrupt_round(uuid,text),game.fail_bot_job(uuid,text),public.bot_job_command(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function game.interrupt_round(uuid,text),game.fail_bot_job(uuid,text),public.bot_job_command(uuid,uuid,text,text) to service_role;

-- Preserve the scoring wrapper, bilingual snapshot and all authorization code.
do $upgrade$
declare definition text; old_block text; replacement text;
begin
  select pg_get_functiondef('game.advance_round_core(uuid)'::regprocedure) into definition;
  if position('-- bot-resilience-v1' in definition)=0 then
    old_block:=$old$    if exists(select 1 from game.bot_jobs where round_id=r.id and status='failed')
       or exists(select 1 from game.bot_jobs where round_id=r.id and status='queued' and created_at<now()-interval '50 seconds')
       or exists(select 1 from game.bot_jobs where round_id=r.id and status in ('sent','generating') and started_at<now()-interval '50 seconds') then
      perform game.cancel_round(r.id); return;
    end if;$old$;
    replacement:=$new$    -- bot-resilience-v1: one bounded attempt per job, at most six jobs per round.
    for j in select * from game.bot_jobs where round_id=r.id and
      ((status='queued' and created_at<now()-interval '50 seconds') or
       (status in ('sent','generating') and started_at<now()-interval '50 seconds')) for update loop
      perform game.fail_bot_job(j.id,'worker_timeout');
    end loop;
    select * into r from game.rounds where id=r.id;
    if r.phase='cancelled' then return; end if;$new$;
    if position(old_block in definition)=0 then raise exception 'Unexpected advance_round_core failure guard'; end if;
    definition:=replace(definition,old_block,replacement);
    definition:=replace(definition,'if r.pause_until is not null and r.pause_until<=now() then perform game.cancel_round(r.id); return; end if;',
      'if r.pause_until is not null and r.pause_until<=now() then perform game.interrupt_round(r.id,''players_disconnected''); return; end if;');
    definition:=replace(definition,'  if r.deadline<=now() then',$guard$  if r.phase='chat' and r.deadline<=now() and not exists(select 1 from game.bot_jobs where round_id=r.id and status='posted') then
    perform game.interrupt_round(r.id,'ai_service'); return;
  end if;
  if r.deadline<=now() then$guard$);
    execute definition;
  end if;
  select pg_get_functiondef('game.snapshot(uuid,uuid)'::regprocedure) into definition;
  if position('-- cancellation-reason-v1' in definition)=0 then
    old_block:=$old$  result:=jsonb_set(result,'{round,number}',to_jsonb(t.number));$old$;
    if position(old_block in definition)=0 then raise exception 'Unexpected snapshot wrapper'; end if;
    definition:=replace(definition,old_block,old_block||$reason$
  -- cancellation-reason-v1: safe room-level reason, only after cancellation.
  if t.phase='cancelled' then
    result:=jsonb_set(result,'{round,cancelReason}',to_jsonb(case when t.cancelled_reason in
      ('ai_configuration','ai_budget','ai_service','players_disconnected') then t.cancelled_reason else 'round_interrupted' end));
  end if;$reason$);
    execute definition;
  end if;
end;
$upgrade$;
commit;

