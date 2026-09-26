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
  text: string
  attachments: Array<{ name: string; mediaType: string }>
}

const DRAFT_PREFIX = 'dsh-recall.draft.'

/** Save the recalled content as the pending refill for a session. */
export function saveDraft(sessionId: string, content: RecalledContent): void {
  try {
    window.localStorage.setItem(DRAFT_PREFIX + sessionId, JSON.stringify({ ...content, at: Date.now() }))
  } catch {
    // Storage full or blocked: the immediate refill still ran.
  }
}

/** Take and remove the pending draft for a session (null when none). */
export function takeDraft(sessionId: string): RecalledContent | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_PREFIX + sessionId)
    if (raw === null) return null
    window.localStorage.removeItem(DRAFT_PREFIX + sessionId)
    const parsed = JSON.parse(raw) as RecalledContent
    if (typeof parsed.text !== 'string') return null
    return parsed
  } catch {
    return null
  }
}