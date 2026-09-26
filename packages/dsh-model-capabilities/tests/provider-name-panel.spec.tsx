/** @vitest-environment jsdom */

/**
 * The provider-card inline provider display-name editor: mounts into the
 * keyed slot contract, reads the pi-ai namespace view through the settings
 * namespace face, and saves the `displayName` field with revision fencing.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ClientRemote, RemoteResult, SettingsDescribeValue, SettingsNamespaceView } from '@deepseek-ai/dsh-api-remotes/client'
import { ProviderNamePanel } from '../src/client/ProviderNamePanel.tsx'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const PROVIDER = {
  provider: 'acme-gateway',
  displayName: 'ACME Gateway',
  settingsNs: 'llm-pi-ai',
  settingsPath: ['providers', 'acme-gateway'],
  active: true,
}

function namespaceView(overrides?: Partial<SettingsNamespaceView>): SettingsNamespaceView {
  return {
    ns: 'llm-pi-ai',
    autoGenerate: true,
    schema: {},
    value: { providers: { 'acme-gateway': { baseURL: 'https://x', models: [] } } },
    user: { providers: { 'acme-gateway': { baseURL: 'https://x', models: [] } } },
    applies: 'live',
    secrets: [],
    revision: 7,
    ...overrides,
  }
}

function describeValue(view: SettingsNamespaceView, writable = true) {
  const value: SettingsDescribeValue = { writable, hasDocument: true, namespaces: [view] }
  return value
}

interface MutateCall {
  ns: string
  ops: Array<{ op: string, path: string[], value?: unknown }>
  expectedRevision: number | undefined
}

/** The settings namespace face, instrumented with the mutate calls it received. */
function makeSettingsFace(
  view: SettingsNamespaceView,
  mutate?: (call: MutateCall) => RemoteResult<SettingsNamespaceView>,
): ClientRemote['settings'] {
  const calls: MutateCall[] = []
  const face = {
    describe: () => Promise.resolve({ ok: true, value: describeValue(view) }) as Promise<RemoteResult<SettingsDescribeValue>>,
    mutate: (ns: string, ops: never, expectedRevision: number | undefined) => {
      calls.push({ ns, ops: ops as unknown as MutateCall['ops'], expectedRevision })
      const result = mutate?.({ ns, ops: ops as unknown as MutateCall['ops'], expectedRevision })
        ?? { ok: true, value: namespaceView({ revision: 8 }) }
      return Promise.resolve(result) as Promise<RemoteResult<SettingsNamespaceView>>
    },
  }
  ;(face as { calls?: unknown }).calls = calls
  return face as unknown as ClientRemote['settings']
}

function callsOf(face: ClientRemote['settings']): MutateCall[] {
  return (face as unknown as { calls: MutateCall[] }).calls
}

describe('ProviderNamePanel', () => {
  it('renders the provider id and the current display name after describe resolves', async () => {
    const view = namespaceView({
      value: { providers: { 'acme-gateway': { displayName: 'ACME Gateway', baseURL: 'https://x', models: [] } } },
    })
    render(<ProviderNamePanel provider={PROVIDER} configured keyConfigured settings={makeSettingsFace(view)} />)
    const panel = document.querySelector('[data-dsh-plugin="model-capabilities"]')
    expect(panel).not.toBeNull()
    await waitFor(() => {
      expect(screen.getByText('acme-gateway')).toBeTruthy()
    })
    const input = screen.getByRole('textbox', { name: /供应商名称/ }) as HTMLInputElement
    expect(input.value).toBe('ACME Gateway')
  })

  it('saves a renamed provider as one displayName set op', async () => {
    const view = namespaceView()
    const face = makeSettingsFace(view)
    render(<ProviderNamePanel provider={PROVIDER} configured keyConfigured settings={face} />)
    await waitFor(() => {
      expect(screen.getByText('acme-gateway')).toBeTruthy()
    })

    const input = screen.getByRole('textbox', { name: /供应商名称/ })
    fireEvent.change(input, { target: { value: 'ACME Renamed' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => {
      expect(callsOf(face)).toHaveLength(1)
    })
    const call = callsOf(face)[0]
    expect(call.ns).toBe('llm-pi-ai')
    expect(call.expectedRevision).toBe(7)
    expect(call.ops).toHaveLength(1)
    expect(call.ops[0].op).toBe('set')
    expect(call.ops[0].path).toEqual(['providers', 'acme-gateway', 'displayName'])
    expect(call.ops[0].value).toBe('ACME Renamed')
  })

  it('clears a provider name by unsetting the displayName field', async () => {
    const view = namespaceView({
      value: { providers: { 'acme-gateway': { displayName: 'ACME Gateway', baseURL: 'https://x', models: [] } } },
      user: { providers: { 'acme-gateway': { displayName: 'ACME Gateway', baseURL: 'https://x', models: [] } } },
    })
    const face = makeSettingsFace(view)
    render(<ProviderNamePanel provider={PROVIDER} configured keyConfigured settings={face} />)
    await waitFor(() => {
      expect(screen.getByText('acme-gateway')).toBeTruthy()
    })

    const input = screen.getByRole('textbox', { name: /供应商名称/ }) as HTMLInputElement
    expect(input.value).toBe('ACME Gateway')
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => {
      expect(callsOf(face)).toHaveLength(1)
    })
    const call = callsOf(face)[0]
    expect(call.ops[0].op).toBe('unset')
    expect(call.ops[0].path).toEqual(['providers', 'acme-gateway', 'displayName'])
  })

  it('surfaces a revision conflict and reloads instead of writing over', async () => {
    const view = namespaceView()
    const conflict: RemoteResult<SettingsNamespaceView> = {
      ok: false,
      error: Object.assign(new Error('settings namespace "llm-pi-ai" changed since it was read'), { code: 'settings/conflict' }),
    } as RemoteResult<SettingsNamespaceView>
    const face = makeSettingsFace(view, () => conflict)
    render(<ProviderNamePanel provider={PROVIDER} configured keyConfigured settings={face} />)
    await waitFor(() => {
      expect(screen.getByText('acme-gateway')).toBeTruthy()
    })
    const input = screen.getByRole('textbox', { name: /供应商名称/ })
    fireEvent.change(input, { target: { value: 'Renamed' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => {
      expect(screen.getByText('未保存(悬停查看原因)')).toBeTruthy()
    })
    expect(callsOf(face)).toHaveLength(1)
  })

  it('disables editing while the settings document is read-only', async () => {
    const view = namespaceView()
    const face = {
      describe: () => Promise.resolve({ ok: true, value: describeValue(view, false) }),
      mutate: () => Promise.resolve({ ok: true, value: namespaceView() }),
    }
    render(<ProviderNamePanel provider={PROVIDER} configured keyConfigured settings={face as unknown as ClientRemote['settings']} />)
    await waitFor(() => {
      expect(screen.getByText('当前设置文档只读，无法修改。')).toBeTruthy()
    })
    const input = screen.getByRole('textbox', { name: /供应商名称/ }) as HTMLInputElement
    expect(input.disabled).toBe(true)
  })

  it('reports a namespace describe failure inline with a reload affordance', async () => {
    const face = {
      describe: () => Promise.resolve({ ok: false, error: Object.assign(new Error('host refused'), { code: 'settings/denied' }) }),
      mutate: () => Promise.resolve({ ok: true, value: namespaceView() }),
    }
    render(<ProviderNamePanel provider={PROVIDER} configured keyConfigured settings={face as unknown as ClientRemote['settings']} />)
    await waitFor(() => {
      expect(screen.getByText('读取失败：host refused')).toBeTruthy()
    })
    expect(screen.getByRole('button', { name: '重新读取' })).toBeTruthy()
  })
})