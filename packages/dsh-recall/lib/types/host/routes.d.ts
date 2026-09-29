/**
 * Recall API routes: POST /api/dsh-recall/rollback applies the latest-turn
 * truncation to a session's on-disk log. Loopback-only, POST-only, and the
 * body carries the session id. The response flags that a reopen (or restart)
 * is required for the GUI view to reflect the change.
 * @module @linxin666/dsh-recall/host/routes
 */
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver';
export declare const RECALL_API_PREFIX = "/api/dsh-recall";
/** POST body of the rollback route. */
export interface RollbackBody {
    sessionId: string;
}
/** Build the recall API routes. */
export declare function makeRecallRoutes(): WebRoute[];
