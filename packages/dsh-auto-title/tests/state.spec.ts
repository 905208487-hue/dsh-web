import { mkdtemp, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { AutoTitleStateStore, emptyState, parseState } from '../src/host/state.ts'

describe('auto-title state store', () => {
  it('operator gets an empty v1 document when the stored state is unusable', () => {
    // Given a state file written by a newer schema version
    // When the document is parsed
    // Then the plugin starts from an empty v1 state instead of trusting the unknown shape
    expect(parseState({ schemaVersion: 2, sessions: { a: {} } })).toEqual(emptyState())
    // And a well-formed v1 document keeps the fields the plugin actually uses
    expect(parseState({ schemaVersion: 1, sessions: { a: { lastProcessedSeq: 3, generatedTitle: 'A', locked: true } } })).toEqual({
      schemaVersion: 1,
      sessions: { a: { lastProcessedSeq: 3, generatedTitle: 'A', locked: true } },
    })
  })

  it('operator keeps the per-session cursors across a store write and read', async () => {
    // Given a store rooted at a temporary directory
    // When one session cursor is committed through the store
    // Then the file on disk holds that session's sequence and generated title
    const dir = await mkdtemp(join(tmpdir(), 'dsh-auto-title-'))
    const file = join(dir, 'state.json')
    const store = new AutoTitleStateStore(file)
    await store.mutate(state => {
      state.sessions.sessionA = { lastProcessedSeq: 7, generatedTitle: 'Checkout | retry' }
    })
    const raw = JSON.parse(await readFile(file, 'utf8')) as unknown
    expect(parseState(raw)).toEqual({
      schemaVersion: 1,
      sessions: { sessionA: { lastProcessedSeq: 7, generatedTitle: 'Checkout | retry' } },
    })
  })
})
