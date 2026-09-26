/**
 * HTTP routes for dsh-quick-restart. Every route is loopback-fenced: this
 * plugin restarts the whole host service, so tunnels and LAN clients get 403.
 * The restart route requires POST and runs the termination only after the
 * helper is armed and the 200 response is written.
 * @module @linxin666/dsh-quick-restart/host/routes
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { isLoopbackRequest } from './loopback.ts'
import { writeJson } from './http.ts'

export const QUICK_RESTART_API_PREFIX = '/api/dsh-quick-restart'

export interface QuickRestartStatusView {
  pid: number
  port: number
  startedAt: number
}

export interface QuickRestartService {
  /** Live status document for the section card. */
  status(): QuickRestartStatusView
  /** Arm the detached relaunch helper. */
  restart(): { ok: boolean; error?: string }
  /** Gracefully stop the current host so the helper can boot the replacement. */
  terminate(): void
}

function fenced(req: IncomingMessage, res: ServerResponse): boolean {
  if (!isLoopbackRequest(req)) {
    writeJson(res, 403, { ok: false, error: 'forbidden: loopback-only' })
    return false
  }
  return true
}

export function makeQuickRestartRoutes(service: QuickRestartService): WebRoute[] {
  return [
    {
      kind: 'exact',
      path: `${QUICK_RESTART_API_PREFIX}/status`,
      handler: async (req, res) => {
        if (!fenced(req, res)) return
        writeJson(res, 200, { ok: true, ...service.status() }, { 'cache-control': 'no-store' })
      },
    },
    {
      kind: 'exact',
      path: `${QUICK_RESTART_API_PREFIX}/restart`,
      handler: async (req, res) => {
        if (!fenced(req, res)) return
        if (req.method !== 'POST') {
          writeJson(res, 405, { ok: false, error: 'method not allowed' })
          return
        }
        const outcome = service.restart()
        if (!outcome.ok) {
          writeJson(res, 500, { ok: false, error: outcome.error })
          return
        }
        writeJson(res, 200, { ok: true, reloading: true })
        service.terminate()
      },
    },
  ]
}