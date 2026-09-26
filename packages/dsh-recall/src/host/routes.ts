/**
 * Recall API routes: POST /api/dsh-recall/rollback applies the latest-turn
 * truncation to a session's on-disk log. Loopback-only, POST-only, and the
 * body carries the session id. The response flags that a reopen (or restart)
 * is required for the GUI view to reflect the change.
 * @module @linxin666/dsh-recall/host/routes
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { isLoopbackRequest } from './loopback.ts'
import { writeJson } from './http.ts'
import { applyRollback, sessionsRoot, type RollbackResult } from './rollback.ts'

export const RECALL_API_PREFIX = '/api/dsh-recall'

/** POST body of the rollback route. */
export interface RollbackBody {
  sessionId: string
}

function fenced(req: IncomingMessage, res: ServerResponse): boolean {
  if (!isLoopbackRequest(req)) {
    writeJson(res, 403, { ok: false, error: 'loopback-required' })
    return true
  }
  if (req.method !== 'POST') {
    writeJson(res, 405, { ok: false, error: 'method-not-allowed' })
    return true
  }
  return false
}

function readBody(req: IncomingMessage): Promise<RollbackBody> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Uint8Array) => { chunks.push(Buffer.from(chunk)) })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as RollbackBody)
      } catch {
        resolve({ sessionId: '' })
      }
    })
    req.on('error', () => resolve({ sessionId: '' }))
  })
}

/** Build the recall API routes. */
export function makeRecallRoutes(): WebRoute[] {
  return [
    {
      kind: 'exact',
      path: `${RECALL_API_PREFIX}/rollback`,
      handler: async (req, res) => {
        if (fenced(req, res)) return
        const body = await readBody(req)
        if (typeof body?.sessionId !== 'string' || body.sessionId.length === 0) {
          writeJson(res, 400, { ok: false, error: 'session-id-required' })
          return
        }
        const result: RollbackResult = applyRollback(body.sessionId, sessionsRoot())
        writeJson(res, result.ok ? 200 : 409, result)
      },
    },
  ]
}