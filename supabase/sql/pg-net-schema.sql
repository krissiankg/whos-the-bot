-- Relocate the newly installed, unused pg_net extension by recreating it.
-- Non-relocatable extension: only safe while queues and response storage are empty.
do $$ begin
  if exists(select 1 from net.http_request_queue) or exists(select 1 from net._http_response)
     or exists(select 1 from game.bot_jobs) then
    raise exception 'pg_net is in use; do not recreate it';
  end if;
end $$;
drop extension pg_net;
create extension pg_net with schema extensions;
