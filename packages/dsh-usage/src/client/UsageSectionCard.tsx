/**
 * The usage statistics settings section: a single-page model-usage dashboard
 * (summary KPIs, a token-activity heatmap, and per-day/per-month usage
 * details with provider balances) plus a compact settings row. Data comes
 * from the host's loopback-fenced /api/dsh-usage/overview document; the
 * dashboard's day/month scope rides the overview query, and polling runs
 * only while the section is mounted and the page is visible.
 * @module @linxin666/dsh-usage/client/UsageSectionCard
 */

import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { UsageStoreInstance } from './usage-store.ts'
import { t } from './locales.ts'
import styles from './usage.module.css'
import { isDeepSeekProviderRoute } from '../core/adapters.ts'
import { deepseekPeriodAt } from '../core/pricing.ts'
import type { ProviderSnapshotView, UsageOverviewView, UsageProviderSummary, UsageScopeView, UsageTokenTotals, UsageWindowSummary } from '../core/types.ts'

/** The settings fields this section edits (immediate-apply semantics). */
export interface UsageSettings {
  enabled?: boolean
  pollIntervalSec?: number
}

/** The registration-side face the section's slot entry injects. */
export interface UsageSectionFace {
  /** The section-local store (overview snapshot + lifecycle). */
  store: UsageStoreInstance
  /** Fetch one overview now. */
  poll: () => void
  /** Force a host probe cycle now (resolves with the fresh overview). */
  refresh: () => void
  /** Point the dashboard's day/month scope at a new key and re-poll. */
  setScope: (kind: 'day' | 'month', key: string) => void
  /** The shared configuration form this section's settings row reads and writes. */
  settings: ConfigForm<UsageSettings>
}

export interface UsageSectionProps extends UsageSectionFace {
  /** Close the settings panel (the shell owns the open state). */
  close: () => void
}

/** Poll cadence while the section is open. */
const SECTION_POLL_MS = 10_000

/** How many model rows the ranking table renders before the shown/total line. */
const MODEL_ROWS_SHOWN = 12

/**
 * Absolute heatmap bands (tokens, upper bound exclusive). Level 0 is the
 * empty cell; levels 1..5 index `activityCellLevel1..5`. Absolute bands, not
 * a share of the window's maximum: cells stay comparable across days and
 * months, and a lone busy hour can no longer paint the whole day dark.
 */
const HEAT_BANDS: readonly number[] = [10_000, 100_000, 1_000_000, 5_000_000, Number.POSITIVE_INFINITY]

/** Compact token count: 12345 -> 12.3k, 1234567 -> 1.23M. */
export function formatTokens(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0'
  if (value < 1000) return String(value)
  if (value < 1_000_000) return trim(value / 1000) + 'k'
  if (value < 1_000_000_000) return trim(value / 1_000_000) + 'M'
  return trim(value / 1_000_000_000) + 'B'
}

/**
 * A call/request count: exact with grouping below 100k (a count is what the
 * user cross-checks against the detail card, so it never wears the token
 * abbreviation), compact above it where the digits stop being readable.
 */
export function formatCount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0'
  if (value < 100_000) return value.toLocaleString()
  return formatTokens(value)
}

function trim(value: number): string {
  return value >= 100 ? String(Math.round(value)) : value.toFixed(value >= 10 ? 1 : 2).replace(/\.?0+$/, '')
}

/** The heatmap band index (1..5) one cell's token total falls into. */
function heatLevel(tokens: number): number {
  if (!Number.isFinite(tokens) || tokens <= 0) return 0
  for (let index = 0; index < HEAT_BANDS.length; index += 1) {
    if (tokens < HEAT_BANDS[index]) return index + 1
  }
  return HEAT_BANDS.length
}

function formatTime(ms: number): string {
  try {
    return new Date(ms).toLocaleTimeString()
  } catch {
    return ''
  }
}

function formatClock(ms: number): string {
  try {
    return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

/** Formatted CNY spend estimate (the only priced currency today). */
function formatCost(cost: number): string {
  return '¥' + cost.toFixed(2)
}

/** A zeroed totals bucket (scope fallback before the host answers). */
function zeroTotals(): UsageTokenTotals {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, calls: 0, cost: 0 }
}

/** `2026-09-26` -> `9月26日` (tooltip and axis labels). */
function dayLabel(key: string): string {
  const parts = key.split('-')
  return t('usage.dash.dayLabel', { m: Number(parts[1]), d: Number(parts[2]) })
}

/** `2026-09` -> `2026年9月`. */
function monthLabel(key: string): string {
  const parts = key.split('-')
  return t('usage.dash.monthLabel', { y: Number(parts[0]), m: Number(parts[1]) })
}

/** `9` -> `09时`. */
function hourLabel(hour: number): string {
  return t('usage.dash.hour', { h: String(hour).padStart(2, '0') })
}

/** Every local date key of the natural month `YYYY-MM`, ascending. */
function monthDateKeys(key: string): string[] {
  const [year, month] = key.split('-').map(Number)
  if (!Number.isFinite(year) || !Number.isFinite(month)) return []
  const days = new Date(year, month, 0).getDate()
  const keys: string[] = []
  for (let day = 1; day <= days; day += 1) keys.push(`${key}-${String(day).padStart(2, '0')}`)
  return keys
}

/** A provider row backed by a configured credential (api key, env key, or OAuth grant). */
function isConfigured(provider: ProviderSnapshotView): boolean {
  // An older wire document without the credential field renders as before.
  return provider.credential !== 'none'
}

function balanceLine(provider: ProviderSnapshotView): ReactNode {
  if (provider.balance !== undefined) {
    return <span className={styles.providerBalance}>{provider.balance.currency.toUpperCase() === 'CNY' ? '¥' : provider.balance.currency.toUpperCase() === 'USD' ? '$' : ''}{provider.balance.totalBalance}{provider.balance.currency.toUpperCase() !== 'CNY' && provider.balance.currency.toUpperCase() !== 'USD' ? ' ' + provider.balance.currency.toUpperCase() : ''}</span>
  }
  if (provider.credential === 'oauth') return <span className={styles.muted}>{t('usage.oauth')}</span>
  if (provider.credential === 'none') return <span className={styles.muted}>{t('usage.balance.noCredential')}</span>
  // balanceSupported === false is the origin gate: the adapter has a balance
  // endpoint but it belongs to another provider's account (issue #1688), so
  // the row says so instead of silently vanishing from the card.
  if (provider.balanceSupported === false) return <span className={styles.muted}>{t('usage.balance.unsupported')}</span>
  if (!provider.supported) return <span className={styles.muted}>{t('usage.balance.unsupported')}</span>
  return null
}

function ProviderRow(props: { provider: ProviderSnapshotView; current?: string }): ReactNode {
  const { provider, current } = props
  return (
    <div className={styles.providerRow} data-dsh-part="provider-row">
      <span className={styles.providerName}>
        {provider.displayName}
        {current === provider.provider && <span className={styles.currentBadge}>{t('usage.current')}</span>}
      </span>
      <span className={styles.providerTokens}>{balanceLine(provider)}</span>
    </div>
  )
}

/** The section component; the slot merges the face into these props. */
export function UsageSectionCard(props: UsageSectionProps): ReactNode {
  const { store, poll, refresh, setScope, settings } = props
  const ui = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const settingsSnapshot = settings.getSnapshot()
  const settingsValue = settingsSnapshot.value ?? {}
  const [refreshing, setRefreshing] = useState(false)
  const [scope, setScopeState] = useState<{ kind: 'day' | 'month'; key: string }>(() => ({ kind: 'day', key: todayKey() }))
  // The enable checkbox writes through the shared form, so subscribing here
  // keeps the flag below live: the form republishes the Host's accepted value,
  // and the poll starts and stops with it instead of waiting for an unrelated
  // render.
  const [, bumpSettings] = useState(0)
  useEffect(() => settings.subscribe(() => bumpSettings((count) => count + 1)), [settings])
  const enabled = settingsValue.enabled ?? true

  // Poll while mounted, enabled and visible; the overview is cheap (no probes —
  // the host's own cycle owns those) so 10 s keeps balances fresh-ish between
  // manual refreshes.
  useEffect(() => {
    // A disabled plugin deregisters its host routes, so the poll must stop with
    // it; the section re-enables by writing the flag back through the checkbox.
    if (!enabled) return undefined
    poll()
    let timer: number | undefined
    const start = (): void => {
      if (timer === undefined && document.visibilityState === 'visible') timer = window.setInterval(poll, SECTION_POLL_MS)
    }
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') {
        poll()
        start()
      } else if (timer !== undefined) {
        window.clearInterval(timer)
        timer = undefined
      }
    }
    start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      if (timer !== undefined) window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [poll, enabled])

  const snapshot = ui.snapshot

  const onRefresh = (): void => {
    setRefreshing(true)
    try {
      refresh()
    } finally {
      // The POST resolves through the next poll tick; unlock shortly either way.
      window.setTimeout(() => setRefreshing(false), 3000)
    }
  }

  const onScopeChange = (kind: 'day' | 'month', key: string): void => {
    setScopeState({ kind, key })
    setScope(kind, key)
  }

  // Disabled, failed and still-loading states keep the settings row mounted:
  // it owns the enable checkbox, so replacing the whole panel would leave the
  // user no way back from the UI.
  if (!enabled || ui.status === 'error' || snapshot === null) {
    return (
      <div className={styles.section} data-dsh-plugin="usage">
        <span className={styles.muted} data-dsh-part="status-line">
          {!enabled
            ? t('usage.disabled')
            : ui.status === 'error'
              ? t('usage.error', { error: ui.error ?? '' })
              : t('usage.loading')}
        </span>
      </div>
    )
  }

  const current = snapshot.current
  const currentProvider = snapshot.providers.find((provider) => provider.provider === current.provider)
  // Peak-period line: only when the official DeepSeek family is in play this
  // session (the current route, or spend recorded under one today).
  const deepseekPeriod = deepseekPeriodAt(Date.now())
  const deepseekVisible = (current.provider !== undefined && isDeepSeekProviderRoute(current.provider))
    || snapshot.usage.today.providers.some((row) => isDeepSeekProviderRoute(row.provider))

  return (
    <div className={styles.section} data-dsh-plugin="usage">
      <div className={styles.header} data-dsh-part="header">
        <span className={styles.currentProvider}>
          {currentProvider !== undefined
            ? `${currentProvider.displayName}${current.model !== undefined && current.model !== '' ? ' · ' + current.model : ''}`
            : t('usage.noData')}
        </span>
        <span className={styles.headerMeta}>
          {/* Pricing rule, not a detail figure: it belongs beside the live
              route and timestamp, not inside the usage-detail card. */}
          {deepseekVisible && (
            <span className={styles.peakStatus} data-dsh-part="peak-status">
              {t(deepseekPeriod.peak ? 'usage.peak.on' : 'usage.peak.off', { time: formatClock(deepseekPeriod.boundaryMs) })}
            </span>
          )}
          <span className={styles.muted}>{t('usage.updated', { time: formatTime(snapshot.updatedAt) })}</span>
          <button type="button" className={styles.refreshBtn} onClick={onRefresh} disabled={refreshing}>
            {refreshing ? t('usage.refreshing') : t('usage.refresh')}
          </button>
        </span>
      </div>

      <UsageDashboard
        snapshot={snapshot}
        scope={scope}
        onScopeChange={onScopeChange}
        currentProvider={current.provider}
        currentModel={current.model}
        pollIntervalSec={typeof settingsValue.pollIntervalSec === 'number' ? settingsValue.pollIntervalSec : 60}
        onRefresh={onRefresh}
        refreshing={refreshing}
      />
    </div>
  )
}

function UsageDashboard(props: {
  snapshot: UsageOverviewView
  scope: { kind: 'day' | 'month'; key: string }
  onScopeChange: (kind: 'day' | 'month', key: string) => void
  currentProvider?: string
  currentModel?: string
  pollIntervalSec: number
  onRefresh: () => void
  refreshing: boolean
}): ReactNode {
  const { snapshot, scope, onScopeChange, currentProvider, currentModel, pollIntervalSec, onRefresh, refreshing } = props
  const retained: UsageWindowSummary | undefined = snapshot.usage.all ?? snapshot.usage.range
  const totals = retained?.totals ?? snapshot.usage.today.totals
  // The peak day and the streak are computed from the overview's trend window
  // (host TREND_DAYS, 30), not the whole retained ledger — the KPI labels say
  // so rather than implying an all-time record.
  const peak = peakDay(snapshot.usage.days)
  const streak = dayStreaks(snapshot.usage.days, snapshot.usage.today.date)
  const configuredBalanceRows = snapshot.providers
    .filter(isConfigured)
    .filter((provider) => provider.balanceSupported === true || provider.balanceSupported === false || (provider.balanceSupported === undefined && provider.supported))

  // Only a scope document that matches the CURRENT selection renders: a poll
  // answered for the previous selection must not flash its numbers here.
  // Before the host answers (or on an older host without the scope query) the
  // day view falls back to the overview's today summary.
  const wire = snapshot.usage.scope
  const selected: UsageScopeView = wire !== undefined && wire.kind === scope.kind && wire.key === scope.key
    ? wire
    : scope.kind === 'day' && scope.key === snapshot.usage.today.date
      ? { kind: 'day', key: scope.key, totals: snapshot.usage.today.totals, providers: snapshot.usage.today.providers }
      : { kind: scope.kind, key: scope.key, totals: zeroTotals(), providers: [] }
  const scopeEmpty = totalOf(selected.totals) === 0 && selected.totals.calls === 0
  const earliestKey = snapshot.usage.all?.from ?? snapshot.usage.days[0]?.date
  const today = snapshot.usage.today.date
  // Kept-ledger window for the all-time figure. The wire carries no
  // retainDays, but it does carry the window it actually kept, which is the
  // honest thing to print and survives a non-default retention setting.
  const windowFrom = snapshot.usage.all?.from
  const windowTo = snapshot.usage.all?.to

  return (
    <div className={styles.usageDashboard}>
      <div className={styles.kpiStrip} data-dsh-part="usage-summary">
        <MetricCard
          value={formatTokens(totalOf(totals))}
          label={t('usage.dash.kpi.total')}
          hint={windowFrom !== undefined && windowTo !== undefined
            ? t('usage.dash.kpi.window', { from: dayLabel(windowFrom), to: dayLabel(windowTo) })
            : t('usage.dash.kpi.none')}
        />
        <MetricCard
          value={formatTokens(peak.tokens)}
          label={t('usage.dash.kpi.peak')}
          hint={peak.date !== '' ? dayLabel(peak.date) : t('usage.dash.kpi.none')}
          onClick={peak.date !== '' && peak.date !== scope.key
            ? () => onScopeChange('day', peak.date)
            : undefined}
          title={peak.date !== '' ? t('usage.dash.kpi.peakOpen', { date: dayLabel(peak.date) }) : undefined}
        />
        <MetricCard value={formatCount(totals.calls)} label={t('usage.dash.kpi.calls')} />
        <MetricCard value={t('usage.dash.days', { n: streak.current })} label={t('usage.dash.kpi.streak')} />
        <MetricCard value={t('usage.dash.days', { n: streak.longest })} label={t('usage.dash.kpi.streakLongest')} />
      </div>

      <div className={styles.scopeBar} data-dsh-part="scope-bar">
        <div className={styles.scopeSeg} role="group" aria-label={t('usage.dash.scope.aria')}>
          <button type="button" className={scope.kind === 'day' ? `${styles.scopeSegBtn} ${styles.scopeSegBtnActive}` : styles.scopeSegBtn} onClick={() => onScopeChange('day', today)}>
            {t('usage.dash.scope.day')}
          </button>
          <button type="button" className={scope.kind === 'month' ? `${styles.scopeSegBtn} ${styles.scopeSegBtnActive}` : styles.scopeSegBtn} onClick={() => onScopeChange('month', scope.kind === 'day' ? scope.key.slice(0, 7) : scope.key)}>
            {t('usage.dash.scope.month')}
          </button>
        </div>
        {scope.kind === 'day'
          ? (
            <input
              type="date"
              className={styles.scopeInput}
              value={scope.key}
              min={earliestKey}
              max={today}
              aria-label={t('usage.dash.scope.pickDay')}
              onChange={(event) => { if (event.target.value !== '') onScopeChange('day', event.target.value) }}
            />
          )
          : (
            <input
              type="month"
              className={styles.scopeInput}
              value={scope.key}
              min={earliestKey !== undefined ? earliestKey.slice(0, 7) : undefined}
              max={today.slice(0, 7)}
              aria-label={t('usage.dash.scope.pickMonth')}
              onChange={(event) => { if (event.target.value !== '') onScopeChange('month', event.target.value) }}
            />
          )}
      </div>

      <section className={`${styles.card} ${styles.activityCard}`} data-dsh-part="activity-card">
        <div className={styles.dashboardCardHead}>
          <span className={styles.dashboardTitle}><span className={styles.dotBlue} />{t('usage.dash.activity.title')}</span>
          <span className={styles.rangePill}>{scope.kind === 'day' ? dayLabel(selected.key) : monthLabel(selected.key)}</span>
        </div>
        <ActivityHeatmap scope={selected} />
      </section>

      <section className={`${styles.card} ${styles.detailCard}`} data-dsh-part="detail-card">
        <div className={styles.dashboardCardHead}>
          <span className={styles.dashboardTitle}><span className={styles.dotGreen} />{t('usage.dash.detail.title')}</span>
          <span className={styles.detailToolbar}>
            <span className={styles.rangePill}>
              {t('usage.dash.detail.byDay')} · {dayLabel(selected.key)}
            </span>
            <span className={styles.autoRefreshPill}>{t('usage.dash.detail.autoRefresh', { sec: Math.max(10, Math.round(pollIntervalSec)) })}</span>
          </span>
        </div>

        <div className={styles.detailStats}>
          <DetailStat value={formatTokens(totalOf(selected.totals))} label={t('usage.dash.stat.consumed')} hint={t('usage.dash.stat.consumedHint')} />
          <DetailStat value={formatCount(selected.totals.calls)} label={t('usage.dash.stat.calls')} hint={t('usage.dash.stat.callsHint')} />
          <DetailStat value={formatPercent(cacheHitPercent(selected.totals))} label={t('usage.dash.stat.cache')} hint={t('usage.dash.stat.cacheHint')} />
          <DetailStat value={formatTokens(selected.totals.reasoningTokens)} label={t('usage.dash.stat.reasoning')} hint={t('usage.dash.stat.reasoningHint')} />
        </div>

        <div className={styles.cacheMeter}>
          <span className={styles.cacheLabel}>{t('usage.dash.cache.label')} <strong>{formatPercent(cacheHitPercent(selected.totals))}</strong></span>
          <span className={styles.cacheTrack}><span className={styles.cacheFill} style={{ width: `${Math.max(0, Math.min(100, cacheHitPercent(selected.totals)))}%` }} /></span>
          <span className={styles.cacheDetail}>
            {t('usage.dash.cache.detail', { input: formatTokens(inputOf(selected.totals)), read: formatTokens(selected.totals.cacheReadTokens) })}
          </span>
        </div>

        {scopeEmpty
          ? <span className={styles.muted}>{t(scope.kind === 'day' ? 'usage.dash.detail.emptyDay' : 'usage.dash.detail.emptyMonth')}</span>
          : <ModelUsageTable rows={modelUsageRows(selected.providers, snapshot.providers, currentProvider, currentModel)} />}
      </section>

      <section className={`${styles.card} ${styles.balanceOverview}`} data-dsh-part="balance-card">
        <div className={styles.dashboardCardHead}>
          <span className={styles.dashboardTitle}>{t('usage.dash.balance.title')}</span>
        </div>
        {configuredBalanceRows.length === 0
          ? <span className={styles.muted}>{t(snapshot.providers.some(isConfigured) ? 'usage.balance.unsupported' : 'usage.balance.noneConfigured')}</span>
          : (
          <div className={styles.balanceRows}>
            {configuredBalanceRows.map((provider) => <ProviderRow key={provider.provider} provider={provider} current={currentProvider} />)}
          </div>
        )}
        {snapshot.providers.some((provider) => isConfigured(provider) && provider.error !== undefined) && (
          <span className={styles.errorLine}>
            {snapshot.providers.filter((provider) => isConfigured(provider) && provider.error !== undefined).map((provider) => `${provider.displayName}: ${t('usage.provider.error', { error: provider.error ?? '' })}`).join(t('usage.errorListSeparator'))}
          </span>
        )}
      </section>
    </div>
  )
}

function MetricCard(props: { value: string; label: string; hint?: string; onClick?: () => void; title?: string }): ReactNode {
  const body = (
    <>
      <span className={styles.kpiValue}>{props.value}</span>
      <span className={styles.kpiLabel}>{props.label}</span>
      {props.hint !== undefined && <span className={styles.kpiHint}>{props.hint}</span>}
    </>
  )
  // Only a card with a destination is a button; a decorative control that
  // does nothing on click is worse than a plain figure.
  if (props.onClick === undefined) return <div className={styles.kpiCard}>{body}</div>
  return (
    <button type="button" className={`${styles.kpiCard} ${styles.kpiCardAction}`} onClick={props.onClick} title={props.title}>
      {body}
    </button>
  )
}

function DetailStat(props: { value: string; label: string; hint: string }): ReactNode {
  return (
    <div className={styles.detailStat}>
      <span className={styles.detailStatLabel}>{props.label}</span>
      <span className={styles.detailStatValue}>{props.value}</span>
      <span className={styles.detailStatHint}>{props.hint}</span>
    </div>
  )
}

type HeatCell = { key: string; label: string; tipTitle: string; totals: UsageTokenTotals }

/**
 * The token-activity heatmap. Day scope: 24 hourly cells of the selected
 * date. Month scope: one cell per natural-month day (future days included, so
 * a month is always as wide as its calendar). Hovering a cell shows its date
 * (and hour) plus the tokens and calls it consumed; every cell carries the
 * same fact as an accessible name, so a keyboard user is not shut out of the
 * only per-hour figures on the page.
 */
function ActivityHeatmap(props: { scope: UsageScopeView }): ReactNode {
  const { scope } = props
  const [hovered, setHovered] = useState<number | null>(null)
  const cells: HeatCell[] = scope.kind === 'day'
    ? (scope.hours ?? Array.from({ length: 24 }, () => zeroTotals())).map((totals, hour) => ({
        key: String(hour),
        label: hourLabel(hour),
        tipTitle: `${dayLabel(scope.key)} ${hourLabel(hour)}`,
        totals,
      }))
    : (() => {
        // The wire sends only retained days; a month still needs its full
        // calendar so a gap does not silently renumber the axis.
        const recorded = new Map((scope.days ?? []).map((day) => [day.date, day.totals]))
        return monthDateKeys(scope.key).map((date) => ({
          key: date,
          label: t('usage.dash.dayOfMonth', { d: Number(date.slice(8)) }),
          tipTitle: dayLabel(date),
          totals: recorded.get(date) ?? zeroTotals(),
        }))
      })()
  const axisTicks = heatAxisTicks(cells.length)
  const empty = cells.every((cell) => totalOf(cell.totals) === 0)
  return (
    <div className={styles.activityBody}>
      <div className={styles.heatmapGrid} aria-label={t('usage.dash.activity.aria')}>
        {cells.map((cell, index) => {
          const tokens = totalOf(cell.totals)
          const level = heatLevel(tokens)
          const levelClass = level === 0 ? styles.activityCellEmpty : styles[`activityCellLevel${level}`]
          const tip = t('usage.dash.activity.tip', { tokens: formatTokens(tokens), calls: formatCount(cell.totals.calls) })
          return (
            <span
              key={cell.key}
              className={`${styles.activityCell} ${levelClass}`}
              tabIndex={0}
              aria-label={`${cell.tipTitle} ${tip}`}
              onMouseEnter={() => setHovered(index)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(index)}
              onBlur={() => setHovered(null)}
            >
              {hovered === index && (
                <span className={styles.heatTip} role="tooltip">
                  <strong>{cell.tipTitle}</strong>
                  {tip}
                </span>
              )}
            </span>
          )
        })}
      </div>
      <div className={styles.heatAxis} aria-hidden="true">
        {cells.map((cell, index) => (
          <span key={cell.key} className={styles.heatAxisLabel}>
            {axisTicks.has(index) ? cell.label : ''}
          </span>
        ))}
      </div>
      <div className={styles.heatLegend} role="group" aria-label={t('usage.dash.legend.aria')}>
        <span className={styles.heatLegendEnd}>{t('usage.dash.legend.less')}</span>
        <span className={styles.heatLegendStep}>
          <span className={`${styles.heatLegendSwatch} ${styles.heatSwatchEmpty}`} />
          <span>0</span>
        </span>
        {HEAT_BANDS.map((band, index) => (
          <span key={band} className={styles.heatLegendStep}>
            <span className={`${styles.heatLegendSwatch} ${styles[`heatSwatchLevel${index + 1}`]}`} />
            {/* Each band is labelled by its own lower edge: the thresholds are
                what make the shades comparable between days. */}
            <span>{index === 0 ? `<${formatTokens(band)}` : `≥${formatTokens(HEAT_BANDS[index - 1])}`}</span>
          </span>
        ))}
        <span className={styles.heatLegendEnd}>{t('usage.dash.legend.more')}</span>
      </div>
      {empty && (
        <span className={styles.muted}>
          {t(scope.kind === 'day' ? 'usage.dash.activity.emptyDay' : 'usage.dash.activity.emptyMonth')}
        </span>
      )}
    </div>
  )
}

/**
 * Indices inside a 24-cell (hourly) or 28..31-cell (daily) strip that get an
 * axis label. Sparse on purpose: 31 labels in a settings panel would collide
 * long before they helped.
 */
function heatAxisTicks(count: number): Set<number> {
  if (count === 0) return new Set()
  if (count <= 24) return new Set([0, 6, 12, 18, count - 1])
  const ticks = new Set<number>([0])
  for (let day = 5; day < count; day += 5) ticks.add(day - 1)
  ticks.add(count - 1)
  return ticks
}

type ModelUsageRow = {
  key: string
  provider: string
  providerName: string
  model: string
  totals: UsageTokenTotals
  current: boolean
}

function ModelUsageTable(props: { rows: ModelUsageRow[] }): ReactNode {
  const all = props.rows
  const rows = all.slice(0, MODEL_ROWS_SHOWN)
  if (rows.length === 0) return <span className={styles.muted}>{t('usage.noData')}</span>
  return (
    <div className={styles.modelTable} data-dsh-part="model-usage-list">
      {rows.map((row) => {
        // Only the DeepSeek official family is priced (its public price book);
        // every other provider stays unpriced rather than guessed at, and the
        // dash says which case the reader is looking at.
        const priced = row.totals.cost > 0
        return (
          <div key={row.key} className={row.current ? `${styles.modelRow} ${styles.modelRowCurrent}` : styles.modelRow}>
            <span className={styles.modelIdentity}>
              <strong>{row.model}</strong>
              <span>{row.providerName}</span>
            </span>
            <ModelCell value={formatTokens(totalOf(row.totals))} label={t('usage.dash.model.total')} />
            <ModelCell value={formatCount(row.totals.calls)} label={t('usage.dash.model.calls')} />
            <ModelCell value={formatTokens(inputOf(row.totals))} label={t('usage.dash.model.input')} />
            <ModelCell value={formatTokens(row.totals.outputTokens)} label={t('usage.dash.model.output')} />
            <ModelCell value={formatTokens(row.totals.reasoningTokens)} label={t('usage.dash.model.reasoning')} />
            <ModelCell value={priced ? formatCost(row.totals.cost) : '—'} label={t('usage.dash.model.cost')} />
          </div>
        )
      })}
      {all.length > rows.length && (
        <span className={styles.muted}>
          {t('usage.dash.model.shown', { shown: rows.length, total: all.length })}
        </span>
      )}
    </div>
  )
}

function ModelCell(props: { value: string; label: string }): ReactNode {
  return (
    <span className={styles.modelMetric}>
      <strong>{props.value}</strong>
      <span>{props.label}</span>
    </span>
  )
}

function modelUsageRows(providers: UsageProviderSummary[], snapshotProviders: ProviderSnapshotView[], currentProvider?: string, currentModel?: string): ModelUsageRow[] {
  const nameOf = (id: string): string => snapshotProviders.find((provider) => provider.provider === id)?.displayName ?? id
  const rows: ModelUsageRow[] = []
  for (const provider of providers) {
    for (const model of provider.models) {
      rows.push({
        key: `${provider.provider}:${model.model}`,
        provider: provider.provider,
        providerName: nameOf(provider.provider),
        model: model.model,
        totals: model.totals,
        current: currentProvider === provider.provider && currentModel === model.model,
      })
    }
  }
  rows.sort((a, b) => totalOf(b.totals) - totalOf(a.totals))
  return rows
}

function peakDay(days: UsageOverviewView['usage']['days']): { date: string; tokens: number } {
  let best = { date: '', tokens: 0 }
  for (const day of days) {
    const tokens = totalOf(day.totals)
    if (tokens > best.tokens) best = { date: day.date, tokens }
  }
  return best
}

/**
 * Current and longest run of usage days. The current run is anchored to
 * `todayKey`, not to the newest recorded day: reading the newest day would
 * report an unbroken streak for a ledger whose last entry was a week ago.
 * Only the latest month of days is visible in the wire document, which is why
 * the KPI labels say the window out loud.
 */
function dayStreaks(days: UsageOverviewView['usage']['days'], todayKey: string): { current: number; longest: number } {
  const active = new Set(days.filter((day) => totalOf(day.totals) > 0).map((day) => day.date))
  const fallback = days[days.length - 1]?.date ?? todayKey
  const ordered = recentDateKeys(fallback > todayKey ? fallback : todayKey, Math.max(30, days.length))
  let longest = 0
  let run = 0
  for (let index = 0; index < ordered.length; index += 1) {
    if (active.has(ordered[index])) {
      run += 1
      longest = Math.max(longest, run)
    } else {
      run = 0
    }
  }
  let current = 0
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    if (!active.has(ordered[index])) break
    current += 1
  }
  return { current, longest }
}

function recentDateKeys(endKey: string, count: number): string[] {
  const end = new Date(endKey + 'T12:00:00')
  if (!Number.isFinite(end.getTime())) return []
  const keys: string[] = []
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(end)
    date.setDate(end.getDate() - offset)
    keys.push(localDateKey(date.getTime()))
  }
  return keys
}

function localDateKey(ms: number): string {
  const date = new Date(ms)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function todayKey(): string {
  return localDateKey(Date.now())
}

function totalOf(totals: UsageTokenTotals): number {
  return totals.inputTokens + totals.cacheReadTokens + totals.cacheWriteTokens + totals.outputTokens
}

function inputOf(totals: UsageTokenTotals): number {
  return totals.inputTokens + totals.cacheReadTokens + totals.cacheWriteTokens
}

function cacheHitPercent(totals: UsageTokenTotals): number {
  const input = inputOf(totals)
  if (input <= 0) return 0
  return (totals.cacheReadTokens / input) * 100
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0%'
  return value >= 10 ? `${value.toFixed(1)}%` : `${value.toFixed(2)}%`
}
