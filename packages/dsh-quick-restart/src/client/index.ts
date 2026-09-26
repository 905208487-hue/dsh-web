/**
 * dsh-quick-restart browser half — seats the 「快速重启 DSH 服务」 first-level
 * settings section (late order, below the other family sections). The card
 * renders the live service status and the confirm-gated restart button; all
 * host interaction happens over the loopback-fenced routes, this bundle only
 * fetches the status document and POSTs the restart.
 * @module @linxin666/dsh-quick-restart/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the ctx.slots merge (the renderer owns the slot registry since 0.1.2).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { createElement } from 'react'
import { QuickRestartCard, type QuickRestartFace, type QuickRestartStatusView } from './QuickRestartCard.tsx'
import { NS, en, zh } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The quick-restart settings card copy. */
    'dsh-quick-restart': keyof typeof zh
  }
}

/** Settings nav id and slot id for this section. */
const SECTION_ID = 'dsh-quick-restart'

/** Late first-level nav position: below the family sections (usage is 151). */
const SECTION_ORDER = 9000

/** Required services. */
export const inject = ['slots', 'locale']

/** Hard ceiling for one status/restart call; a stalled host must not pile up. */
const QUICK_RESTART_FETCH_TIMEOUT_MS = 15_000

async function quickRestartFetch<T>(path: string, method: 'GET' | 'POST'): Promise<T> {
  const response = await fetch(path, {
    ...(method === 'POST' ? { method: 'POST' } : {}),
    signal: AbortSignal.timeout(QUICK_RESTART_FETCH_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error('dsh-quick-restart ' + path + ' failed: ' + response.status)
  return (await response.json()) as T
}

const quickRestartApi: QuickRestartFace = {
  // DOCUMENT-RELATIVE routes: the GUI is served with `<base href="./">`, so a
  // sub-path deployment resolves these against its entry directory.
  status: () => quickRestartFetch<QuickRestartStatusView>('api/dsh-quick-restart/status', 'GET'),
  restart: () => quickRestartFetch<{ ok: boolean; error?: string }>('api/dsh-quick-restart/restart', 'POST'),
}

/**
 * Client plugin body: register dictionaries and seat the settings section.
 * The card fetches status only on mount, so no background traffic exists
 * while the page is closed.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => {
    try {
      return ctx.locale.register(NS, { zh, en })
    } catch {
      return () => {}
    }
  }, 'dsh-quick-restart: dictionaries')

  const face = (): QuickRestartFace => quickRestartApi

  ctx.slots.inject('settings.section', () => {
    try {
      const unregister = ctx.slots.register({
        name: 'settings.section',
        id: SECTION_ID,
        order: SECTION_ORDER,
        label: () => ctx.locale.bind(NS)('quick.title'),
        locale: NS,
        inject: face,
      }, QuickRestartCard)
      return () => {
        unregister()
      }
    } catch {
      return () => {}
    }
  })
}