# Human opens the chat

The authoritative queue waits for an accepted human message in the current round. Empty or rejected messages do not qualify. Repeated state requests and the safety cron cannot make the AI open the chat.

The capability-protected claim and finish commands also require human context that existed when the job was created. Old queued, generating or ready jobs created before that context are discarded without a model-budget reservation and excluded from the provider failure circuit breaker. No active room is reset by the migration.

Before the AI's first published contribution, its private context includes replyTo with the first human nickname and message. The editable Markdown prompt instructs it to react directly to that message, not introduce itself or announce a topic. Player text remains untrusted user input, never system instructions. Later responses retain the existing recent-history context, message cap, cooldown and 2–8 second publication delay. Cron polling and provider latency may add to the visible response delay.

A totally silent round never spends model credits and ends without reveals, votes or points. Existing deadlines (180/30 seconds), six-attempt limit, API providers, keys, RLS and guest authorization are unchanged.

Verification: human-opens-chat.sql runs transaction-only French and English fixtures over all three rounds, including stale jobs, forged capabilities, no budget before human input, empty messages, replyTo content, exactly-once claims/publication, delay and a silent round. No real model call is made. The bot worker/prompt unit tests use mocked transport; they do not evaluate the subjective naturalness of a generated response.

