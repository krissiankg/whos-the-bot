# Step 2 verification

Verified against project `ayvfdycfkavoeqbkplex`:

- Seven private tables have RLS enabled, with no browser-role schema/table access.
- Anonymous and authenticated API roles cannot execute the privileged command RPC.
- The 10-second maintenance job is active.
- Transactional database checks passed for host election after 41 seconds of absence, immediate expired-room access denial, and cascade cleanup of players, rounds, messages, votes and reports. Fixtures were rolled back.
- The deployed Edge Function was exercised with two independent random guests: create, join, shared readiness, voluntary host departure, and host transfer all passed.
- End-to-end checks through Next.js passed for HttpOnly guest cookies, fixed 24-hour room expiry, idempotent creation, reconnect identity, room isolation, foreign-origin rejection, host-only authorization, actual Realtime broadcasts with empty payloads, concurrent six-seat capacity, unique aliases, kick/rejoin denial, and public-RPC denial. Test seats were released; disposable rooms expire automatically.

One integration bug was caught and fixed: Next.js may build `request.url` with its internal `0.0.0.0` listen address. Comparing it directly with the browser Origin incorrectly rejected valid requests. The gateway now compares Origin with the request Host and hosting-proxy protocol; HTTPS also sets Secure cookies from that validated origin.

The full production build (`next build --webpack`) completed successfully, including TypeScript, page-data collection, static generation and build tracing. The home, room and privacy routes also returned HTTP 200 through the development server. Package metadata and lockfile engines agree on Node >=22.

Visual browser QA is still unverified. The end-to-end checks use actual HTTP requests and an actual Supabase Realtime subscription, not two visually controlled browser windows; follow the README’s two-browser checklist to review the interface itself.

These checks do not certify an actual playable AI game yet. The play loop, message moderation, model-cost limits, French, scoring and frontend deployment remain later milestones.
