/**
 * Host rollback IO rules: applying the recall cut rewrites the session's
 * zstd-compressed event log on disk, keeps a timestamped backup, and reports
 * whether a reopen is needed. Given a store root and a session id, when the
 * log has a completed turn, then the latest turn is truncated and a backup is
 * left next to the log.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zstdCompressSync, zstdDecompressSync } from 'node:zlib'
import { applyRollback, sessionLogPath } from '../src/host/rollback.ts'

function encodeEvents(events: Array<string | Record<string, unknown>>): Uint8Array {
  const lines = events.map(e => (typeof e === 'string' ? e : JSON.stringify(e))).join('\n')
  return zstdCompressSync(Buffer.from(lines + '\n', 'utf8'))
}

function decodeFile(path: string): string {
  return zstdDecompressSync(readFileSync(path)).toString('utf8')
}

const originalEvents = [
  { type: 'session', id: 's' },
  { type: 'permission/preset' },
  { type: 'turn/start', turn: 1 },
  { type: 'user/message', turn: 1 },
  { type: 'assistant/message', turn: 1 },
  { type: 'turn/end', turn: 1 },
  { type: 'turn/start', turn: 2 },
  { type: 'user/message', turn: 2 },
]

let root: string
let dir: string
let logPath: string

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'dsh-recall-io-'))
  dir = join(root, 'workspace', 'sess-0000-1111')
  mkdirSync(dir, { recursive: true })
  logPath = join(dir, 'session.v4.jsonl.zstd')
  writeFileSync(logPath, encodeEvents(originalEvents))
})

afterAll(() => { rmSync(root, { recursive: true, force: true }) })

describe('conversation recall host rollback', () => {
  it('user rolls back the latest turn and leaves a backup file', () => {
    // Given the session log on disk with an in-flight latest turn
    const before = readdirSync(dir)
    // When the rollback is applied
    const result = applyRollback('sess-0000-1111', root)
    // Then the log keeps the pre-latest-turn events and a backup appears
    expect(result.ok).toBe(true)
    expect(result.inFlight).toBe(true)
    const keptText = decodeFile(logPath)
    const keptLines = keptText.trim().split('\n')
    expect(keptLines).toHaveLength(6)
    expect(keptText).not.toContain('"turn":2')
    const after = readdirSync(dir)
    expect(after.includes('session.v4.jsonl.zstd.recall-bak-')).toBe(false)
    expect(after.some(f => f.includes('session.v4.jsonl.zstd.recall-bak-'))).toBe(true)
    expect(before.some(f => f.includes('.recall-bak-'))).toBe(false)
  })

  it('user gets missing-session for an unknown session id', () => {
    // Given a store without the session
    // When the rollback targets an unknown id
    const result = applyRollback('sess-9999-9999', root)
    // Then the failure names the missing session
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('missing-session')
  })

  it('user refuses to roll back a log without completed turns', () => {
    // Given a session with no completed turn
    const dir2 = join(root, 'workspace', 'sess-0000-2222')
    mkdirSync(dir2, { recursive: true })
    writeFileSync(join(dir2, 'session.v4.jsonl.zstd'), encodeEvents([{ type: 'session', id: 'x' }, { type: 'turn/start', turn: 1 }]))
    // When the rollback is applied
    const result = applyRollback('sess-0000-2222', root)
    // Then nothing to recall is reported
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('nothing-to-recall')
  })

  it('user never resolves paths outside the store for hostile ids', () => {
    // Given a hostile session id with traversal segments
    const found = sessionLogPath(root, '../../etc/passwd')
    // When the store lookup runs
    // Then it refuses the id
    expect(found).toBeNull()
  })
})