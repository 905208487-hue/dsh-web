/**
 * The recall trigger: a small tail-of-conversation button. Clicking it
 * confirms once, POSTs the active session id to the host rollback route,
 * removes the latest turn's rows from the visible flow immediately, and keeps
 * the recalled content available as a composer draft (the reopen/restart
 * note covers the host-memory side, not the visible flow).
 * @module @linxin666/dsh-recall/client/RecallTrigger
 */
import type { RecallKey } from './locales.ts';
export interface RecallTriggerProps {
    /** Translate bound to the recall locale namespace. */
    t: (key: RecallKey, params?: Record<string, unknown>) => string;
    /** Resolve the active session id (null when no conversation is open). */
    sessionId: () => string | null;
    /** Whether a turn is currently streaming (recall disabled then). */
    inFlight: () => boolean;
}
/** Outcome strings the button surfaces after the rollback call. */
export type RecallOutcome = 'idle' | 'loading' | 'done' | 'missing' | 'none' | 'failed';
export declare function RecallTrigger({ t, sessionId, inFlight }: RecallTriggerProps): import("react").JSX.Element;
