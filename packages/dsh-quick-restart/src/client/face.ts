/**
 * Shared shapes of the dsh-quick-restart browser half: the status document the
 * host reports and the face the settings header action injects. Both halves of
 * the plugin's UI read this module so the section and the header button cannot
 * drift apart.
 * @module @linxin666/dsh-quick-restart/client/face
 */

/** Status document the host status route returns. */
export interface QuickRestartStatusView {
  pid: number
  port: number
  startedAt: number
}

/** What the settings header action injects into the button component. */
export interface QuickRestartFace {
  /** Read the live status document. */
  status(): Promise<QuickRestartStatusView>
  /** Arm the detached relaunch helper. */
  restart(): Promise<{ ok: boolean; error?: string }>
  /**
   * Resolve once the replacement host answers again (a different pid than
   * `previousPid` when one is given). The caller reloads the page on true so
   * the GUI reconnects by itself.
   */
  waitUntilRestarted(previousPid?: number): Promise<boolean>
}