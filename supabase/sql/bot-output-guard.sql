create function game.safe_bot_message(p_text text) returns boolean
language sql immutable security invoker set search_path='' as $$
  select game.safe_message(p_text) and char_length(p_text)<=180
    and lower(p_text) !~ '\m(ai|ia|bot|robot|assistant|model|prompt|openai|gpt|artificial intelligence)\M'
    and lower(p_text) !~ '(i am (an? |the )?human|i.m (an? |the )?human)';
$$;


create or replace function public.bot_job_command(p_job uuid,p_capability uuid,p_action text,p_body text default null) returns jsonb
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


revoke all on function game.safe_bot_message(text) from public,anon,authenticated; grant execute on function game.safe_bot_message(text) to service_role;
