# dsh-recall

English | [中文](README.zh.md)

Recall the latest conversation turn (撤回) in the DeepSeek Harness web GUI —
latest content only, completed history stays untouched.

## How it works

- At the tail of an open conversation's message flow, the plugin shows a small
  **Recall latest** pill. It appears only for the **latest turn** and only
  while no turn is streaming; history turns never get a recall affordance.
- Clicking it asks for confirmation, then POSTs
  `/api/dsh-recall/rollback` with the active session id. The host decodes the
  session's zstd event log (`$DSH_HOME/sessions/<workspace>/<session-id>/`,
  `session.v4.jsonl.zstd`), truncates it at the latest-turn boundary
  (dropping an in-flight trailing turn or the last completed turn), writes it
  back atomically with a timestamped `.recall-bak-` backup, and reports the
  outcome.
- Because the running harness keeps finished sessions in memory, the rollback
  lands on disk first. The client then mirrors the cut immediately: the
  recalled turn's rows (the user message and its reply) leave the visible
  message flow, and their identity keys (`data-chat-anchor-key`) persist in a
  page-level stylesheet so shell re-renders cannot resurrect them. Anchor keys
  derive from event identity, so re-sending the recalled draft and reopening
  the session both render fresh keys — the stale rules stay inert. The
  reopen/restart note now refers to the host-memory side (the running
  session's own context state), not the displayed flow.

## Restrictions

- Recall is **latest-turn only** by construction (positional cut at the last
  `turn/end` boundary); historical content is never touched.
- Loopback-only, POST-only route; hostile session ids are refused.
- Compression uses Node's built-in `zlib` zstd (requires Node >= 24).

## Development

- `src/core/rollback.ts` — pure truncation-cut function (unit-tested on
  synthetic logs).
- `src/host/*` — route and on-disk rollback (fixture-tested with real zstd
  round-trips).
- `src/client/*` — the trigger pill, its gating, the post-recall flow cleanup,
  and the locale dictionary.
- `pnpm test` runs the suite; `pnpm i18n:check` covers the zh/en/ru keys.
