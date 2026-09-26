/**
 * Host loader entry for the dsh-quick-restart plugin — runs in the DSH host
 * process. Registers the loopback-fenced `/api/dsh-quick-restart/*` routes:
 * `status` feeds the settings card and `restart` arms a detached helper that
 * relaunches `dsh web` once this process is gone (see `host/restart.ts` for
 * the full mechanism). The plugin deliberately does not announce anything to
 * the agent system prompt.
 * @module @linxin666/dsh-quick-restart
 */

import type { Context } from '@deepseek-ai/cordis'
import { makeQuickRestartRoutes, type QuickRestartService } from './host/routes.ts'
import { armRestart, relaunchCommand, scheduleTermination, type RestartTarget } from './host/restart.ts'

export const inject = ['webServer']

/** Host process start time, used for the status document. */
const STARTED_AT = Date.now()

/** Default log file the relaunched process appends to; override via env. */
const DEFAULT_LOG = '/tmp/dsh-web.log'

/**
 * Apply the host half: one status route and one restart route on the web
 * server, both loopback-fenced. The restart arms the helper, responds, then
 * terminates this process gracefully.
 */
export function apply(ctx: Context): void {
  const port = ctx.webServer.port
  const service: QuickRestartService = {
    status: () => ({ pid: process.pid, port, startedAt: STARTED_AT }),
    restart: () => {
      const target: RestartTarget = {
        port,
        cwd: process.cwd(),
        log: process.env.DSH_QUICK_RESTART_LOG ?? DEFAULT_LOG,
      }
      return armRestart(target, relaunchCommand())
    },
    terminate: () => scheduleTermination(),
  }
  for (const route of makeQuickRestartRoutes(service)) {
    ctx.webServer.register(route)
  }
}