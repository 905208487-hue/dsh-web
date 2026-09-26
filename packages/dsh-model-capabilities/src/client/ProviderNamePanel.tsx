/**
 * Models-page provider-card extension area: inline provider display-name
 * editing.
 *
 * The official card only offers a display-name field for hand-declared
 * (user-layer) providers; providers configured in a base/profile layer get no
 * name input there, because the official editor gates that field on
 * `declared === true`. This panel puts the edit directly on the card for
 * every `llm-pi-ai` route: one "provider display name" input, saved as
 * `providers.<route>.displayName` through the official settings wire with
 * revision fencing — the same conflict posture the official card uses.
 *
 * The former per-model editors (reasoning efforts, then model display names)
 * are intentionally not offered: this extension edits the provider's own
 * identity only.
 * @module @linxin666/dsh-client-ui-model-capabilities/client/ProviderNamePanel
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ProviderCardExtrasOwnerProps } from '@deepseek-ai/dsh-client-ui-settings-models/client'
import type { RemoteFailure } from '@deepseek-ai/dsh-typert-protocol'
import { readAt } from '../core/capabilities.ts'
import type { SettingsNamespaceFace } from './settings-face.ts'
import { t } from './locales.ts'
import css from './capabilities.module.css'

export type { SettingsNamespaceFace } from './settings-face.ts'
import type { RefreshBus } from './settings-face.ts'

/** Component props: the slot's owner share plus the injected faces. */
export interface ProviderNamePanelProps extends ProviderCardExtrasOwnerProps {
  /** The generated remote settings namespace (extracted by the apply body, which declares the dotted inject). */
  settings: SettingsNamespaceFace
  /** Cross-surface refresh bus; absent keeps the editor functional (no auto-refresh). */
  refresh?: RefreshBus
}

/** One parsed snapshot the panel renders from. */
interface Snapshot {
  /** Currently effective display name (value or resolved layer). */
  displayName: string | undefined
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
 * Render the inline provider display-name editor for one provider card.
 * @param props - the card's directory row and the injected faces.
 * @returns the extension area.
 */
export function ProviderNamePanel(props: ProviderNamePanelProps) {
  const { provider, settings, refresh } = props
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  const [snapshot, setSnapshot] = useState<Snapshot | undefined>(undefined)
  const [draft, setDraft] = useState<string | undefined>(undefined)
  const [save, setSave] = useState<SaveState>({ kind: 'idle' })
  /** Revision the open draft was read from (the write's fence while it is open). */
  const draftBasis = useRef<number | undefined>(undefined)

  const profilePath = useMemo(() => [...provider.settingsPath], [provider.settingsPath])
  /** The value edited when the profile lives directly at the route node. */
  const displayNamePath = useMemo(() => [...profilePath, 'displayName'], [profilePath])

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
      const effective = readAt(view.value, displayNamePath)
      const basis = draftBasis.current
      setSnapshot({
        displayName: typeof effective === 'string' ? effective : undefined,
        revision: basis ?? view.revision,
        writable: described.value.writable,
      })
      if (basis === undefined) setDraft(undefined)
      setPhase({ kind: 'ready' })
    } catch (error) {
      setPhase({ kind: 'error', message: error instanceof Error ? error.message : String(error) })
    }
  }, [displayNamePath, provider.settingsNs])

  useEffect(() => {
    void load(settings)
  }, [load, settings])

  useEffect(() => {
    return refresh?.subscribe(() => { void load(settings) })
  }, [load, refresh, settings])

  const editing = phase.kind === 'ready' && snapshot !== undefined
  const readOnly = editing && !snapshot.writable
  const value = draft ?? snapshot?.displayName ?? ''
  const dirty = draft !== undefined

  const setName = (next: string) => {
    if (!editing || readOnly) return
    if (draft === undefined) draftBasis.current = snapshot.revision
    setDraft(next)
    setSave({ kind: 'idle' })
  }

  const discard = () => {
    draftBasis.current = undefined
    setDraft(undefined)
    setSave({ kind: 'idle' })
  }

  const doSave = async () => {
    if (!editing || readOnly || draft === undefined || snapshot === undefined) return
    setSave({ kind: 'saving' })
    try {
      // Empty name removes the field so the route falls back to its id.
      const ops = draft.length === 0
        ? [{ op: 'unset', path: displayNamePath }]
        : [{ op: 'set', path: displayNamePath, value: draft }]
      const written = await settings.mutate(provider.settingsNs, ops as never, snapshot.revision)
      if (written.ok) {
        const effective = readAt(written.value.value, displayNamePath)
        setSnapshot(current => current === undefined ? current : {
          ...current,
          displayName: typeof effective === 'string' ? effective : undefined,
          revision: written.value.revision,
        })
        draftBasis.current = undefined
        setDraft(undefined)
        setSave({ kind: 'saved' })
        return
      }
      if (written.error.code === 'settings/conflict') {
        // The document moved under the draft: reload to the stored state and
        // let the user re-apply, exactly the posture the official card takes.
        draftBasis.current = undefined
        setDraft(undefined)
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
    <section className={css.namePanel} data-dsh-plugin="model-capabilities" data-dsh-part="provider-name">
      {phase.kind === 'loading' ? <span className={css.status} role="status">{t('providerName.loading')}</span> : null}
      {phase.kind === 'error'
        ? (
            <span className={css.statusRow}>
              <span className={css.failed} role="alert">{t('providerName.loadFailed', { error: phase.message })}</span>
              <button type="button" className={css.inlineBtn} data-dsh-part="reload" onClick={() => { void load(settings) }}>
                {t('providerName.reload')}
              </button>
            </span>
          )
        : null}
      {phase.kind === 'ready' && snapshot !== undefined
        ? (
            <>
              <div className={css.nameRow} data-dsh-part="name-row">
                <span className={css.nameId}>{provider.provider}</span>
                <input
                  className={css.nameInput}
                  type="text"
                  value={value}
                  placeholder={t('providerName.placeholder')}
                  aria-label={t('providerName.label')}
                  title={t('providerName.hint')}
                  disabled={readOnly}
                  onChange={event => { setName(event.target.value) }}
                />
                {save.kind === 'saved' ? <span className={css.status} role="status">{t('providerName.saved')}</span> : null}
                {save.kind === 'conflict' ? <span className={css.failed} role="alert" title={t('providerName.conflict')}>{t('providerName.errorShort')}</span> : null}
                {save.kind === 'failed' ? <span className={css.failed} role="alert" title={t('providerName.failed', { error: save.message })}>{t('providerName.errorShort')}</span> : null}
                {dirty
                  ? (
                      <>
                        <button
                          type="button"
                          className={css.inlineBtn}
                          data-dsh-part="discard"
                          disabled={save.kind === 'saving'}
                          onClick={discard}
                          aria-label={t('providerName.discard')}
                        >
                          {t('providerName.discard')}
                        </button>
                        <button
                          type="button"
                          className={css.inlineBtn}
                          data-dsh-part="save"
                          disabled={readOnly || save.kind === 'saving'}
                          onClick={() => { void doSave() }}
                        >
                          {save.kind === 'saving' ? t('providerName.saving') : t('providerName.save')}
                        </button>
                      </>
                    )
                  : null}
              </div>
              {readOnly ? <p className={css.readOnly} role="status">{t('providerName.readOnly')}</p> : null}
            </>
          )
        : null}
    </section>
  )
}