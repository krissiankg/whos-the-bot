-- Isolated fixtures only: no real room is inspected and no AI request is made.
begin;
set local role service_role;
do $$
#variable_conflict use_variable
declare
  lang text; humans integer; i integer; code text; room uuid; rid uuid;
  ip text; sessions text[]; ids uuid[]; x jsonb; y jsonb; before_roster jsonb;
begin
  assert not has_function_privilege('anon','game.snapshot_lobby(uuid,uuid)','execute'), 'anonymous RPC forbidden';
  assert not has_function_privilege('authenticated','game.snapshot_lobby(uuid,uuid)','execute'), 'authenticated RPC forbidden';
  foreach lang in array array['en','fr'] loop
    foreach humans in array array[2,6] loop
      ip:=encode(extensions.gen_random_bytes(32),'hex'); sessions:=array[]::text[]; ids:=array[]::uuid[];
      for i in 1..humans loop
        sessions:=array_append(sessions,encode(extensions.gen_random_bytes(32),'hex'));
        if i=1 then
          x:=public.lobby_command('create',jsonb_build_object('requestId',gen_random_uuid(),'language',lang),sessions[i],ip);
          code:=x#>>'{room,code}'; room:=(x#>>'{room,id}')::uuid;
        else
          x:=public.lobby_command('join',jsonb_build_object('code',code),sessions[i],ip);
        end if;
        assert x->>'error' is null,'join succeeds';
        ids:=array_append(ids,(x->>'meId')::uuid);
      end loop;
      x:=game.snapshot(room,ids[1]); before_roster:=x->'players';
      assert jsonb_array_length(before_roster)=humans,'only human seats in waiting room';
      assert (select count(distinct p->>'name') from jsonb_array_elements(before_roster) p)=humans,'unique seat labels';
      assert not exists(select 1 from jsonb_array_elements(before_roster) with ordinality as p(value,n)
        where value->>'name'<>(case when lang='fr' then 'Joueur ' else 'Player ' end)||n::text
          or value->>'animal'<>'hidden' or value->>'color'<>'#b6b9ad'),'uniform neutral waiting identities';
      assert x#>>'{room,hostId}'=ids[1]::text,'lobby host controls preserved';
      assert not exists(select 1 from jsonb_array_elements(before_roster) p,
        lateral jsonb_object_keys(p) k where k not in ('id','name','animal','color','ready','online')),'no hidden mapping fields';
      for i in 1..humans loop
        perform public.lobby_command('ready',jsonb_build_object('code',code,'ready',true),sessions[i],ip);
      end loop;
      x:=public.lobby_command('start',jsonb_build_object('code',code,'practice',humans=2,'_aiReady',true),sessions[1],ip);
      assert x->>'error' is null,'actual start succeeds';
      rid:=(x#>>'{round,id}')::uuid;
      assert x#>>'{room,phase}'='chat','start reaches chat';
      assert jsonb_array_length(x->'players')=humans+1,'one extra hidden participant';
      assert (select count(*) from game.participants where round_id=rid and player_id is null)=1,'exactly one bot';
      assert game.snapshot_lobby(room,ids[1]) is null,'cannot fetch waiting identities during a round';
      assert x#>>'{room,hostId}' is null,'host mapping hidden';
      assert x->'leaderboard' is null and x#>'{round,reveal}' is null,'no premature role or persistent scoreboard';
      assert not exists(select 1 from jsonb_array_elements(x->'players') p where (p->>'id')::uuid=any(ids)),'fresh participant identifiers';
      assert not exists(select 1 from jsonb_array_elements(x->'players') p where p->>'animal'='hidden'
        or p->>'color'='#b6b9ad' or p->>'name' like 'Player %' or p->>'name' like 'Joueur %'),'no waiting appearance carried into play';
      assert not exists(select 1 from jsonb_array_elements(x->'players') p where p->>'ready'<>'true' or p->>'online'<>'true'),'no readiness or presence role hint';
      assert not exists(select 1 from jsonb_array_elements(x->'players') p,
        lateral jsonb_object_keys(p) k where k not in ('id','name','animal','color','ready','online')),'no player or bot mapping fields';
      y:=game.snapshot(room,ids[humans]);
      assert y->'players'=x->'players','all clients see identical anonymous roster ordering';
      assert y->>'meId'<>x->>'meId','only own anonymous identity is personal';
      -- Ownership remains private; no stable seat identifier appears in the roster.
      -- Only read the private assignment; uniqueness constraints stay untouched.
      assert exists(select 1 from game.participants where round_id=rid and player_id=ids[1]),'private ownership retained server-side';
      -- No persistent mutation survives this transaction.
      y:=game.snapshot(room,ids[1]);
      assert y->'players'=x->'players','round identity independent of lobby alias';
    end loop;
  end loop;
end;
$$;
rollback;

