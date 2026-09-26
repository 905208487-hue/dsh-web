/**
 * Core shared logic: settings-path view reads. The per-model capability
 * editors and the provider display-name line were removed, so the draft and
 * op-building helpers are gone with them.
 */

import { describe, expect, it } from 'vitest'
import { readAt } from '../src/core/capabilities.ts'

describe('readAt', () => {
  const section = { providers: { acme: { models: [{ id: 'gpt-x' }] } } }

  it('walks plain objects', () => {
    expect(readAt(section, ['providers', 'acme'])).toEqual({ models: [{ id: 'gpt-x' }] })
    expect(readAt(section, ['providers', 'acme', 'models'])).toEqual([{ id: 'gpt-x' }])
  })

  it('returns undefined past a missing or non-object link', () => {
    expect(readAt(section, ['providers', 'nope'])).toBeUndefined()
    expect(readAt(section, ['providers', 'acme', 'models', 'id'])).toBeUndefined()
    expect(readAt(undefined, ['providers'])).toBeUndefined()
  })
})