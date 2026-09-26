/** @vitest-environment jsdom */

/**
 * The sidebar usage action trigger: one icon-only button seated where the
 * download (self-update) trigger used to sit. It carries the localized
 * usage label and a statistics bar-chart glyph. Given a label and an open
 * callback, when the user taps the trigger, then the dashboard opens once.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { UsageFootAction } from '../src/client/UsageFootAction.tsx'

afterEach(cleanup)

describe('sidebar usage foot action', () => {
  it('user sees one icon trigger with the localized label and the bar glyph', () => {
    // Given a persisted usage label
    const { getByTitle, container } = render(<UsageFootAction label={() => 'Usage'} onOpen={() => {}} />)
    // When the foot action mounts
    // Then the trigger is a button carrying the label and the bar glyph
    expect(getByTitle('Usage').tagName).toBe('BUTTON')
    expect(getByTitle('Usage').getAttribute('aria-label')).toBe('Usage')
    expect(container.querySelectorAll('button svg path').length).toBe(4)
  })

  it('user taps the trigger and the dashboard opens once', () => {
    // Given the open callback spy and the trigger
    const onOpen = vi.fn()
    const { getByTitle, container } = render(<UsageFootAction label={() => 'Usage'} onOpen={onOpen} />)
    // When the user taps the trigger
    fireEvent.click(getByTitle('Usage'))
    // Then the dashboard opens exactly once and the trigger stays mounted
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(container.querySelector('button svg path')).not.toBeNull()
  })
})