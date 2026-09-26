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

/** Compact token count: 12345 -> 12.3k, 1234567 -> 1.23M. */
export function formatTokens(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0'
  if (value < 1000) return String(value)
  if (value < 1_000_000) return trim(value / 1000) + 'k'
  if (value < 1_000_000_000) return trim(value / 1_000_000) + 'M'
  return trim(value / 1_000_000_000) + 'B'
}

function trim(value: number): string {
  return value >= 100 ? String(Math.round(value)) : value.toFixed(value >= 10 ? 1 : 2).replace(/\.?0+$/, '')
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
  return `${Number(parts[1])}月${Number(parts[2])}日` // i18n-allow: usage dashboard labels (zh on purpose)
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
        deepseekVisible={deepseekVisible}
        deepseekPeak={deepseekPeriod.peak}
        deepseekBoundary={formatClock(deepseekPeriod.boundaryMs)}
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
  deepseekVisible: boolean
  deepseekPeak: boolean
  deepseekBoundary: string
  pollIntervalSec: number
  onRefresh: () => void
  refreshing: boolean
}): ReactNode {
  const { snapshot, scope, onScopeChange, currentProvider, currentModel, deepseekVisible, deepseekPeak, deepseekBoundary, pollIntervalSec, onRefresh, refreshing } = props
  const retained: UsageWindowSummary | undefined = snapshot.usage.all ?? snapshot.usage.range
  const totals = retained?.totals ?? snapshot.usage.today.totals
  const peak = peakDay(snapshot.usage.days)
  const streak = dayStreaks(snapshot.usage.days)
  const cachePercent = cacheHitPercent(totals)
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

  return (
    <div className={styles.usageDashboard}>
      <div className={styles.kpiStrip} data-dsh-part="usage-summary">
        <MetricCard value={formatTokens(totalOf(totals))} label="累计 Token 数" />{/* i18n-allow: usage dashboard labels (zh on purpose) */}
        <MetricCard value={formatTokens(peak.tokens)} label="峰值 Token 数" />{/* i18n-allow: usage dashboard labels (zh on purpose) */}
        <MetricCard value={formatTokens(totals.calls)} label="总请求数" />{/* i18n-allow: usage dashboard labels (zh on purpose) */}
        <MetricCard value={`${streak.current} 天`} label="当前连续天数" />{/* i18n-allow: usage dashboard labels (zh on purpose) */}
        <MetricCard value={`${streak.longest} 天`} label="最长连续天数" />{/* i18n-allow: usage dashboard labels (zh on purpose) */}
      </div>

      <div className={styles.scopeBar} data-dsh-part="scope-bar">
        <div className={styles.scopeSeg} role="group" aria-label="统计维度">{/* i18n-allow: usage dashboard labels (zh on purpose) */}
          <button type="button" className={scope.kind === 'day' ? `${styles.scopeSegBtn} ${styles.scopeSegBtnActive}` : styles.scopeSegBtn} onClick={() => onScopeChange('day', today)}>
            每日{/* i18n-allow: usage dashboard labels (zh on purpose) */}
          </button>
          <button type="button" className={scope.kind === 'month' ? `${styles.scopeSegBtn} ${styles.scopeSegBtnActive}` : styles.scopeSegBtn} onClick={() => onScopeChange('month', scope.kind === 'day' ? scope.key.slice(0, 7) : scope.key)}>
            每月{/* i18n-allow: usage dashboard labels (zh on purpose) */}
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
              aria-label="选择日期" // i18n-allow: usage dashboard labels (zh on purpose)
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
              aria-label="选择月份" // i18n-allow: usage dashboard labels (zh on purpose)
              onChange={(event) => { if (event.target.value !== '') onScopeChange('month', event.target.value) }}
            />
          )}
      </div>

      <section className={`${styles.card} ${styles.activityCard}`} data-dsh-part="activity-card">
        <div className={styles.dashboardCardHead}>
          <span className={styles.dashboardTitle}><span className={styles.dotBlue} />Token 活动</span>{/* i18n-allow: usage dashboard labels (zh on purpose) */}
          <span className={styles.rangePill}>{scope.kind === 'day' ? dayLabel(selected.key) : selected.key}</span>
        </div>
        <ActivityHeatmap scope={selected} />
      </section>

      <section className={`${styles.card} ${styles.detailCard}`} data-dsh-part="detail-card">
        <div className={styles.dashboardCardHead}>
          <span className={styles.dashboardTitle}><span className={styles.dotGreen} />用量明细</span>{/* i18n-allow: usage dashboard labels (zh on purpose) */}
          <span className={styles.detailToolbar}>
            <span className={styles.rangePill}>{scope.kind === 'day' ? '按日' : '按月'} · {selected.key}</span>{/* i18n-allow: usage dashboard labels (zh on purpose) */}
            <span className={styles.autoRefreshPill}>{Math.max(10, Math.round(pollIntervalSec))}s 自动刷新</span>{/* i18n-allow: usage dashboard labels (zh on purpose) */}
          </span>
        </div>

        <div className={styles.detailStats}>
          <DetailStat value={formatTokens(totalOf(selected.totals))} label="真实消耗 Tokens" hint="输入 + 输出 + 缓存" />{/* i18n-allow: usage dashboard labels (zh on purpose) */}
          <DetailStat value={formatTokens(selected.totals.calls)} label="总请求数" hint="所有模型调用" />{/* i18n-allow: usage dashboard labels (zh on purpose) */}
          <DetailStat value={formatPercent(cacheHitPercent(selected.totals))} label="缓存命中" hint="cache read token" />{/* i18n-allow: usage dashboard labels (zh on purpose) */}
          <DetailStat value={formatTokens(selected.totals.reasoningTokens)} label="推理 Tokens" hint="reasoning tokens" />{/* i18n-allow: usage dashboard labels (zh on purpose) */}
        </div>

        <div className={styles.cacheMeter}>
          <span className={styles.cacheLabel}>缓存命中率 <strong>{formatPercent(cacheHitPercent(selected.totals))}</strong></span>{/* i18n-allow: usage dashboard labels (zh on purpose) */}
          <span className={styles.cacheTrack}><span className={styles.cacheFill} style={{ width: `${Math.max(0, Math.min(100, cacheHitPercent(selected.totals)))}%` }} /></span>
        </div>

        {deepseekVisible && (
          <span className={styles.peakStatus} data-dsh-part="peak-status">
            {t(deepseekPeak ? 'usage.peak.on' : 'usage.peak.off', { time: deepseekBoundary })}
          </span>
        )}

        {scopeEmpty
          ? <span className={styles.muted}>{scope.kind === 'day' ? '该日期暂无用量记录' : '该月份暂无用量记录'}</span> // i18n-allow: usage dashboard labels (zh on purpose)
          : <ModelUsageTable rows={modelUsageRows(selected.providers, snapshot.providers, currentProvider, currentModel)} />}
      </section>

      <section className={`${styles.card} ${styles.balanceOverview}`} data-dsh-part="balance-card">
        <div className={styles.dashboardCardHead}>
          <span className={styles.dashboardTitle}>余额概览</span>{/* i18n-allow: usage dashboard labels (zh on purpose) */}
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

function MetricCard(props: { value: string; label: string }): ReactNode {
  return (
    <div className={styles.kpiCard}>
      <span className={styles.kpiValue}>{props.value}</span>
      <span className={styles.kpiLabel}>{props.label}</span>
    </div>
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
 * date. Month scope: one cell per natural-month day. Hovering a cell shows
 * its date (and hour) plus the tokens and calls it consumed.
 */
function ActivityHeatmap(props: { scope: UsageScopeView }): ReactNode {
  const { scope } = props
  const [hovered, setHovered] = useState<number | null>(null)
  const cells: HeatCell[] = scope.kind === 'day'
    ? (scope.hours ?? Array.from({ length: 24 }, () => zeroTotals())).map((totals, hour) => ({
        key: String(hour),
        label: `${String(hour).padStart(2, '0')}时`, // i18n-allow: usage dashboard labels (zh on purpose)
        tipTitle: `${dayLabel(scope.key)} ${String(hour).padStart(2, '0')}时`, // i18n-allow: usage dashboard labels (zh on purpose)
        totals,
      }))
    : (scope.days ?? []).map((day) => ({
        key: day.date,
        label: `${Number(day.date.slice(8))}日`, // i18n-allow: usage dashboard labels (zh on purpose)
        tipTitle: dayLabel(day.date),
        totals: day.totals,
      }))
  const max = Math.max(1, ...cells.map((cell) => totalOf(cell.totals)))
  return (
    <div className={styles.activityBody}>
      <div className={styles.heatmapGrid} aria-label="Token 活动热力图">{/* i18n-allow: usage dashboard labels (zh on purpose) */}
        {cells.map((cell, index) => {
          const tokens = totalOf(cell.totals)
          const level = tokens <= 0 ? 0 : Math.max(1, Math.min(5, Math.ceil((tokens / max) * 5)))
          const levelClass = level === 0 ? styles.activityCellEmpty : styles[`activityCellLevel${level}`]
          return (
            <span
              key={cell.key}
              className={`${styles.activityCell} ${levelClass}`}
              onMouseEnter={() => setHovered(index)}
              onMouseLeave={() => setHovered(null)}
            >
              {hovered === index && (
                <span className={styles.heatTip} role="tooltip">
                  <strong>{cell.tipTitle}</strong>
                  {formatTokens(tokens)} tokens · {cell.totals.calls} 次调用{/* i18n-allow: usage dashboard labels (zh on purpose) */}
                </span>
              )}
            </span>
          )
        })}
      </div>
      <span className={styles.activityAxis}>
        <span>{cells[0]?.label ?? ''}</span>
        <span>{cells[cells.length - 1]?.label ?? ''}</span>
      </span>
      {cells.every((cell) => totalOf(cell.totals) === 0) && (
        <span className={styles.muted}>
          {scope.kind === 'day' ? '本日暂无小时用量（小时数据自本版本启用起记录）' : '本月暂无用量记录'}{/* i18n-allow: usage dashboard labels (zh on purpose) */}
        </span>
      )}
    </div>
  )
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
  const rows = props.rows.slice(0, 12)
  if (rows.length === 0) return <span className={styles.muted}>{t('usage.noData')}</span>
  return (
    <div className={styles.modelTable} data-dsh-part="model-usage-list">
      {rows.map((row) => (
        <div key={row.key} className={row.current ? `${styles.modelRow} ${styles.modelRowCurrent}` : styles.modelRow}>
          <span className={styles.modelIdentity}>
            <strong>{row.model}</strong>
            <span>{row.providerName}</span>
          </span>
          <ModelCell value={formatTokens(totalOf(row.totals))} label="总 token" />{/* i18n-allow: usage dashboard labels (zh on purpose) */}
          <ModelCell value={formatTokens(row.totals.calls)} label="调用" />{/* i18n-allow: usage dashboard labels (zh on purpose) */}
          <ModelCell value={formatTokens(inputOf(row.totals))} label="输入" />{/* i18n-allow: usage dashboard labels (zh on purpose) */}
          <ModelCell value={formatTokens(row.totals.outputTokens)} label="输出" />{/* i18n-allow: usage dashboard labels (zh on purpose) */}
          <ModelCell value={formatTokens(row.totals.reasoningTokens)} label="推理" />{/* i18n-allow: usage dashboard labels (zh on purpose) */}
          <ModelCell value={row.totals.cost > 0 ? formatCost(row.totals.cost) : '—'} label="成本消耗" />{/* i18n-allow: usage dashboard labels (zh on purpose) */}
        </div>
      ))}
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

function dayStreaks(days: UsageOverviewView['usage']['days']): { current: number; longest: number } {
  const active = new Set(days.filter((day) => totalOf(day.totals) > 0).map((day) => day.date))
  let longest = 0
  let currentRun = 0
  const ordered = recentDateKeys(days[days.length - 1]?.date ?? todayKey(), Math.max(30, days.length))
  for (const key of ordered) {
    if (active.has(key)) {
      currentRun += 1
      longest = Math.max(longest, currentRun)
    } else {
      currentRun = 0
    }
  }
  let current = 0
  for (let i = ordered.length - 1; i >= 0; i -= 1) {
    if (!active.has(ordered[i])) break
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
