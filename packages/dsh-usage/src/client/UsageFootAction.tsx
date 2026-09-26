/**
 * The sidebar usage action: an icon-only trigger seated where the download
 * (self-update) trigger used to sit, beside the remote-control phone icon.
 * It opens the usage statistics dashboard (settings page, usage section).
 *
 * The glyph is a statistics bar chart adapted from the open-source Lucide
 * "bar-chart-3" icon (https://lucide.dev/icons/bar-chart-3, ISC license),
 * redrawn on the 16px grid with the same stroke format as the official
 * download primitives (stroke 1.3, round caps/joins, currentColor) so it
 * matches the removed download trigger's look.
 * @module @linxin666/dsh-usage/client/UsageFootAction
 */

import css from './usage.module.css'

/** Entry props: the localized label and the open-dashboard action. */
export interface UsageFootActionProps {
  /** The settings-entry label in the active locale. */
  label: () => string
  /** Open the usage settings dashboard. */
  onOpen: () => void
}

/**
 * Render the usage trigger.
 * @param props - label and open action.
 * @returns the trigger element.
 */
export function UsageFootAction({ label, onOpen }: UsageFootActionProps) {
  return (
    <button
      type="button"
      className={css.footAction}
      data-dsh-plugin="usage"
      aria-label={label()}
      title={label()}
      onClick={onOpen}
    >
      <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2.25 13.25h11.5" />
        <path d="M4.5 13.25V10.75" />
        <path d="M8 13.25V7.25" />
        <path d="M11.5 13.25V3.75" />
      </svg>
    </button>
  )
}