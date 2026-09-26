/** @vitest-environment jsdom */

/**
 * The Models-page footer archive listing: lists archived (disabled) providers
 * and enables one through the orchestration. The two-phase orchestration
 * itself is covered in provider-toggle.spec.ts.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { RemoteResult, SettingsDescribeValue, SettingsNamespaceView } from '@deepseek-ai/dsh-api-remotes/client'
import { DisabledProvidersFooter } from '../src/client/DisabledProvidersFooter.tsx'
import type { RefreshBus, SettingsNamespaceFace } from '../src/client/settings-face.ts'
import { CAPS_ENTRY_IDS } from '../src/core/provider-toggle.ts'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/** The profile entry id this deployment mounts the plugin under (the aggregate's row). */
const CAPS_ENTRY_ID = CAPS_ENTRY_IDS[1]

interface World {
  llm: SettingsNamespaceView
  caps: SettingsNamespaceView
  calls: Array<{ ns: string, ops: Array<{ op: string, path: string[] }>, revision: number | undefined }>
  describeCount: number
  failNext?: { ns: string, code: string }
}

function view(ns: string, user: unknown, revision: number, schema: unknown = {}): SettingsNamespaceView {
  // Share one object for the resolved value and raw user section (the archive
  // entry's schema is a passthrough, so production carries the same content).
  const section = user as Record<string, unknown>
  return { ns, autoGenerate: true, schema: schema as never, value: section as never, user: section as never, applies: 'live', secrets: [], revision }
}

/** Replace the raw user section (the resolved value follows: passthrough schema). */
function setUserSection(target: SettingsNamespaceView, section: unknown): void {
  const shared = section as Record<string, unknown>
  target.user = shared as never
  target.value = shared as never
}

/** Apply a path op to the user section (object paths only, mirroring the host walker). */
function applyToUser(view: SettingsNamespaceView, op: { op: string, path: string[], value?: unknown }): void {
  const user = (view.user ?? {}) as Record<string, unknown>
  let node: Record<string, unknown> = user
  const segments = op.path
  for (let index = 0; index < segments.length - 1; index++) {
    const key = segments[index]
    const child = node[key]
    if (typeof child !== 'object' || child === null || Array.isArray(child)) {
      if (op.op === 'unset') return
      const created: Record<string, unknown> = {}
      node[key] = created
      node = created
    } else {
      node = child as Record<string, unknown>
    }
  }
  const last = segments[segments.length - 1]
  if (op.op === 'set') node[last] = op.value
  else delete node[last]
  ;(view as { user?: unknown }).user = user
}

function makeFace(world: World): SettingsNamespaceFace {
  return {
    describe: () => {
      world.describeCount += 1
      return Promise.resolve({
        ok: true,
        value: { writable: true, hasDocument: true, namespaces: [world.llm, world.caps] } satisfies SettingsDescribeValue,
      }) as Promise<RemoteResult<SettingsDescribeValue>>
    },
    mutate: (ns: string, ops: never, expectedRevision: number | undefined) => {
      world.calls.push({ ns, ops: ops as unknown as Array<{ op: string, path: string[] }>, revision: expectedRevision })
      const fail = world.failNext
      if (fail !== undefined && fail.ns === ns) {
        world.failNext = undefined
        return Promise.resolve({
          ok: false,
          error: Object.assign(new Error('boom'), { code: fail.code }),
        }) as Promise<RemoteResult<SettingsNamespaceView>>
      }
      const view = ns === world.llm.ns ? world.llm : world.caps
      for (const op of world.calls[world.calls.length - 1].ops) applyToUser(view, op)
      view.revision += 1
      return Promise.resolve({ ok: true, value: view }) as Promise<RemoteResult<SettingsNamespaceView>>
    },
  }
}

function bus(): RefreshBus & { notifyCount: number } {
  let notifyCount = 0
  const listeners = new Set<() => void>()
  return {
    subscribe(callback) {
      listeners.add(callback)
      return () => { listeners.delete(callback) }
    },
    notify() {
      notifyCount += 1
      for (const listener of [...listeners]) listener()
    },
    get notifyCount() { return notifyCount },
  }
}

function baseWorld(): World {
  return {
    llm: view('llm-pi-ai', { providers: { 'acme-gateway': { models: [{ id: 'gpt-x', name: 'GPT X' }] } } }, 7),
    caps: view(CAPS_ENTRY_ID, {}, 3),
    calls: [],
    describeCount: 0,
  }
}

describe('DisabledProvidersFooter', () => {
  it('renders nothing while the archive is empty', async () => {
    const world = baseWorld()
    const { container } = render(<DisabledProvidersFooter settings={makeFace(world)} refresh={bus()} />)
    await waitFor(() => {
      expect(world.describeCount).toBe(1)
    })
    expect(container.querySelector('[data-dsh-part="disabled-footer"]')).toBeNull()
  })

  it('lists archived providers and enables one through the orchestration', async () => {
    const world = baseWorld()
    setUserSection(world.llm, { providers: {} })
    setUserSection(world.caps, {
      disabled: {
        'acme-gateway': { profile: { apiKeyEnv: 'ACME_KEY' }, displayName: 'ACME Gateway' },
        'other-gw': { profile: { apiKeyEnv: 'OTHER_KEY' } },
      },
    })
    const mirror = bus()
    render(<DisabledProvidersFooter settings={makeFace(world)} refresh={mirror} />)
    await waitFor(() => {
      expect(screen.getByText('已禁用的提供方')).toBeTruthy()
    })
    expect(screen.getByText('ACME Gateway')).toBeTruthy()
    expect(screen.getByText('other-gw')).toBeTruthy()

    const enableButtons = screen.getAllByRole('button', { name: '启用' })
    fireEvent.click(enableButtons[0])
    await waitFor(() => {
      // The row leaves the archive after the reload.
      expect(screen.queryByText('ACME Gateway')).toBeNull()
    })
    expect(world.calls[0].ns).toBe('llm-pi-ai')
    expect(world.calls[1].ns).toBe(CAPS_ENTRY_ID)
    expect(mirror.notifyCount).toBe(1)
  })

  it('reports a route that grew a new configuration between the listing and the click', async () => {
    const world = baseWorld()
    setUserSection(world.llm, { providers: {} })
    setUserSection(world.caps, { disabled: { 'acme-gateway': { profile: { apiKeyEnv: 'OLD' } } } })
    render(<DisabledProvidersFooter settings={makeFace(world)} refresh={bus()} />)
    await waitFor(() => {
      expect(screen.getByText('已禁用的提供方')).toBeTruthy()
    })
    // The route comes back after the listing read (a race, not a stale entry):
    // the enable re-reads the document and must refuse instead of clobbering.
    // A fresh view object mirrors the wire, where the listing's read cannot
    // retroactively change.
    world.llm = view('llm-pi-ai', { providers: { 'acme-gateway': { apiKeyEnv: 'NEW' } } }, 8)
    fireEvent.click(screen.getByRole('button', { name: '启用' }))
    await waitFor(() => {
      expect(screen.getByText('该提供方已存在新配置，无法恢复存档；请先移除现有配置再启用。')).toBeTruthy()
    })
    expect(world.calls).toHaveLength(0)
  })

  it('hides an archive entry whose provider is configured again', async () => {
    const world = baseWorld()
    // The archive still holds the profile, but the route is live in the user layer.
    setUserSection(world.caps, { disabled: { 'acme-gateway': { profile: { apiKeyEnv: 'OLD' } } } })
    const { container } = render(<DisabledProvidersFooter settings={makeFace(world)} refresh={bus()} />)
    await waitFor(() => {
      expect(world.describeCount).toBe(1)
    })
    expect(container.querySelector('[data-dsh-part="disabled-footer"]')).toBeNull()
  })

  it('hides an archive entry whose route is declared in the composition layer', async () => {
    const world = baseWorld()
    setUserSection(world.llm, { providers: {} })
    world.llm.base = { providers: { 'acme-gateway': { apiKeyEnv: 'BASE_KEY' } } }
    setUserSection(world.caps, { disabled: { 'acme-gateway': { profile: { apiKeyEnv: 'OLD' } } } })
    const { container } = render(<DisabledProvidersFooter settings={makeFace(world)} refresh={bus()} />)
    await waitFor(() => {
      expect(world.describeCount).toBe(1)
    })
    expect(container.querySelector('[data-dsh-part="disabled-footer"]')).toBeNull()
  })
})