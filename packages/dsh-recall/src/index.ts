/**
 * Host entry of the dsh-recall plugin: registers the recall rollback route
 * (POST /api/dsh-recall/rollback, loopback-fenced) on the harness web server.
 * @module @linxin666/dsh-recall
 */

import type { Context } from '@deepseek-ai/cordis'
import { makeRecallRoutes } from './host/routes.ts'

export const name = 'dsh-recall'

export const inject = ['webServer'] as const

/** Register the recall rollback route. */
export function apply(ctx: Context): void {
  for (const route of makeRecallRoutes()) {
    ctx.webServer.register(route)
  }
}