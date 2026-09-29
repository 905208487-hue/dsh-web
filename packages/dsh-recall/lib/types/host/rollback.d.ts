/**
 * Host-side conversation recall (撤回): decode the session event log from
 * disk, truncate it to the latest-turn boundary via the pure core, and write
 * the result back atomically with a backup.
 *
 * The dsh host persists each session as a zstd-compressed JSONL event log:
 * `$DSH_HOME/sessions/<workspace>/<session-id>/session.v4.jsonl.zstd`
 * (falling back to `session.jsonl.zstd`). Compression is the standard zstd
 * codec, handled here with the pure-JS `fzstd` implementation so the plugin
 * needs no native bindings.
 *
 * Consistency caveat (deliberate): the running host keeps sessions in memory
 * and has no message-level API, so a rollback changes the on-disk log while
 * the host's open view may stay stale; the response reports `requiresRestart`
 * and the caller tells the operator to reopen the session or restart dsh.
 * @module @linxin666/dsh-recall/host/rollback
 */
/** Default session store root (the dsh CLI's `~/.dsh/sessions`). */
export declare function sessionsRoot(): string;
/** Locate a session's event-log file by id, or null when absent. */
export declare function sessionLogPath(root: string, sessionId: string): string | null;
/** Result of applying a rollback to disk. */
/** An attachment part of the recalled user message. */
export interface RecalledAttachment {
    name: string;
    mediaType: string;
}
/** The recalled user message, returned so the client can refill the composer. */
export interface RecalledContent {
    text: string;
    attachments: RecalledAttachment[];
}
export interface RollbackResult {
    ok: boolean;
    /** Machine-readable failure reason when ok is false. */
    reason?: 'missing-session' | 'nothing-to-recall';
    /** Session id the rollback acted on. */
    sessionId: string;
    /** Lines removed from the log tail. */
    removedLines: number;
    /** Whether the removed tail was an in-flight turn. */
    inFlight: boolean;
    /** The recalled user message content (text plus attachment metadata). */
    recalled?: RecalledContent;
    /** Whether a restart/reopen is required for the GUI to reflect the change. */
    requiresRestart: true;
}
/**
 * Extract the last user message from a removed tail: joined text parts and
 * attachment metadata (name/media type; bytes live in the host attachment
 * store, so only the names are recoverable after the fact).
 */
export declare function extractRecalledUserMessage(removedTail: readonly string[]): RecalledContent | null;
/**
 * Apply the recall truncation to the latest turn of a session's event log.
 * @param sessionId - the session to roll back.
 * @param root - the sessions store root (defaults to the harness one).
 * @returns the rollback result (or the failure reason).
 */
export declare function applyRollback(sessionId: string, root?: string): RollbackResult;
