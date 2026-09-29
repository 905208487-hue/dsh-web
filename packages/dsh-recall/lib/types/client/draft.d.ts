/**
 * Recall draft persistence: after a rollback the recalled content is stored
 * per session so that after the required reopen/restart the composer is
 * refilled automatically when the conversation opens again. Attachments can
 * only be re-listed by name (their bytes live in the host attachment store
 * and cannot be re-mounted after the fact).
 * @module @linxin666/dsh-recall/client/draft
 */
/** Recalled content stored per session (mirrors the host response shape). */
export interface RecalledContent {
    text: string;
    attachments: Array<{
        name: string;
        mediaType: string;
    }>;
}
/** Save the recalled content as the pending refill for a session. */
export declare function saveDraft(sessionId: string, content: RecalledContent): void;
/** Take and remove the pending draft for a session (null when none). */
export declare function takeDraft(sessionId: string): RecalledContent | null;
