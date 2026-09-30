/** @vitest-environment jsdom */

/**
 * The sidebar usage action trigger: one icon-only button seated where the
 * download (self-update) trigger used to sit. It opts into the shared footer
 * entry layout, carries the localized usage label and a usage chart glyph.
 * Given a label and an open callback,
 * when the user taps the trigger, then the dashboard opens once.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { UsageFootAction } from '../src/client/UsageFootAction.tsx'
import { __test, mountUsageFootAction } from '../src/client/foot-card-mount.tsx'

afterEach(() => {
  cleanup()
  document.head.innerHTML = ''
})

describe('sidebar usage foot action', () => {
  it('user sees one icon trigger with the localized label and the bar glyph', () => {
    // Given a persisted usage label
    const { getByTitle, container } = render(<UsageFootAction label={() => 'Usage'} onOpen={() => {}} />)
    // When the foot action mounts
    // Then the trigger is a button carrying the label and the bar glyph
    const trigger = getByTitle('Usage')
    expect(trigger.tagName).toBe('BUTTON')
    expect(trigger.getAttribute('aria-label')).toBe('Usage')
    expect(trigger.getAttribute('data-dsh-plugin')).toBe('usage')
    expect(trigger.getAttribute('data-dsh-part')).toBe('entry')
    expect(trigger.hasAttribute('data-wide')).toBe(false)
    expect(container.querySelectorAll('button svg path').length).toBe(3)
  })

  it('user taps the trigger and the dashboard opens once', () => {
    // Given the open callback spy and the trigger
    const onOpen = vi.fn()
    const { getByTitle, container } = render(<UsageFootAction label={() => 'Usage'} onOpen={onOpen} />)
    // When the user taps the trigger
    fireEvent.click(getByTitle('Usage'))
    // Then the dashboard opens exactly once and the trigger stays mounted
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(container.querySelector('button svg path')).toBeInstanceOf(SVGElement)
  })

  it('operator marks the collapsed rail variant for the shared footer stack rule', () => {
    // Given the official footer slot renders in the collapsed rail
    const { getByTitle } = render(<UsageFootAction label={() => 'Usage'} onOpen={() => {}} wide={false} />)
    // When the trigger mounts
    const trigger = getByTitle('Usage')
    // Then it carries the same rail marker as the retired download trigger.
    expect(trigger.getAttribute('data-wide')).toBe('rail')
    expect(trigger.getAttribute('data-rail')).toBe('rail')
  })

  it('operator contributes Usage to the old download position in the official footer action slot', () => {
    // Given a slot registry that immediately declares the official footer action slot
    const props = { label: () => 'Usage', onOpen: () => {} }
    const disposeRegistration = vi.fn()
    const disposeWait = vi.fn()
    const register = vi.fn((_options: { inject: () => typeof props }, _component: unknown) => disposeRegistration)
    const inject = vi.fn((_key: string, callback: () => () => void) => {
      const disposeActive = callback()
      return () => {
        disposeActive()
        disposeWait()
      }
    })

    // When the usage foot action mounts
    const dispose = mountUsageFootAction({ slots: { inject, register } as never }, props)

    // Then it registers one real slot entry at the default order. In the aggregate
    // load order, Remote access registers first and Usage follows in the removed
    // download trigger's visual position.
    expect(inject).toHaveBeenCalledWith(__test.FOOT_ACTION_SLOT, expect.any(Function))
    expect(register).toHaveBeenCalledWith({
      name: __test.FOOT_ACTION_SLOT,
      id: 'dsh-usage',
      order: __test.FOOT_ACTION_ORDER,
      inject: expect.any(Function),
    }, UsageFootAction)
    expect(__test.FOOT_ACTION_ORDER).toBe(0)
    expect(register.mock.calls[0]?.[0].inject()).toBe(props)
    // And it leaves the aggregate's own foot layout untouched: a second shim
    // here fought that rule and centred the action cluster.
    expect(document.head.querySelector('style')).toBeNull()

    dispose()
    expect(disposeRegistration).toHaveBeenCalledTimes(1)
    expect(disposeWait).toHaveBeenCalledTimes(1)
  })
})
