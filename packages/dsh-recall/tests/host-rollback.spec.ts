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
import { zstdCompressSync } from 'node:zlib'
import { decompress as fzDecompress } from 'fzstd'
import { applyRollback, extractRecalledUserMessage, sessionLogPath } from '../src/host/rollback.ts'

function encodeEvents(events: Array<string | Record<string, unknown>>): Uint8Array {
  const lines = events.map(e => (typeof e === 'string' ? e : JSON.stringify(e))).join('\n')
  return zstdCompressSync(Buffer.from(lines + '\n', 'utf8'))
}

function decodeFile(path: string): string {
  return Buffer.from(fzDecompress(new Uint8Array(readFileSync(path)))).toString('utf8')
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

  it('user rolls back an unclosed solo turn by keeping the header', () => {
    // Given a session whose only turn never closed
    const dir2 = join(root, 'workspace', 'sess-0000-2222')
    mkdirSync(dir2, { recursive: true })
    writeFileSync(join(dir2, 'session.v4.jsonl.zstd'), encodeEvents([{ type: 'session', id: 'x' }, { type: 'turn/start', turn: 1 }]))
    // When the rollback is applied
    const result = applyRollback('sess-0000-2222', root)
    // Then the open turn is dropped and the header stays
    expect(result.ok).toBe(true)
    expect(result.inFlight).toBe(true)
    expect(result.removedLines).toBeGreaterThanOrEqual(1)
    const keptText = decodeFile(join(dir2, 'session.v4.jsonl.zstd'))
    expect(keptText).toContain('"session"')
    expect(keptText).not.toContain('"turn/start"')
  })

  it('user never resolves paths outside the store for hostile ids', () => {
    // Given a hostile session id with traversal segments
    const found = sessionLogPath(root, '../../etc/passwd')
    // When the store lookup runs
    // Then it refuses the id
    expect(found).toBeNull()
  })
})
describe('conversation recall content extraction', () => {
  it('user gets the recalled text and attachment names from the tail', () => {
    // Given a removed tail carrying a user message with text and an image part
    const tail = [
      JSON.stringify({ type: 'turn/end', turn: 2 }),
      JSON.stringify({ type: 'turn/start', turn: 3 }),
      JSON.stringify({ type: 'user/message', data: { content: [
        { type: 'text', text: '检查这个附件' },
        { type: 'image', attachment: { name: '图像.png', mediaType: 'image/png' } },
      ] } }),
    ]
    // When the recalled content is extracted
    const recalled = extractRecalledUserMessage(tail)
    // Then the text is joined and the attachment metadata carried over
    expect(recalled!.text).toBe('检查这个附件')
    expect(recalled!.attachments).toHaveLength(1)
    expect(recalled!.attachments[0].name).toBe('图像.png')
  })

  it('user gets null when the tail has no user message', () => {
    // Given a removed tail without a user message
    const tail = [JSON.stringify({ type: 'assistant/message', data: {} })]
    // When the recalled content is extracted
    const recalled = extractRecalledUserMessage(tail)
    // Then nothing is recovered
    expect(recalled).toBeNull()
  })
})

describe('conversation recall multi-frame zstd logs', () => {
  it('user rolls back a log stored as concatenated zstd frames', () => {
    // Given a session log written as two concatenated zstd frames
    const dir3 = join(root, 'workspace', 'sess-0000-3333')
    mkdirSync(dir3, { recursive: true })
    const first = [JSON.stringify({ type: 'session', id: 'x' }), JSON.stringify({ type: 'turn/start', turn: 1 })].join('\n') + '\n'
    const second = [JSON.stringify({ type: 'user/message', data: { content: [{ type: 'text', text: 'm' }] } }), JSON.stringify({ type: 'turn/end', turn: 1 })].join('\n') + '\n'
    writeFileSync(join(dir3, 'session.v4.jsonl.zstd'), Buffer.concat([zstdCompressSync(Buffer.from(first, 'utf8')), zstdCompressSync(Buffer.from(second, 'utf8'))]))
    // When the rollback is applied
    const result = applyRollback('sess-0000-3333', root)
    // Then the cut works across the frame boundary: the frame-2 turn/end is
    // seen, the single completed turn is removed, and the header stays
    expect(result.ok).toBe(true)
    expect(result.removedLines).toBeGreaterThanOrEqual(3)
    const keptText = decodeFile(join(dir3, 'session.v4.jsonl.zstd'))
    expect(keptText).toContain('"session"')
    expect(keptText).not.toContain('"turn/end"')
    expect(keptText).not.toContain('"user/message"')
  })
})
