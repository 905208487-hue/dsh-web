/**
 * dsh-web compat shim, browser half (folded into the aggregate package).
 *
 * The current dsh web shell renders its grid columns without the legacy
 * `data-pane` / `data-dsh-frame` hooks (the columns carry css-module class
 * names such as `*_sidebarCol` / `*_centerCol` / `*_detailsCol`). The
 * dsh-web family plugins (task-board, ssh, several skins)
 * mount at the DOM level through those legacy selectors, so without them the
 * plugins stay silent even though they load.
 *
 * This shim stamps the expected attributes onto the real shell elements and
 * re-applies them on any DOM mutation (React re-renders that re-create the
 * columns), which restores every DOM-mounting plugin and the skins' column
 * selectors in one place. It only ever WRITES attributes; it never removes
 * nodes and never disturbs React's reconciliation.
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { mountClientChildren } from './mount-children.ts'
import { subscribeBodyInvalidations } from './body-mutations.ts'

/** Column shims: element selector → attribute to stamp. */
const COLUMN_SHIMS: ReadonlyArray<readonly [selector: string, attribute: string]> = [
  ['[class*="sidebarCol"]', 'data-pane="sidebar"'],
  ['[class*="centerCol"]', 'data-pane="conversation"'],
  ['[class*="detailsCol"]', 'data-pane="details"'],
]

const DISPLAY_MODE_STORAGE_KEY = 'dsh-web-all-display-mode'
const DISPLAY_MODE_CHANGE_EVENT = 'dsh-web-all-display-mode-change'
type DisplayMode = 'mario' | 'default'

function readDisplayMode(): DisplayMode {
  try {
    return window.localStorage.getItem(DISPLAY_MODE_STORAGE_KEY) === 'default' ? 'default' : 'mario'
  } catch {
    return 'mario'
  }
}

function writeDisplayMode(mode: DisplayMode): void {
  try {
    window.localStorage.setItem(DISPLAY_MODE_STORAGE_KEY, mode)
  } catch {
    // Ignore storage failures; the live page still updates through the event.
  }
  window.dispatchEvent(new CustomEvent(DISPLAY_MODE_CHANGE_EVENT, { detail: { mode } }))
}

function displayModeText(key: 'title' | 'mario' | 'default' | 'hint'): string {
  const isEnglish = document.documentElement.lang.toLowerCase().startsWith('en')
  if (isEnglish) {
    if (key === 'title') return 'Display mode'
    if (key === 'mario') return 'Mario mode'
    if (key === 'default') return 'Default mode'
    return 'Mario mode shows the themed hero and bottom interactions. Default mode restores the stock system appearance.'
  }
  if (key === 'title') return '\u663e\u793a\u6a21\u5f0f'
  if (key === 'mario') return '\u9a6c\u91cc\u5965\u6a21\u5f0f'
  if (key === 'default') return '\u9ed8\u8ba4\u6a21\u5f0f'
  return '\u9a6c\u91cc\u5965\u6a21\u5f0f\u4f1a\u663e\u793a\u9996\u9875\u4e0e\u5e95\u90e8\u4e92\u52a8\uff1b\u9ed8\u8ba4\u6a21\u5f0f\u6062\u590d\u7cfb\u7edf\u51fa\u5382\u5916\u89c2\u3002'
}

type ReactishElement = {
  $$typeof: symbol
  type: string | ((props: unknown) => ReactishElement)
  key: string | null
  ref: null
  props: Record<string, unknown>
  _owner: null
}

function h(type: ReactishElement['type'], props: Record<string, unknown> | null, ...children: unknown[]): ReactishElement {
  const childValue = children.length <= 1 ? children[0] : children
  return {
    $$typeof: Symbol.for('react.element'),
    type,
    key: null,
    ref: null,
    props: childValue === undefined ? { ...(props ?? {}) } : { ...(props ?? {}), children: childValue },
    _owner: null,
  }
}

function refreshDisplayModeButtons(root: HTMLElement, mode: DisplayMode): void {
  root.querySelectorAll<HTMLButtonElement>('[data-dsh-display-mode-option]').forEach(button => {
    const selected = button.dataset.dshDisplayModeOption === mode
    button.setAttribute('aria-pressed', String(selected))
    button.toggleAttribute('data-selected', selected)
  })
}

function DisplayModeRow(): ReactishElement {
  const mode = readDisplayMode()
  const option = (value: DisplayMode, label: string): ReactishElement => h('button', {
    type: 'button',
    'data-dsh-display-mode-option': value,
    'aria-pressed': mode === value,
    'data-selected': mode === value ? '' : undefined,
    onClick: (event: Event) => {
      writeDisplayMode(value)
      const target = event.currentTarget
      if (target instanceof HTMLElement) {
        const root = target.closest('[data-dsh-display-mode-row]')
        if (root instanceof HTMLElement) refreshDisplayModeButtons(root, value)
      }
    },
  },
    h('span', { 'data-dsh-display-mode-icon': value, 'aria-hidden': 'true' }),
    h('span', { 'data-dsh-display-mode-label': '' }, label),
  )
  return h('div', { 'data-dsh-display-mode-row': '' },
    h('div', { 'data-dsh-display-mode-title': '' }, displayModeText('title')),
    h('div', { 'data-dsh-display-mode-options': '' },
      option('mario', displayModeText('mario')),
      option('default', displayModeText('default')),
    ),
    h('div', { 'data-dsh-display-mode-hint': '' }, displayModeText('hint')),
  )
}

/** Stable hooks consumed by the responsive compat layer (never text/hash selectors). */
export const RESPONSIVE_CSS = `
[data-dsh-frame] { min-height: 0; }
[data-dsh-display-mode-row] {
  border-bottom: .5px solid var(--dsw-alias-border-l2);
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px 0;
  color: inherit;
  font: inherit;
}
[data-dsh-display-mode-title] {
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  font-weight: 400;
  line-height: 22px;
}
[data-dsh-display-mode-options] {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
[data-dsh-display-mode-option] {
  box-sizing: border-box;
  min-width: 116px;
  min-height: 72px;
  padding: 8px 14px;
  border: .5px solid var(--dsw-alias-border-l4, var(--dsw-elevation-stroke-color, rgb(0 0 0 / 16%)));
  border-radius: var(--dsw-radius-xl, 12px);
  background: transparent;
  color: var(--dsw-alias-label-primary, inherit);
  cursor: pointer;
  display: grid;
  gap: 6px;
  place-items: center;
  font: inherit;
  font-size: 14px;
  line-height: 22px;
  transition: border-color 120ms ease, background-color 120ms ease, box-shadow 120ms ease, transform 120ms ease;
}
[data-dsh-display-mode-option]:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--dsw-alias-brand-primary, #3867d6) 45%, var(--dsw-elevation-stroke-color, rgb(0 0 0 / 16%)));
}
[data-dsh-display-mode-option][data-selected] {
  border-color: var(--dsw-static-neutral-bluish-400, var(--dsw-alias-brand-primary, #3867d6));
  background: var(--dsw-alias-bg-module-platform, color-mix(in srgb, var(--dsw-alias-brand-primary, #3867d6) 12%, transparent));
  box-shadow: none;
}
[data-dsh-display-mode-icon] {
  width: 36px;
  height: 32px;
  position: relative;
  display: block;
}
[data-dsh-display-mode-icon="mario"]::before {
  content: "";
  width: 28px;
  height: 34px;
  image-rendering: pixelated;
  background:
    linear-gradient(#d83a2e 0 0) 7px 0 / 17px 4px no-repeat,
    linear-gradient(#d83a2e 0 0) 4px 4px / 22px 4px no-repeat,
    linear-gradient(#744016 0 0) 5px 8px / 6px 9px no-repeat,
    linear-gradient(#ffd19a 0 0) 10px 8px / 15px 10px no-repeat,
    linear-gradient(#17110d 0 0) 21px 10px / 3px 3px no-repeat,
    linear-gradient(#744016 0 0) 18px 15px / 8px 3px no-repeat,
    linear-gradient(#d83a2e 0 0) 6px 20px / 17px 7px no-repeat,
    linear-gradient(#fff5dc 0 0) 1px 27px / 6px 4px no-repeat,
    linear-gradient(#fff5dc 0 0) 22px 27px / 6px 4px no-repeat,
    linear-gradient(#1f61b5 0 0) 9px 20px / 12px 11px no-repeat,
    radial-gradient(circle at 12px 25px, #ffd75a 0 1.8px, transparent 2px),
    radial-gradient(circle at 18px 25px, #ffd75a 0 1.8px, transparent 2px),
    linear-gradient(#744016 0 0) 4px 31px / 9px 3px no-repeat,
    linear-gradient(#744016 0 0) 17px 31px / 9px 3px no-repeat;
  filter: drop-shadow(0 4px 5px rgb(0 0 0 / 18%));
  position: absolute;
  left: 50%;
  bottom: -1px;
  transform: translateX(-50%) scale(.8);
  transform-origin: 50% 100%;
}
[data-dsh-display-mode-icon="default"]::before {
  content: "";
  width: 30px;
  height: 22px;
  border: 1.5px solid color-mix(in srgb, currentColor 28%, transparent);
  border-radius: 8px;
  background:
    radial-gradient(circle at 6px 5px, color-mix(in srgb, currentColor 42%, transparent) 0 1.25px, transparent 1.55px),
    radial-gradient(circle at 11px 5px, color-mix(in srgb, currentColor 24%, transparent) 0 1.25px, transparent 1.55px),
    linear-gradient(90deg, color-mix(in srgb, var(--dsw-alias-brand-primary, #3867d6) 34%, transparent), color-mix(in srgb, var(--dsw-alias-brand-primary, #3867d6) 14%, transparent)) 6px 10px / 18px 4px no-repeat,
    linear-gradient(color-mix(in srgb, currentColor 18%, transparent) 0 0) 8px 17px / 14px 3px no-repeat,
    linear-gradient(color-mix(in srgb, currentColor 8%, transparent) 0 0) 0 8px / 100% 1px no-repeat,
    linear-gradient(135deg, color-mix(in srgb, currentColor 4%, transparent), transparent 58%),
    var(--dsw-alias-bg-base, transparent);
  box-shadow:
    0 5px 9px rgb(0 0 0 / 9%),
    inset 0 1px 0 rgb(255 255 255 / 48%);
  position: absolute;
  z-index: 1;
  left: 50%;
  bottom: 5px;
  transform: translateX(-50%);
}
[data-dsh-display-mode-icon="default"]::after {
  content: "";
  width: 24px;
  height: 18px;
  border-radius: 7px;
  background: color-mix(in srgb, var(--dsw-alias-brand-primary, #3867d6) 13%, transparent);
  border: 1px solid color-mix(in srgb, var(--dsw-alias-brand-primary, #3867d6) 18%, transparent);
  position: absolute;
  left: 50%;
  bottom: 9px;
  transform: translateX(-36%);
  box-shadow: 0 3px 7px rgb(0 0 0 / 7%);
}
[data-dsh-display-mode-hint] {
  color: var(--dsw-alias-label-secondary, currentColor);
  font-size: 14px;
  font-weight: 400;
  line-height: 22px;
  opacity: .72;
}

/* Viewport lock for installs with no active visual. The identical lock lives in
   the skin-center shell-rendering stylesheet, but that stylesheet is inert
   unless a catalog skin, custom theme or wallpaper is active, so a stock
   install keeps html/body at their inherited "overflow: visible". Every
   conversation disclosure control (the tool/step-process collapse bar carrying
   the step summary, and the whole-turn process bar) calls focus() on itself
   when toggled; a focused element below any document overflow scrolls the page
   down by that overflow, which reads as the page being stretched downward with
   the titlebar and sidebar top pushed out of the viewport: issue #1135's
   symptom, reachable here with no skin active. Locking only the scrolling root
   (never the app root element, whose own lock clipped content in
   #1222/#1225) removes the overflow scroll target without touching the frame's
   box in any state. Scoped through :has() so the rule stays inert until the
   shell frame exists. */
html:has([data-dsh-frame]),
html:has([data-dsh-frame]) > body {
  height: 100%;
  width: 100%;
  overflow: hidden;
}
/* macOS window-drag guard. The official base stylesheet turns every DIRECT body
   child into a "-webkit-app-region: no-drag" region (its selector spares only
   the app's own root element), so a body-level element that spans the viewport
   subtracts the whole window from the macOS draggable region and cancels the
   official [data-window-drag] chrome rows with it: the window
   can no longer be dragged by its title area, and macOS no longer runs the
   system double-click action (zoom to fit the screen) there. "pointer-events:
   none" does not exempt an element from that computation - only a declaration
   of its own does. Family decorations are exactly such elements: the skin
   center mounts its six fixed decoration layers and the backdrop-blur veil as
   full-viewport body children and declares them non-interactive (aria-hidden,
   pointer-events: none; decoration must never eat clicks). The "initial"
   keyword is the initial value ("none"), which leaves the element and its whole
   subtree out of the app-region computation; the declaration must be !important
   because the official selector outranks this one. */
html[data-platform="darwin"] body > :is(
  [data-dsh-skin-layer],
  [data-dsh-boot-splash],
  [aria-hidden="true"]
) {
  -webkit-app-region: initial !important;
}
[data-dsh-frame] [data-dsh-responsive-part="composer"],
[data-dsh-frame] [data-dsh-responsive-part="sidebar-toggle"],
  [data-dsh-frame] [data-dsh-responsive-part="menu"] { touch-action: manipulation; }
/*
 * Split model / reasoning-effort selectors. The official seat renders ONE
 * trigger carrying "model name" plus the effort; the family splits that into
 * two triggers that must read as a matched pair.
 *
 * The slot outlet carries an inline display:contents, so it can never be
 * the flex container: the second trigger is appended INSIDE the official
 * trigger's root wrapper (stamped data-dsh-model-root) and that wrapper
 * becomes the row. Appending to the outlet instead made the composer row's
 * own 12px gap push the two triggers apart.
 *
 * Neither trigger declares a font family: the official one keeps the button
 * default, so the split one must not inherit the page font or the pair
 * renders in two different typefaces.
 */
[data-dsh-model-root] {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
  max-width: 100%;
}
[data-dsh-frame] [data-slot="conversation.input.model"] [data-dsh-model-original-effort] {
  display: none !important;
}
[data-dsh-model-effort-trigger] {
  appearance: none;
  border: none;
  outline: none;
  height: 28px;
  max-width: min(180px, 32vw);
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 4px 0 8px;
  font-size: 13px;
  font-weight: 400;
  line-height: 20px;
}
[data-dsh-model-effort-trigger]:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
}
[data-dsh-model-effort-trigger]:focus-visible {
  box-shadow: 0 0 0 2px var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
}
[data-dsh-model-effort-trigger]:disabled {
  color: var(--dsw-alias-label-dimmed);
  cursor: default;
}
[data-dsh-model-effort-label] {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 1000;
}
[data-dsh-model-effort-chevron] {
  color: var(--dsw-alias-label-caption);
  flex: none;
  transition: transform .12s;
}
[data-dsh-model-effort-trigger][aria-expanded="true"] [data-dsh-model-effort-chevron] {
  transform: rotate(180deg);
}
@media (max-width: 768px) {
  [data-dsh-frame] [data-dsh-responsive-part="sidebar-toggle"] { min-width: 44px; min-height: 44px; }
  [data-dsh-frame] {
    box-sizing: border-box;
    height: 100dvh;
    min-height: 100dvh;
    max-height: 100dvh;
    grid-template-columns: minmax(0, 1fr) !important;
    grid-template-rows: 100%;
    padding-bottom: env(safe-area-inset-bottom);
  }
  [data-dsh-frame] [data-pane="sidebar"] {
    position: absolute;
    inset-block: 0;
    inset-inline-start: 0;
    z-index: 1100;
    width: min(88vw, 320px) !important;
    max-width: 100%;
    box-shadow: 0 12px 32px rgb(0 0 0 / 24%);
    transform: translateX(0);
    transition: transform 160ms ease;
  }
  [data-dsh-frame]:not([data-sidebar-collapsed])::after {
    content: "";
    position: fixed;
    inset: 0;
    z-index: 1050;
    background: rgb(0 0 0 / 24%);
  }
  [data-dsh-frame][data-sidebar-collapsed] [data-pane="sidebar"] {
    width: 52px !important;
    transform: none;
    pointer-events: none;
    background: transparent !important;
    border: 0 !important;
    box-shadow: none;
  }
  [data-dsh-frame][data-sidebar-collapsed] [data-pane="sidebar"] > [data-slot="sidebar"] > :first-child > :not(:first-child),
  [data-dsh-frame][data-sidebar-collapsed] [data-pane="sidebar"] > [data-slot="sidebar"] > :first-child > :first-child > :not([data-dsh-responsive-part="sidebar-toggle"]) {
    display: none !important;
  }
  [data-dsh-frame][data-sidebar-collapsed] [data-pane="sidebar"] > [data-slot="sidebar"],
  [data-dsh-frame][data-sidebar-collapsed] [data-pane="sidebar"] > [data-slot="sidebar"] > :first-child { background: transparent !important; }
  [data-dsh-frame][data-sidebar-collapsed] [data-pane="sidebar"] [data-dsh-responsive-part="sidebar-toggle"] {
    pointer-events: auto;
    display: inline-flex !important;
  }
  /* The official settings dialog renders inside the sidebar foot, so collapsing
     the rail would both hide it (the rule above) and freeze it (a collapsed pane
     sets pointer-events: none). Restore only the subtree that actually carries an
     open dialog; with no dialog open the collapsed rail is unchanged (issue #1510). */
  [data-dsh-frame][data-sidebar-collapsed] [data-pane="sidebar"] > [data-slot="sidebar"] > :first-child > :not(:first-child):has([role="dialog"], [aria-modal="true"]) {
    display: flex !important;
    pointer-events: auto;
  }
  /* Center-view plugins own this marker; the aggregate shell owns its mobile offset. */
  [data-dsh-frame][data-sidebar-collapsed] [data-dsh-center-view-back] {
    margin-inline-start: 52px;
  }
  [data-dsh-frame] [data-pane="conversation"] {
    min-width: 0;
    width: 100%;
    min-height: 0;
  }
  [data-dsh-frame] [data-pane="details"] {
    display: none;
  }
  [data-dsh-frame]:not([data-details-collapsed]) [data-pane="details"] {
    display: block;
    position: absolute;
    inset: 0;
    z-index: 1000;
    width: 100%;
    background: var(--dsw-alias-bg-base);
  }
  [data-dsh-frame][data-details-collapsed] [data-pane="details"] {
    display: none;
  }
  [data-dsh-frame] [data-dsh-responsive-part="composer"] {
    max-width: 100%;
    padding-inline: max(8px, env(safe-area-inset-left)) max(8px, env(safe-area-inset-right));
  }
  [data-dsh-frame] [data-slot="conversation.composer"],
  [data-dsh-frame] [data-composer-card],
  [data-dsh-frame] [data-input-scroll] {
    min-width: 0;
    max-width: 100%;
  }
  [data-dsh-frame] [data-composer-card] > :last-child {
    min-width: 0;
    max-width: 100%;
    flex-wrap: wrap;
  }
  [data-dsh-frame] textarea[data-phase] {
    min-width: 0;
    font-size: 16px;
  }
  [data-dsh-part="summon-button"] {
    right: max(12px, env(safe-area-inset-right));
    bottom: max(12px, env(safe-area-inset-bottom));
    z-index: 40 !important;
    width: 44px !important;
    height: 44px !important;
    min-width: 44px;
    min-height: 44px;
    padding: 0 !important;
    border-radius: 50% !important;
    font-size: 0 !important;
  }
  [data-dsh-part="summon-button"]::before {
    content: "";
    display: block;
    width: 18px;
    height: 13px;
    margin: auto;
    border: 2px solid currentColor;
    border-radius: 55% 65% 45% 55%;
    transform: rotate(-8deg);
  }
  [data-dsh-frame] [data-dsh-responsive-part="code"] {
    max-width: 100%;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  [data-dsh-frame] [data-dsh-responsive-part="menu"] {
    max-width: min(92vw, 360px);
  }
}
@media (max-width: 768px) {
  [data-dsh-frame] [data-dsh-responsive-part="conversation-header"] {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-rows: minmax(32px, auto) minmax(44px, auto);
    column-gap: 8px;
    padding: 8px 8px 0 60px !important;
  }
  [data-dsh-frame] [data-dsh-responsive-part="session-title-row"] {
    display: contents;
  }
  [data-dsh-frame] [data-dsh-responsive-part="session-title-cluster"] {
    box-sizing: border-box;
    grid-column: 1 / -1;
    grid-row: 1;
    min-width: 0;
    padding-inline-end: 44px;
    overflow: hidden;
  }
  [data-dsh-frame] [data-dsh-responsive-part="session-tablist"] {
    grid-column: 1;
    grid-row: 2;
    min-width: 0;
    margin-top: 0;
    padding-left: 0;
    gap: 16px;
    overflow-x: auto;
    scrollbar-width: none;
  }
  [data-dsh-frame] [data-dsh-responsive-part="session-tablist"]::-webkit-scrollbar {
    display: none;
  }
  [data-dsh-frame] [data-dsh-responsive-part="session-tablist"] > [role="tab"] {
    min-height: 44px;
    flex: none;
  }
  [data-dsh-frame] [data-dsh-responsive-part="session-utilities"] {
    grid-column: 2;
    grid-row: 2;
    z-index: 2;
    max-width: 42vw;
    min-height: 44px;
    margin-left: 0;
    overflow-x: auto;
    scrollbar-width: none;
  }
  [data-dsh-frame] [data-dsh-responsive-part="session-utilities"]::-webkit-scrollbar {
    display: none;
  }
  [data-dsh-frame] [data-dsh-responsive-part="session-utilities"] :is(button, [role="button"]) {
    min-width: 44px;
    min-height: 44px;
    flex: none;
  }
}
[data-dsh-mario-hero],
[data-dsh-mario-brand] {
  width: 54px;
  height: 58px;
  border-radius: 14px;
  cursor: default;
  position: relative;
  overflow: visible;
}
[data-dsh-mario-brand] {
  width: 42px;
  height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
[data-dsh-mario-hero] svg,
[data-dsh-mario-brand] svg {
  opacity: 0 !important;
  visibility: hidden !important;
}
[data-dsh-mario-hero]::before,
[data-dsh-mario-brand]::before,
[data-dsh-mario-runner]::after {
  content: "";
  display: block;
  width: 40px;
  height: 48px;
  image-rendering: pixelated;
  background:
    linear-gradient(#d83a2e 0 0) 10px 0 / 24px 6px no-repeat,
    linear-gradient(#d83a2e 0 0) 6px 6px / 31px 6px no-repeat,
    linear-gradient(#744016 0 0) 7px 12px / 9px 13px no-repeat,
    linear-gradient(#ffd19a 0 0) 14px 12px / 21px 14px no-repeat,
    linear-gradient(#17110d 0 0) 29px 15px / 4px 4px no-repeat,
    linear-gradient(#744016 0 0) 25px 20px / 12px 4px no-repeat,
    linear-gradient(#ffd19a 0 0) 10px 22px / 25px 7px no-repeat,
    linear-gradient(#d83a2e 0 0) 8px 28px / 24px 8px no-repeat,
    linear-gradient(#d83a2e 0 0) 2px 30px / 9px 11px no-repeat,
    linear-gradient(#d83a2e 0 0) 29px 30px / 9px 11px no-repeat,
    linear-gradient(#fff5dc 0 0) 0 39px / 9px 6px no-repeat,
    linear-gradient(#fff5dc 0 0) 31px 39px / 9px 6px no-repeat,
    linear-gradient(#1f61b5 0 0) 12px 28px / 16px 17px no-repeat,
    linear-gradient(#1f61b5 0 0) 8px 40px / 11px 5px no-repeat,
    linear-gradient(#1f61b5 0 0) 22px 40px / 11px 5px no-repeat,
    radial-gradient(circle at 16px 35px, #ffd75a 0 2px, transparent 2.5px),
    radial-gradient(circle at 24px 35px, #ffd75a 0 2px, transparent 2.5px),
    linear-gradient(#744016 0 0) 5px 45px / 13px 3px no-repeat,
    linear-gradient(#744016 0 0) 23px 45px / 13px 3px no-repeat;
  filter: drop-shadow(0 8px 10px rgb(0 0 0 / 18%));
  position: absolute;
  left: 50%;
  bottom: 6px;
  transform: translateX(-50%) scale(.94);
  transform-origin: 50% 100%;
}
[data-dsh-mario-brand]::before {
  bottom: 2px;
  transform: translateX(-50%) scale(.72);
}
[data-dsh-mario-hero]::after {
  content: "";
  width: 30px;
  height: 5px;
  border-radius: 999px;
  background: rgb(0 0 0 / 16%);
  filter: blur(1px);
  position: absolute;
  left: 6px;
  bottom: 1px;
}
[data-dsh-mario-hero][data-dsh-mario-effect="mushroom"]::after {
  width: 30px;
  height: 24px;
  border-radius: 14px 14px 8px 8px;
  background:
    radial-gradient(circle at 7px 7px, #fff7dc 0 3px, transparent 3.5px),
    radial-gradient(circle at 15px 4px, #fff7dc 0 2.5px, transparent 3px),
    radial-gradient(circle at 23px 8px, #fff7dc 0 3px, transparent 3.5px),
    linear-gradient(#cf3329 0 0) 3px 2px / 24px 11px no-repeat,
    linear-gradient(#f2b85f 0 0) 8px 12px / 14px 10px no-repeat,
    linear-gradient(#2a160f 0 0) 11px 16px / 2px 2px no-repeat,
    linear-gradient(#2a160f 0 0) 18px 16px / 2px 2px no-repeat,
    linear-gradient(#7a421c 0 0) 9px 21px / 12px 3px no-repeat;
  box-shadow: inset 0 -3px 0 rgb(116 45 28 / 18%);
  filter: drop-shadow(0 4px 5px rgb(0 0 0 / 18%));
  left: 12px;
  bottom: 0;
}
[data-dsh-frame] [data-conversation-region="composer"]:has([data-dsh-mario-hero]) [data-composer-card] {
  --dsw-elevation-stroke-color: #b86a5d;
  border: 1px solid rgb(184 106 93 / 62%) !important;
  box-shadow:
    0 0 0 1px rgb(184 106 93 / 34%),
    0 0 0 4px rgb(218 174 86 / 8%),
    0 10px 26px rgb(55 83 130 / 7%),
    var(--dsw-elevation-soft);
}
[data-dsh-frame] [data-conversation-region="composer"]:has([data-dsh-mario-hero]) [data-composer-card]:focus-within {
  --dsw-elevation-stroke-color: #5875a7;
  border-color: rgb(88 117 167 / 68%) !important;
  box-shadow:
    0 0 0 1px rgb(88 117 167 / 40%),
    0 0 0 4px rgb(184 106 93 / 9%),
    0 10px 26px rgb(55 83 130 / 10%),
    var(--dsw-elevation-soft);
}
[data-dsh-mario-hero][data-dsh-mario-effect="brick"]::after {
  width: 36px;
  height: 24px;
  border-radius: 2px;
  background:
    linear-gradient(#ffd184 0 0) 3px 2px / 30px 2px no-repeat,
    linear-gradient(#8b3f18 0 0) 0 0 / 2px 100% no-repeat,
    linear-gradient(#8b3f18 0 0) 34px 0 / 2px 100% no-repeat,
    linear-gradient(#8b3f18 0 0) 0 0 / 100% 2px no-repeat,
    linear-gradient(#8b3f18 0 0) 0 22px / 100% 2px no-repeat,
    linear-gradient(#8b3f18 0 0) 0 8px / 100% 2px no-repeat,
    linear-gradient(#8b3f18 0 0) 0 16px / 100% 2px no-repeat,
    linear-gradient(#8b3f18 0 0) 11px 0 / 2px 8px no-repeat,
    linear-gradient(#8b3f18 0 0) 24px 0 / 2px 8px no-repeat,
    linear-gradient(#8b3f18 0 0) 5px 9px / 2px 7px no-repeat,
    linear-gradient(#8b3f18 0 0) 18px 9px / 2px 7px no-repeat,
    linear-gradient(#8b3f18 0 0) 31px 9px / 2px 7px no-repeat,
    linear-gradient(#8b3f18 0 0) 11px 17px / 2px 6px no-repeat,
    linear-gradient(#8b3f18 0 0) 24px 17px / 2px 6px no-repeat,
    linear-gradient(#c96b27 0 0) 2px 2px / 32px 20px no-repeat;
  box-shadow: inset 0 -2px 0 rgb(139 63 24 / 16%);
  filter: drop-shadow(0 4px 4px rgb(0 0 0 / 14%));
  left: 9px;
  top: -18px;
  bottom: auto;
}
@media (hover: hover) and (prefers-reduced-motion: no-preference) {
  [data-dsh-mario-hero]:hover::before {
    animation: dsh-mario-hero-jump 620ms cubic-bezier(.2, .85, .2, 1) both;
  }
  [data-dsh-mario-hero]:hover::after {
    animation: dsh-mario-shadow-squash 620ms cubic-bezier(.2, .85, .2, 1) both;
  }
  [data-dsh-mario-hero][data-dsh-mario-effect="mushroom"]:hover::after {
    animation: dsh-mario-mushroom-stomp 620ms cubic-bezier(.2, .85, .2, 1) both;
  }
  [data-dsh-mario-hero][data-dsh-mario-effect="brick"]:hover::after {
    animation: dsh-mario-brick-bump 620ms cubic-bezier(.2, .85, .2, 1) both;
  }
}
body[data-dsh-display-mode="default"] [data-dsh-mario-runner],
body[data-dsh-display-mode="default"] [data-dsh-mario-mushroom] {
  display: none !important;
}
[data-dsh-mario-runner] {
  width: 78px;
  height: 62px;
  pointer-events: auto;
  cursor: pointer;
  position: fixed;
  z-index: 45;
  left: max(18px, env(safe-area-inset-left));
  bottom: max(10px, env(safe-area-inset-bottom));
  --dsh-mario-step-duration: 540ms;
  --dsh-mario-x: 0px;
  --dsh-mario-dir: 1;
  opacity: .9;
  transform: translateX(var(--dsh-mario-x)) scaleX(var(--dsh-mario-dir));
  transform-origin: 50% 100%;
  overflow: visible;
}
[data-dsh-mario-runner]::before {
  content: "";
  width: 50px;
  height: 7px;
  border-radius: 999px;
  background: rgb(0 0 0 / 14%);
  filter: blur(1px);
  position: absolute;
  left: 10px;
  bottom: 0;
}
[data-dsh-mario-runner]::after {
  position: absolute;
  left: 18px;
  bottom: 8px;
  transform: scale(1);
  animation: dsh-mario-feet-run var(--dsh-mario-step-duration) steps(2, end) infinite;
}
body[data-dsh-mario-active="true"] [data-dsh-mario-runner] {
  opacity: 1;
}
[data-dsh-mario-runner]:hover::after,
[data-dsh-mario-runner][data-dsh-mario-paused="true"]::after {
  animation-play-state: paused;
}
[data-dsh-mario-runner][data-dsh-mario-interact="true"]::after {
  animation: dsh-mario-runner-hop 560ms cubic-bezier(.2, .9, .25, 1) both;
}
[data-dsh-mario-runner][data-dsh-mario-skateboard="true"]::before {
  width: 56px;
  height: 11px;
  left: 7px;
  bottom: 0;
  border-radius: 9px;
  background:
    radial-gradient(circle at 12px 9px, #2b211a 0 3px, transparent 3.4px),
    radial-gradient(circle at 44px 9px, #2b211a 0 3px, transparent 3.4px),
    linear-gradient(#f7d47a 0 0) 6px 2px / 44px 4px no-repeat,
    linear-gradient(#9a4f22 0 0) 3px 5px / 50px 4px no-repeat;
  filter: drop-shadow(0 4px 4px rgb(0 0 0 / 20%));
}
[data-dsh-mario-runner][data-dsh-mario-skateboard="true"]::after {
  animation: dsh-mario-skateboard-glide calc(var(--dsh-mario-step-duration) * 1.4) ease-in-out infinite;
}
[data-dsh-mario-mushroom] {
  width: 38px;
  height: 32px;
  pointer-events: none;
  position: fixed;
  z-index: 44;
  left: max(18px, env(safe-area-inset-left));
  bottom: max(12px, env(safe-area-inset-bottom));
  --dsh-mario-mushroom-x: 0px;
  opacity: 0;
  transform: translateX(var(--dsh-mario-mushroom-x)) translateY(8px) scale(.92);
  transform-origin: 50% 100%;
  transition: opacity 180ms ease, transform 180ms ease;
}
[data-dsh-mario-mushroom][data-visible="true"] {
  opacity: 1;
  transform: translateX(var(--dsh-mario-mushroom-x)) translateY(0) scale(.92);
}
[data-dsh-mario-mushroom]::before {
  content: "";
  display: block;
  width: 32px;
  height: 27px;
  image-rendering: pixelated;
  background:
    radial-gradient(circle at 8px 7px, #fff7dc 0 3px, transparent 3.4px),
    radial-gradient(circle at 16px 4px, #fff7dc 0 2.4px, transparent 2.8px),
    radial-gradient(circle at 24px 8px, #fff7dc 0 3px, transparent 3.4px),
    linear-gradient(#c7342b 0 0) 3px 2px / 26px 12px no-repeat,
    linear-gradient(#ffd79b 0 0) 8px 13px / 16px 11px no-repeat,
    linear-gradient(#24140f 0 0) 11px 17px / 2px 2px no-repeat,
    linear-gradient(#24140f 0 0) 20px 17px / 2px 2px no-repeat,
    linear-gradient(#774018 0 0) 10px 24px / 13px 3px no-repeat;
  filter: drop-shadow(0 4px 4px rgb(0 0 0 / 16%));
  transform-origin: 50% 100%;
}
[data-dsh-mario-mushroom][data-squashed="true"]::before {
  animation: dsh-mario-runner-mushroom-squash 520ms cubic-bezier(.2, .9, .25, 1) both;
}
@keyframes dsh-mario-hero-jump {
  0%, 100% { transform: translateX(-50%) translateY(0) scale(.94); }
  16% { transform: translateX(-50%) translateY(2px) scale(1, .88); }
  48% { transform: translateX(-50%) translateY(-25px) scale(.96, 1.04) rotate(-4deg); }
  72% { transform: translateX(-50%) translateY(-8px) scale(.94) rotate(3deg); }
}
@keyframes dsh-mario-shadow-squash {
  0%, 100% { transform: scaleX(1); opacity: 1; }
  48% { transform: scaleX(.45); opacity: .35; }
}
@keyframes dsh-mario-mushroom-stomp {
  0%, 100% { transform: translateY(0) scaleY(1); opacity: 1; }
  46% { transform: translateY(1px) scaleY(.58) scaleX(1.18); opacity: .92; }
  72% { transform: translateY(-2px) scaleY(1.08) scaleX(.96); }
}
@keyframes dsh-mario-brick-bump {
  0%, 30%, 100% { transform: translateY(0); }
  46% { transform: translateY(-7px); }
  56% { transform: translateY(-9px) rotate(-1deg); }
  70% { transform: translateY(-4px) rotate(1deg); }
}
@keyframes dsh-mario-idle-bob {
  0%, 100% { transform: translateY(0) scale(1); }
  50% { transform: translateY(-2px) scale(1); }
}
@keyframes dsh-mario-feet-run {
  0% { transform: translateY(0) scale(1) skewX(-3deg); }
  100% { transform: translateY(-1px) scale(1) skewX(3deg); }
}
@keyframes dsh-mario-runner-hop {
  0%, 100% { transform: translateY(0) scale(1); }
  35% { transform: translateY(-18px) scale(1.04) rotate(-5deg); }
  62% { transform: translateY(-10px) scale(1.02) rotate(5deg); }
}
@keyframes dsh-mario-skateboard-glide {
  0%, 100% { transform: translateY(-3px) rotate(-2deg); }
  50% { transform: translateY(-5px) rotate(2deg); }
}
@keyframes dsh-mario-runner-mushroom-squash {
  0% { transform: translateY(0) scale(1); opacity: 1; }
  36% { transform: translateY(5px) scale(1.18, .46); opacity: .95; }
  72% { transform: translateY(2px) scale(.92, .82); opacity: .82; }
  100% { transform: translateY(8px) scale(.7, .42); opacity: 0; }
}
@keyframes dsh-mario-track-run {
  0% { transform: translateX(0) scaleX(1); }
  48% { transform: translateX(calc(100vw - 116px)) scaleX(1); }
  50% { transform: translateX(calc(100vw - 116px)) scaleX(-1); }
  98% { transform: translateX(0) scaleX(-1); }
  100% { transform: translateX(0) scaleX(1); }
}
@media (prefers-reduced-motion: reduce) {
  [data-dsh-frame] [data-pane="sidebar"] { transition: none; }
  [data-dsh-boot-splash],
  [data-dsh-mario-hero]::before,
  [data-dsh-mario-hero]::after,
  [data-dsh-mario-brand]::before,
  [data-dsh-mario-runner],
  [data-dsh-mario-runner]::before,
  [data-dsh-mario-runner]::after,
  [data-dsh-mario-mushroom],
  [data-dsh-mario-mushroom]::before { transition: none; animation: none !important; }
}
[data-dsh-boot-splash] {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: var(--dsw-alias-bg-base, #1e1e20);
  opacity: 1;
  pointer-events: none;
  transition: opacity 160ms cubic-bezier(0.4, 0, 0.2, 1);
}
[data-dsh-boot-splash][data-ready] {
  opacity: 0;
}
`

function ensureResponsiveStyle(): HTMLStyleElement {
  const existing = document.querySelector<HTMLStyleElement>('style[data-dsh-compat="responsive"]')
  if (existing !== null) return existing
  const style = document.createElement('style')
  style.dataset.dshCompat = 'responsive'
  style.textContent = RESPONSIVE_CSS
  document.head.appendChild(style)
  return style
}

function applyDisplayModeAttribute(): void {
  document.body.dataset.dshDisplayMode = readDisplayMode()
}

function clearMarioSurface(): boolean {
  let changed = false
  document.querySelectorAll<HTMLElement>('[data-dsh-mario-hero], [data-dsh-mario-brand]').forEach(element => {
    if (element.hasAttribute('data-dsh-mario-hero')) {
      element.removeAttribute('data-dsh-mario-hero')
      element.removeAttribute('data-dsh-mario-effect')
      changed = true
    }
    if (element.hasAttribute('data-dsh-mario-brand')) {
      element.removeAttribute('data-dsh-mario-brand')
      changed = true
    }
  })
  document.body.removeAttribute('data-dsh-mario-active')
  delete document.body.dataset.dshMarioTaskCount
  return changed
}

function installDisplayModeSync(onChange: () => void): () => void {
  const sync = (): void => {
    applyDisplayModeAttribute()
    if (readDisplayMode() === 'default') clearMarioSurface()
    onChange()
  }
  sync()
  window.addEventListener(DISPLAY_MODE_CHANGE_EVENT, sync)
  window.addEventListener('storage', sync)
  return () => {
    window.removeEventListener(DISPLAY_MODE_CHANGE_EVENT, sync)
    window.removeEventListener('storage', sync)
  }
}

function installDisplayModeSetting(ctx: Context): void {
  const maybe = ctx as Context & {
    slots?: {
      inject: (name: string, callback: () => () => void) => void
      register: (options: Record<string, unknown>, component: (props: unknown) => ReactishElement) => () => void
    }
  }
  if (maybe.slots === undefined) return
  maybe.slots.inject('settings.general.item', () => maybe.slots!.register({
    name: 'settings.general.item',
    id: 'dsh-web-display-mode',
    order: 12,
  }, DisplayModeRow))
}

function modelPickerText(key: 'effort' | 'effortAria'): string {
  const isEnglish = document.documentElement.lang.toLowerCase().startsWith('en')
  if (key === 'effort') return isEnglish ? 'Effort' : '\u63a8\u7406\u7b49\u7ea7'
  return isEnglish ? 'Choose reasoning effort' : '\u9009\u62e9\u63a8\u7406\u7b49\u7ea7'
}

/** Value span of the split effort trigger (the official trigger's own shape). */
const EFFORT_LABEL_MARKUP = '<span data-dsh-model-effort-label=""></span>'
/** Chevron of the split effort trigger, copied from the official chevron icon. */
const EFFORT_CHEVRON_MARKUP = '<svg data-dsh-model-effort-chevron="" width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" stroke-width="1"><path d="M4 6L7.29289 9.29289C7.68342 9.68342 8.31658 9.68342 8.70711 9.29289L12 6" stroke="currentColor"></path></svg>'

/**
 * Write one attribute only when it actually changes. The wiring observer
 * watches these attributes, so an unconditional write would re-trigger it
 * forever.
 * @param element - the target element.
 * @param name - attribute name.
 * @param value - desired value.
 */
function setAttr(element: Element, name: string, value: string): void {
  if (element.getAttribute(name) !== value) element.setAttribute(name, value)
}

function installSplitModelEffortPicker(): () => void {
  const bypass = new WeakSet<HTMLButtonElement>()
  let wireTimer = 0
  const triggerOf = (): HTMLButtonElement | null => document.querySelector<HTMLButtonElement>('[data-slot="conversation.input.model"] button[aria-haspopup="menu"]:not([data-dsh-model-effort-trigger])')
  const menuOf = (trigger: HTMLButtonElement): HTMLElement | null => {
    const id = trigger.getAttribute('aria-controls')
    if (id !== null && id !== '') return document.getElementById(id)
    return document.querySelector<HTMLElement>('[role="menu"][aria-busy]')
  }
  const drill = (kind: 'model' | 'effort'): void => {
    const trigger = triggerOf()
    if (trigger === null || trigger.disabled) return
    if (trigger.getAttribute('aria-expanded') !== 'true') {
      bypass.add(trigger)
      trigger.click()
      bypass.delete(trigger)
    }
    window.setTimeout(() => {
      const menu = menuOf(trigger)
      if (menu === null) return
      const rows = Array.from(menu.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]'))
      const row = rows[kind === 'model' ? 0 : 1]
      if (row !== undefined && !row.disabled) row.click()
    }, 0)
  }
  const wire = (): void => {
    wireTimer = 0
    const slot = document.querySelector<HTMLElement>('[data-slot="conversation.input.model"]')
    const trigger = triggerOf()
    if (slot === null || trigger === null) return
    const labels = Array.from(trigger.querySelectorAll<HTMLElement>(':scope > span'))
    const effort = labels[1]
    const effortText = effort?.textContent?.trim() ?? ''
    // The slot outlet is `display: contents`, so a trigger appended there
    // becomes a sibling in the composer row and the row's 12px gap separates
    // it from the model trigger. Seat it inside the official trigger's own
    // wrapper instead, and make that wrapper the row.
    const root = trigger.parentElement instanceof HTMLElement ? trigger.parentElement : slot
    root.setAttribute('data-dsh-model-root', '')
    let effortButton = root.querySelector<HTMLButtonElement>('[data-dsh-model-effort-trigger]')
    if (effort === undefined || effortText === '') {
      effortButton?.remove()
      return
    }
    effort.setAttribute('data-dsh-model-original-effort', '')
    if (effortButton === null) {
      effortButton = document.createElement('button')
      effortButton.type = 'button'
      effortButton.setAttribute('data-dsh-model-effort-trigger', '')
      effortButton.setAttribute('aria-haspopup', 'menu')
      // Same shape as the official trigger: value span + chevron, no label
      // prefix (the official trigger carries no "Model"/"Effort" wording
      // either; the full meaning stays in title/aria-label).
      effortButton.innerHTML = `${EFFORT_LABEL_MARKUP}${EFFORT_CHEVRON_MARKUP}`
      root.append(effortButton)
    }
    const effortValue = effortButton.querySelector<HTMLElement>('[data-dsh-model-effort-label]')
    if (effortValue !== null && effortValue.textContent !== effortText) effortValue.textContent = effortText
    setAttr(effortButton, 'title', `${modelPickerText('effort')}: ${effortText}`)
    setAttr(effortButton, 'aria-label', `${modelPickerText('effortAria')}\uff0c${effortText}`)
    setAttr(effortButton, 'aria-expanded', trigger.getAttribute('aria-expanded') === 'true' ? 'true' : 'false')
    effortButton.disabled = trigger.disabled
  }
  const schedule = (): void => {
    if (wireTimer !== 0) return
    wireTimer = window.setTimeout(wire, 0)
  }
  const onClick = (event: MouseEvent): void => {
    const target = event.target
    if (!(target instanceof Element)) return
    const effortButton = target.closest<HTMLButtonElement>('[data-dsh-model-effort-trigger]')
    if (effortButton !== null) {
      event.preventDefault()
      event.stopImmediatePropagation()
      drill('effort')
      return
    }
    const trigger = target.closest<HTMLButtonElement>('[data-slot="conversation.input.model"] button[aria-haspopup="menu"]:not([data-dsh-model-effort-trigger])')
    if (trigger === null || bypass.has(trigger)) return
    event.preventDefault()
    event.stopImmediatePropagation()
    drill('model')
  }
  document.body.addEventListener('click', onClick, true)
  const observer = new MutationObserver(schedule)
  observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['aria-expanded', 'aria-busy', 'disabled', 'title'] })
  wire()
  return () => {
    document.body.removeEventListener('click', onClick, true)
    observer.disconnect()
    if (wireTimer !== 0) window.clearTimeout(wireTimer)
    document.querySelector('[data-dsh-model-effort-trigger]')?.remove()
    document.querySelectorAll('[data-dsh-model-original-effort]').forEach(element => element.removeAttribute('data-dsh-model-original-effort'))
    document.querySelectorAll('[data-dsh-model-root]').forEach(element => element.removeAttribute('data-dsh-model-root'))
  }
}

function stampSemanticParts(frame: Element): boolean {
  let changed = false
  const mark = (element: Element, part: string): void => {
    if (element.getAttribute('data-dsh-responsive-part') === part) return
    element.setAttribute('data-dsh-responsive-part', part)
    changed = true
  }
  frame.querySelectorAll<HTMLElement>('[data-slot="conversation.composer"], [data-composer-card], [data-input-scroll], textarea[data-phase], [contenteditable="true"]').forEach(element => mark(element, 'composer'))
  frame.querySelectorAll<HTMLElement>('pre').forEach(element => mark(element, 'code'))
  frame.querySelectorAll<HTMLElement>('[role="menu"], [data-subagent-menu]').forEach(element => mark(element, 'menu'))
  frame.querySelectorAll<HTMLElement>('[role="treeitem"]:not([data-dsh-part])').forEach(element => mark(element, 'sidebar-entry'))
  if (readDisplayMode() === 'mario') {
    frame.querySelectorAll<HTMLElement>('[class*="_fishHitbox"]').forEach(element => {
      if (element.hasAttribute('data-dsh-mario-hero')) return
      element.setAttribute('data-dsh-mario-hero', '')
      changed = true
    })
    frame.querySelectorAll<HTMLElement>('[class*="_brandMark"]').forEach(element => {
      if (element.hasAttribute('data-dsh-mario-brand')) return
      element.setAttribute('data-dsh-mario-brand', '')
      changed = true
    })
  } else {
    changed = clearMarioSurface() || changed
  }
  const conversation = frame.querySelector<HTMLElement>('[data-pane="conversation"]')
  const headerSlot = conversation?.querySelector<HTMLElement>('[data-slot="conversation.session.header"]')
  const slottedHeader = headerSlot?.querySelector<HTMLElement>(':scope > header') ?? null
  const scrollport = conversation?.querySelector<HTMLElement>('[data-conversation-scroll]') ?? null
  const siblingHeader = scrollport?.previousElementSibling ?? null
  const conversationHeader = slottedHeader
    ?? (siblingHeader?.tagName === 'HEADER' && siblingHeader.parentElement === scrollport?.parentElement ? siblingHeader : null)
  if (conversationHeader !== null) {
    mark(conversationHeader, 'conversation-header')
    const titleRow = conversationHeader.firstElementChild
    if (titleRow !== null && titleRow.getAttribute('role') !== 'tablist') {
      mark(titleRow, 'session-title-row')
      const titleCluster = titleRow.firstElementChild
      const utilities = titleCluster?.nextElementSibling
      if (titleCluster !== null && titleCluster !== undefined) mark(titleCluster, 'session-title-cluster')
      if (utilities !== null && utilities !== undefined) mark(utilities, 'session-utilities')
    }
    const tablist = conversationHeader.querySelector<HTMLElement>(':scope > [role="tablist"]')
    if (tablist !== null) mark(tablist, 'session-tablist')
  }
  const sidebar = frame.querySelector<HTMLElement>('[data-pane="sidebar"]')
  const sidebarSlot = sidebar?.querySelector<HTMLElement>(':scope > [data-slot="sidebar"]')
  const logoRow = sidebarSlot?.firstElementChild?.firstElementChild
  const logoButtons = logoRow?.querySelectorAll<HTMLElement>(':scope > button, :scope > [role="button"]')
  const toggle = logoButtons?.item((logoButtons.length || 1) - 1)
  if (toggle !== null && toggle !== undefined) mark(toggle, 'sidebar-toggle')
  return changed
}

function installMobileSidebarDismiss(frame: HTMLElement): () => void {
  let raf = 0
  const onClick = (event: Event): void => {
    const target = event.target
    if (!(target instanceof Element)) return
    if (typeof window.matchMedia !== 'function' || !window.matchMedia('(max-width: 768px)').matches) return
    const sidebar = frame.querySelector<HTMLElement>('[data-pane="sidebar"]')
    const toggle = frame.querySelector<HTMLElement>('[data-dsh-responsive-part="sidebar-toggle"]')
    if (!frame.hasAttribute('data-sidebar-collapsed') && sidebar !== null && !sidebar.contains(target)) {
      event.preventDefault()
      event.stopPropagation()
      toggle?.click()
      return
    }
    if (target.closest('[data-dsh-responsive-part="sidebar-toggle"]') !== null) return
    // A group row toggles its own aria-expanded in place, so folding the drawer
    // on that tap hides the rows it just revealed; its menu trigger opens a
    // menu the fold would discard (issue #1716). The group row's trailing
    // new-session button navigates away and keeps the fold, matching the
    // remote package's own workspace-row rule.
    const sessionRow = target.closest('[class*="sessionRow"]')
    if (sessionRow === null && target.closest('[class*="projectRow"]') !== null) {
      const actions = target.closest('[class*="rowActions"]')
      if (actions === null) return
      const buttons = actions.querySelectorAll('button')
      if (target.closest('button') !== buttons[buttons.length - 1]) return
    }
    if (sessionRow === null && target.closest('[data-dsh-part="sidebar-entry"]') === null && target.closest('[role="treeitem"]') === null) return
    if (raf !== 0) cancelAnimationFrame(raf)
    raf = requestAnimationFrame(() => {
      raf = 0
      if (!frame.hasAttribute('data-sidebar-collapsed')) {
        toggle?.click()
      }
    })
  }
  frame.addEventListener('click', onClick, true)
  return () => {
    frame.removeEventListener('click', onClick, true)
    if (raf !== 0) cancelAnimationFrame(raf)
  }
}

/** One pass over the current DOM. Returns false once every stamp is already in place. */
function applyShims(): boolean {
  let changed = false
  for (const [selector, attribute] of COLUMN_SHIMS) {
    const el = document.querySelector(selector)
    const eq = attribute.indexOf('=')
    const name = attribute.slice(0, eq)
    const value = attribute.slice(eq + 1).replace(/^"|"$/g, '')
    if (el !== null && el.getAttribute(name) !== value) {
      el.setAttribute(name, value)
      changed = true
    }
  }
  // The frame is the grid item that parents the sidebar column.
  const frame = document.querySelector('[class*="sidebarCol"]')?.parentElement ?? null
  if (frame !== null && frame.getAttribute('data-dsh-frame') !== '') {
    frame.setAttribute('data-dsh-frame', '')
    changed = true
  }
  if (frame !== null) changed = stampSemanticParts(frame) || changed
  return changed
}

function installBootShield(): { dismiss: () => void; remove: () => void } {
  if (typeof document === 'undefined') return { dismiss: () => {}, remove: () => {} }
  let splash = document.querySelector<HTMLElement>('div[data-dsh-boot-splash]')
  if (splash === null) {
    splash = document.createElement('div')
    splash.setAttribute('data-dsh-boot-splash', '')
    document.body.appendChild(splash)
  }
  let dismissed = false
  let fadeTimer = 0
  const dismiss = (): void => {
    if (dismissed) return
    dismissed = true
    splash?.setAttribute('data-ready', '')
    fadeTimer = window.setTimeout(() => {
      splash?.remove()
    }, 180)
  }
  const timeout = window.setTimeout(dismiss, 1000)
  return {
    dismiss,
    remove: () => {
      window.clearTimeout(timeout)
      window.clearTimeout(fadeTimer)
      splash?.remove()
    },
  }
}

const ACTIVE_TASK_SELECTOR = [
  '[aria-busy="true"]',
  '[data-streaming]',
  '[data-state="running"]',
  '[data-pending-steering="true"]',
  '[data-dsh-plugin="task-board"] [data-status="running"]',
].join(', ')

const ACTIVE_TASK_TEXT = /\b(Running|Executing|Compacting context|Deep diving)\b|\u8fd0\u884c\u4e2d|\u6267\u884c\u4e2d|\u6b63\u5728\u538b\u7f29|\u6df1\u5ea6\u601d\u8003/ // i18n-allow: aggregate inline running-task text, zh alternatives match on purpose

/**
 * Streaming-marker blind spot. The marker attributes above only exist while
 * assistant TEXT is streaming; during the tool-call / thinking stretch a turn
 * is busy but nothing is marked, so the page would read as idle. The composer
 * covers that window: while an agent turn runs it turns its primary button (and
 * a dedicated control) into a stop button, whose icon is a rounded square.
 */
const ACTIVE_STOP_ICON_SELECTOR = 'button svg rect[width="10"][height="10"][rx="3"][fill="currentColor"]'
const ACTIVE_STOP_LABEL = /\u505c\u6b62\u751f\u6210|stop generating/i // i18n-allow: official composer stop labels (zh/en), substring match is intentional

/**
 * Count the busy signals the live DOM carries.
 * @returns 0 when the page is idle, otherwise at least one, capped for pacing.
 */
function activeTaskCount(): number {
  const matches = new Set<Element>()
  document.querySelectorAll(ACTIVE_TASK_SELECTOR).forEach(element => matches.add(element))
  // The composer stop state is a plain "busy" fact: it should not inflate the
  // count by itself, only guarantee at least one running signal.
  if (document.querySelector(ACTIVE_STOP_ICON_SELECTOR) !== null) matches.add(document.body)
  if (matches.size > 0) return Math.max(1, Math.min(matches.size, 8))
  for (const button of document.querySelectorAll('button[aria-label]')) {
    if (ACTIVE_STOP_LABEL.test(button.getAttribute('aria-label') ?? '')) return 1
  }
  return ACTIVE_TASK_TEXT.test(document.body.innerText) ? 1 : 0
}

function marioRunTempo(count: number): { speed: number; step: string } {
  if (count <= 0) return { speed: 22, step: '540ms' }
  if (count === 1) return { speed: 34, step: '500ms' }
  if (count === 2) return { speed: 48, step: '420ms' }
  if (count === 3) return { speed: 64, step: '340ms' }
  return { speed: 82, step: '280ms' }
}

const MARIO_HERO_EFFECTS = ['mushroom', 'brick'] as const

function installMarioHeroEffects(): () => void {
  if (typeof document === 'undefined') return () => {}
  const timers = new WeakMap<HTMLElement, number>()
  const heroes = new Set<HTMLElement>()

  const clearHeroTimer = (hero: HTMLElement): void => {
    const timer = timers.get(hero)
    if (timer === undefined) return
    window.clearTimeout(timer)
    timers.delete(hero)
  }

  const onPointerOver = (event: PointerEvent): void => {
    const target = event.target
    if (!(target instanceof Element)) return
    if (readDisplayMode() !== 'mario') return
    const hero = target.closest<HTMLElement>('[data-dsh-mario-hero]')
    if (hero === null) return
    if (event.relatedTarget instanceof Node && hero.contains(event.relatedTarget)) return

    heroes.add(hero)
    clearHeroTimer(hero)
    hero.removeAttribute('data-dsh-mario-effect')
    void hero.offsetWidth
    const effect = MARIO_HERO_EFFECTS[Math.floor(Math.random() * MARIO_HERO_EFFECTS.length)]
    hero.setAttribute('data-dsh-mario-effect', effect)
    timers.set(hero, window.setTimeout(() => {
      hero.removeAttribute('data-dsh-mario-effect')
      timers.delete(hero)
    }, 760))
  }

  document.body.addEventListener('pointerover', onPointerOver, true)
  return () => {
    document.body.removeEventListener('pointerover', onPointerOver, true)
    for (const hero of heroes) {
      clearHeroTimer(hero)
      hero.removeAttribute('data-dsh-mario-effect')
    }
    heroes.clear()
  }
}

function installMarioRunner(): () => void {
  if (typeof document === 'undefined') return () => {}
  let runner = document.querySelector<HTMLElement>('[data-dsh-mario-runner]')
  if (runner === null) {
    runner = document.createElement('div')
    runner.setAttribute('data-dsh-mario-runner', '')
    runner.setAttribute('aria-hidden', 'true')
    document.body.appendChild(runner)
  }
  let mushroom = document.querySelector<HTMLElement>('[data-dsh-mario-mushroom]')
  if (mushroom === null) {
    mushroom = document.createElement('div')
    mushroom.setAttribute('data-dsh-mario-mushroom', '')
    mushroom.setAttribute('aria-hidden', 'true')
    document.body.appendChild(mushroom)
  }

  let updateTimer = 0
  let taskCount = 0
  let speed = marioRunTempo(0).speed
  let x = 0
  let dir = 1
  let lastMove = Date.now()
  let paused = false
  let interactTimer = 0
  let mushroomX = 0
  let mushroomVisible = false
  let mushroomSquashing = false
  let mushroomHideTimer = 0
  let nextMushroomAt = Date.now() + 3000 + Math.random() * 6000
  let skateboarding = false

  const maxX = (): number => Math.max(0, window.innerWidth - 116)
  const paintPosition = (): void => {
    runner.style.setProperty('--dsh-mario-x', `${Math.round(x)}px`)
    runner.style.setProperty('--dsh-mario-dir', String(dir))
  }
  const paintMushroom = (): void => {
    mushroom.style.setProperty('--dsh-mario-mushroom-x', `${Math.round(mushroomX)}px`)
    mushroom.toggleAttribute('data-visible', mushroomVisible)
    mushroom.toggleAttribute('data-squashed', mushroomSquashing)
  }
  const scheduleNextMushroom = (): void => {
    nextMushroomAt = Date.now() + 8000 + Math.random() * 10000
  }
  const hideMushroom = (): void => {
    mushroomVisible = false
    mushroomSquashing = false
    paintMushroom()
    scheduleNextMushroom()
  }
  /**
   * The board is a state, not a random treat: a running task puts Mario on it
   * and the idle page walks. Only the change is written, so the 20Hz movement
   * loop never touches the DOM attribute.
   * @param on - true while at least one task is executing.
   */
  const setSkateboard = (on: boolean): void => {
    if (skateboarding === on) return
    skateboarding = on
    if (on) runner.setAttribute('data-dsh-mario-skateboard', 'true')
    else runner.removeAttribute('data-dsh-mario-skateboard')
  }
  const update = (): void => {
    updateTimer = 0
    if (readDisplayMode() !== 'mario') {
      taskCount = 0
      speed = 0
      if (mushroomVisible) hideMushroom()
      setSkateboard(false)
      document.body.removeAttribute('data-dsh-mario-active')
      delete document.body.dataset.dshMarioTaskCount
      return
    }
    const count = activeTaskCount()
    const tempo = marioRunTempo(count)
    taskCount = count
    speed = tempo.speed
    // Any running task means the board; an idle page walks.
    setSkateboard(count > 0)
    if (count > 0 && mushroomVisible) hideMushroom()
    document.body.toggleAttribute('data-dsh-mario-active', count > 0)
    document.body.dataset.dshMarioTaskCount = String(count)
    runner.style.setProperty('--dsh-mario-step-duration', tempo.step)
  }
  const schedule = (): void => {
    if (updateTimer !== 0) return
    updateTimer = window.setTimeout(update, 80)
  }
  const move = (): void => {
    const now = Date.now()
    const dt = Math.min(240, now - lastMove) / 1000
    lastMove = now
    if (readDisplayMode() !== 'mario') return
    if (paused) return
    x += dir * speed * dt
    const right = maxX()
    if (x >= right) {
      x = right
      dir = -1
    } else if (x <= 0) {
      x = 0
      dir = 1
    }
    paintPosition()
    // The mushroom is a walking-page treat only; on the board Mario is busy.
    if (taskCount === 0 && !mushroomVisible && Date.now() >= nextMushroomAt) {
      const right = maxX()
      const lead = 110 + Math.random() * 70
      mushroomX = dir > 0 ? Math.min(right, x + lead) : Math.max(0, x - lead)
      if (Math.abs(mushroomX - x) > 70) {
        mushroomVisible = true
        mushroomSquashing = false
        paintMushroom()
      } else {
        scheduleNextMushroom()
      }
    }
    if (mushroomVisible && !mushroomSquashing) {
      if (taskCount > 0 || Math.abs(mushroomX - x) > 320) {
        hideMushroom()
      } else if (Math.abs(mushroomX - x) < 30) {
        mushroomSquashing = true
        paintMushroom()
        interact()
        if (mushroomHideTimer !== 0) window.clearTimeout(mushroomHideTimer)
        mushroomHideTimer = window.setTimeout(() => {
          mushroomHideTimer = 0
          hideMushroom()
        }, 580)
      }
    }
  }
  const pause = (): void => {
    paused = true
    runner.setAttribute('data-dsh-mario-paused', 'true')
  }
  const resume = (): void => {
    paused = false
    lastMove = Date.now()
    runner.removeAttribute('data-dsh-mario-paused')
  }
  const interact = (): void => {
    runner.setAttribute('data-dsh-mario-interact', 'true')
    if (interactTimer !== 0) window.clearTimeout(interactTimer)
    interactTimer = window.setTimeout(() => {
      interactTimer = 0
      runner.removeAttribute('data-dsh-mario-interact')
    }, 620)
  }

  runner.addEventListener('pointerenter', pause)
  runner.addEventListener('pointerleave', resume)
  runner.addEventListener('click', interact)
  const observer = new MutationObserver(schedule)
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['aria-busy', 'aria-label', 'data-state', 'data-status', 'data-streaming', 'data-pending-steering', 'class'],
  })
  const interval = window.setInterval(schedule, 1400)
  const moveInterval = window.setInterval(move, 50)
  schedule()
  paintPosition()
  paintMushroom()
  scheduleNextMushroom()

  return () => {
    observer.disconnect()
    window.clearInterval(interval)
    window.clearInterval(moveInterval)
    if (updateTimer !== 0) window.clearTimeout(updateTimer)
    if (interactTimer !== 0) window.clearTimeout(interactTimer)
    if (mushroomHideTimer !== 0) window.clearTimeout(mushroomHideTimer)
    runner.removeEventListener('pointerenter', pause)
    runner.removeEventListener('pointerleave', resume)
    runner.removeEventListener('click', interact)
    document.body.removeAttribute('data-dsh-mario-active')
    delete document.body.dataset.dshMarioTaskCount
    runner?.remove()
    mushroom?.remove()
  }
}

/** Required services: slots seats the display-mode row in General settings. */
export const inject = ['slots'] as const

/**
 * Register the shim for the page lifetime.
 * @param ctx - client root context.
 */
export function apply(ctx: Context): void {
  // The family children ride this bundle (see mount-children.ts): the shell's
  // folded rows leave them invisible to the client module scanner, so they
  // mount here as nested client plugins. Fire-and-forget: the row-state fetch
  // must not delay the DOM shims (boot splash dismissal is time-critical),
  // and the mount is fail-open and self-contained — it never rejects.
  void mountClientChildren(ctx).catch(error => {
    console.error('[dsh-web-all] client children mount failed', error)
  })
  installDisplayModeSetting(ctx)
  ctx.effect(() => {
    const responsiveStyle = ensureResponsiveStyle()
    const bootShield = installBootShield()
    const removeMarioRunner = installMarioRunner()
    const removeMarioHeroEffects = installMarioHeroEffects()
    const removeSplitModelEffortPicker = installSplitModelEffortPicker()
    const removeDisplayModeSync = installDisplayModeSync(applyShims)
    applyShims()
    let removeMobileDismiss = (): void => {}
    let dismissFrame: HTMLElement | null = null
    let resolvedFrame: HTMLElement | null = null
    const ensureMobileDismiss = (): void => {
      // The frame element is stable for the page lifetime; re-query only when
      // the cached one is gone. A document.querySelector per mutation batch
      // was paid for every streaming commit even though the answer never
      // changed.
      if (resolvedFrame !== null && !resolvedFrame.isConnected) resolvedFrame = null
      const frame = resolvedFrame ?? document.querySelector<HTMLElement>('[data-dsh-frame]')
      resolvedFrame = frame
      if (frame === null) return
      bootShield.dismiss()
      if (frame === dismissFrame) return
      removeMobileDismiss()
      removeMobileDismiss = installMobileSidebarDismiss(frame)
      dismissFrame = frame
    }
    ensureMobileDismiss()
    // The shell renders after boot settlement and React can re-create the
    // columns on re-render. The hub already coalesces callbacks per frame;
    // scheduling another frame here would delay hooks and leave work alive
    // after this effect is disposed. Attribute writes remain idempotent.
    const unsubscribeBody = subscribeBodyInvalidations(() => {
      applyShims()
      ensureMobileDismiss()
    })
    return () => {
      unsubscribeBody()
      bootShield.remove()
      responsiveStyle.remove()
      removeMobileDismiss()
      removeDisplayModeSync()
      removeSplitModelEffortPicker()
      removeMarioRunner()
      removeMarioHeroEffects()
    }
  })
}
