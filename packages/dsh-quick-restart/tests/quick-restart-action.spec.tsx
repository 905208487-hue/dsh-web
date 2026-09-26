// @vitest-environment jsdom
/**
 * Runtime evidence for the header action (settings.action, beside
 * 「打开配置文件」): it renders the compact restart button, keeps the confirm
 * gate, waits for the replacement host and reloads the page.
 */

import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QuickRestartAction } from '../src/client/QuickRestartAction.tsx'
import type { QuickRestartFace } from '../src/client/face.ts'

let container: HTMLDivElement
let reload: ReturnType<typeof vi.fn>

function face(overrides: Partial<QuickRestartFace> = {}): QuickRestartFace {
  return {
    status: async () => ({ pid: 7, port: 3080, startedAt: 0 }),
    restart: async () => ({ ok: true }),
    waitUntilRestarted: async () => true,
    ...overrides,
  }
}

function renderAction(props: QuickRestartFace): void {
  container = document.createElement('div')
  document.body.appendChild(container)
  act(() => {
    createRoot(container).render(createElement(QuickRestartAction, props))
  })
}

function actionButton(): HTMLButtonElement | null {
  return container.querySelector('button')
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

describe('QuickRestartAction', () => {
  it('operator sees the restart button labelled for the service', () => {
    // Given the settings header action slot
    // When the component renders
    // Then it shows the restart label
    renderAction(face())
    expect(container.textContent).toContain('重启 DSH 服务')
  })

  it('operator gets nothing sent when the confirm is declined', async () => {
    // Given a confirm gate the operator declines
    // When the header button is clicked
    // Then no restart request is sent
    const restart = vi.fn(async () => ({ ok: true }))
    renderAction(face({ restart }))
    vi.mocked(window.confirm).mockReturnValue(false)
    await act(async () => {
      actionButton()?.click()
      await Promise.resolve()
    })
    expect(actionButton()?.textContent).toContain('重启 DSH 服务')
    expect(actionButton()?.disabled).toBe(false)
    expect(restart).not.toHaveBeenCalled()
  })

  it('operator gets the page reloaded after the replacement host answers', async () => {
    // Given a confirmed restart and a host that reports back
    // When the header button is clicked
    // Then the restart is armed once, the wait resolves and the page reloads
    const restart = vi.fn(async () => ({ ok: true }))
    const waitUntilRestarted = vi.fn(async () => true)
    renderAction(face({ restart, waitUntilRestarted }))
    await act(async () => {
      actionButton()?.click()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(restart).toHaveBeenCalledTimes(1)
    expect(waitUntilRestarted).toHaveBeenCalledWith(7)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('operator reads the failure through the button title when the restart cannot be armed', async () => {
    // Given a host that refuses to arm the helper
    // When the header button is clicked
    // Then the button carries the error and no reload happens
    renderAction(face({ restart: async () => ({ ok: false, error: 'EPERM' }) }))
    await act(async () => {
      actionButton()?.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(actionButton()?.title).toContain('EPERM')
    expect(reload).not.toHaveBeenCalled()
  })
})