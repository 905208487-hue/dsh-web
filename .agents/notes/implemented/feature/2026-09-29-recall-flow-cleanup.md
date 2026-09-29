# Agent Note: Recall flow cleanup (client mirror of the disk cut)

Status: implemented

## Problem

`dsh-recall` truncated the session's on-disk event log but left the visible
message flow untouched: the recalled turn (the operator's message and its
reply) stayed on screen until a reopen or restart, contradicting the operator
requirement that a recall removes that content from the interface.

## Decision

The client mirrors the disk cut immediately upon a successful rollback
(`src/client/cleanup.ts`):

- Anchor on the LAST flow row of kind `user`/`steering` (the shell's own
  operator-message marker, matching the disk-side real-user-message anchor),
  then remove every `[data-chat-turn]` row whose turn number is that row's or
  higher — the positional mirror of the `core/rollback.ts` cut.
- Removed rows' identity keys (`data-chat-anchor-key`) land in a page-level
  stylesheet (`[data-chat-anchor-key=...]{display:none!important}`) and in a
  per-session persisted key set (localStorage, in-page map fallback):
  the shell's React reconciliation re-creates removed rows from its store, and
  the rules keep those re-creations hidden for the page lifetime.

## Alternatives

- **DOM removal only**: defeated by the next React reconciliation, which
  re-creates rows from the shell's (host-memory) store.
- **Hide by turn number**: breaks after a reopen — the shell renumbers turns
  from the truncated disk state and a future turn can collide with a recorded
  value, wrongly hiding fresh content. Anchor keys derive from event identity,
  so a re-sent draft and a post-reopen reload render fresh keys and stale
  rules stay inert.

## Constraints

- Disk recall semantics stay the authority; this mirror is display-only and
  no-ops without the shell's flow markers. The reopen/restart note now covers
  the host-memory side (the running session's own context state).
- No new routes, host services, or profile writes; the trigger pill keeps its
  gating (latest turn, not in flight).
- Tests: `tests/client-cleanup.spec.tsx` (fresh module state per spec via
  `vi.resetModules`; jsdom ships no localStorage on Node 26, the map fallback
  is what the specs implicitly cover).
