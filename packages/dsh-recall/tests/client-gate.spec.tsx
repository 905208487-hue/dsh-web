/** @vitest-environment jsdom */

/**
 * Recall trigger gating: the trigger resolves the active session id from the
 * conversation pane and hides while a turn is streaming. Given an open
 * conversation, when the session marker is present and nothing is streaming,
 * then the recall session id resolves and the turn is not in flight; while a
 * streaming marker exists, then the turn is in flight.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { recallSessionId, isTurnInFlight } from '../src/client/mount-recall.ts'

afterEach(() => { document.body.innerHTML = '' })

/** Render a conversation pane with optional markers. */
function chatPane(withSession: string | null, streaming: boolean): void {
  const pane = document.createElement('div')
  pane.setAttribute('data-pane', 'conversation')
  if (withSession !== null) pane.setAttribute('data-conversation-session', withSession)
  const flow = document.createElement('div')
  flow.setAttribute('data-chat-flow', '')
  pane.append(flow)
  if (streaming) {
    const tail = document.createElement('div')
    tail.setAttribute('data-streaming', '')
    flow.append(tail)
  }
  document.body.append(pane)
}

describe('conversation recall trigger gating', () => {
  it('user resolves the session id from an open conversation', () => {
    // Given a conversation pane carrying the session marker
    chatPane('session-aa-11', false)
    // When the session is resolved
    const id = recallSessionId()
    // Then the marker's id is returned
    expect(id).toBe('session-aa-11')
  })

  it('user gets no session id outside a chat view', () => {
    // Given a page without a conversation pane
    // When the session is resolved
    const id = recallSessionId()
    // Then there is nothing to recall against
    expect(id).toBeNull()
  })

  it('user sees a streaming turn as in flight', () => {
    // Given a conversation with a streaming tail marker
    chatPane('session-aa-11', true)
    // When the in-flight flag is read
    const busy = isTurnInFlight()
    // Then the recall gate is closed
    expect(busy).toBe(true)
  })

  it('user sees a finished turn as not in flight', () => {
    // Given a conversation without streaming markers
    chatPane('session-aa-11', false)
    // When the in-flight flag is read
    const busy = isTurnInFlight()
    // Then the recall gate is open
    expect(busy).toBe(false)
  })
})