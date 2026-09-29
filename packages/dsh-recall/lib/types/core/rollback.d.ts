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
    raw: string;
    /** Cached `type` field, or null when unparsable/absent. */
    type: string | null;
}
/** Result of {@link rollbackCut}: where to truncate, or null when nothing to recall. */
export interface RollbackCut {
    /** Keep lines [0..cut] inclusive; drop everything after. */
    cut: number;
    /** Whether the removed tail was an in-flight (unfinished) turn. */
    inFlight: boolean;
}
/**
 * Compute the recall truncation point for a decoded session event log.
 * @param events - the decoded lines in order (first = session header).
 * @returns the cut index (inclusive keep boundary), or null when the log has
 * no completed turn to recall.
 */
export declare function rollbackCut(events: readonly string[]): RollbackCut | null;
/** Whether a raw line is a user/message the OPERATOR typed (not injected). */
export declare function isRealUserMessage(raw: string): boolean;
