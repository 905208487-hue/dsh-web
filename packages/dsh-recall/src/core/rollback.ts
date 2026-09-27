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
 * be recalled; completed history must be left untouched. The rule is purely
 * positional:
 * - if the log ends with an in-flight turn (no closing `turn/end` for the
 *   latest turn), drop that turn: cut after the last `turn/end` (or, when no
 *   turn ever closed, after the last `turn/start`'s predecessor — the host
 *   frequently leaves the final turn unclosed, e.g. when a reply is cut off);
 * - otherwise the latest turn is already completed — drop it: cut after the
 *   second-to-last `turn/end`;
 * - a log with no turn at all (bare header/seed events) has nothing to recall.
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
  let starts = 0
  let ends = 0
  let lastStart = -1
  let lastEnd = -1
  let prevEnd = -1
  for (let i = 0; i < events.length; i++) {
    const type = eventType(events[i])
    if (type === 'turn/start') {
      starts += 1
      lastStart = i
    } else if (type === 'turn/end') {
      ends += 1
      prevEnd = lastEnd
      lastEnd = i
    }
  }
  if (starts === 0) return null
  if (ends === 0) {
    // Only an unclosed turn exists (the host may never emit its turn/end):
    // recall it wholesale, keeping everything through the turn's start.
    return { cut: Math.max(lastStart - 1, 0), inFlight: true }
  }
  const inFlight = starts > ends
  // The cut keeps everything through the turn boundary before the latest
  // turn; never cut below the session header line.
  const cut = inFlight ? lastEnd : (ends > 1 ? prevEnd : Math.max(lastStart - 1, 0))
  return { cut, inFlight }
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