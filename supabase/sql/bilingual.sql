-- Non-destructive upgrade after admin-dashboard.sql. Atomic, idempotent,
-- preserves existing RPC privileges and fails closed on unexpected definitions.
begin;
create or replace function game.localized_name(p_alias integer,p_language text) returns text
language sql immutable security invoker set search_path='' as $$
  select case when p_language='fr' then
    (array['Renard orange','Chat lilas','Grenouille menthe','Lapin rose','Ours bleu','Oiseau doré','Hibou azur'])[p_alias]
  else (array['Orange Fox','Lilac Cat','Mint Frog','Pink Rabbit','Blue Bear','Golden Bird','Sky Owl'])[p_alias] end;
$$;
create or replace function game.localized_topic(p_topic text,p_language text) returns text
language sql immutable security invoker set search_path='' as $$
  select case when p_language='fr' then case p_topic
    when 'Describe your perfect weekend.' then 'Décris ton week-end idéal.'
    when 'Which harmless invention should exist?' then 'Quelle invention inoffensive devrait exister ?'
    when 'What unusual food combination do you enjoy?' then 'Quel mélange alimentaire insolite aimes-tu ?'
    when 'Which fictional place would you visit?' then 'Quel lieu imaginaire aimerais-tu visiter ?'
    when 'What tiny thing makes your day better?' then 'Quel petit détail embellit ta journée ?'
    else p_topic end else p_topic end;
$$;
revoke all on function game.localized_name(integer,text),game.localized_topic(text,text) from public,anon,authenticated;
grant execute on function game.localized_name(integer,text),game.localized_topic(text,text) to service_role;

do $upgrade$
declare definition text; signature text;
  aliases text := '(array[''Orange Fox'',''Lilac Cat'',''Mint Frog'',''Pink Rabbit'',''Blue Bear'',''Golden Bird'',''Sky Owl''])';
  topics text := '(array[''Describe your perfect weekend.'',''Which harmless invention should exist?'',''What unusual food combination do you enjoy?'',''Which fictional place would you visit?'',''What tiny thing makes your day better?''])[1+floor(random()*5)::integer]';
begin
  select pg_get_functiondef('public.lobby_command_v1(text,jsonb,text,text)'::regprocedure) into definition;
  if position('-- bilingual-v1' in definition)=0 then
    if position('insert into game.rooms (code, creator_hash, request_id)' in definition)=0 then raise exception 'Unexpected legacy lobby definition'; end if;
    definition:=replace(definition,'begin','begin'||chr(10)||'  -- bilingual-v1');
    definition:=replace(definition,'''kick'',''leave'')','''kick'',''leave'',''language'')');
    definition:=replace(definition,'if p_action = ''create'' then', $code$if p_action = 'create' then
      if p_args ? 'language' and (jsonb_typeof(p_args->'language') is distinct from 'string' or p_args->>'language' not in ('en','fr')) then
        return jsonb_build_object('error','INVALID_REQUEST','status',400);
      end if;$code$);
    definition:=replace(definition,'insert into game.rooms (code, creator_hash, request_id) values (v_code, p_session_hash, v_request)',
      'insert into game.rooms (code, creator_hash, request_id, language) values (v_code, p_session_hash, v_request, coalesce(p_args->>''language'',''en''))');
    definition:=replace(definition,'if p_action = ''ready'' then', $code$if p_action = 'language' then
      if v_room.host_id is distinct from v_player.id then return jsonb_build_object('error','HOST_ONLY','status',403); end if;
      if v_room.phase <> 'lobby' then return jsonb_build_object('error','ROUND_IN_PROGRESS','status',409); end if;
      if jsonb_typeof(p_args->'language') is distinct from 'string' or p_args->>'language' not in ('en','fr') then return jsonb_build_object('error','INVALID_REQUEST','status',400); end if;
      if v_room.language is distinct from p_args->>'language' then
        update game.rooms set language=p_args->>'language', version=version+1 where id=v_room.id;
        update game.players set ready=false where room_id=v_room.id and status='active';
      end if;
    elsif p_action = 'ready' then$code$);
    execute definition;
  end if;
  select pg_get_functiondef('public.lobby_command(text,jsonb,text,text)'::regprocedure) into definition;
  if position('-- bilingual-core' in definition)=0 then
    if position(topics in definition)=0 then raise exception 'Unexpected core topic definition'; end if;
    definition:=replace(definition,'begin','begin'||chr(10)||'  -- bilingual-core');
    definition:=replace(definition,'''leave'',''state'')','''leave'',''state'',''language'')');
    definition:=replace(definition,topics,'game.localized_topic('||topics||',r.language)');
    -- The main gateway must reject language changes during all round phases.
    definition:=replace(definition,'if p_action=''start'' then', $code$if p_action='language' then
      return jsonb_build_object('error','ROUND_IN_PROGRESS','status',409);
    elsif p_action='start' then$code$);
    execute definition;
  end if;
  foreach signature in array array['game.snapshot_lobby(uuid,uuid)','game.snapshot(uuid,uuid)'] loop
    select pg_get_functiondef(signature::regprocedure) into definition;
    definition:=replace(definition,aliases||'[p.alias_index]','game.localized_name(p.alias_index,r.language)');
    definition:=replace(definition,aliases||'[s.alias_index]','game.localized_name(s.alias_index,r.language)');
    execute definition;
  end loop;
  select pg_get_functiondef('public.bot_job_command(uuid,uuid,text,text)'::regprocedure) into definition;
  if position('''language'',(select language from game.rooms where id=r.room_id)' in definition)=0 then
    definition:=replace(definition,'''topic'',r.topic,''nickname''','''language'',(select language from game.rooms where id=r.room_id),''topic'',r.topic,''nickname''');
  end if;
  definition:=replace(definition,aliases||'[alias_index]','game.localized_name(alias_index,(select language from game.rooms where id=r.room_id))');
  definition:=replace(definition,aliases||'[s.alias_index]','game.localized_name(s.alias_index,(select language from game.rooms where id=r.room_id))');
  execute definition;
end;
$upgrade$;

create or replace function game.safe_bot_message(p_text text) returns boolean
language sql immutable security invoker set search_path='' as $$
  select game.safe_message(p_text) and char_length(p_text)<=180
    and lower(p_text) !~ '\m(ai|ia|bot|robot|assistant|model|modèle|modele|prompt|openai|gpt|artificial intelligence|intelligence artificielle)\M'
    and lower(p_text) !~ '(i am (an? |the )?human|i.m (an? |the )?human|je suis (un[e]? |l[a-z]? )?humain[e]?)';
$$;
commit;
