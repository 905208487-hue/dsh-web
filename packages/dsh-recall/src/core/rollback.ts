/**
 * Conversation recall (撤回) core: compute the truncation point that removes
 * only the LATEST turn of a session JSONL event log.
 *
 * The dsh host persists each session as a zstd-compressed JSONL event log
 * (one JSON event per line; see `session.v4.jsonl.zstd` under
 * `$DSH_HOME/sessions/<workspace>/<session-id>/`). Events are typed — the
 * turn boundaries are `turn/start` and `turn/end` events, and the newest
 * content always sits at the log's tail.
 *
 * Recall policy (per the operator): only the latest conversation content may
 * be recalled; completed history must be left untouched. The cut anchors on
 * the user's OWN latest message — platform-injected `user/message` events
 * (`source.kind` other than `user`: runtime-context snapshots, skill-catalog
 * reminders, job notifications) never anchor a recall, so recalling this
 * conversation never pulls in or removes other conversations' content:
 * - the turn containing the last real user message is dropped: cut after the
 *   previous turn's `turn/end` (or before the turn start / message when no
 *   prior turn closed — the host often leaves the final turn unclosed);
 * - a log without any real user message has nothing to recall.
 *
 * The function is pure (operates on decoded lines) so it can be tested
 * without touching real session files; the zstd read/write and the host
 * route wrap it (see {@link @linxin666/dsh-recall/host}).
 * @module @linxin666/dsh-recall/core/rollback
 */

/** A decoded session event line with its JSON `type`. */
export interface SessionEventLine {
  /** The JSON payload (kept verbatim for re-serialization). */
  raw: string
  /** Cached `type` field, or null when unparsable/absent. */
  type: string | null
}

/** Result of {@link rollbackCut}: where to truncate, or null when nothing to recall. */
export interface RollbackCut {
  /** Keep lines [0..cut] inclusive; drop everything after. */
  cut: number
  /** Whether the removed tail was an in-flight (unfinished) turn. */
  inFlight: boolean
}

/**
 * Compute the recall truncation point for a decoded session event log.
 * @param events - the decoded lines in order (first = session header).
 * @returns the cut index (inclusive keep boundary), or null when the log has
 * no completed turn to recall.
 */
export function rollbackCut(events: readonly string[]): RollbackCut | null {
  const turnStarts: number[] = []
  const turnEnds: number[] = []
  let realMsg = -1
  for (let i = 0; i < events.length; i++) {
    const type = eventType(events[i])
    if (type === 'turn/start') turnStarts.push(i)
    else if (type === 'turn/end') turnEnds.push(i)
    else if (type === 'user/message' && isRealUserMessage(events[i])) realMsg = i
  }
  // No message the user typed themselves: nothing of theirs to recall.
  if (realMsg < 0) return null
  // The turn containing that message.
  const turnStart = lastBefore(turnStarts, realMsg)
  const turnEnd = firstAfter(turnEnds, realMsg)
  let cut: number
  if (turnEnd >= 0) {
    // Completed turn: keep everything through the previous turn's close.
    const priorEnds = turnEnds.filter((e) => turnStart >= 0 && e < turnStart)
    cut = priorEnds.length > 0 ? priorEnds[priorEnds.length - 1] : Math.max((turnStart >= 0 ? turnStart : realMsg) - 1, 0)
  } else {
    // Unclosed turn (the host often never emits its turn/end): drop the whole
    // open turn, keeping everything through its start.
    cut = turnStart >= 0 ? turnStart - 1 : Math.max(realMsg - 1, 0)
  }
  return { cut: Math.max(cut, 0), inFlight: turnEnd < 0 || turnStarts.length > turnEnds.length }
}

/** Whether a raw line is a user/message the OPERATOR typed (not injected). */
export function isRealUserMessage(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw) as { data?: { source?: { kind?: unknown }; content?: unknown } }
    const source = parsed?.data?.source
    if (source !== null && typeof source === 'object' && typeof (source as { kind?: unknown }).kind === 'string') {
      if ((source as { kind: string }).kind !== 'user') return false
    }
    const content = parsed?.data?.content
    if (Array.isArray(content)) {
      let text = ''
      for (const part of content as Array<{ type?: unknown; text?: unknown }>) {
        if (part?.type === 'text' && typeof part.text === 'string') text += part.text
      }
      if (text.startsWith('<system-reminder>')) return false
    }
    return true
  } catch {
    return false
  }
}

/** The last element strictly before the bound (-1 when none). */
function lastBefore(indices: readonly number[], bound: number): number {
  let found = -1
  for (const i of indices) {
    if (i < bound) found = i
    else break
  }
  return found
}

/** The first element strictly after the bound (-1 when none). */
function firstAfter(indices: readonly number[], bound: number): number {
  for (const i of indices) {
    if (i > bound) return i
  }
  return -1
}

/** Read the `type` field of a raw event line (null when unparsable). */
function eventType(raw: string): string | null {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed !== null && typeof parsed === 'object' && typeof (parsed as { type?: unknown }).type === 'string') {
      return (parsed as { type: string }).type
    }
  } catch {
    // Unparsable line: count it as non-turn so boundaries stay correct.
  }
  return null
}