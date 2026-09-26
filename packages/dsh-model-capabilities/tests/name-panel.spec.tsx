/** @vitest-environment jsdom */

/**
 * The provider-card inline model-name editor: mounts into the keyed slot
 * contract, reads the pi-ai namespace view through the settings namespace
 * face, and saves one whole-array mutate with revision fencing, preserving
 * every field the name panel does not edit.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ClientRemote, RemoteResult, SettingsDescribeValue, SettingsNamespaceView } from '@deepseek-ai/dsh-api-remotes/client'
import { ModelNamePanel } from '../src/client/ModelNamePanel.tsx'

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

/** A stored models row the official card wrote (id/name/contexts + nothing else). */
const STORED_ROW = {
  id: 'gpt-x',
  name: 'GPT X',
  contextWindow: 256000,
  maxTokens: 32000,
}

function namespaceView(overrides?: Partial<SettingsNamespaceView>): SettingsNamespaceView {
  return {
    ns: 'llm-pi-ai',
    autoGenerate: true,
    schema: {},
    value: { providers: { 'acme-gateway': { models: [STORED_ROW] } } },
    user: { providers: { 'acme-gateway': { models: [{ ...STORED_ROW }] } } },
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

describe('ModelNamePanel', () => {
  it('renders the model rows with editable name inputs after describe resolves', async () => {
    render(<ModelNamePanel provider={PROVIDER} configured keyConfigured settings={makeSettingsFace(namespaceView())} />)
    const panel = document.querySelector('[data-dsh-plugin="model-capabilities"]')
    expect(panel).not.toBeNull()
    await waitFor(() => {
      expect(screen.getByText('gpt-x')).toBeTruthy()
    })
    const input = screen.getByRole('textbox', { name: /显示名称: gpt-x/ }) as HTMLInputElement
    expect(input.value).toBe('GPT X')
  })

  it('shows the empty copy for a provider without a declared catalog', async () => {
    const view = namespaceView({
      value: {},
      user: undefined,
    })
    render(<ModelNamePanel provider={PROVIDER} configured keyConfigured settings={makeSettingsFace(view)} />)
    await waitFor(() => {
      expect(screen.getByText('此提供方还没有可编辑的模型目录。先在上方模型目录中添加模型行，再回到这里修改名称。')).toBeTruthy()
    })
  })

  it('saves a renamed model as one whole-array op, preserving every other field', async () => {
    const view = namespaceView()
    const face = makeSettingsFace(view)
    render(<ModelNamePanel provider={PROVIDER} configured keyConfigured settings={face} />)
    await waitFor(() => {
      expect(screen.getByText('gpt-x')).toBeTruthy()
    })

    const input = screen.getByRole('textbox', { name: /显示名称: gpt-x/ })
    fireEvent.change(input, { target: { value: 'GPT-X Renamed' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => {
      expect(callsOf(face)).toHaveLength(1)
    })
    const call = callsOf(face)[0]
    expect(call.ns).toBe('llm-pi-ai')
    expect(call.expectedRevision).toBe(7)
    expect(call.ops).toHaveLength(1)
    expect(call.ops[0].op).toBe('set')
    expect(call.ops[0].path).toEqual(['providers', 'acme-gateway', 'models'])
    const written = (call.ops[0].value as Array<Record<string, unknown>>)[0]
    expect(written['id']).toBe('gpt-x')
    expect(written['name']).toBe('GPT-X Renamed')
    // Fields the name panel does not edit survive the whole-array save.
    expect(written['contextWindow']).toBe(256000)
    expect(written['maxTokens']).toBe(32000)
  })

  it('clears a name by writing an entry without the name key', async () => {
    const view = namespaceView()
    const face = makeSettingsFace(view)
    render(<ModelNamePanel provider={PROVIDER} configured keyConfigured settings={face} />)
    await waitFor(() => {
      expect(screen.getByText('gpt-x')).toBeTruthy()
    })

    const input = screen.getByRole('textbox', { name: /显示名称: gpt-x/ })
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => {
      expect(callsOf(face)).toHaveLength(1)
    })
    const written = (callsOf(face)[0].ops[0].value as Array<Record<string, unknown>>)[0]
    expect(written['id']).toBe('gpt-x')
    expect('name' in written).toBe(false)
  })

  it('surfaces a revision conflict and reloads instead of writing over', async () => {
    const view = namespaceView()
    const conflict: RemoteResult<SettingsNamespaceView> = {
      ok: false,
      error: Object.assign(new Error('settings namespace "llm-pi-ai" changed since it was read'), { code: 'settings/conflict' }),
    } as RemoteResult<SettingsNamespaceView>
    const face = makeSettingsFace(view, () => conflict)
    render(<ModelNamePanel provider={PROVIDER} configured keyConfigured settings={face} />)
    await waitFor(() => {
      expect(screen.getByText('gpt-x')).toBeTruthy()
    })
    const input = screen.getByRole('textbox', { name: /显示名称: gpt-x/ })
    fireEvent.change(input, { target: { value: 'Renamed' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => {
      expect(screen.getByText('配置已被其他界面修改，已重新读取，请重试。')).toBeTruthy()
    })
    // No second write happened after the conflict; the panel reloaded instead.
    expect(callsOf(face)).toHaveLength(1)
  })

  it('disables editing while the settings document is read-only', async () => {
    const view = namespaceView()
    const face = {
      describe: () => Promise.resolve({ ok: true, value: describeValue(view, false) }),
      mutate: () => Promise.resolve({ ok: true, value: namespaceView() }),
    }
    render(<ModelNamePanel provider={PROVIDER} configured keyConfigured settings={face as unknown as ClientRemote['settings']} />)
    await waitFor(() => {
      expect(screen.getByText('当前设置文档只读，无法修改。')).toBeTruthy()
    })
    const input = screen.getByRole('textbox', { name: /显示名称: gpt-x/ }) as HTMLInputElement
    expect(input.disabled).toBe(true)
  })

  it('reports a namespace describe failure inline with a reload affordance', async () => {
    const face = {
      describe: () => Promise.resolve({ ok: false, error: Object.assign(new Error('host refused'), { code: 'settings/denied' }) }),
      mutate: () => Promise.resolve({ ok: true, value: namespaceView() }),
    }
    render(<ModelNamePanel provider={PROVIDER} configured keyConfigured settings={face as unknown as ClientRemote['settings']} />)
    await waitFor(() => {
      expect(screen.getByText('读取失败：host refused')).toBeTruthy()
    })
    expect(screen.getByRole('button', { name: '重新读取' })).toBeTruthy()
  })
})