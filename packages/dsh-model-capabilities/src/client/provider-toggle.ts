/**
 * Provider enable orchestration over the remote settings wire.
 *
 * The former card-side disable affordance was removed with the capability
 * editor; disabling happens by removing the provider profile through the
 * official Models page seam, which archives nothing. The archive this plugin
 * still owns lists providers disabled by older deployments, and enable
 * restores an archived profile verbatim and clears the archive entry. The
 * op ordering keeps the worst case a harmless duplicate archive.
 * @module @linxin666/dsh-client-ui-model-capabilities/client/provider-toggle
 */

import type { RemoteFailure } from '@deepseek-ai/dsh-typert-protocol'
import type { SettingsNamespaceView } from '@deepseek-ai/dsh-settings/types'
import {
  buildRestoreProviderOp,
  buildUnstashOp,
  hasProfileAt,
  readDisabledStore,
  resolveArchiveEntry,
} from '../core/provider-toggle.ts'
import type { SettingsNamespaceFace } from './settings-face.ts'

/** What one enable attempt ended in. */
export type ToggleOutcome =
  | { kind: 'ok' }
  /** A namespace moved past its read revision; the caller reloads and retries. */
  | { kind: 'conflict', ns: string }
  | { kind: 'refused', message: string }
  /** The route already has a profile; restoring the archive would clobber it. */
  | { kind: 'route-exists' }
  | { kind: 'no-stash' }
  /** A needed entry is not served on this host. */
  | { kind: 'unavailable' }
  /** The route is enabled again, but clearing the archive entry failed. */
  | { kind: 'partial', message: string }

function refused(error: RemoteFailure): ToggleOutcome {
  return { kind: 'refused', message: typeof error.message === 'string' && error.message.length > 0 ? error.message : error.code }
}

function failureOf(ns: string, error: RemoteFailure): ToggleOutcome {
  return error.code === 'settings/conflict' ? { kind: 'conflict', ns } : refused(error)
}

function viewOf(namespaces: readonly SettingsNamespaceView[], ns: string): SettingsNamespaceView | undefined {
  return namespaces.find(candidate => candidate.ns === ns)
}

/**
 * Bring one provider back: restore the archived profile verbatim, then clear
 * the archive entry. Refuses when the route has grown a new profile in the
 * meantime, so an enable can never clobber newer configuration.
 * @param face - the settings namespace face.
 * @param llmNs - the pi-ai namespace the provider is declared in.
 * @param route - provider route id.
 */
export async function enableProvider(
  face: SettingsNamespaceFace,
  llmNs: string,
  route: string,
): Promise<ToggleOutcome> {
  const described = await face.describe()
  if (!described.ok) return refused(described.error)
  const llmView = viewOf(described.value.namespaces, llmNs)
  const archive = resolveArchiveEntry(described.value.namespaces)
  if (llmView === undefined || archive === undefined) return { kind: 'unavailable' }
  if (hasProfileAt(llmView.user, route)) return { kind: 'route-exists' }
  const stash = readDisabledStore(archive.view.value)[route]
  if (stash === undefined) return { kind: 'no-stash' }
  const restored = await face.mutate(llmNs, [buildRestoreProviderOp(route, stash.profile)], llmView.revision)
  if (!restored.ok) return failureOf(llmNs, restored.error)
  const cleared = await face.mutate(archive.entryId, [buildUnstashOp(route)], archive.view.revision)
  if (!cleared.ok) return { kind: 'partial', message: cleared.error.message }
  return { kind: 'ok' }
}
