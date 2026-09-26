/**
 * Shared core for the disabled-provider archive orchestration: settings-path
 * helpers and the path-op types the provider enable path uses.
 *
 * The official `llm-pi-ai` settings namespace carries every per-model field
 * (id, name, `models[].input`, `reasoningEfforts`) and the Models page edits
 * them itself. This plugin's per-model editors (reasoning efforts, model
 * display names) and the provider display-name line were all removed:
 * provider names and model details are edited through configuration, not the
 * GUI. What remains is the plumbing the provider enable archive shares with
 * the official settings wire.
 *
 * Write granularity note: the settings `mutate` path-op walker only descends
 * plain objects (`applyPathOp` replaces arrays it meets mid-path). The
 * provider enable path never rewrites models arrays; it only restores whole
 * provider profiles, which the path ops in provider-toggle.ts express.
 *
 * @module @linxin666/dsh-client-ui-model-capabilities/core
 */

import type { JsonValue } from '@deepseek-ai/dsh-util-values'

/** The official adapter family this plugin extends (the card slot's key). */
export const PI_AI_SETTINGS_NAMESPACE = 'llm-pi-ai'

/**
 * Read the value at a settings path. Plain-object walk only; an absent or
 * non-object link yields undefined. (Mirrors the redacted view's shape, not
 * the host's op walker: reads never need array indexing.)
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