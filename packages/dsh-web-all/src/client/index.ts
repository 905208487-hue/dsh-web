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
import { mountClientChildren } from './mount-children.ts'
import { subscribeBodyInvalidations } from './body-mutations.ts'

/** Column shims: element selector → attribute to stamp. */
const COLUMN_SHIMS: ReadonlyArray<readonly [selector: string, attribute: string]> = [
  ['[class*="sidebarCol"]', 'data-pane="sidebar"'],
  ['[class*="centerCol"]', 'data-pane="conversation"'],
  ['[class*="detailsCol"]', 'data-pane="details"'],
]

/** Stable hooks consumed by the responsive compat layer (never text/hash selectors). */
export const RESPONSIVE_CSS = `
[data-dsh-frame] { min-height: 0; }
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
[data-dsh-frame] [data-dsh-responsive-part="composer"],
[data-dsh-frame] [data-dsh-responsive-part="sidebar-toggle"],
  [data-dsh-frame] [data-dsh-responsive-part="menu"] { touch-action: manipulation; }
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
  [data-dsh-frame] [data-slot="conversation.input.model"] {
    min-width: 0;
    max-width: 45%;
  }
  [data-dsh-frame] [data-slot="conversation.input.model"] :is(button, span) {
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
    if (target.closest('[data-dsh-part="sidebar-entry"], [role="treeitem"]') === null) return
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

function activeTaskCount(): number {
  const matches = new Set<Element>()
  document.querySelectorAll(ACTIVE_TASK_SELECTOR).forEach(element => matches.add(element))
  if (matches.size > 0) return Math.min(matches.size, 8)
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
  let nextMushroomAt = Date.now() + 9000 + Math.random() * 12000

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
    nextMushroomAt = Date.now() + 14000 + Math.random() * 18000
  }
  const hideMushroom = (): void => {
    mushroomVisible = false
    mushroomSquashing = false
    paintMushroom()
    scheduleNextMushroom()
  }
  const update = (): void => {
    updateTimer = 0
    const count = activeTaskCount()
    const tempo = marioRunTempo(count)
    taskCount = count
    speed = tempo.speed
    if (count > 1 && mushroomVisible) hideMushroom()
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
    if (taskCount <= 1 && !mushroomVisible && Date.now() >= nextMushroomAt) {
      const right = maxX()
      const lead = 180 + Math.random() * 120
      mushroomX = dir > 0 ? Math.min(right, x + lead) : Math.max(0, x - lead)
      if (Math.abs(mushroomX - x) > 95) {
        mushroomVisible = true
        mushroomSquashing = false
        paintMushroom()
      } else {
        scheduleNextMushroom()
      }
    }
    if (mushroomVisible && !mushroomSquashing) {
      if (taskCount > 1 || Math.abs(mushroomX - x) > 420) {
        hideMushroom()
      } else if (Math.abs(mushroomX - x) < 24) {
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
    attributeFilter: ['aria-busy', 'data-state', 'data-status', 'data-streaming', 'data-pending-steering', 'class'],
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

/** Required services: none — the shim must run before any DOM mount waits. */
export const inject = [] as const

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
  ctx.effect(() => {
    const responsiveStyle = ensureResponsiveStyle()
    const bootShield = installBootShield()
    const removeMarioRunner = installMarioRunner()
    const removeMarioHeroEffects = installMarioHeroEffects()
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
      removeMarioRunner()
      removeMarioHeroEffects()
    }
  })
}
