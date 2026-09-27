/**
 * The recall trigger: a small tail-of-conversation button. Clicking it
 * confirms once, POSTs the active session id to the host rollback route, and
 * surfaces the outcome with the reopen/restart note.
 * @module @linxin666/dsh-recall/client/RecallTrigger
 */

import { useState } from 'react'
import type { RecallKey } from './locales.ts'
import { fillComposer } from './composer.ts'
import { saveDraft } from './draft.ts'
import css from './recall.module.css'

export interface RecallTriggerProps {
  /** Translate bound to the recall locale namespace. */
  t: (key: RecallKey, params?: Record<string, unknown>) => string
  /** Resolve the active session id (null when no conversation is open). */
  sessionId: () => string | null
  /** Whether a turn is currently streaming (recall disabled then). */
  inFlight: () => boolean
}

/** Outcome strings the button surfaces after the rollback call. */
export type RecallOutcome = 'idle' | 'loading' | 'done' | 'missing' | 'none' | 'failed'

export function RecallTrigger({ t, sessionId, inFlight }: RecallTriggerProps) {
  const [outcome, setOutcome] = useState<RecallOutcome>('idle')
  const busy = outcome === 'loading'

  const recall = (): void => {
    const id = sessionId()
    if (id === null || inFlight()) return
    if (!window.confirm(t('recall.confirm'))) return
    setOutcome('loading')
    // The host persists a brand-new session on a flush cycle that can lag the
    // first click by seconds; back off and retry so a just-created session
    // still recalls on the first click (capped, then the operator can click
    // again once the file is on disk).
    const MAX_ATTEMPTS = 5
    let attempts = 0
    const attempt = (): void => {
      void fetch('/api/dsh-recall/rollback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: id }),
      })
      .then(r => r.json() as Promise<{ ok: boolean; reason?: string; requiresRestart?: boolean; recalled?: { text: string; attachments: Array<{ name: string; mediaType: string }> } }>)
      .then((res) => {
        if (!res.ok) {
          if (res.reason === 'missing-session' && attempts < MAX_ATTEMPTS) {
            attempts += 1
            window.setTimeout(attempt, 2000 * attempts)
            return
          }
          setOutcome(res.reason === 'missing-session' ? 'missing' : res.reason === 'nothing-to-recall' ? 'none' : 'failed')
          return
        }
        if (res.recalled !== undefined && id !== null) {
          saveDraft(id, { text: res.recalled.text, attachments: res.recalled.attachments ?? [] })
          if (res.recalled.text.length > 0) fillComposer(res.recalled.text)
        }
        setOutcome('done')
      })
      .catch(() => setOutcome('failed'))
    }
    attempt()
  }

  const status = outcome === 'done' ? t('recall.done') : outcome === 'failed' || outcome === 'missing' || outcome === 'none' ? t('recall.failed') : null
  return (
    <span className={css.wrap}>
      <button
        type="button"
        className={css.trigger}
        data-dsh-plugin="recall"
        disabled={busy}
        title={t('recall.hint')}
        aria-label={t('recall.button')}
        onClick={recall}
      >
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M11.2 2.8v5.2a4 4 0 0 1-4 4H2.8" />
          <path d="M5.4 9.4l-2.8 2.8 2.8 2.8" />
        </svg>
      </button>
      {status !== null ? <span className={css.status}>{status}</span> : null}
    </span>
  )
}