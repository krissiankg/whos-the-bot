-- Upgrade after bot-resilience.sql. No live room is reset or inspected.
-- Apply atomically; keep the existing locks, scoring, safety and quotas.
begin;
do $upgrade$
declare definition text; before_text text; after_text text;
begin
  select pg_get_functiondef('game.advance_round_core(uuid)'::regprocedure) into definition;
  if position('-- human-opens-v1' in definition)=0 then
    before_text:=$old$  if r.phase='chat' and r.deadline>now() then$old$;
    after_text:=$new$  if r.phase='chat' and r.deadline>now() then
    -- human-opens-v1: retire pre-upgrade work generated without human context.
    -- This is not an AI/service failure and must never count toward its breaker.
    update game.bot_jobs job set status='failed',body=null,failure_code='awaiting_human',finished_at=now()
      where job.round_id=r.id and job.status in ('queued','sent','generating','ready')
      and not exists(select 1 from game.messages m join game.participants human on human.id=m.participant_id
        where m.round_id=r.id and human.player_id is not null and m.created_at<=job.created_at);$new$;
    if position(before_text in definition)=0 then raise exception 'Unexpected chat block'; end if;
    definition:=replace(definition,before_text,after_text);
    before_text:=$old$    if r.next_bot_at<=now() and r.deadline>now()+interval '15 seconds'$old$;
    after_text:=before_text||$new$
      and exists(select 1 from game.messages m join game.participants human on human.id=m.participant_id
        where m.round_id=r.id and human.player_id is not null)$new$;
    if position(before_text in definition)=0 then raise exception 'Unexpected queue block'; end if;
    definition:=replace(definition,before_text,after_text);
    before_text:=$old$    perform game.interrupt_round(r.id,'ai_service'); return;$old$;
    after_text:=$new$    if exists(select 1 from game.messages m join game.participants human on human.id=m.participant_id
      where m.round_id=r.id and human.player_id is not null) then
      perform game.interrupt_round(r.id,'ai_service');
    else
      -- No conversation took place: no bot reveal, no votes and no points.
      perform game.cancel_round(r.id);
    end if;
    return;$new$;
    if position(before_text in definition)=0 then raise exception 'Unexpected no-output guard'; end if;
    definition:=replace(definition,before_text,after_text);
    execute definition;
  end if;

  select pg_get_functiondef('public.bot_job_command(uuid,uuid,text,text)'::regprocedure) into definition;
  if position('-- human-context-v1' in definition)=0 then
    before_text:=$old$  if p_action='claim' then$old$;
    after_text:=$new$  -- human-context-v1: fail closed before reserving budget or accepting output.
  if not exists(select 1 from game.messages m join game.participants human on human.id=m.participant_id
    where m.round_id=r.id and human.player_id is not null and m.created_at<=j.created_at) then
    update game.bot_jobs set status='failed',body=null,failure_code='awaiting_human',finished_at=now()
      where id=j.id and status in ('queued','sent','generating','ready');
    return null;
  end if;
  if p_action='claim' then$new$;
    if position(before_text in definition)=0 then raise exception 'Unexpected claim guard'; end if;
    definition:=replace(definition,before_text,after_text);
    before_text:=$old$    return jsonb_build_object('language',$old$;
    after_text:=$new$    return jsonb_build_object('replyTo',case when not exists(
      select 1 from game.messages sent join game.participants bot on bot.id=sent.participant_id
      where sent.round_id=r.id and bot.player_id is null) then (
        select jsonb_build_object('nickname',game.localized_name(human.alias_index,(select language from game.rooms where id=room)),'text',m.body)
        from game.messages m join game.participants human on human.id=m.participant_id
        where m.round_id=r.id and human.player_id is not null order by m.created_at,m.id limit 1
      ) else null end,'language',$new$;
    if position(before_text in definition)=0 then raise exception 'Unexpected context block'; end if;
    definition:=replace(definition,before_text,after_text);
    execute definition;
  end if;

  select pg_get_functiondef('game.fail_bot_job(uuid,text)'::regprocedure) into definition;
  if position('-- ignore-unstarted-v1' in definition)=0 then
    before_text:=$old$from game.bot_jobs b where b.round_id=r.id order by b.created_at desc,b.id desc limit 3$old$;
    after_text:=$new$from game.bot_jobs b where b.round_id=r.id and b.failure_code is distinct from 'awaiting_human'
      -- ignore-unstarted-v1: skipped pre-upgrade work is not an upstream failure.
      order by b.created_at desc,b.id desc limit 3$new$;
    if position(before_text in definition)=0 then raise exception 'Unexpected failure breaker'; end if;
    execute replace(definition,before_text,after_text);
  end if;
end;
$upgrade$;
commit;

