/**
 * Compact restart button for the settings dialog header (`settings.action`,
 * next to 「打开配置文件」). Shares the restart flow with the section card:
 * confirm, arm the restart, wait for the replacement host, then reload the
 * page so the GUI reconnects on its own.
 * @module @linxin666/dsh-quick-restart/client/QuickRestartAction
 */

import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { useState, type ReactNode } from 'react'
import { t } from './locales.ts'
import type { QuickRestartFace, QuickRestartStatusView } from './QuickRestartCard.tsx'

export interface QuickRestartActionProps extends QuickRestartFace {
  section?: unknown
  locale?: unknown
}

/**
 * The header action: a small outline button beside 「打开配置文件」. While the
 * restart is in flight it reports progress and stays disabled; the reload
 * happens once the replacement host answers.
 */
export function QuickRestartAction(props: QuickRestartActionProps): ReactNode {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState('')

  const onRestart = async (): Promise<void> => {
    if (busy) return
    if (!window.confirm(t('quick.restart.confirm'))) return
    let previousPid: number | undefined
    try {
      const view: QuickRestartStatusView = await props.status()
      previousPid = view.pid
    } catch {
      previousPid = undefined
    }
    setBusy(true)
    setFailed('')
    try {
      const outcome = await props.restart()
      if (!outcome.ok) {
        setFailed(outcome.error ?? '')
        setBusy(false)
        return
      }
      const back = await props.waitUntilRestarted(previousPid)
      if (back) {
        window.location.reload()
        return
      }
      setFailed(t('quick.restart.timeout'))
      setBusy(false)
    } catch (cause) {
      setFailed(cause instanceof Error ? cause.message : String(cause))
      setBusy(false)
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={busy}
      title={failed === '' ? undefined : failed}
      onClick={() => void onRestart()}
    >
      {busy ? t('quick.action.restarting') : t('quick.restart.button')}
    </Button>
  )
}