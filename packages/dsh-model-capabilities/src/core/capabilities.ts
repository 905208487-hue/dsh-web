/**
 * Capability-declaration core: settings-path helpers shared by the
 * model-name panel and the disable/enable orchestration.
 *
 * The official `llm-pi-ai` settings namespace carries every field a custom
 * model needs — id, name, `models[].input` (request modalities) and
 * `models[].reasoningEfforts` — and the Models page edits most of it itself.
 * This plugin's model-name panel offers one thing the page does not put
 * directly on the card: an inline per-model display-name editor. The former
 * per-model reasoning-effort editor stays removed: model abilities need no
 * per-user editing.
 *
 * Write granularity note: the settings `mutate` path-op walker only descends
 * plain objects (`applyPathOp` replaces arrays it meets mid-path), so a model
 * entry can only be addressed by writing the provider's whole `models` array
 * — the same whole-array override the official card performs on its first
 * edit. The provider toggle never rewrites models arrays; it only stashes and
 * restores whole provider profiles, which the path ops in provider-toggle.ts
 * express.
 *
 * @module @linxin666/dsh-client-ui-model-capabilities/core
 */

import type { JsonValue } from '@deepseek-ai/dsh-util-values'

/** The official adapter family this plugin extends (the card slot's key). */
export const PI_AI_SETTINGS_NAMESPACE = 'llm-pi-ai'

/**
 * One model profile as the name panel drafts it. Fields this plugin does not
 * edit (input, contextWindow, maxTokens, compat, reasoningEfforts, ...) are
 * kept as-is so a save never drops what the official card or a hand edit
 * wrote.
 */
export interface ModelEntryDraft {
  /** Model id sent to the provider; the only required field. */
  id: string
  /** Optional display name (the field the name panel edits). */
  name?: string
  [field: string]: unknown
}

/**
 * Read the value at a settings path. Plain-object walk only; an absent or
 * non-object link yields undefined. (Mirrors the redacted view's shape, not
 * the host's op walker: reads never need array indexing because the whole
 * `models` array is one value.)
 */
export function readAt(section: unknown, path: readonly string[]): unknown {
  let current: unknown = section
  for (const key of path) {
    if (typeof current !== 'object' || current === null || Array.isArray(current)) return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

/**
 * Coerce a stored `models` value into drafts. Returns undefined when the value
 * is not an array; entries without a non-empty string id are skipped (the
 * adapter refuses them anyway, and dropping them here keeps the editor
 * renderable). Unknown fields are preserved by reference.
 */
export function modelsArrayOf(value: unknown): ModelEntryDraft[] | undefined {
  if (!Array.isArray(value)) return undefined
  const entries: ModelEntryDraft[] = []
  for (const item of value) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) continue
    const record = item as Record<string, unknown>
    if (typeof record['id'] !== 'string' || record['id'].length === 0) continue
    entries.push(record as ModelEntryDraft)
  }
  return entries
}

/**
 * Sanitize a draft for storage: drop keys whose value is undefined (JSON has
 * no undefined) and clone plain objects/arrays one level deep so later draft
 * edits cannot alias stored state. Unknown fields ride along untouched.
 */
export function sanitizeEntry(entry: ModelEntryDraft): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(entry)) {
    if (value === undefined) continue
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      out[key] = { ...(value as Record<string, unknown>) }
    } else if (Array.isArray(value)) {
      out[key] = [...value]
    } else {
      out[key] = value
    }
  }
  return out
}

/** One settings path op (the wire shape the remote mutate takes). */
export interface SetPathOp {
  op: 'set'
  path: string[]
  value: JsonValue
}

export interface UnsetPathOp {
  op: 'unset'
  path: string[]
}

export type PathOp = SetPathOp | UnsetPathOp

/**
 * Build the single op a save performs: replace the provider's whole `models`
 * array. The empty path suffix works on a stored section that does not carry
 * the array yet — the walker creates the intermediate objects, and every
 * other profile field keeps inheriting from its layer.
 */
export function buildModelsOp(settingsPath: readonly string[], entries: readonly ModelEntryDraft[]): SetPathOp {
  return {
    op: 'set',
    path: [...settingsPath, 'models'],
    // Entries originate from JSON-parsed stored views plus editor primitives,
    // so the sanitized output is JSON-shaped by construction.
    value: entries.map(sanitizeEntry) as JsonValue,
  }
}