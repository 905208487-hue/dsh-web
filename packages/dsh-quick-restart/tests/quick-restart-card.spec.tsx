// @vitest-environment jsdom
/**
 * Runtime evidence for the quick-restart settings card: it renders the live
 * status document (PID, port, start time), gates the restart behind a
 * confirm step, and switches to the restarting state only after the confirm
 * passes and the host route answers.
 */

import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QuickRestartCard, type QuickRestartFace, type QuickRestartStatusView } from '../src/client/QuickRestartCard.tsx'

let container: HTMLDivElement

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

beforeEach(() => {
  vi.stubGlobal('confirm', vi.fn(() => true))
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
    const face: QuickRestartFace = {
      status: () => status.promise,
      restart: vi.fn(async () => ({ ok: true })),
    }
    renderCard(face)
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
    const status = deferredStatus()
    const restart = vi.fn(async () => ({ ok: true }))
    renderCard({ status: () => status.promise, restart })
    await act(async () => {
      status.resolve({ pid: 1, port: 3080, startedAt: 0 })
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

  it('operator sees a restart failure instead of staying in the restarting state', async () => {
    // Given a host that fails to arm the restart helper
    // When the operator confirms the restart and the route answers failure
    // Then the error is surfaced in the card
    const status = deferredStatus()
    const face: QuickRestartFace = {
      status: () => status.promise,
      restart: vi.fn(async () => ({ ok: false, error: 'EPERM' })),
    }
    renderCard(face)
    await act(async () => {
      status.resolve({ pid: 1, port: 3080, startedAt: 0 })
      await Promise.resolve()
    })
    await act(async () => {
      button()?.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(container.textContent).toContain('EPERM')
  })
})