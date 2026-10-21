begin;
set local role service_role;
do $$
declare a text:=encode(extensions.gen_random_bytes(32),'hex'); b text:=encode(extensions.gen_random_bytes(32),'hex');
  c text:=encode(extensions.gen_random_bytes(32),'hex'); ip text:=encode(extensions.gen_random_bytes(32),'hex');
  x jsonb; y jsonb; code text; room uuid; rid uuid; old_rid uuid; pa uuid; pb uuid; pc uuid; sa uuid; sb uuid; sc uuid; bot uuid; n integer;
begin
  x:=public.lobby_command('create',jsonb_build_object('requestId',gen_random_uuid(),'language','fr'),a,ip);
  code:=x#>>'{room,code}';room:=(x#>>'{room,id}')::uuid;pa:=(x->>'meId')::uuid;
  x:=public.lobby_command('join',jsonb_build_object('code',code),b,ip);pb:=(x->>'meId')::uuid;
  x:=public.lobby_command('join',jsonb_build_object('code',code),c,ip);pc:=(x->>'meId')::uuid;
  perform public.lobby_command('ready',jsonb_build_object('code',code,'ready',true),a,ip);
  perform public.lobby_command('ready',jsonb_build_object('code',code,'ready',true),b,ip);
  perform public.lobby_command('ready',jsonb_build_object('code',code,'ready',true),c,ip);
  x:=public.lobby_command('start',jsonb_build_object('code',code,'_aiReady',true),a,ip);
  for n in 1..3 loop
    assert x->>'error' is null,'round start succeeds';
    rid:=(x#>>'{round,id}')::uuid;
    assert (x#>>'{round,number}')::integer=n,'monotonic round number';
    assert x#>>'{room,phase}'='chat','new round begins in chat';
    assert x->'leaderboard' is null,'no cross-round identity leaks during chat';
    assert x#>'{round,result}' is null,'no pre-reveal points';
    assert x#>>'{round,topic}' !~ '^(Describe|Which|What)','French topic retained';
    assert (select count(*) from game.participants where round_id=rid)=4,'three humans plus exactly one bot';
    assert (select extract(epoch from deadline-now()) from game.rounds where id=rid)=180,'chat deadline remains 180 seconds';
    if n=2 then
      y:=public.lobby_command('next',jsonb_build_object('code',code,'roundId',old_rid,'_aiReady',true),a,ip);
      assert y#>>'{round,id}'=rid::text,'retry after lost response never skips a round';
    end if;
    y:=public.lobby_command('next',jsonb_build_object('code',code,'roundId',rid,'_aiReady',true),a,ip);
    assert y->>'error'='ROUND_IN_PROGRESS','cannot skip active round';
    select id into sa from game.participants where round_id=rid and player_id=pa;
    select id into sb from game.participants where round_id=rid and player_id=pb;
    select id into sc from game.participants where round_id=rid and player_id=pc;
    select id into bot from game.participants where round_id=rid and player_id is null;
    update game.rounds set phase='vote',deadline=now()+interval '30 seconds' where id=rid;
    update game.rooms set phase='vote',phase_deadline=now()+interval '30 seconds' where id=room;
    if n=1 then
      perform public.lobby_command('vote',jsonb_build_object('code',code,'targetId',sb),a,ip);
      perform public.lobby_command('vote',jsonb_build_object('code',code,'targetId',sc),b,ip);
      perform public.lobby_command('vote',jsonb_build_object('code',code,'targetId',sa),c,ip);
    elsif n=2 then
      perform public.lobby_command('vote',jsonb_build_object('code',code,'targetId',bot),a,ip);
      perform public.lobby_command('vote',jsonb_build_object('code',code,'targetId',bot),b,ip);
      perform public.lobby_command('vote',jsonb_build_object('code',code,'targetId',bot),c,ip);
    else
      perform public.lobby_command('vote',jsonb_build_object('code',code,'targetId',sb),a,ip);
      perform public.lobby_command('vote',jsonb_build_object('code',code,'targetId',bot),b,ip);
      perform public.lobby_command('vote',jsonb_build_object('code',code,'targetId',sb),c,ip);
    end if;
    update game.rounds set deadline=now()-interval '1 second' where id=rid;
    update game.rooms set phase_deadline=now()-interval '1 second' where id=room;
    y:=public.lobby_command('vote',jsonb_build_object('code',code,'targetId',bot),a,ip);
    assert y->>'error'='VOTE_CLOSED','late votes rejected at server deadline';
    perform game.advance_round(room);perform game.advance_round(room);
    x:=public.lobby_command('state',jsonb_build_object('code',code),a,ip);
    assert (select count(*) from game.round_scores where round_id=rid)=3,'one score per eligible human despite retries';
    assert jsonb_array_length(x#>'{round,reveal,votes}')=3,'every human vote revealed';
    if n=1 then
      assert (select bool_and(delta=-1) from game.round_scores where round_id=rid),'all tied most accused lose one';
      assert x#>>'{round,result,aiWon}'='true','majority human votes means AI wins';
    elsif n=2 then
      assert (select bool_and(delta=1) from game.round_scores where round_id=rid),'correct votes earn one';
      assert x#>>'{round,result,aiWon}'='false','bot detected by humans';
    else
      assert (select bool_and(delta=0) from game.round_scores where round_id=rid),'correct-but-most-accused gets net zero';
    end if;
    if n<3 then
      assert x->'leaderboard' is null,'no cumulative identities between rounds';
      y:=public.lobby_command('next',jsonb_build_object('code',code,'roundId',rid,'_aiReady',true),b,ip);
      assert y->>'error'='HOST_ONLY','only host advances';
      old_rid:=rid;
      x:=public.lobby_command('next',jsonb_build_object('code',code,'roundId',rid,'_aiReady',true),a,ip);
    end if;
  end loop;
  assert x#>>'{room,phase}'='finished' and x#>>'{match,finished}'='true','finished only after three reveals';
  assert jsonb_array_length(x->'leaderboard')=3,'final human leaderboard';
  assert (select bool_and((p->>'score')::integer=0 and (p->>'rank')::integer=1) from jsonb_array_elements(x->'leaderboard') p),'totals and tied ranks';
  assert (select count(*) from jsonb_array_elements(x->'leaderboard') p where (p->>'me')::boolean)=1,'personal result card identity';
  y:=public.lobby_command('next',jsonb_build_object('code',code,'roundId',rid,'_aiReady',true),a,ip);
  assert y->>'error'='GAME_FINISHED','no fourth round';
  assert (select count(*) from game.rounds where room_id=room)=3,'exactly three rounds';
  assert (select count(*) from game.round_scores where player_id in(pa,pb,pc))=9,'idempotent scoring';
  assert not has_table_privilege('anon','game.round_scores','select'),'scores private';
  assert not has_function_privilege('authenticated','game.score_round(uuid)','execute'),'browser cannot assign points';
  -- Practice and cancellation remain unranked.
  x:=public.lobby_command('create',jsonb_build_object('requestId',gen_random_uuid()),a,ip);
  code:=x#>>'{room,code}';room:=(x#>>'{room,id}')::uuid;
  perform public.lobby_command('join',jsonb_build_object('code',code),b,ip);
  perform public.lobby_command('ready',jsonb_build_object('code',code,'ready',true),a,ip);
  perform public.lobby_command('ready',jsonb_build_object('code',code,'ready',true),b,ip);
  x:=public.lobby_command('start',jsonb_build_object('code',code,'practice',true,'_aiReady',true),a,ip);
  rid:=(x#>>'{round,id}')::uuid;
  update game.rounds set phase='reveal' where id=rid;
  perform game.score_round(rid);
  assert (select bool_and(delta=0) from game.round_scores where round_id=rid),'practice never awards points';
  x:=public.lobby_command('next',jsonb_build_object('code',code,'roundId',rid,'_aiReady',true),a,ip);
  rid:=(x#>>'{round,id}')::uuid;
  perform game.cancel_round(rid);perform game.score_round(rid);
  assert not exists(select 1 from game.round_scores where round_id=rid),'cancelled round not scored';
  update game.rooms set expires_at=now()-interval '1 second' where id=room;
  assert game.snapshot(room,pa) is null,'expired score access denied';
  delete from game.rooms where id=room;
  assert not exists(select 1 from game.round_scores s join game.rounds r on r.id=s.round_id where r.room_id=room),'score cleanup cascades';
end;
$$;
rollback;
