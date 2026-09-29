/**
 * Client-side cleanup after a successful recall: the recalled latest turn's
 * flow rows vanish from the open conversation immediately — the operator sees
 * their message and its reply removed without reopening the session or
 * restarting dsh. The on-disk facts stay authoritative (the host route already
 * truncated the event log); this module only keeps the visible flow in step.
 *
 * The official chat shell renders every turn's content as flow rows marked
 * with `data-chat-turn=<number>` (ascending along the conversation) and a
 * stable identity key on `data-chat-anchor-key` (mirrored on
 * `data-chat-flow-key`). Disk recall semantics (core/rollback) cut everything
 * from the turn containing the LAST real user message through the end of the
 * log, so the client mirror is: anchor on the LAST flow row of kind `user` or
 * `steering` (the shell's own selector for operator-typed messages — injected
 * platform content never renders as `user`), then remove every row whose turn
 * number is that row's or higher.
 *
 * The shell renders rows from its own React store (the running host keeps the
 * session in memory), so a later reconciliation re-creates removed rows.
 * Every removed row's anchor key therefore lands in a page-level stylesheet,
 * and the key sets persist per session (localStorage, best effort): re-created
 * rows are hidden by attribute selector while the SPA lives, and the same keys
 * cannot reappear elsewhere — anchor keys derive from event identity, so both
 * a re-sent message and a post-reopen reload render fresh keys, which keeps
 * stale rules inert instead of hiding new content. Storage-unavailable
 * environments fall back to the in-page map: hiding still works for the whole
 * page lifetime, only the cross-reload persistence is lost.
 * @module @linxin666/dsh-recall/client/cleanup
 */

const HIDDEN_PREFIX = 'dsh-recall.hidden.'
/** Cap on persisted key sets, trimming the least recently written sessions. */
const MAX_PERSISTED_SESSIONS = 20

/** The shell marks operator-typed messages (mid-stream steering included) so. */
const USER_ROW_SELECTOR = '[data-chat-flow-kind="user"], [data-chat-flow-kind="steering"]'
const TURN_ATTR = 'data-chat-turn'
const KEY_ATTR = 'data-chat-anchor-key'
const FALLBACK_KEY_ATTR = 'data-chat-flow-key'

/** The live per-session key sets (insertion order = recency). */
const hiddenBySession = new Map<string, Set<string>>()
let hydrated = false

/** Best-effort Storage access (null when the environment provides none). */
function storage(): Storage | null {
  try {
    const store = window.localStorage
    return store ?? null
  } catch {
    return null
  }
}

/** Hydrate the live map from persisted key sets (once per page). */
function hydrate(): void {
  if (hydrated) return
  hydrated = true
  const store = storage()
  if (store === null) return
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i)
    if (key === null || !key.startsWith(HIDDEN_PREFIX)) continue
    try {
      const sessionId = key.slice(HIDDEN_PREFIX.length)
      if (hiddenBySession.has(sessionId)) continue
      const parsed: unknown = JSON.parse(store.getItem(key) ?? '[]')
      if (Array.isArray(parsed)) hiddenBySession.set(sessionId, new Set(parsed.filter((k): k is string => typeof k === 'string')))
    } catch {
      // One malformed entry never blocks the other sessions' hydration.
      continue
    }
  }
}

/** Persist one session's hidden keys, trimming the oldest persisted sessions past the cap. */
function persist(sessionId: string, keys: Set<string>): void {
  const store = storage()
  if (store === null) return
  try {
    // delete + set refreshes recency: localStorage key order is insertion order.
    store.removeItem(HIDDEN_PREFIX + sessionId)
    // The cap trims PERSISTED sets only: the live map (and with it the page
    // stylesheet, which refreshStyle rebuilds from the map) keeps every hidden
    // set until the page dies, so an eviction can never drop rules that
    // re-render resurrection still depends on.
    for (let i = hiddenBySession.size; i > MAX_PERSISTED_SESSIONS; i--) {
      const stale = hiddenBySession.keys().next().value
      if (stale === undefined) break
      store.removeItem(HIDDEN_PREFIX + stale)
    }
    store.setItem(HIDDEN_PREFIX + sessionId, JSON.stringify([...keys]))
  } catch {
    // Storage full or blocked: the in-page rules still apply.
  }
}

/** Register one session's hidden keys in the live map. */
function remember(sessionId: string, added: Iterable<string>): void {
  hydrate()
  const set = hiddenBySession.get(sessionId) ?? new Set<string>()
  for (const key of added) set.add(key)
  hiddenBySession.delete(sessionId) // refresh recency in the live map too
  hiddenBySession.set(sessionId, set)
  persist(sessionId, set)
}

/** A row's turn number, or null when absent or not a safe integer. */
function turnValue(row: Element): number | null {
  const value = Number(row.getAttribute(TURN_ATTR))
  return Number.isSafeInteger(value) ? value : null
}

/** A row's identity key, or null when the shell rendered it bare. */
function rowKey(row: Element): string | null {
  return row.getAttribute(KEY_ATTR) ?? row.getAttribute(FALLBACK_KEY_ATTR) ?? null
}

/** Escape a key for a double-quoted CSS attribute selector. */
function cssEscape(value: string): string {
  return value.replace(/[\\"]/g, (ch) => '\\' + ch)
}

/** The page-level stylesheet that keeps re-created rows hidden (or null). */
function hiddenStyle(): HTMLStyleElement | null {
  if (typeof document === 'undefined') return null
  let style = document.querySelector<HTMLStyleElement>('style[data-dsh-recall-hidden]')
  if (style === null && document.head !== null) {
    style = document.createElement('style')
    style.setAttribute('data-dsh-recall-hidden', '')
    document.head.appendChild(style)
  }
  return style
}

/** Rebuild the stylesheet from every session's hidden keys. */
function refreshStyle(): void {
  const style = hiddenStyle()
  if (style === null) return
  const rules: string[] = []
  for (const keys of hiddenBySession.values()) {
    for (const key of keys) rules.push(`[${KEY_ATTR}="${cssEscape(key)}"]{display:none!important}`)
  }
  style.textContent = rules.join('\n')
}

/**
 * Remove the recalled latest turn's rows from the open conversation flow and
 * remember their identity keys so re-created rows stay hidden. No-op when no
 * conversation is open or no operator message anchors the flow (the disk
 * rollback's outcome is unaffected either way).
 * @param sessionId - the session whose recall just succeeded on disk.
 */
export function hideRecalledTail(sessionId: string): void {
  const flow = recallFlow()
  if (flow === null) return
  const rows = [...flow.querySelectorAll(`[${TURN_ATTR}]`)]
  const userRows = rows.filter((row) => row.matches(USER_ROW_SELECTOR))
  const anchor = userRows.length > 0 ? userRows[userRows.length - 1] : null
  if (anchor === null) return
  const turn = turnValue(anchor)
  if (turn === null) return
  const doomed = rows.filter((row) => {
    const value = turnValue(row)
    return value !== null && value >= turn
  })
  if (doomed.length === 0) return
  const keys = new Set<string>()
  for (const row of doomed) {
    const key = rowKey(row)
    if (key !== null) keys.add(key)
  }
  for (const row of doomed) row.remove()
  if (keys.size > 0) {
    remember(sessionId, keys)
    refreshStyle()
  }
}

/**
 * Drop the plugin's page-level hidden stylesheet (plugin disposal): the
 * persisted key sets survive a reload so re-created rows stay hidden there.
 * @returns disposer removing the stylesheet.
 */
export function recallCleanupDisposer(): () => void {
  return () => { document.querySelector('style[data-dsh-recall-hidden]')?.remove() }
}

/** Locate the open conversation's message flow (null outside a chat view). */
function recallFlow(): HTMLElement | null {
  const pane = document.querySelector<HTMLElement>('[data-pane="conversation"]')
  return pane?.querySelector<HTMLElement>('[data-chat-flow]') ?? null
}
