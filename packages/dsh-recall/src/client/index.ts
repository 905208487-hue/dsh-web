/**
 * Client entry: registers the recall locale and mounts the trigger at the
 * open conversation's tail.
 * @module @linxin666/dsh-recall/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { mountRecallTrigger } from './mount-recall.ts'
import { recallSessionId, isTurnInFlight } from './mount-recall.ts'
import { NS, en, zh } from './locales.ts'

export const inject = ['locale'] as const

/** Mount the recall trigger behind the conversation flow tail. */
export function apply(ctx: ClientContext): void {
  ctx.locale.register(NS, { zh, en })
  const label = ctx.locale.bind(NS)
  const disposeRecall = mountRecallTrigger({
    t: label,
    sessionId: recallSessionId,
    inFlight: isTurnInFlight,
  })
  ctx.effect(() => () => disposeRecall(), 'dsh-recall: conversation recall trigger')
}