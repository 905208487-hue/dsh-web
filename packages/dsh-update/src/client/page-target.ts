/**
 * Page-delivery facts retained for legacy callers that ask where a visible
 * update seat would be allowed.
 *
 * The family self-update is a *web* capability: it runs pnpm inside the profile
 * the host was booted from. The current browser half renders no sidebar seat,
 * and the official DSH Desktop shell serves its Web GUI from `dsh-app://app/`
 * with its own updater.
 *
 * Naming the web side rather than an allowlist of known shells follows the
 * pairing fence's own classification
 * (`packages/dsh-remote-web-ui/src/remote-channel-rules.ts`, WEB_PAGE_PROTOCOLS):
 * any scheme that is not a web scheme was delivered by an application on this
 * machine. The two lists describe the same fact and stay in step.
 */

/** Schemes a web page can be delivered with. */
export const WEB_PAGE_SCHEMES: readonly string[] = [
  'http:',
  'https:',
  'blob:',
  'data:',
  'about:',
  'filesystem:',
]

/**
 * Whether the page was delivered by an application on this machine (the DSH
 * Desktop shell) instead of a web transport.
 * @param protocol - `location.protocol` of the page (for example `dsh-app:`).
 * @returns true for an application-delivered page; false for a web page and
 *   for an unreadable (empty) scheme, which stays on the web side.
 */
export function isApplicationDeliveredPage(protocol: string): boolean {
  return protocol !== '' && !WEB_PAGE_SCHEMES.includes(protocol)
}

/**
 * Whether a legacy visible sidebar seat would be allowed on this page. The
 * current client does not call this helper when applying.
 * @param protocol - `location.protocol` of the page.
 * @returns true for web pages and false for application-delivered pages.
 */
export function shouldMountUpdateSeat(protocol: string): boolean {
  return !isApplicationDeliveredPage(protocol)
}

/**
 * Read the page protocol from a window-like object.
 * @param win - the window to read (defaults to the real one).
 * @returns `location.protocol`, or an empty string when unreadable.
 */
export function pageProtocolOf(win: { location?: { protocol?: string } } = window): string {
  return win.location?.protocol ?? ''
}
