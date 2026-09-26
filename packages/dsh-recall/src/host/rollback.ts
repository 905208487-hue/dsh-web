/**
 * Host-side conversation recall (撤回): decode the session event log from
 * disk, truncate it to the latest-turn boundary via the pure core, and write
 * the result back atomically with a backup.
 *
 * The dsh host persists each session as a zstd-compressed JSONL event log:
 * `$DSH_HOME/sessions/<workspace>/<session-id>/session.v4.jsonl.zstd`
 * (falling back to `session.jsonl.zstd`). Compression is the standard zstd
 * codec, handled here with the pure-JS `fzstd` implementation so the plugin
 * needs no native bindings.
 *
 * Consistency caveat (deliberate): the running host keeps sessions in memory
 * and has no message-level API, so a rollback changes the on-disk log while
 * the host's open view may stay stale; the response reports `requiresRestart`
 * and the caller tells the operator to reopen the session or restart dsh.
 * @module @linxin666/dsh-recall/host/rollback
 */

import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { zstdCompressSync, zstdDecompressSync } from 'node:zlib'
import { rollbackCut } from '../core/rollback.ts'

/** Default session store root (the dsh CLI's `~/.dsh/sessions`). */
export function sessionsRoot(): string {
  return join(process.env.DSH_HOME ? process.env.DSH_HOME : homedir(), '.dsh', 'sessions')
}

/** Locate a session's event-log file by id, or null when absent. */
export function sessionLogPath(root: string, sessionId: string): string | null {
  if (!/^[A-Za-z0-9-]{1,80}$/.test(sessionId)) return null
  let dir: string | null = null
  for (const workspace of readdirSync(root, { withFileTypes: true })) {
    if (!workspace.isDirectory()) continue
    const candidate = join(root, workspace.name, sessionId)
    try {
      if (readdirSync(candidate).some(entry => entry.endsWith('.jsonl.zstd'))) {
        dir = candidate
        break
      }
    } catch {
      // Unreadable candidate: keep scanning.
    }
  }
  if (dir === null) return null
  for (const name of ['session.v4.jsonl.zstd', 'session.jsonl.zstd']) {
    const path = join(dir, name)
    try {
      readFileSync(path)
      return path
    } catch {
      // Try the next candidate name.
    }
  }
  return null
}

/** Result of applying a rollback to disk. */
export interface RollbackResult {
  ok: boolean
  /** Machine-readable failure reason when ok is false. */
  reason?: 'missing-session' | 'nothing-to-recall'
  /** Session id the rollback acted on. */
  sessionId: string
  /** Lines removed from the log tail. */
  removedLines: number
  /** Whether the removed tail was an in-flight turn. */
  inFlight: boolean
  /** Whether a restart/reopen is required for the GUI to reflect the change. */
  requiresRestart: true
}

/**
 * Apply the recall truncation to the latest turn of a session's event log.
 * @param sessionId - the session to roll back.
 * @param root - the sessions store root (defaults to the harness one).
 * @returns the rollback result (or the failure reason).
 */
export function applyRollback(sessionId: string, root: string = sessionsRoot()): RollbackResult {
  const path = sessionLogPath(root, sessionId)
  if (path === null) return { ok: false, reason: 'missing-session', sessionId, removedLines: 0, inFlight: false, requiresRestart: true }
  const original = readFileSync(path)
  const decompressed = zstdDecompressSync(original)
  const text = new TextDecoder().decode(decompressed)
  const lines = text.split('\n').filter(line => line.trim() !== '')
  const cut = rollbackCut(lines)
  if (cut === null) return { ok: false, reason: 'nothing-to-recall', sessionId, removedLines: 0, inFlight: false, requiresRestart: true }
  const kept = lines.slice(0, cut.cut + 1).join('\n') + '\n'
  // Backup the pre-rollback log once (timestamped), then write atomically.
  const backup = `${path}.recall-bak-${new Date().toISOString().replace(/[:.]/g, '-')}`
  copyFileSync(path, backup)
  const compressed = zstdCompressSync(Buffer.from(kept, 'utf8'))
  const tmp = `${path}.recall-tmp`
  writeFileSync(tmp, compressed)
  renameSync(tmp, path)
  return { ok: true, sessionId, removedLines: lines.length - kept.trim().split('\n').length, inFlight: cut.inFlight, requiresRestart: true }
}