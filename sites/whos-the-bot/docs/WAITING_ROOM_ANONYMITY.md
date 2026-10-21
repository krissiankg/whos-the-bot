# Waiting-room anonymity

The lobby shows numbered waiting seats with the same neutral silhouette and color. Neither the lobby JSON nor the UI exposes the stored animal/color alias. The client also masks old cached lobby payloads.

At the start of every real round, the existing server engine assigns fresh participant UUIDs, randomized aliases and randomized roster positions to all humans and the single AI. Waiting-seat numbers, host badges and readiness/presence indicators do not identify a participant during play. Own identity is returned only to its owner. Cross-round scores remain hidden until the match ends.

The private snapshot_lobby function returns nothing after the room leaves the lobby. Its execute privilege is restricted to service_role; the existing guest-capability authorization remains unchanged. No table permissions, model instructions, keys, AI quotas or round durations change.

Tutorial and How to play explain the simultaneous assignment in English and French. Players should not announce their new nickname outside the game; technical anonymity cannot prevent voice chat, screen sharing or recognizing a friend's writing style. Two-human games remain practice; 3–6 humans are the normal format.

## Verification

- tests/waiting-seat.test.mjs renders the actual LiveLobby and Avatar components, with cached old identities, in both languages; checks neutral visuals, labels, host moderation and readiness.
- supabase/tests/anonymous-waiting-seats.sql uses transaction-only fixtures for 2 and 6 humans in both languages. Checks the actual start command, one bot, separate participant IDs, uniform waiting visuals, no role/mapping fields, identical anonymous roster for all clients and revoked direct function access. Everything rolls back, with no model calls.
- Existing playable-core, three-rounds and bilingual SQL regression suites passed against Supabase after the migration.
- scripts/test-lobby.mjs in the original workspace also asserts neutral waiting identities over the public API.

Run local Site tests with Node's test runner and TypeScript support:

    node --experimental-strip-types --test tests/*.test.mjs
    node node_modules/typescript/bin/tsc --noEmit

For the SQL tests, execute the complete file in the Supabase SQL editor; retain BEGIN/ROLLBACK. Do not run tests against another user's active room.

