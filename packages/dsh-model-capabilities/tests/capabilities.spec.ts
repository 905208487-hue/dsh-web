/**
 * Core capability-declaration logic: view reads, model-array drafts, and the
 * path-op building shared with the model-name panel and the provider enable
 * orchestration. The per-model reasoning-effort editor was removed, so the
 * draft/validation helpers are gone with it.
 */

import { describe, expect, it } from 'vitest'
import {
  buildModelsOp,
  modelsArrayOf,
  readAt,
  sanitizeEntry,
  type ModelEntryDraft,
} from '../src/core/capabilities.ts'

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

describe('modelsArrayOf', () => {
  it('rejects non-arrays', () => {
    expect(modelsArrayOf(undefined)).toBeUndefined()
    expect(modelsArrayOf({ id: 'x' })).toBeUndefined()
  })

  it('keeps entries with a non-empty string id and preserves unknown fields', () => {
    const compat = { supportsReasoningEffort: true }
    const value = [
      { id: 'gpt-x', name: 'GPT X', compat },
      { name: 'no id' },
      'junk',
    ]
    const entries = modelsArrayOf(value)
    expect(entries).toHaveLength(1)
    expect(entries?.[0]?.name).toBe('GPT X')
    expect(entries?.[0]?.compat).toBe(compat)
  })
})

describe('sanitizeEntry', () => {
  it('drops undefined values and preserves unknown fields', () => {
    const entry = { id: 'm', name: undefined, extra: { a: 1 } } as unknown as ModelEntryDraft
    const clean = sanitizeEntry(entry)
    expect(clean).toEqual({ id: 'm', extra: { a: 1 } })
    expect('name' in clean).toBe(false)
  })

  it('clones nested values so later edits never alias stored state', () => {
    const extra = { a: 1 }
    const clean = sanitizeEntry({ id: 'm', extra })
    expect(clean['extra']).not.toBe(extra)
  })
})

describe('buildModelsOp', () => {
  it('replaces the whole models array below the provider path', () => {
    const op = buildModelsOp(['providers', 'acme'], [
      { id: 'gpt-x', name: 'GPT X', input: ['text', 'image'] },
    ])
    expect(op.op).toBe('set')
    expect(op.path).toEqual(['providers', 'acme', 'models'])
    expect(op.value).toEqual([
      { id: 'gpt-x', name: 'GPT X', input: ['text', 'image'] },
    ])
  })
})