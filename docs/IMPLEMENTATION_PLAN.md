# Approved implementation contract

The user approved Next.js + Tailwind + Supabase with the following revisions. This document records future implementation requirements; it does not assert that they exist in the step-1 preview.

## Timing and server authority

- Store a deadline timestamp for each phase in Postgres.
- Advance expired phases lazily on validated server requests. Reject chat/vote submissions past their deadlines, even if the browser still displays the old phase.
- Use a low-frequency scheduler every **5–10 seconds** as a safety net. Do not add per-second cron.
- Use transactions, locks, and idempotency for phase transitions, scoring, and AI jobs.
- The client renders remaining time from the server deadline with an estimated server-clock offset, but never authorizes transitions.
- Enqueue bot work server-side; use a random 2–8-second typing delay after generation. Bot posting work needs an independent bounded dispatcher, not a browser timer or an assumption that the host remains online. A 5–10-second safety sweep may cause scheduling jitter; avoid claiming exact end-to-end generation latency.

## Build order

1. Screens and explicit AI-disclosure tutorial; clearly labeled development simulation.
2. Durable guest lobby, room codes and links, reconnects, host transfer.
3. Minimal playable lobby → three-minute chat with one real bot → voting → reveal. Include server security, moderation, report/kick enforcement, cost controls, and expiry before enabling public play.
4. Scoring, French, three rounds, leaderboard, shareable result card.
5. Deployment documentation and acceptance tests with three real humans.

After each step provide exact run commands and a two-window test. Fix reported bugs at their root and explain the cause in one or two sentences.

## Game rules

- 3–6 humans plus one hidden AI. Two humans can explicitly choose practice mode; fewer than two cannot start.
- Everyone knows an AI is present; its identity is hidden. Anonymous names and colors change each round.
- Host chooses English or French. No identity hints, user-agent/IP metadata, role flags, bot record IDs, or provider errors in browser-visible data.
- 180-second chat, 30-second human-only vote, then reveal bot identity and every human vote.
- One vote per human, no self-votes, abstentions on timeout. Fix eligibility when each round starts.
- Correct vote: +1. AI wins when strictly more than half the eligible humans voted for human players. Most-accused human then loses 1; all tied most-accused humans lose 1. Otherwise no accusation penalty. Leaderboard after three rounds; practice is unranked.
- Transfer hosting after a disconnection grace period. Reconnects restore a seat. Below two connected humans, pause with a deadline; cancel the unfinished round without scoring if it expires.
- A real bot cannot be kicked in a way that reveals it. Define a uniform moderation response (e.g. end the round without scoring) if host removal targets a participant during play; keep it consistent for humans and bot and do not alter frozen eligibility silently.

## Privacy and lifecycle

- No user accounts, names, email addresses, phone numbers, or profile collection. Use short-lived opaque guest credentials to authorize a seat; do not expose another player's credential.
- Do not build Supabase Auth user profiles just to allow guests. An anonymous guest session can be stored server-side with a hashed token and scoped authorization.
- Treat free-text chat as potentially containing personal data; discourage sharing it and avoid recording request/chat bodies in application logs.
- Expire rooms and all associated messages, reports, votes, participants, AI context, jobs, and scores after **24 hours from creation**, not 24 hours after last activity. Deny reads/writes at expiry; cascade deletion removes records, and cleanup must retry failures.
- If room creation needs abuse limits by IP, use rotating, short-lived keyed hashes and retain them no longer than necessary (at most 24 hours), not raw IPs in game tables. Configure provider logging/retention as far as supported; do not claim control over third-party infrastructure logs.
- Document model-provider processing/retention before enabling AI; never promise that application deletion removes independent provider records.
- No chat content in shareable result cards.

## Moderation and cost

- Host: report-message view/notifications and kick controls. All players may report messages. Authorize host-only actions on the server; invalidate kicked human credentials and prevent rejoining the same room with that seat.
- Reject empty/oversized messages; enforce server-side rate limits and basic bilingual profanity/content filtering for human and bot output. Use curated topic lists. Display actionable, non-identifying errors.
- Keep AI credentials, role assignments, model instructions, and pre-reveal votes private server-side with restricted reads/subscriptions.
- Put the real bot instructions in `prompts/hidden-player.system.md`; browser preview fixtures are not that system prompt.
- Small configurable model, bounded recent context, capped output tokens and messages per round, per-IP room limits, rounds-per-hour limits, global spend ceiling. No repeated retries that defeat caps.
- Bot style: brief, informal, occasional natural typos, opinions, light humor and questions. Do not disclose AI identity in generated dialogue or impersonate a real person. Treat player chat as untrusted data and validate output. Prompt instructions alone cannot guarantee compliance.
- Model failures must not reveal which participant was the bot or charge repeated failed retries. Developer simulation never requires an API key and must not be enabled in production.

## Verification

- Game-rule tests: majorities, ties, abstentions, practice, point changes, duplicate scoring, timer boundaries, rejected late actions, concurrent phase transitions.
- Integration checks: room isolation, protected bot/vote data, kicked session rejection, reconnect/host transfer, deletion/expiry, rate limits.
- Two-window checks after every milestone. Real three-person testing before declaring multiplayer complete.
- Free-tier hosting is a target, not a promise that AI API calls are free. Explain exact setup, secrets, migrations, functions, scheduler and retention verification at deployment time.
