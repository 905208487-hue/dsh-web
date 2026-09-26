/**
 * Capability-declaration core: settings-path helpers shared by the
 * disable/enable orchestration.
 *
 * The official `llm-pi-ai` settings namespace carries every field a custom
 * model needs — `models[].input` (request modalities) and
 * `models[].reasoningEfforts` (selectable reasoning levels with their wire
 * spellings) — and the Models page edits `models[].input` itself. The former
 * per-model reasoning-effort editor was removed: model abilities need no
 * per-user editing, so this plugin no longer reads or writes capability
 * declarations. What remains is the plumbing the provider disable/enable
 * archive shares with the official settings wire.
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