// @vitest-environment jsdom
/**
 * Runtime evidence for the quick-restart settings card: it renders the live
 * status document (PID, port, start time), gates the restart behind a confirm
 * step, and waits for the replacement host before reloading the page.
 */

import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QuickRestartCard, type QuickRestartFace, type QuickRestartStatusView } from '../src/client/QuickRestartCard.tsx'

let container: HTMLDivElement
let reload: ReturnType<typeof vi.fn>

function renderCard(face: QuickRestartFace): void {
  container = document.createElement('div')
  document.body.appendChild(container)
  act(() => {
    createRoot(container).render(createElement(QuickRestartCard, face))
  })
}

function button(): HTMLButtonElement | null {
  return container.querySelector('[data-dsh-part="restart-button"]') as HTMLButtonElement | null
}

function deferredStatus(): { promise: Promise<QuickRestartStatusView>; resolve: (v: QuickRestartStatusView) => void } {
  let resolve!: (v: QuickRestartStatusView) => void
  const promise = new Promise<QuickRestartStatusView>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

/** A face whose status resolves immediately and whose restart flow is scripted. */
function face(overrides: Partial<QuickRestartFace> = {}): QuickRestartFace {
  return {
    status: async () => ({ pid: 1, port: 3080, startedAt: 0 }),
    restart: async () => ({ ok: true }),
    waitUntilRestarted: async () => true,
    ...overrides,
  }
}

beforeEach(() => {
  vi.stubGlobal('confirm', vi.fn(() => true))
  reload = vi.fn()
  vi.stubGlobal('location', { reload })
})

afterEach(() => {
  vi.unstubAllGlobals()
  container?.remove()
})

describe('QuickRestartCard', () => {
  it('operator sees the hint and the live status document once the status resolves', async () => {
    // Given a host that answers the status probe
    // When the card mounts and the status promise resolves
    // Then the hint and the pid/port/start-time line render
    const status = deferredStatus()
    renderCard(face({ status: () => status.promise }))
    await act(async () => {
      status.resolve({ pid: 4242, port: 3080, startedAt: 1_700_000_000_000 })
      await Promise.resolve()
    })
    expect(container.textContent).toContain('3080')
    expect(container.textContent).toContain('4242')
    expect(container.querySelector('[data-dsh-part="hint"]')?.textContent).toContain('提示')
  })

  it('operator must confirm before the restart is sent', async () => {
    // Given a card showing an idle status and a confirm gate
    // When the operator first declines and then confirms the restart
    // Then a declined confirm sends nothing and a confirmed one sends exactly once
    const restart = vi.fn(async () => ({ ok: true }))
    renderCard(face({ restart }))
    await act(async () => {
      await Promise.resolve()
    })

    vi.mocked(window.confirm).mockReturnValue(false)
    act(() => {
      button()?.click()
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(restart).not.toHaveBeenCalled()

    vi.mocked(window.confirm).mockReturnValue(true)
    await act(async () => {
      button()?.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(restart).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain('正在重启')
  })

  it('operator gets the page reloaded once the replacement host answers', async () => {
    // Given a scripted restart that reports the host back
    // When the operator confirms the restart
    // Then the card waits for the replacement and reloads the page
    const waitUntilRestarted = vi.fn(async () => true)
    renderCard(face({ waitUntilRestarted }))
    await act(async () => {
      await Promise.resolve()
    })
    await act(async () => {
      button()?.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(waitUntilRestarted).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain('正在重启')
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('operator sees a timeout message when the host never comes back', async () => {
    // Given a restart whose replacement never answers
    // When the operator confirms the restart and the wait expires
    // Then the card reports the timeout instead of reloading
    renderCard(face({ waitUntilRestarted: async () => false }))
    await act(async () => {
      await Promise.resolve()
    })
    await act(async () => {
      button()?.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(container.textContent).toContain('服务未在预期时间内恢复')
    expect(reload).not.toHaveBeenCalled()
  })

  it('operator sees a restart failure instead of staying in the restarting state', async () => {
    // Given a host that fails to arm the restart helper
    // When the operator confirms the restart and the route answers failure
    // Then the error is surfaced in the card without a reload
    renderCard(face({ restart: async () => ({ ok: false, error: 'EPERM' }) }))
    await act(async () => {
      await Promise.resolve()
    })
    await act(async () => {
      button()?.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(container.textContent).toContain('EPERM')
    expect(reload).not.toHaveBeenCalled()
  })
})