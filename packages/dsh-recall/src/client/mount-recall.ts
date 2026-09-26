/**
 * Browser-side conversation recall (撤回): the trigger mounts at the tail of
 * the open conversation's message flow, visible only for the LATEST turn and
 * only while no turn is streaming. Clicking it confirms once, calls the host
 * rollback route with the active session id, and reports the outcome (the
 * host flags that a reopen or restart is required).
 *
 * Anchors on the official chat DOM semantics observed in the 0.1.7 shell:
 * `[data-pane="conversation"]` holds `[data-conversation-session]` (the
 * active session id) and the message flow `[data-chat-flow]`; a running turn
 * exposes `[data-streaming]` / `[data-state="running"]` / `[aria-busy="true"]`.
 * @module @linxin666/dsh-recall/client/mount-recall
 */

import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { subscribeBodyInvalidations } from './body-mutations.ts'
import { RecallTrigger, type RecallTriggerProps } from './RecallTrigger.tsx'

/** Stable data attribute identifying the injected recall trigger container. */
export const RECALL_SELECTOR = '[data-dsh-recall-trigger]'

/** The active conversation's session id (null outside a chat view). */
export function recallSessionId(): string | null {
  const pane = document.querySelector<HTMLElement>('[data-pane="conversation"]')
  if (pane === null) return null
  if (pane.dataset.conversationSession !== undefined) return pane.dataset.conversationSession || null
  const el = pane.querySelector<HTMLElement>('[data-conversation-session]')
  return el?.getAttribute('data-conversation-session') ?? null
}

/** Whether a turn is currently streaming in the conversation pane. */
export function isTurnInFlight(): boolean {
  return document.querySelector('[data-streaming], [data-state="running"], [aria-busy="true"]') !== null
}

/**
 * Mount the recall trigger at the tail of the open conversation flow.
 * @param props - label and rollback request inputs.
 * @returns disposer removing the container and its observers.
 */
export function mountRecallTrigger(props: RecallTriggerProps): () => void {
  if (typeof document !== 'undefined' && document.querySelector(RECALL_SELECTOR) !== null) {
    return () => {}
  }
  const container = document.createElement('div')
  container.setAttribute('data-dsh-recall-trigger', '')
  const root: Root = createRoot(container)
  root.render(createElement(RecallTrigger, props))

  /** Keep the trigger at the chat flow tail; hide for history sockets or in-flight turns. */
  const place = (): void => {
    const pane = document.querySelector('[data-pane="conversation"]')
    const flow = pane?.querySelector<HTMLElement>('[data-chat-flow]')
    if (pane == null || flow == null) {
      if (container.parentElement !== null) container.remove()
      return
    }
    if (container.parentElement !== flow) flow.append(container)
    // The recall gate: only the latest turn's tail, and only when it finished.
    container.style.display = props.sessionId() !== null && !props.inFlight() ? 'flex' : 'none'
  }
  place()
  const unsubscribeBody = subscribeBodyInvalidations(place)

  return () => {
    unsubscribeBody()
    root.unmount()
    container.remove()
  }
}