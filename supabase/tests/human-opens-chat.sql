-- Run the complete transaction. Fake provider output only; never calls an API.
begin;
set local role service_role;
do $$
#variable_conflict use_variable
declare
  lang text; a text; b text; ip text; x jsonb; context jsonb; code text; room uuid; rid uuid;
  j game.bot_jobs%rowtype; first_id uuid; n integer; attempts integer; budget integer;
  first_text text; deadline_before timestamptz;
begin
  foreach lang in array array['en','fr'] loop
    a:=encode(extensions.gen_random_bytes(32),'hex'); b:=encode(extensions.gen_random_bytes(32),'hex');
    ip:=encode(extensions.gen_random_bytes(32),'hex');
    first_text:=case when lang='fr' then 'un week-end parfait commence par des crêpes' else 'a perfect weekend starts with pancakes' end;
    x:=public.lobby_command('create',jsonb_build_object('requestId',gen_random_uuid(),'language',lang),a,ip);
    room:=(x#>>'{room,id}')::uuid;code:=x#>>'{room,code}';
    perform public.lobby_command('join',jsonb_build_object('code',code),b,ip);
    perform public.lobby_command('ready',jsonb_build_object('code',code,'ready',true),a,ip);
    perform public.lobby_command('ready',jsonb_build_object('code',code,'ready',true),b,ip);
    x:=public.lobby_command('start',jsonb_build_object('code',code,'practice',true,'_aiReady',true),a,ip);
    for n in 1..3 loop
      rid:=(x#>>'{round,id}')::uuid;
      assert x->>'error' is null and rid is not null,'each real round starts';
      select deadline into deadline_before from game.rounds where id=rid;
      for attempts in 1..5 loop perform game.advance_round(room); end loop;
      assert not exists(select 1 from game.bot_jobs where round_id=rid),'start, lazy reads and safety ticks do not queue an opener';
      assert not exists(select 1 from game.messages where round_id=rid),'nobody has spoken yet';
      assert (select deadline=deadline_before from game.rounds where id=rid),'waiting does not reset the timer';
      x:=public.lobby_command('message',jsonb_build_object('code',code,'text','   ','requestId',gen_random_uuid()),a,ip);
      assert x->>'error'='MESSAGE_REJECTED','empty message cannot trigger the bot';
      assert not exists(select 1 from game.bot_jobs where round_id=rid),'rejected messages create no bot jobs';
      -- A legacy claimed/scheduled opener must not consume credits or publish.
      select coalesce(hits,0) into budget from game.rate_limits where bucket='ai-budget-reservations';
      budget:=coalesce(budget,0);
      insert into game.bot_jobs(round_id,status,started_at,created_at) values(rid,'sent',now(),now()-interval '1 second') returning * into j;
      assert public.bot_job_command(j.id,gen_random_uuid(),'claim') is null,'forged capability still rejected';
      assert public.bot_job_command(j.id,j.capability,'claim') is null,'claim without human context does not call a model';
      assert (select status='failed' and failure_code='awaiting_human' and body is null from game.bot_jobs where id=j.id),'contextless job safely retired';
      assert coalesce((select hits from game.rate_limits where bucket='ai-budget-reservations'),0)=budget,'no reservation without a human';
      insert into game.bot_jobs(round_id,status,body,publish_at,created_at)
        values(rid,'ready','opening text that must never appear',now()-interval '1 second',now()-interval '1 second') returning * into j;
      perform game.advance_round(room);
      assert not exists(select 1 from game.messages where round_id=rid),'old ready output cannot be the opener';
      assert (select phase='chat' from game.rounds where id=rid),'skipped work is not a service failure';
      x:=public.lobby_command('message',jsonb_build_object('code',code,'text',first_text,'requestId',gen_random_uuid()),a,ip);
      assert x->>'error' is null,'human opener accepted';
      select id into first_id from game.messages where round_id=rid;
      perform game.advance_round(room); perform game.advance_round(room);
      assert (select count(*) from game.bot_jobs where round_id=rid and status='queued')=1,'one job only despite repeated reads';
      select * into j from game.bot_jobs where round_id=rid and status='queued';
      update game.bot_jobs set status='sent',started_at=now() where id=j.id;
      context:=public.bot_job_command(j.id,j.capability,'claim');
      assert context->>'language'=lang,'trusted language preserved';
      assert context#>>'{replyTo,text}'=first_text,'first reply is explicitly anchored to first human message';
      assert jsonb_array_length(context->'messages')=1,'claim includes the human opener';
      assert public.bot_job_command(j.id,j.capability,'claim') is null,'one model reservation per job';
      perform public.bot_job_command(j.id,j.capability,'finish',case when lang='fr' then 'citron ou chocolat sur tes crêpes ?' else 'lemon or chocolate on those pancakes?' end);
      assert (select publish_at between now()+interval '2 seconds' and now()+interval '8 seconds' from game.bot_jobs where id=j.id),'natural random typing delay retained';
      perform game.advance_round(room);
      assert (select count(*) from game.messages where round_id=rid)=1,'not published before typing delay';
      update game.bot_jobs set publish_at=now()-interval '1 second' where id=j.id;
      perform game.advance_round(room);perform game.advance_round(room);
      assert (select count(*) from game.messages where round_id=rid)=2,'one human then exactly one bot output';
      assert (select participant_id from game.messages where id=first_id) in
        (select id from game.participants where round_id=rid and player_id is not null),'first message always belongs to a human';
      assert (select phase='chat' from game.rounds where id=rid),'legacy skipped jobs do not trip the failure breaker';
      update game.rounds set phase='reveal' where id=rid;
      update game.rooms set phase='reveal' where id=room;
      if n<3 then x:=public.lobby_command('next',jsonb_build_object('code',code,'roundId',rid,'_aiReady',true),a,ip); end if;
    end loop;
    x:=public.lobby_command('create',jsonb_build_object('requestId',gen_random_uuid(),'language',lang),a,ip);
    room:=(x#>>'{room,id}')::uuid;code:=x#>>'{room,code}';
    perform public.lobby_command('join',jsonb_build_object('code',code),b,ip);
    perform public.lobby_command('ready',jsonb_build_object('code',code,'ready',true),a,ip);
    perform public.lobby_command('ready',jsonb_build_object('code',code,'ready',true),b,ip);
    x:=public.lobby_command('start',jsonb_build_object('code',code,'practice',true,'_aiReady',true),a,ip);
    rid:=(x#>>'{round,id}')::uuid;
    update game.rounds set deadline=now()-interval '1 second' where id=rid;
    perform game.advance_round(room);
    x:=game.snapshot(room,(select id from game.players where room_id=room and session_hash=a));
    assert x#>>'{round,phase}'='cancelled','a silent round ends safely';
    assert x#>>'{round,cancelReason}'<>'ai_service','silence is not an upstream service failure';
    assert x#>'{round,reveal}' is null and x#>'{round,result}' is null,'silent round reveals nothing and awards no points';
    assert not exists(select 1 from game.bot_jobs where round_id=rid),'silence consumes no AI jobs';
  end loop;
end;
$$;
rollback;

