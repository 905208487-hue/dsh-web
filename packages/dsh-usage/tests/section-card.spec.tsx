/** @vitest-environment jsdom */

/**
 * The section card's single-page dashboard: the balance card and the model
 * usage details render only configured providers (credential !== 'none'),
 * the scope bar replaces the deleted tab pages (plans and the token bank
 * were removed from the section), and the dashboard renders the daily scope
 * with its segmented control by default.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import type { ConfigForm, ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import { UsageSectionCard, type UsageSettings } from '../src/client/UsageSectionCard.tsx'
import { type UsageStoreInstance, type UsageUiState } from '../src/client/usage-store.ts'
import { emptyTotals, type ProviderSnapshotView, type UsageOverviewView } from '../src/core/types.ts'

afterEach(cleanup)

/** Mirror the component's default scope keys (same local clock). */
function todayKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function monthKey(): string {
  return todayKey().slice(0, 7)
}

/** A wire provider row with view defaults; callers override the credential. */
function provider(row: Partial<ProviderSnapshotView> & Pick<ProviderSnapshotView, 'provider'>): ProviderSnapshotView {
  return { displayName: row.provider, credential: 'none', supported: true, ...row }
}

/** A minimal overview document: no ledger usage, one current route. */
function overview(providers: ProviderSnapshotView[]): UsageOverviewView {
  return {
    updatedAt: 1_700_000_000_000,
    providers,
    current: { provider: 'deepseek', model: '', source: 'live' },
    usage: {
      today: { date: '2026-01-01', totals: emptyTotals(), providers: [] },
      days: [],
      range: { from: '2026-01-01', to: '2026-01-01', totals: emptyTotals(), providers: [] },
    },
  }
}

/** Stable-reference store fake (a fresh object per getSnapshot would loop useSyncExternalStore). */
function fakeStore(state: UsageUiState): UsageStoreInstance {
  return { subscribe: () => () => {}, getSnapshot: () => state } as unknown as UsageStoreInstance
}

const settings = fakeForm().form

/**
 * Form fake over one effective section: writes are recorded and answered by
 * the caller's policy, so a test drives the section's controls exactly the way
 * the shared form contract answers them (`true` accepted, `false` refused).
 * `publish` stands in for a Host answer that replaces the effective section.
 */
function fakeForm(policy: {
  value?: UsageSettings
  writable?: boolean
  answer?: (field: string, value: unknown) => boolean | Promise<boolean>
} = {}): { form: ConfigForm<UsageSettings>; writes: Array<[string, unknown]>; publish: (patch: UsageSettings) => void } {
  const writes: Array<[string, unknown]> = []
  let listeners: Array<() => void> = []
  const snapshot = (current: UsageSettings): ConfigFormSnapshot<UsageSettings> => ({
    status: 'ready',
    value: current,
    base: undefined,
    user: undefined,
    revision: 1,
    writable: policy.writable ?? true,
    mode: 'host',
  })
  let held = snapshot(policy.value ?? {})
  const form = {
    getSnapshot: () => held,
    subscribe: (listener: () => void) => {
      listeners.push(listener)
      return () => { listeners = listeners.filter((candidate) => candidate !== listener) }
    },
    set: (field: string, next: unknown) => {
      writes.push([field, next])
      return Promise.resolve(policy.answer?.(field, next) ?? true)
    },
    unset: () => Promise.resolve(false),
    mutate: () => Promise.resolve(false),
  }
  return {
    form: form as unknown as ConfigForm<UsageSettings>,
    writes,
    publish: (patch) => {
      held = snapshot({ ...held.value, ...patch })
      for (const listener of [...listeners]) listener()
    },
  }
}

function cardProps(snapshot: UsageOverviewView, overrides: Partial<ComponentProps<typeof UsageSectionCard>> = {}): ComponentProps<typeof UsageSectionCard> {
  return {
    store: fakeStore({ snapshot, status: 'ready', error: null }),
    poll: () => {},
    refresh: () => {},
    setScope: () => {},
    settings,
    close: () => {},
    ...overrides,
  } as unknown as ComponentProps<typeof UsageSectionCard>
}

/** One configured balance provider, one configured plan provider, two unconfigured rows. */
const mixed = [
  provider({ provider: 'deepseek', displayName: 'DeepSeek', credential: 'env', balanceSupported: true, balance: { currency: 'CNY', totalBalance: '42.00', updatedAt: 1 } }),
  provider({ provider: 'kimi-coding', displayName: 'Kimi For Coding', credential: 'api-key', planSupported: true, plan: { windows: [{ key: '5h', percent: 12.5 }], updatedAt: 1 } }),
  provider({ provider: 'zenmux', displayName: 'ZenMux', balanceSupported: true }),
  provider({ provider: 'openai-codex', displayName: 'Codex', planSupported: true, error: 'HTTP 401' }),
]

describe('UsageSectionCard configured-provider filter', () => {
  it('user sees only configured providers in the balance card', () => {
    // Given a balance-capable provider with a credential, a plan-only provider,
    // and two catalog rows without one
    // When the balance card renders
    render(<UsageSectionCard {...cardProps(overview(mixed))} />)
    // Then one row renders per configured provider (the balance-capable one and
    // the credential-bearing plan-only one), and no unconfigured route or stale
    // error line reaches the card
    expect(document.querySelectorAll('[data-dsh-part="provider-row"]')).toHaveLength(2)
    expect(screen.getByText('¥42.00').textContent).toBe('¥42.00')
    expect(screen.queryByText('ZenMux')).toBeNull()
    expect(screen.queryByText('未配置凭据')).toBeNull()
    expect(screen.queryByText(/HTTP 401/)).toBeNull()
  })

  it('user sees the none-configured empty state when no provider has a credential', () => {
    // Given a catalog in which no provider carries a credential
    const unconfigured = [
      provider({ provider: 'zenmux', displayName: 'ZenMux', balanceSupported: true }),
      provider({ provider: 'openai-codex', displayName: 'Codex', planSupported: true }),
    ]
    render(<UsageSectionCard {...cardProps(overview(unconfigured))} />)
    // When the balance card renders
    // Then the balance card reports nothing configured rather than an empty table
    expect(screen.getAllByText('没有已配置的提供方')).toHaveLength(1)
  })
})

/**
 * The single-page dashboard: no tab list at all (the plans and token-bank
 * pages were deleted), the scope bar defaults to the daily view, and the
 * heatmap renders the selected scope's buckets with hover tooltips.
 */
describe('UsageSectionCard dashboard', () => {
  it('user sees the KPI strip, the scope bar, and no tab list', () => {
    render(<UsageSectionCard {...cardProps(overview(mixed))} />)
    expect(screen.getByText('Token 活动')).toBeTruthy()
    expect(screen.getByText('用量明细')).toBeTruthy()
    expect(screen.getByRole('group', { name: '统计维度' })).toBeTruthy()
    expect(screen.queryByRole('tab')).toBeNull()
    expect(screen.queryByText('个人套餐')).toBeNull()
    expect(screen.queryByText('Token 银行')).toBeNull()
  })

  it('points the face scope at the picked month and re-polls through the face', () => {
    const setScope = vi.fn()
    render(<UsageSectionCard {...cardProps(overview(mixed), { setScope })} />)
    fireEvent.click(screen.getByRole('button', { name: '每月' }))
    expect(setScope).toHaveBeenCalledWith('month', expect.stringMatching(/^\d{4}-\d{2}$/))
  })

  it('labels 24 hour cells for the day scope and tooltips date plus consumption on hover', () => {
    // Given a scope document whose 9th hour consumed 1,000 tokens in 2 calls
    const snapshot = overview([])
    snapshot.usage.today = { date: todayKey(), totals: emptyTotals(), providers: [] }
    snapshot.usage.scope = {
      kind: 'day',
      key: todayKey(),
      totals: emptyTotals(),
      providers: [],
      hours: Array.from({ length: 24 }, (_, hour) => ({ ...emptyTotals(), inputTokens: hour === 9 ? 1_000 : 0, calls: hour === 9 ? 2 : 0 })),
    }
    render(<UsageSectionCard {...cardProps(snapshot)} />)
    // Then the heatmap renders one cell per hour of the day
    const cells = document.querySelectorAll('[aria-label="Token 活动热力图"] > span')
    expect(cells).toHaveLength(24)
    expect(screen.getByText('00时').textContent).toBe('00时')
    expect(screen.getByText('23时').textContent).toBe('23时')
    // And hovering a cell surfaces its hour with the consumption figures
    fireEvent.mouseEnter(cells[9])
    expect(screen.getByRole('tooltip').textContent).toContain('1k tokens')
    expect(screen.getByRole('tooltip').textContent).toContain('2 次调用')
  })

  it('labels one cell per natural-month day for the month scope', () => {
    // Given a month scope document holding three retained days of the picked
    // month, and the user switched the selector to that month
    const snapshot = overview([])
    snapshot.usage.scope = {
      kind: 'month',
      key: monthKey(),
      totals: emptyTotals(),
      providers: [],
      days: [1, 2, 3].map((day) => ({ date: `${monthKey()}-${String(day).padStart(2, '0')}`, totals: emptyTotals() })),
    }
    render(<UsageSectionCard {...cardProps(snapshot)} />)
    fireEvent.click(screen.getByRole('button', { name: '每月' }))
    // Then the heatmap renders one cell per day, not 24 hours
    expect(document.querySelectorAll('[aria-label="Token 活动热力图"] > span')).toHaveLength(3)
    expect(screen.queryByLabelText('选择日期')).toBeNull()
  })

  it('falls back to the overview today summary before the host answers the scope query', () => {
    // Given an older host that serves no scope document, the day view still
    // renders today's totals from the overview's today summary
    const snapshot = overview([])
    snapshot.usage.today = {
      date: todayKey(),
      totals: { ...emptyTotals(), inputTokens: 1_000, outputTokens: 500, calls: 3 },
      providers: [{ provider: 'deepseek', totals: { ...emptyTotals(), inputTokens: 1_000, calls: 1 }, models: [] }],
    }
    render(<UsageSectionCard {...cardProps(snapshot)} />)
    expect(screen.getAllByText('1.5k').length).toBeGreaterThan(0)
  })
})

/**
 * #1500: disabling the plugin deregisters the host routes, so the panel must
 * stop polling, say why, and keep the enable checkbox reachable — the earlier
 * panel-wide error return left no way back from the UI.
 */
describe('UsageSectionCard disabled and failed states', () => {
  it('stops polling and keeps the enable checkbox while the plugin is disabled', () => {
    const poll = vi.fn()
    const live = fakeForm({ value: { enabled: false } })
    render(<UsageSectionCard {...cardProps(overview(mixed))} poll={poll} settings={live.form} />)
    expect(poll).not.toHaveBeenCalled()
    expect(screen.getByText(/插件已停用/)).toBeTruthy()
    expect(screen.getByRole('checkbox')).toBeTruthy()
  })

  it('resumes polling once the Host reports the plugin enabled again', () => {
    const poll = vi.fn()
    const live = fakeForm({ value: { enabled: false } })
    render(<UsageSectionCard {...cardProps(overview(mixed))} poll={poll} settings={live.form} />)
    expect(poll).not.toHaveBeenCalled()
    act(() => { live.publish({ enabled: true }) })
    expect(poll).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(/插件已停用/)).toBeNull()
  })

  it('keeps the settings controls mounted when the overview transport fails', () => {
    const failing = fakeStore({ snapshot: null, status: 'error', error: 'usage /api/dsh-usage/overview failed: 500' })
    render(<UsageSectionCard {...cardProps(overview(mixed))} store={failing} />)
    expect(screen.getByText(/failed: 500/)).toBeTruthy()
    expect(screen.getByRole('checkbox')).toBeTruthy()
  })
})

/**
 * The shared form contract answers each write with a boolean: `false` is a
 * refusal or a skipped write (the value never reached the Host document), and a
 * dead transport rejects. Neither may read as a successful save.
 */
describe('UsageSectionCard settings writes', () => {
  it('surfaces a Host-refused write as a failed save', async () => {
    const live = fakeForm({ value: { enabled: true }, answer: () => false })
    render(<UsageSectionCard {...cardProps(overview(mixed))} settings={live.form} />)
    // The checkbox starts from the form's effective value and writes the toggle.
    fireEvent.click(screen.getByRole('checkbox'))
    expect(live.writes).toEqual([['enabled', false]])
    await waitFor(() => { expect(screen.getByText(/保存失败/)).toBeTruthy() })
  })

  it('surfaces a rejecting transport with its own message', async () => {
    const live = fakeForm({ value: { enabled: true }, answer: () => Promise.reject(new Error('settings bridge unreachable')) })
    render(<UsageSectionCard {...cardProps(overview(mixed))} settings={live.form} />)
    fireEvent.click(screen.getByRole('checkbox'))
    await waitFor(() => { expect(screen.getByText(/保存失败.*settings bridge unreachable/)).toBeTruthy() })
  })

  it('reports no failure for an accepted write', async () => {
    const live = fakeForm({ value: { enabled: true } })
    render(<UsageSectionCard {...cardProps(overview(mixed))} settings={live.form} />)
    fireEvent.click(screen.getByRole('checkbox'))
    await act(async () => { await Promise.resolve() })
    expect(live.writes).toEqual([['enabled', false]])
    expect(screen.queryByText(/保存失败/)).toBeNull()
  })

  it('writes the rounded poll interval and keeps out-of-range drafts off the wire', () => {
    const live = fakeForm()
    render(<UsageSectionCard {...cardProps(overview(mixed))} settings={live.form} />)
    const interval = screen.getByRole('spinbutton')
    fireEvent.change(interval, { target: { value: '120' } })
    expect(live.writes).toEqual([['pollIntervalSec', 120]])
    fireEvent.change(interval, { target: { value: '10' } })
    expect(live.writes).toEqual([['pollIntervalSec', 120]])
  })
})
