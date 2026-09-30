/**
 * The sidebar usage action: an icon-only trigger seated where the download
 * (self-update) trigger used to sit, beside the remote-control phone icon.
 * It opens the usage statistics dashboard (settings page, usage section).
 *
 * The glyph is a usage chart adapted from the open-source Lucide
 * "chart-no-axes-column-increasing" icon
 * (https://lucide.dev/icons/chart-no-axes-column-increasing, ISC license),
 * redrawn on the 16px grid with the same stroke format as the official
 * download primitive (fill none, currentColor stroke, round caps/joins).
 * @module @linxin666/dsh-usage/client/UsageFootAction
 */

import css from './usage.module.css'

/** Entry props: the localized label and the open-dashboard action. */
export interface UsageFootActionProps {
  /** The settings-entry label in the active locale. */
  label: () => string
  /** Open the usage settings dashboard. */
  onOpen: () => void
  /** Whether the sidebar renders wide content (false = 56px rail). */
  wide?: boolean
}

/**
 * Render the usage trigger.
 * @param props - label and open action.
 * @returns the trigger element.
 */
export function UsageFootAction({ label, onOpen, wide = true }: UsageFootActionProps) {
  return (
    <button
      type="button"
      className={css.footAction}
      data-dsh-plugin="usage"
      data-dsh-part="entry"
      data-wide={wide ? undefined : 'rail'}
      data-rail={wide ? undefined : 'rail'}
      aria-label={label()}
      title={label()}
      onClick={onOpen}
    >
      <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3.5 13.5V9.75" />
        <path d="M8 13.5V6.25" />
        <path d="M12.5 13.5V2.5" />
      </svg>
    </button>
  )
}