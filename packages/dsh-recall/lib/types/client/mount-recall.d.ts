/**
 * Browser-side conversation recall (撤回): the trigger mounts in the latest
 * message's action row, right beside its copy button, visible only for the
 * LATEST turn and only while no turn is streaming. Clicking it confirms once, calls the host
 * rollback route with the active session id, and reports the outcome (the
 * host flags that a reopen or restart is required).
 *
 * Anchors on the official chat DOM semantics observed in the 0.1.7 shell:
 * `[data-pane="conversation"]` holds `[data-conversation-session]` (the
 * active session id) and the message flow `[data-chat-flow]`; a running turn
 * exposes `[data-streaming]` / `[data-state="running"]` / `[aria-busy="true"]`.
 * @module @linxin666/dsh-recall/client/mount-recall
 */
import { type RecallTriggerProps } from './RecallTrigger.tsx';
/** Stable data attribute identifying the injected recall trigger container. */
export declare const RECALL_SELECTOR = "[data-dsh-recall-trigger]";
/** The active conversation's session id (null outside a chat view). */
export declare function recallSessionId(): string | null;
/** Whether a turn is currently streaming in the conversation pane. */
export declare function isTurnInFlight(): boolean;
/**
 * Mount the recall trigger beside the open conversation's latest copy button.
 * @param props - label and rollback request inputs.
 * @returns disposer removing the container and its observers.
 */
export declare function mountRecallTrigger(props: RecallTriggerProps): () => void;
