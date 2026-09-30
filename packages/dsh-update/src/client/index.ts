/**
 * dsh-update — browser half. Registers the `update` dictionaries and the
 * anonymous install heartbeat only. The family no longer mounts a visible
 * sidebar-foot download/update trigger; the `sidebar.footer.action` seat is
 * kept for the usage statistics action and remote-access phone trigger.
 *
 * The host half still owns the loopback-only update routes. They remain
 * available to trusted local callers, but this package does not put a button in
 * the Web GUI. Desktop shell pages already own their update UX, and browser
 * pages now follow the same no-footer-trigger rule to keep the left foot row
 * stable.
 *
 * Export discipline (packages/AGENTS.md): the /client surface carries only
 * what cordis loading needs plus types.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the locale plugin's Context merge (ctx.locale) and its
// LocaleNamespaceMap merge table.
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { en, zh, type UpdateKey } from './locales.ts'
import { reportDailyHeartbeat } from './telemetry.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Family self-update surface copy. */
    update: UpdateKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'update'

/** Services required by this plugin. */
export const inject = ['locale']

/**
 * Register the self-update dictionaries and heartbeat, without a visible footer
 * action. The former download trigger's seat is intentionally left free for the
 * usage statistics action.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  // Anonymous install heartbeat (docs/telemetry.md): one beat per browser per
  // UTC day, package name only, silent failure.
  reportDailyHeartbeat([{ name: '@linxin666/dsh-update' }])

  ctx.effect(() => {
    try {
      return ctx.locale.register(NS, { zh, en })
    } catch {
      return () => {}
    }
  }, 'dsh-update: dictionaries')
}

export type { UpdateKey } from './locales.ts'
