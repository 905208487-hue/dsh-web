/**
 * Client-side cleanup after a successful recall: the recalled latest turn's
 * flow rows vanish from the open conversation immediately — the operator sees
 * their message and its reply removed without reopening the session or
 * restarting dsh. The on-disk facts stay authoritative (the host route already
 * truncated the event log); this module only keeps the visible flow in step.
 *
 * The official chat shell renders every turn's content as flow rows marked
 * with `data-chat-turn=<number>` (ascending along the conversation) and a
 * stable identity key on `data-chat-anchor-key` (mirrored on
 * `data-chat-flow-key`). Disk recall semantics (core/rollback) cut everything
 * from the turn containing the LAST real user message through the end of the
 * log, so the client mirror is: anchor on the LAST flow row of kind `user` or
 * `steering` (the shell's own selector for operator-typed messages — injected
 * platform content never renders as `user`), then remove every row whose turn
 * number is that row's or higher.
 *
 * The shell renders rows from its own React store (the running host keeps the
 * session in memory), so a later reconciliation re-creates removed rows.
 * Every removed row's anchor key therefore lands in a page-level stylesheet,
 * and the key sets persist per session (localStorage, best effort): re-created
 * rows are hidden by attribute selector while the SPA lives, and the same keys
 * cannot reappear elsewhere — anchor keys derive from event identity, so both
 * a re-sent message and a post-reopen reload render fresh keys, which keeps
 * stale rules inert instead of hiding new content. Storage-unavailable
 * environments fall back to the in-page map: hiding still works for the whole
 * page lifetime, only the cross-reload persistence is lost.
 * @module @linxin666/dsh-recall/client/cleanup
 */
/**
 * Remove the recalled latest turn's rows from the open conversation flow and
 * remember their identity keys so re-created rows stay hidden. No-op when no
 * conversation is open or no operator message anchors the flow (the disk
 * rollback's outcome is unaffected either way).
 * @param sessionId - the session whose recall just succeeded on disk.
 */
export declare function hideRecalledTail(sessionId: string): void;
/**
 * Drop the plugin's page-level hidden stylesheet (plugin disposal): the
 * persisted key sets survive a reload so re-created rows stay hidden there.
 * @returns disposer removing the stylesheet.
 */
export declare function recallCleanupDisposer(): () => void;
