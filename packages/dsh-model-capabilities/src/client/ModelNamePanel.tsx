/**
 * Models-page provider-card extension area: per-model display-name editing.
 *
 * Renders, for one pi-ai provider route, the model rows of its catalog with
 * an inline display-name editor. Model ids stay read-only (they are the wire
 * identity); the display name is what the pickers show, and the edit writes
 * back through the official settings wire as one whole-array path op with
 * revision fencing — the same write granularity and conflict posture the
 * official card uses. Every other model field (input modalities, context
 * window, reasoning-effort declarations, ...) rides along untouched.
 *
 * This is the successor of the former reasoning-effort editor: model
 * abilities need no per-user editing, but a display-name edit belongs on the
 * card. Save is a single path op replacing the provider's whole `models`
 * array.
 * @module @linxin666/dsh-client-ui-model-capabilities/client/ModelNamePanel
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { ProviderCardExtrasOwnerProps } from '@deepseek-ai/dsh-client-ui-settings-models/client'
import type { RemoteFailure } from '@deepseek-ai/dsh-typert-protocol'
import type { SettingsNamespaceView } from '@deepseek-ai/dsh-settings/types'
import {
  buildModelsOp,
  modelsArrayOf,
  readAt,
  sanitizeEntry,
  type ModelEntryDraft,
} from '../core/capabilities.ts'
import type { SettingsNamespaceFace } from './settings-face.ts'
import { t } from './locales.ts'
import css from './capabilities.module.css'

export type { SettingsNamespaceFace } from './settings-face.ts'
import type { RefreshBus } from './settings-face.ts'

/** Component props: the slot's owner share plus the injected faces. */
export interface ModelNamePanelProps extends ProviderCardExtrasOwnerProps {
  /** The generated remote settings namespace (extracted by the apply body, which declares the dotted inject). */
  settings: SettingsNamespaceFace
  /** Cross-surface refresh bus; absent keeps the editor functional (no auto-refresh). */
  refresh?: RefreshBus
}

/** One parsed snapshot the panel renders from. */
interface Snapshot {
  /** Effective entries: the user layer's array when it owns one, else the resolved one. */
  entries: ModelEntryDraft[]
  /** Namespace revision the snapshot was read at (the write's fence). */
  revision: number
  /** Whether the settings provider accepts writes. */
  writable: boolean
}

type Phase = { kind: 'loading' } | { kind: 'error', message: string } | { kind: 'ready' }

type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'conflict' }
  | { kind: 'failed', message: string }

/** Extract a display text from a remote failure (the host diagnostic, or its code). */
function failureText(error: RemoteFailure): string {
  return typeof error.message === 'string' && error.message.length > 0 ? error.message : error.code
}

/**
 * Render the inline model-name editor for one provider card.
 * @param props - the card's directory row and the injected faces.
 * @returns the extension area.
 */
export function ModelNamePanel(props: ModelNamePanelProps) {
  const { provider, settings, refresh } = props
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  const [snapshot, setSnapshot] = useState<Snapshot | undefined>(undefined)
  const [draft, setDraft] = useState<ModelEntryDraft[] | null>(null)
  const [save, setSave] = useState<SaveState>({ kind: 'idle' })
  /** Revision the open draft was read from (the write's fence while it is open). */
  const draftBasis = useRef<number | undefined>(undefined)

  const modelsPath = useMemo(() => [...provider.settingsPath, 'models'], [provider.settingsPath])
  const entries = draft ?? snapshot?.entries ?? []

  const load = useCallback(async (face: SettingsNamespaceFace) => {
    setPhase({ kind: 'loading' })
    try {
      const described = await face.describe()
      if (!described.ok) throw new Error(failureText(described.error))
      const namespaces = described.value.namespaces
      const view = namespaces.find(candidate => candidate.ns === provider.settingsNs)
      if (view === undefined) {
        throw new Error(`settings entry "${provider.settingsNs}" is not served on this host`)
      }
      const userModels = modelsArrayOf(readAt(view.user, modelsPath))
      const effective = userModels ?? modelsArrayOf(readAt(view.value, modelsPath)) ?? []
      // An open draft keeps its own basis revision: a background refresh must
      // neither drop unsaved edits nor let them ride a newer revision.
      const basis = draftBasis.current
      setSnapshot({
        entries: effective,
        revision: basis ?? view.revision,
        writable: described.value.writable,
      })
      if (basis === undefined) setDraft(null)
      setPhase({ kind: 'ready' })
    } catch (error) {
      setPhase({ kind: 'error', message: error instanceof Error ? error.message : String(error) })
    }
  }, [modelsPath, provider.settingsNs])

  useEffect(() => {
    void load(settings)
  }, [load, settings])

  useEffect(() => {
    return refresh?.subscribe(() => { void load(settings) })
  }, [load, refresh, settings])

  const editing = phase.kind === 'ready' && snapshot !== undefined
  const readOnly = editing && !snapshot.writable
  const dirty = draft !== null

  const setName = (index: number, name: string) => {
    if (!editing || readOnly) return
    if (draft === null) draftBasis.current = snapshot.revision
    setDraft(current => {
      const base = current ?? snapshot.entries.map(entry => JSON.parse(JSON.stringify(sanitizeEntry(entry))) as ModelEntryDraft)
      const clone = base.map(entry => ({ ...entry }))
      clone[index] = { ...clone[index], name: name.length > 0 ? name : undefined }
      return clone
    })
    setSave({ kind: 'idle' })
  }

  const discard = () => {
    draftBasis.current = undefined
    setDraft(null)
    setSave({ kind: 'idle' })
  }

  const doSave = async () => {
    if (!editing || readOnly || draft === null || snapshot === undefined) return
    const op = buildModelsOp(provider.settingsPath, draft)
    setSave({ kind: 'saving' })
    try {
      const written = await settings.mutate(provider.settingsNs, [op], snapshot.revision)
      if (written.ok) {
        const userModels = modelsArrayOf(readAt(written.value.user, modelsPath)) ?? []
        setSnapshot(current => current === undefined ? current : {
          ...current,
          entries: userModels,
          revision: written.value.revision,
        })
        draftBasis.current = undefined
        setDraft(null)
        setSave({ kind: 'saved' })
        return
      }
      if (written.error.code === 'settings/conflict') {
        // The document moved under the draft: reload to the stored state and
        // let the user re-apply, exactly the posture the official card takes.
        draftBasis.current = undefined
        setDraft(null)
        setSave({ kind: 'conflict' })
        await load(settings)
        return
      }
      setSave({ kind: 'failed', message: failureText(written.error) })
    } catch (error) {
      setSave({ kind: 'failed', message: error instanceof Error ? error.message : String(error) })
    }
  }

  return (
    <section className={css.namePanel} data-dsh-plugin="model-capabilities" data-dsh-part="name-panel">
      <p className={css.nameHint}>{t('name.hint')}</p>
      {phase.kind === 'loading' ? <p className={css.status} role="status">{t('name.loading')}</p> : null}
      {phase.kind === 'error'
        ? (
            <div className={css.statusRow}>
              <p className={css.failed} role="alert">{t('name.loadFailed', { error: phase.message })}</p>
              <button type="button" className={css.ghost} data-dsh-part="reload" onClick={() => { void load(settings) }}>
                {t('name.reload')}
              </button>
            </div>
          )
        : null}
      {phase.kind === 'ready' && snapshot !== undefined
        ? (
            <>
              {readOnly ? <p className={css.readOnly} role="status">{t('name.readOnly')}</p> : null}
              {snapshot.entries.length === 0
                ? <p className={css.status} role="status">{t('name.empty')}</p>
                : (
                    <ul className={css.nameRows}>
                      {entries.map((entry, index) => (
                        <li key={typeof entry.id === 'string' ? entry.id : index} className={css.nameRow} data-dsh-part="name-row">
                          <code className={css.nameId}>{entry.id}</code>
                          <input
                            className={css.nameInput}
                            type="text"
                            value={typeof entry.name === 'string' ? entry.name : ''}
                            placeholder={t('name.placeholder')}
                            aria-label={`${t('name.label')}: ${entry.id}`}
                            disabled={readOnly}
                            onChange={event => { setName(index, event.target.value) }}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
              <div className={css.footer}>
                {save.kind === 'saved' ? <p className={css.status} role="status">{t('name.saved')}</p> : null}
                {save.kind === 'conflict' ? <p className={css.failed} role="alert">{t('name.conflict')}</p> : null}
                {save.kind === 'failed' ? <p className={css.failed} role="alert">{t('name.failed', { error: save.message })}</p> : null}
                <span className={css.spacer} />
                <button
                  type="button"
                  className={css.ghost}
                  data-dsh-part="discard"
                  disabled={!dirty || save.kind === 'saving'}
                  onClick={discard}
                >
                  {t('name.discard')}
                </button>
                <button
                  type="button"
                  className={css.primary}
                  data-dsh-part="save"
                  disabled={!dirty || readOnly || save.kind === 'saving'}
                  onClick={() => { void doSave() }}
                >
                  {save.kind === 'saving' ? t('name.saving') : t('name.save')}
                </button>
              </div>
            </>
          )
        : null}
    </section>
  )
}