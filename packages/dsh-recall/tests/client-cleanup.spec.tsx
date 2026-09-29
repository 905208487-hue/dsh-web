/** @vitest-environment jsdom */

/**
 * Client cleanup after a successful recall: the latest turn's flow rows leave
 * the open conversation immediately. Given a rendered flow, when the cleanup
 * runs for the recalled session, then every row from the last operator
 * message's turn onward is removed, its anchor keys land in the page
 * stylesheet, earlier turns stay put, a flow without an operator message is
 * left untouched, and each spec starts from a fresh module state.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  document.body.innerHTML = ''
  document.head.innerHTML = ''
})

/** A flow row in the official chat shell's markup. */
function flowRow(turn: number, kind: string | null, key: string): HTMLElement {
  const row = document.createElement('div')
  row.setAttribute('data-chat-turn', String(turn))
  row.setAttribute('data-chat-anchor-key', key)
  row.setAttribute('data-chat-flow-key', key)
  if (kind !== null) row.setAttribute('data-chat-flow-kind', kind)
  return row
}

/** Render a conversation pane whose flow holds the given rows. */
function chatPane(rows: Array<HTMLElement>): HTMLElement {
  const pane = document.createElement('div')
  pane.setAttribute('data-pane', 'conversation')
  pane.setAttribute('data-conversation-session', 'session-aa-11')
  const flow = document.createElement('div')
  flow.setAttribute('data-chat-flow', '')
  flow.append(...rows)
  pane.append(flow)
  document.body.append(pane)
  return flow
}

/** The stylesheet attribute-selector rule for an identity key. */
function ruleFor(key: string): string {
  const escaped = key.replace(/[\\"]/g, (ch) => '\\' + ch)
  return `[data-chat-anchor-key="${escaped}"]{display:none!important}`
}

describe('client cleanup after recall', () => {
  let hideRecalledTail: typeof import('../src/client/cleanup.ts').hideRecalledTail
  let recallCleanupDisposer: typeof import('../src/client/cleanup.ts').recallCleanupDisposer

  beforeEach(async () => {
    // Fresh module state per spec: the hidden map and stylesheet live on the
    // module, so isolation comes from a re-import instead of a test hook.
    vi.resetModules()
    ;({ hideRecalledTail, recallCleanupDisposer } = await import('../src/client/cleanup.ts'))
  })

  it('user sees the recalled turn and its reply leave the flow immediately', () => {
    // Given a flow with an older turn and a newer turn (message plus reply)
    const flow = chatPane([
      flowRow(0, 'user', 'u0'),
      flowRow(0, 'assistant', 'a0'),
      flowRow(1, 'user', 'u1'),
      flowRow(1, 'assistant', 'a1'),
    ])
    // When the recall succeeds for the active session
    hideRecalledTail('session-aa-11')
    // Then the turn 1 rows are gone and the turn 0 rows remain
    expect(flow.querySelectorAll('[data-chat-turn="1"]')).toHaveLength(0)
    expect(flow.querySelectorAll('[data-chat-turn="0"]')).toHaveLength(2)
  })

  it('user keeps re-created rows hidden through the persisted rule set', () => {
    // Given a flow whose latest turn was just recalled away
    const flow = chatPane([
      flowRow(0, 'user', 'u0'),
      flowRow(1, 'user', 'u1'),
    ])
    hideRecalledTail('session-aa-11')
    // When the shell reconciles and re-creates a removed row (same identity keys)
    const recreated = flowRow(1, 'user', 'u1')
    flow.append(recreated)
    // Then the page stylesheet rules hide it by its stable anchor key
    const styleText = document.querySelector('style[data-dsh-recall-hidden]')?.textContent ?? ''
    expect(styleText).toContain(ruleFor('u1'))
    expect(window.getComputedStyle(recreated).display).toBe('none')
  })

  it('user chains recalls and removes the next latest turn as well', () => {
    // Given a flow reduced by one recall to its older turn
    const flow = chatPane([
      flowRow(0, 'user', 'u0'),
      flowRow(0, 'assistant', 'a0'),
    ])
    // When recalling again with no re-render in between
    hideRecalledTail('session-aa-11')
    // Then the remaining turn leaves the flow and its key joins the rule set
    expect(flow.querySelectorAll('[data-chat-turn]')).toHaveLength(0)
    expect(document.querySelector('style[data-dsh-recall-hidden]')!.textContent).toContain(ruleFor('u0'))
  })

  it('user cannot hide a flow that has no operator message', () => {
    // Given a flow whose rows are assistant content only
    const flow = chatPane([flowRow(0, 'assistant', 'a0')])
    // When the cleanup runs
    hideRecalledTail('session-aa-11')
    // Then nothing was removed and no rules were produced
    expect(flow.querySelectorAll('[data-chat-turn]')).toHaveLength(1)
    expect(document.querySelector('style[data-dsh-recall-hidden]')).toBeNull()
  })

  it('user gets safely escaped rules for keys that carry quotes', () => {
    // Given a turn whose identity key embeds a double quote (JSON pairing)
    const flow = chatPane([
      flowRow(0, 'user', 'q0'),
      flowRow(1, 'user', 'q"1'),
    ])
    // When the cleanup runs
    hideRecalledTail('session-aa-11')
    // Then the selector quotes are escaped, not inlined raw
    const style = document.querySelector('style[data-dsh-recall-hidden]')
    expect(style!.textContent).toContain(ruleFor('q"1'))
    expect(flow.querySelectorAll('[data-chat-turn="1"]')).toHaveLength(0)
  })

  it('user has the hidden stylesheet removed when the plugin unmounts', () => {
    // Given a hidden rule set from a previous recall
    chatPane([flowRow(1, 'user', 'u1')])
    hideRecalledTail('session-aa-11')
    // When the plugin unmounts
    recallCleanupDisposer()()
    // Then the stylesheet is gone from the page
    expect(document.querySelector('style[data-dsh-recall-hidden]')).toBeNull()
  })
})
