/**
 * Core capability-declaration logic: view reads and the path-op types shared
 * with the provider enable orchestration. The per-model reasoning-effort
 * editor was removed, so the draft/validation helpers are gone with it.
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