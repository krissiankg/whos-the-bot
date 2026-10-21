# Step 2: connected guest lobbies

## Deployed backend

- Organization: Test.
- Project: whos-the-bot / `ayvfdycfkavoeqbkplex`, Paris / `eu-west-3`.
- Schema source: `supabase/sql/guest-lobbies.sql`; applied as the remote `guest_lobbies` migration.
- Edge Function: `game-lobby`, with guest-token authorization in its body (`verify_jwt=false` by design; these players do not have Supabase Auth accounts).
- Cleanup / host election: `game-lobby-maintenance`, one SQL job every **10 seconds**, no per-second cron or HTTP invocations while idle.

## Access model

Next.js creates a 256-bit random HttpOnly, SameSite=Lax guest cookie for at most 24 hours. HTTPS uses Secure cookies. The session bootstrap completes before creation or joining, so a lost room-command response can be retried with the same identity. A client-generated request UUID makes creation idempotent for that guest.

Only the Edge Function gets an administrative key, from Supabase-managed environment variables. It hashes guest credentials before calling `public.lobby_command`. That RPC is SECURITY INVOKER, executable only by service_role, and validates membership and host rights within a short transaction. It locks the room before counting or allocating seats. The private `game` schema has no browser-role usage or table grants; all tables have RLS. It never returns session hashes, creator hashes, rate-limit records, or credentials.

The security advisor may display [RLS Enabled No Policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) as an informational notice for the private tables. This is intentional: browser roles are denied all access; the scoped server gateway is the only access path. Adding permissive browser policies would weaken this model.

Supabase Realtime broadcasts only an empty `changed` signal on a random room-ID topic. These are public invalidation hints, not authorized data. A client cannot obtain a roster or mutate a room by subscribing or sending its own hint. Every refresh rechecks its HttpOnly credential server-side. Broadcasts use the REST API rather than database broadcasts, so no chat or roster is copied into the Realtime message retention table. Clients debounce signals and perform a 10-second authenticated recovery heartbeat. A dropped or forged signal never becomes authoritative state.

## Presence, removal and expiry

- One cookie/profile is one seat per room. Use incognito, another profile, or another device to test a second human.
- Rejoining with the same credential restores a seat and never creates a duplicate.
- Heartbeat every 10 seconds; displayed offline after 25 seconds without contact.
- If the host has not contacted the server for 40 seconds, elect the oldest active connected guest. SQL requests and the 10-second safety sweep perform the same election. A guest returning after the election does not reclaim hosting automatically.
- Browser background throttling or device sleep can look like disconnection. Keep the successor’s page foregrounded when testing host transfer.
- Voluntary leave releases a seat and transfers hosting immediately. Rejoining voluntarily is allowed. Host removal instead marks the seat kicked; subsequent reads and joins with that credential are rejected. A new browser identity can bypass seat-based removal, a known limitation of accountless games.
- Expiry is fixed at creation + 24 hours. Requests deny access at expiry, independent of cleanup. The sweep deletes the room and cascades through players, rounds, messages, votes and reports. Cleanup failures retry on the next tick. Infrastructure logs/backups have provider-managed retention.

## Abuse limits

The Edge Function HMAC-hashes the proxy-added network address with a daily scope; raw IP addresses are not stored in game tables. Proxy addressing and shared NAT make network quotas best effort. A deployment may group users behind the Next.js server’s address, so this initial network quota also acts as a conservative deployment cap.

- Room creation: 20 per network bucket/hour, 3 per guest/hour.
- Join attempts: 100 per network bucket/hour and 20 per guest/minute, including nonexistent room codes.
- Authorized requests: 120 per seat/minute.
- Request size: 4 KB at each gateway.
- Rate-limit rows expire after at most one hour and are swept every 10 seconds.

The game is not ready for unrestricted public use: the next milestone must add actual chat moderation, model budgets, round-hour limits, and the play loop before public play.

## Redeploy / verify

The two Next.js settings are `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. These are intentionally public. No database password, secret API key or AI key belongs in this Next.js milestone’s environment.

Deploy the saved Edge Function source with the connected Supabase tool or the official CLI. For CLI commands, inspect `supabase functions deploy --help` first; retain the function’s custom guest authorization configuration. Do not apply the schema source repeatedly: it is the definition of an already-applied migration, not an idempotent seed script. For later changes, create a proper migration with the CLI after checking its help.

Verify `cron.job` contains the active `game-lobby-maintenance` job with schedule `10 seconds`, inspect recent `cron.job_run_details` for failures, and run the security advisor after changing access rules. Run `npm run test:lobby` against a local running frontend plus this test project. Do not print credentials or HTTP cookie headers in troubleshooting logs.

## Not implemented here

The real chat, AI participant, voting/reveal, score calculation, French, results cards, and public frontend hosting remain separate milestones. Their screen previews remain available at `/?dev=1` in development only. The rounds/messages/votes/reports tables are provisioned but deliberately have no public write or read actions yet.
