create or replace function game.advance_round(p_room uuid) returns void
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
