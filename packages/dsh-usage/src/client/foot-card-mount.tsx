/**
 * Sidebar foot card mounting.
 *
 * The foot's only slot (sidebar.footer.action) stacks ABOVE the Settings row
 * and cannot host a block, so the card container is inserted into the shell's
 * foot area directly above the Settings seat — keeping Settings the foot's
 * terminal row instead of hanging a card off the sidebar floor. It self-heals
 * with the page-wide body-mutation hub: a React re-render that displaces the
 * container re-seats it on the next frame, and a whole-pane rebuild is noticed
 * by the same body-level watcher the family entry rows use.
 *
 * The container is a plain div carrying its own React root, so it can never
 * disturb the shell's reconciliation.
 * @module @linxin666/dsh-usage/client/foot-card-mount
 */

import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { subscribeBodyInvalidations } from './body-mutations.ts'
import { UsageFootCard, type UsageFootCardProps } from './UsageFootCard.tsx'
import { UsageFootAction, type UsageFootActionProps } from './UsageFootAction.tsx'

/** Stable data attribute identifying the injected card container. */
export const FOOT_CARD_SELECTOR = '[data-dsh-usage-foot-card]'

/** Stable data attribute identifying the injected usage action container. */
export const FOOT_ACTION_SELECTOR = '[data-dsh-usage-foot-action]'

/** The shell sidebar's foot area (footer actions + the Settings row), when mounted. */
function footArea(): HTMLElement | undefined {
  const column = document.querySelector<HTMLElement>('[data-pane="sidebar"], [class*="sidebarCol"]')
  return column?.querySelector<HTMLElement>('[class*="footArea"]') ?? undefined
}

/**
 * Open the settings panel on the usage section. The shell owns the panel's
 * open state and exposes no service for it, so the card replays the user's
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
 * Mount the sidebar foot card directly above the Settings row.
 * @param props - the store/poll/settings/open inputs of the apply body.
 * @returns disposer removing the container and its observers.
 */
export function mountUsageFootCard(props: UsageFootCardProps): () => void {
  // DOM-level idempotency: whatever path mounted a card before this call (a
  // duplicated apply, an HMR re-injection), never mount a second one.
  if (typeof document !== 'undefined' && document.querySelector(FOOT_CARD_SELECTOR) !== null) {
    return () => {}
  }
  const container = document.createElement('div')
  container.setAttribute('data-dsh-usage-foot-card', '')
  const root: Root = createRoot(container)
  root.render(createElement(UsageFootCard, props))

  /** Keep the container directly above the Settings seat inside the foot area. */
  const place = (): void => {
    const foot = footArea()
    if (foot === undefined) return
    const settings = foot.querySelector<HTMLElement>('[class*="settingsArea"]')
    if (settings !== null) {
      if (container.nextElementSibling !== settings) foot.insertBefore(container, settings)
      return
    }
    // No Settings seat to anchor against (shell change): fall back to the tail.
    if (foot.lastElementChild !== container) foot.append(container)
  }
  place()
  const unsubscribeBody = subscribeBodyInvalidations(place)

  return () => {
    unsubscribeBody()
    root.unmount()
    container.remove()
  }
}

/**
 * Mount the sidebar usage action into the foot row where the download
 * (self-update) trigger used to sit: directly before the remote-control
 * entry row, so it keeps the phone icon on its right and the settings
 * trigger on its left. Falls back to before the settings row when the
 * remote entry is absent. Self-heals with the same body-mutation hub.
 * @param props - the label and open-dashboard inputs.
 * @returns disposer removing the container.
 */
export function mountUsageFootAction(props: UsageFootActionProps): () => void {
  if (typeof document !== 'undefined' && document.querySelector(FOOT_ACTION_SELECTOR) !== null) {
    return () => {}
  }
  const container = document.createElement('div')
  container.setAttribute('data-dsh-usage-foot-action', '')
  const root: Root = createRoot(container)
  root.render(createElement(UsageFootAction, props))

  /** Keep the trigger in the download slot, left of the remote entry row. */
  const place = (): void => {
    const foot = footArea()
    if (foot === undefined) return
    const remoteRow = foot.querySelector<HTMLElement>('[class*="entryRow"]')
    if (remoteRow !== null) {
      if (container.nextElementSibling !== remoteRow) foot.insertBefore(container, remoteRow)
      return
    }
    const settings = foot.querySelector<HTMLElement>('[class*="settingsArea"]')
    if (settings !== null) {
      if (container.nextElementSibling !== settings) foot.insertBefore(container, settings)
      return
    }
    if (container.parentElement !== foot) foot.append(container)
  }
  place()
  const unsubscribeBody = subscribeBodyInvalidations(place)

  return () => {
    unsubscribeBody()
    root.unmount()
    container.remove()
  }
}
