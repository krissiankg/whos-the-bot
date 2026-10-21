-- Waiting seats must never disclose the playable alias pool or assignments.
-- Round participants keep their existing fresh IDs, random aliases and positions.
create or replace function game.snapshot_lobby(p_room uuid, p_player uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'room', jsonb_build_object('id', r.id, 'code', r.code, 'hostId', r.host_id,
      'language', r.language, 'phase', r.phase, 'deadline', r.phase_deadline,
      'version', r.version, 'createdAt', r.created_at, 'expiresAt', r.expires_at),
    'meId', p_player,
    'players', coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id,
      'name', (case when r.language = 'fr' then 'Joueur ' else 'Player ' end) || p.seat,
      'animal', 'hidden', 'color', '#b6b9ad',
      'ready', p.ready, 'online', p.last_seen > now() - interval '25 seconds'
    ) order by p.seat) from (
      select id, ready, last_seen, row_number() over(order by joined_at, id) as seat
      from game.players where room_id = r.id and status = 'active'
    ) p), '[]'::jsonb),
    'serverNow', now()
  ) from game.rooms r where r.id = p_room and r.expires_at > now() and r.phase = 'lobby';
$$;
revoke all on function game.snapshot_lobby(uuid,uuid) from public,anon,authenticated;
grant execute on function game.snapshot_lobby(uuid,uuid) to service_role;

