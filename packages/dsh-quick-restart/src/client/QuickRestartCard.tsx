/**
 * dsh-quick-restart settings card: shows the live service status (PID, port,
 * start time) and a confirm-gated restart button. Rendering the guide prose
 * only while the section is open keeps the restart surface explicit; the
 * restart flow itself is a POST to the loopback-fenced host route followed by
 * an automatic page reconnection once the replacement host boots.
 * @module @linxin666/dsh-quick-restart/client/QuickRestartCard
 */

import { useEffect, useState, type ReactNode } from 'react'
import { t } from './locales.ts'
import styles from './quick-restart.module.css'

/** Status document the host status route returns. */
export interface QuickRestartStatusView {
  pid: number
  port: number
  startedAt: number
}

/** What the settings slot injects into this card. */
export interface QuickRestartFace {
  /** Read the live status document. */
  status(): Promise<QuickRestartStatusView>
  /** Arm the detached relaunch helper. */
  restart(): Promise<{ ok: boolean; error?: string }>
}

export interface QuickRestartProps extends QuickRestartFace {
  section?: unknown
  locale?: { bind(ns: string): (key: string, vars?: Record<string, unknown>) => string }
}

type Phase = 'loading' | 'idle' | 'restarting' | 'error'

/**
 * The settings card body: a hint, the live status line, and the restart
 * button with an explicit confirm step.
 */
export function QuickRestartCard(props: QuickRestartProps): ReactNode {
  const [phase, setPhase] = useState<Phase>('loading')
  const [status, setStatus] = useState<QuickRestartStatusView | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    props.status().then(
      (view) => {
        if (!alive) return
        setStatus(view)
        setPhase('idle')
      },
      (cause: unknown) => {
        if (!alive) return
        setError(cause instanceof Error ? cause.message : String(cause))
        setPhase('error')
      },
    )
    return () => {
      alive = false
    }
  }, [props])

  const onRestart = async (): Promise<void> => {
    if (phase === 'restarting' || phase === 'loading') return
    if (!window.confirm(t('quick.restart.confirm'))) return
    setPhase('restarting')
    try {
      const outcome = await props.restart()
      if (!outcome.ok) {
        setError(outcome.error ?? '')
        setPhase('error')
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setPhase('error')
    }
  }

  const busy = phase === 'loading' || phase === 'restarting'

  return (
    <div data-dsh-plugin="quick-restart" className={styles.root}>
      <p data-dsh-part="hint" className={styles.hint}>{t('quick.hint')}</p>
      {status !== null ? (
        <p data-dsh-part="status" className={styles.status}>
          {t('quick.status', { pid: String(status.pid), port: String(status.port) })}
          {' · '}
          {t('quick.started', { time: new Date(status.startedAt).toLocaleTimeString() })}
        </p>
      ) : null}
      {phase === 'error' && error !== '' ? (
        <p data-dsh-part="error" className={styles.error}>{error}</p>
      ) : null}
      <div data-dsh-part="actions">
        <button
          data-dsh-part="restart-button"
          type="button"
          className={styles.button}
          disabled={busy}
          onClick={() => void onRestart()}
        >
          {phase === 'restarting' ? t('quick.restart.doing') : t('quick.restart.button')}
        </button>
      </div>
    </div>
  )
}