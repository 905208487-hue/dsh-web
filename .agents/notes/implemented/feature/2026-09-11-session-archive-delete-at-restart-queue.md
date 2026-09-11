# Agent Note: delete-at-restart queue for sessions the host holds live

Status: implemented

## Problem

The maintainer reported that deleting from the session archive always answers "会话仍被 DSH 进程占用，重启服务或关闭该会话后可删除" — the phrase shipped by [session-archive follow-up fixes](../../implemented/bug-fix/2026-08-31-session-archive-followup-fixes.md). A read-only probe of the running GUI (a delete request with `expectedTotal: 0`, which aborts on plan mismatch before any write) showed the extent: 18 of 21 sessions were `attached`, including all six archived ones, so the delete action was effectively dead on that installation.

The mechanism is host-side, not a wrong predicate. The browser stages one session at a time, and opening it makes the host `follow` → `promote` → `ctx.agents.resume`; the resulting `AgentHandle` is owned by the session-controller plugin fiber (the whole process), `AgentRegistry` exposes no by-id dispose, and no close/detach RPC exists. So every session ever opened in a browser tab stays in `ctx.sessions` until `dsh web` exits. [DSH sleeping-tabs research](../../../../docs/archive/dsh-sleeping-tabs-research.md) documents the same gap as the missing L3 (`serverReap`) capability. Meanwhile the advice in the message ("close the session") had no counterpart in the GUI.

## Decision

Sessions blocked by attachment **alone** are no longer refused. The host records them in a durable queue and deletes them at its next start, before a browser can attach anything.

- `deferrableTargets` re-runs `planDelete` over the same ids with the `attached` marks dropped and takes whatever becomes deletable. Only attachment-blocked work is deferred; every other protection keeps its current meaning.
- Protection precedence is now weakest to strongest — `attached` < `running` < `current` < `in-flight` — so a live session that is also running reports `running` instead of `attached`. This is required for safety, not cosmetics: without it a running session would have looked "attachment-only" and been queued for deletion at the next start.
- The queue lives in `$DSH_HOME/dsh-session-archive/pending-deletes.json` and holds the direct ids the user confirmed, so families are re-planned authoritatively at drain time. Batch results relabel queued ids with the new `queued` reason; the panel shows the queue size, the last sweep's counts, and a cancel action backed by `POST /api/dsh-session-archive/pending/clear`.
- `start()` drains the queue (awaited inside `start()`, which the plugin applies with `void`, so host boot is not delayed) and later scheduler ticks retry. Ids leave the queue when they are deleted, when they fail structurally, or when the feed confirms they are gone; an id still protected — or one the feed cannot even see (`feedAvailable === false`) — stays queued.
- Unarchiving cancels a deferred delete: restoring a session states the intent to keep it.
- The automatic delete policy queues its attachment-blocked candidates too; its seeds now exclude only sessions that are working, so an idle held session no longer escapes the retention policy forever.
- The inventory carries `attached` per row and the queue itself, so the panel can mark held sessions, and the delete confirmation can say up front how many confirmed targets land at the next start.

## Alternatives considered

- **Force-delete now and accept the ghost.** The live in-memory copy survives storage deletion: the session keeps its row in the client list (the host feed still lists live sessions), can be reopened and read from memory, and any new prompt re-persists it. Deletion would be a lie the user cannot see through, so this was rejected.
- **Force-stop the live agent before deleting** (`agent.ctx.fiber.dispose()` and similar private reaches). No public seam exists, and stepping into another plugin's fiber to kill a session is exactly the contract the package refuses — "forced stops never happen".
- **Only improve the wording.** The message was already honest; the maintainer's complaint was that it blocked the action, not that it was unclear.
- **Wait for upstream to expose a release seam.** The dependency is real but open-ended; deferring to the next start works with today's SDK and keeps working if upstream later adds one (a start-time drain with an empty queue is a no-op).
- **Drain on a timer within the running process.** A session that got attached stays attached for the life of the process, so an intra-process retry cannot free anything; only a restart changes the outcome. Ticks retry anyway, cheaply, for a sweep that failed for another reason.

## Testing

`tests/janitor.spec.ts` covers the queue end-to-end with the fake host: queueing instead of refusing, a restart drain (fresh process, `liveIds` cleared) deleting storage and clearing the queue, an id that stays held (browser won the race) remaining queued, retirement of ids the feed confirms gone, retaining ids when the feed cannot answer, `running`/`current` never being deferred, unarchive cancelling, `clearPending`, per-row `attached`, and the automatic policy deferring its attachment-blocked candidates. `tests/controller.spec.ts` covers the confirm-dialog deferred count, queued results surfacing in the batch, and the cancel call. `tests/pending-ui.spec.tsx` mounts the real components in jsdom and asserts the user-visible surface: the confirmation's deferred line (and its absence when nothing is held), the finished batch's queue notice with the per-id reason, and the section's queue strip with the held-by-process chip and a cancel click reaching the host route.

## Consequences

- Deleting an archived session now always terminates: either immediately (cold session) or at the next DSH service start (held session), with the panel saying which.
- The deferred queue is a new durable document and a new reason code; the client, the ru dictionary, the package README pair, and [the package's own AGENTS.md](../../../../packages/dsh-session-archive/AGENTS.md) carry the rule.
- Space is only freed at restart for held sessions, and a queued session that a browser auto-opens at start stays queued for the start after that. Both facts are stated in the README's known limitations.
- A failed queue write is swallowed like the ledger's (`flushPending`), so the queue would only be lost with the process that recorded it; the in-memory queue still retries on the next tick.
