/**
 * Sidebar foot action mounting.
 *
 * The shell owns the sidebar footer through the `sidebar.footer.action` list
 * slot, so the usage action is registered as a normal slot entry rather than
 * spliced into React's DOM output: an injected sibling node is what the shell
 * re-renders around, and the aggregate's own foot layout then treats it as a
 * stray child.
 *
 * No layout shim lives here. The aggregate package (`dsh-web-all`) already
 * orders the foot for this shell:
 *
 *   [class*=footArea]      { flex-flow: wrap; align-items: center }
 *   [class*=settingsArea]  { flex: auto; order: 1 }
 *   [class*=footerActions] { flex: none; order: 2; align-items: center }
 *
 * A second shim forcing `flex-direction: column` on the same element fought
 * that rule and left the action cluster centred instead of beside Settings.
 * The only ordering this package owns is its position INSIDE the cluster,
 * which the slot `order` below sets: Usage before Remote access.
 * @module @linxin666/dsh-usage/client/foot-card-mount
 */

import { UsageFootAction, type UsageFootActionProps } from './UsageFootAction.tsx'
import type { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'

// Local contract mirror for the official sidebar-owned slot. dsh-usage does
// not depend on ui-sidebar at runtime; this typed declaration lets the package
// register into the shell slot while keeping all imports browser-pure.
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'sidebar.footer.action': {
      kind: 'list'
      scope: 'root'
      owner: { wide: boolean }
    }
  }
}

/** Stable data attribute identifying the usage action trigger. */
export const FOOT_ACTION_SELECTOR = '[data-dsh-plugin="usage"]'

const FOOT_ACTION_SLOT = 'sidebar.footer.action'
/** First in the cluster: the official list sorts ascending, Remote access sits at 0. */
const FOOT_ACTION_ORDER = -100

interface UsageFootActionContext {
  slots: Pick<SlotRegistry, 'inject' | 'register'>
}

/**
 * Open the settings panel on the usage section. The shell owns the panel's
 * open state and exposes no service for it, so the trigger replays the user's
 * own path: activate the sidebar Settings trigger, then pick the nav row
 * carrying the section's (localized) label. Every step degrades silently —
 * with the panel already open only the nav pick runs, and a missing row
 * leaves the panel on its default section.
 * @param label - the usage section's nav label in the active locale.
 */
export function openUsageSettings(label: () => string): void {
  /** Click the nav row carrying the usage label inside the open panel. */
  const pick = (panel: Element): void => {
    const wanted = label()
    for (const row of panel.querySelectorAll<HTMLButtonElement>('nav button')) {
      if (row.textContent !== null && row.textContent.includes(wanted)) {
        row.click()
        return
      }
    }
    // Panel open but the usage row is gone (plugin toggled off): stay put.
  }
  // A panel that is already open must never be toggled shut by the trigger;
  // only the nav pick runs.
  const open = document.querySelector('[role="dialog"]')
  if (open !== null) {
    pick(open)
    return
  }
  const column = document.querySelector<HTMLElement>('[data-pane="sidebar"], [class*="sidebarCol"]')
  const trigger = column?.querySelector<HTMLButtonElement>('[class*="settingsArea"] button')
  trigger?.click()
  let tries = 0
  const attempt = (): void => {
    const panel = document.querySelector('[role="dialog"]')
    if (panel !== null) {
      pick(panel)
      return
    }
    tries += 1
    // The panel mounts on the shell's next frames; wait briefly, then give up.
    if (tries <= 20) window.setTimeout(attempt, 50)
  }
  window.setTimeout(attempt, 0)
}

/**
 * Mount the sidebar usage action into the official footer action slot.
 * @param ctx - client context carrying the slot registry.
 * @param props - the label and open-dashboard inputs.
 * @returns disposer removing the slot contribution.
 */
export function mountUsageFootAction(ctx: UsageFootActionContext, props: UsageFootActionProps): () => void {
  return ctx.slots.inject(FOOT_ACTION_SLOT, () => {
    try {
      return ctx.slots.register({
        name: FOOT_ACTION_SLOT,
        id: 'dsh-usage',
        order: FOOT_ACTION_ORDER,
        inject: () => props,
      }, UsageFootAction)
    } catch {
      return () => {}
    }
  })
}

export const __test = {
  FOOT_ACTION_SLOT,
  FOOT_ACTION_ORDER,
}
