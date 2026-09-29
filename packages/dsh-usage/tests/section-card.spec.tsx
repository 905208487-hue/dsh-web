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
    // Then the heatmap renders the whole calendar of that month — a day with
    // no ledger entry keeps its cell, so the axis cannot renumber — rather
    // than the 24 hours of the day scope, and the date input is gone
    const daysInMonth = new Date(Number(monthKey().slice(0, 4)), Number(monthKey().slice(5, 7)), 0).getDate()
    expect(document.querySelectorAll('[aria-label="Token 活动热力图"] > span')).toHaveLength(daysInMonth)
    expect(screen.queryByLabelText('选择日期')).toBeNull()
  })

  it('user sees the ranking row for the model that spent the tokens', () => {
    // Given a day scope whose only model consumed 5M tokens in 7 calls
    const snapshot = overview([])
    snapshot.usage.today = { date: todayKey(), totals: emptyTotals(), providers: [] }
    snapshot.usage.scope = {
      kind: 'day',
      key: todayKey(),
      totals: { ...emptyTotals(), inputTokens: 5_000_000, calls: 7 },
      providers: [{ provider: 'deepseek', totals: { ...emptyTotals(), inputTokens: 5_000_000, calls: 7 }, models: [{ model: 'deepseek-chat', totals: { ...emptyTotals(), inputTokens: 5_000_000, calls: 7 } }] }],
      hours: Array.from({ length: 24 }, () => ({ ...emptyTotals(), inputTokens: 5_000_000, calls: 7 })),
    }
    // When the ranking table renders that scope
    render(<UsageSectionCard {...cardProps(snapshot)} />)
    // Then the row names the model, and the call count stays an exact count
    // instead of wearing the 12.3k token abbreviation
    const list = document.querySelector('[data-dsh-part="model-usage-list"]')
    expect(list?.textContent).toContain('deepseek-chat')
    expect(list?.textContent).toContain('5M')
    expect(list?.textContent).toContain('7')
  })
})

/**
 * The activity shades are ABSOLUTE bands, not a share of the window's
 * maximum: a calm day and a busy day must not paint identically, and one busy
 * hour must not drag the rest of the day up with it.
 */
describe('UsageSectionCard heatmap bands', () => {
  it('user reads the shade of each hour from its own band', () => {
    // Given a day whose 9th hour consumed 100k tokens and 23rd hour 5M
    const snapshot = overview([])
    snapshot.usage.today = { date: todayKey(), totals: emptyTotals(), providers: [] }
    snapshot.usage.scope = {
      kind: 'day',
      key: todayKey(),
      totals: emptyTotals(),
      providers: [],
      hours: Array.from({ length: 24 }, (_, hour) => ({
        ...emptyTotals(),
        inputTokens: hour === 9 ? 100_000 : hour === 23 ? 5_000_000 : 0,
      })),
    }
    // When the heatmap paints those hours
    render(<UsageSectionCard {...cardProps(snapshot)} />)
    // Then 100k wears the level-3 shade and 5M the level-5 shade, instead of
    // both being normalised against the day's 5M maximum
    const cells = document.querySelectorAll('[aria-label="Token 活动热力图"] > span')
    expect(cells[9].className).toContain('activityCellLevel3')
    expect(cells[23].className).toContain('activityCellLevel5')
  })

  it('user sees the band legend so shades compare across days', () => {
    // Given the dashboard with no usage in the selected scope
    // When the heatmap renders
    render(<UsageSectionCard {...cardProps(overview(mixed))} />)
    // Then the legend names every band edge beside its swatch, so the shades
    // can be read as absolute usage rather than a share of one window
    const legend = screen.getByRole('group', { name: '用量图例（由少到多）' })
    expect(legend.textContent).toContain('少')
    expect(legend.textContent).toContain('<10k')
    expect(legend.textContent).toContain('≥1M')
    expect(legend.textContent).toContain('≥5M')
    expect(legend.textContent).toContain('多')
  })
})

/**
 * Every KPI states the window it covers: the retained-ledger range for the
 * all-time figure, and the trend window that the peak and streak come from.
 */
describe('UsageSectionCard summary figures', () => {
  it('user sees the retained window behind the all-time token figure', () => {
    // Given a ledger whose retained window is a known range
    const snapshot = overview([])
    snapshot.usage.all = { from: '2026-03-12', to: '2026-09-26', totals: emptyTotals(), providers: [] }
    // When the summary renders
    render(<UsageSectionCard {...cardProps(snapshot)} />)
    // Then the card names that range rather than calling itself cumulative
    const strip = document.querySelector('[data-dsh-part="usage-summary"]')
    expect(strip?.textContent).toContain('近半年 Token')
    expect(strip?.textContent).toContain('3月12日 ~ 9月26日')
  })

  it('user jumps the scope to the peak day from the peak card', () => {
    // Given a trend whose busiest day is not the selected day
    const snapshot = overview([])
    snapshot.usage.days = [
      { date: '2026-09-11', totals: { ...emptyTotals(), inputTokens: 1_000 } },
      { date: '2026-09-12', totals: { ...emptyTotals(), inputTokens: 9_000_000 } },
    ]
    const setScope = vi.fn()
    // When the user activates the peak card
    render(<UsageSectionCard {...cardProps(snapshot, { setScope })} />)
    const peakCard = screen.getByRole('button', { name: /单日峰值/ })
    // Then the card carries that date and the click moves the scope to it
    expect(peakCard.textContent).toContain('9月12日')
    fireEvent.click(peakCard)
    expect(setScope).toHaveBeenCalledWith('day', '2026-09-12')
  })

  it('user sees exact request counts where token totals abbreviate', () => {
    // Given a retained window holding 12345 requests
    const snapshot = overview([])
    snapshot.usage.all = { from: '2026-03-12', to: '2026-09-26', totals: { ...emptyTotals(), calls: 12_345 }, providers: [] }
    // When the summary renders
    render(<UsageSectionCard {...cardProps(snapshot)} />)
    // Then the request figure is the exact grouped count, never the token form
    const strip = document.querySelector('[data-dsh-part="usage-summary"]')
    expect(strip?.textContent).toContain('12,345')
    expect(strip?.textContent).not.toContain('12.3k')
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
  it('stops polling and reports the disabled state', () => {
    const poll = vi.fn()
    const live = fakeForm({ value: { enabled: false } })
    render(<UsageSectionCard {...cardProps(overview(mixed))} poll={poll} settings={live.form} />)
    expect(poll).not.toHaveBeenCalled()
    expect(screen.getByText(/插件已停用/)).toBeTruthy()
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

  it('reports the transport failure without a dashboard', () => {
    const failing = fakeStore({ snapshot: null, status: 'error', error: 'usage /api/dsh-usage/overview failed: 500' })
    render(<UsageSectionCard {...cardProps(overview(mixed))} store={failing} />)
    expect(screen.getByText(/failed: 500/)).toBeTruthy()
  })
})
