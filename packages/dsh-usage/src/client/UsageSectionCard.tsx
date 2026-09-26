/**
 * The usage statistics settings section: three tabs (用量: today's usage,
 * balances, trend; 个人套餐: per-provider plan quota windows; Token 银行:
 * the whale-yuan voucher minted from the DeepSeek official family's usage)
 * plus a compact settings row. Data comes from the host's loopback-fenced
 * /api/dsh-usage/overview document; polling runs only while the section is
 * mounted and the tab is visible.
 * @module @linxin666/dsh-usage/client/UsageSectionCard
 */

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { ConfigForm, ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { UsageStoreInstance } from './usage-store.ts'
import { t } from './locales.ts'
import styles from './usage.module.css'
import { isDeepSeekProviderRoute } from '../core/adapters.ts'
import { deepseekPeriodAt } from '../core/pricing.ts'
import { deepseekVoucherData, drawVoucher, faceValue, formatDay, formatDenomination, loadVoucherArt } from './voucher.ts'
import type { ObservedSpendView, ProviderSnapshotView, UsageOverviewView, UsageProviderSummary, UsageTokenTotals, UsageWindowSummary } from '../core/types.ts'

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

function toneClass(percent: number): string {
  if (percent >= 90) return styles.barLow
  if (percent >= 70) return styles.barWarn
  return styles.barFill
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
  const { store, poll, refresh, settings } = props
  const ui = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const settingsSnapshot = settings.getSnapshot()
  const settingsValue = settingsSnapshot.value ?? {}
  const [tab, setTab] = useState<'usage' | 'plans' | 'bank'>('usage')
  const [refreshing, setRefreshing] = useState(false)
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
        <SettingsRow settings={settings} snapshot={settingsSnapshot.status === 'ready' ? settingsSnapshot : undefined} value={settingsValue} />
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
  // Plans tab: only configured routes with a real coding-plan/subscription
  // adapter (planSupported; an older host without the flag falls back to "has
  // a plan fact"). Balance-only providers (DeepSeek, ZenMux, ...) and
  // unconfigured routes (credential 'none') never appear here.
  const planProviders = snapshot.providers.filter((provider) => isConfigured(provider) && (provider.planSupported === true || (provider.planSupported === undefined && provider.plan !== undefined)))

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

      <div className={styles.tabs} role="tablist" data-dsh-part="tabs">
        <button type="button" role="tab" aria-selected={tab === 'usage'} className={tab === 'usage' ? `${styles.tab} ${styles.tabActive}` : styles.tab} onClick={() => setTab('usage')}>
          {t('usage.tab.usage')}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'plans'} className={tab === 'plans' ? `${styles.tab} ${styles.tabActive}` : styles.tab} onClick={() => setTab('plans')}>
          {t('usage.tab.plans')}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'bank'} className={tab === 'bank' ? `${styles.tab} ${styles.tabActive}` : styles.tab} onClick={() => setTab('bank')}>
          {t('usage.tab.bank')}
        </button>
      </div>

      {tab === 'usage' && (
        <>
          <UsageDashboard
            snapshot={snapshot}
            currentProvider={current.provider}
            currentModel={current.model}
            deepseekVisible={deepseekVisible}
            deepseekPeak={deepseekPeriod.peak}
            deepseekBoundary={formatClock(deepseekPeriod.boundaryMs)}
            pollIntervalSec={typeof settingsValue.pollIntervalSec === 'number' ? settingsValue.pollIntervalSec : 60}
            onRefresh={onRefresh}
            refreshing={refreshing}
          />
          <SettingsRow settings={settings} snapshot={settingsSnapshot.status === 'ready' ? settingsSnapshot : undefined} value={settingsValue} />
        </>
      )}

      {tab === 'plans' && (
        planProviders.length === 0
          ? <div className={styles.card}><span className={styles.muted}>{t('usage.plan.noneConfigured')}</span></div>
          : planProviders.map((provider) => <PlanCard key={provider.provider} provider={provider} current={current.provider} />)
      )}

      {tab === 'bank' && <VoucherCard window={snapshot.usage.all ?? snapshot.usage.range} observedSpend={snapshot.usage.observedSpend} />}
    </div>
  )
}

function UsageDashboard(props: {
  snapshot: UsageOverviewView
  currentProvider?: string
  currentModel?: string
  deepseekVisible: boolean
  deepseekPeak: boolean
  deepseekBoundary: string
  pollIntervalSec: number
  onRefresh: () => void
  refreshing: boolean
}): ReactNode {
  const { snapshot, currentProvider, currentModel, deepseekVisible, deepseekPeak, deepseekBoundary, pollIntervalSec, onRefresh, refreshing } = props
  const retained = snapshot.usage.all ?? snapshot.usage.range
  const totals = retained?.totals ?? snapshot.usage.today.totals
  const peak = peakDay(snapshot.usage.days)
  const streak = dayStreaks(snapshot.usage.days)
  const cachePercent = cacheHitPercent(totals)
  const modelRows = modelUsageRows(retained, snapshot.providers, currentProvider, currentModel)
  const configuredBalanceRows = snapshot.providers
    .filter(isConfigured)
    .filter((provider) => provider.balanceSupported === true || provider.balanceSupported === false || (provider.balanceSupported === undefined && provider.supported))

  return (
    <div className={styles.usageDashboard}>
      <div className={styles.kpiStrip} data-dsh-part="usage-summary">
        <MetricCard value={formatTokens(totalOf(totals))} label="累计 Token 数" />
        <MetricCard value={formatTokens(peak.tokens)} label="峰值 Token 数" />
        <MetricCard value={formatTokens(totals.calls)} label="总请求数" />
        <MetricCard value={`${streak.current} 天`} label="当前连续天数" />
        <MetricCard value={`${streak.longest} 天`} label="最长连续天数" />
      </div>

      <section className={`${styles.card} ${styles.activityCard}`} data-dsh-part="activity-card">
        <div className={styles.dashboardCardHead}>
          <span className={styles.dashboardTitle}><span className={styles.dotBlue} />Token 活动</span>
          <span className={styles.rangePill}>近 30 天</span>
        </div>
        <ActivityHeatmap days={snapshot.usage.days} />
      </section>

      <section className={`${styles.card} ${styles.detailCard}`} data-dsh-part="detail-card">
        <div className={styles.dashboardCardHead}>
          <span className={styles.dashboardTitle}><span className={styles.dotGreen} />用量明细</span>
          <span className={styles.detailToolbar}>
            <span className={styles.rangePill}>全部模型</span>
            <button type="button" className={styles.refreshBtn} onClick={onRefresh} disabled={refreshing}>↻ {refreshing ? t('usage.refreshing') : t('usage.refresh')}</button>
            <span className={styles.autoRefreshPill}>{Math.max(10, Math.round(pollIntervalSec))}s 自动刷新</span>
          </span>
        </div>

        <div className={styles.detailStats}>
          <DetailStat value={formatTokens(totalOf(totals))} label="真实消耗 Tokens" hint="输入 + 输出 + 缓存" />
          <DetailStat value={formatTokens(totals.calls)} label="总请求数" hint="所有模型调用" />
          <DetailStat value={totals.cost > 0 ? formatCost(totals.cost) : '未计费'} label="总成本(估算)" hint="按公开单价估算" />
          <DetailStat value={`${formatPercent(cachePercent)}`} label="缓存命中" hint="cache read token" />
          <DetailStat value={formatTokens(totals.reasoningTokens)} label="推理 Tokens" hint="reasoning tokens" />
        </div>

        <div className={styles.cacheMeter}>
          <span className={styles.cacheLabel}>缓存命中率 <strong>{formatPercent(cachePercent)}</strong></span>
          <span className={styles.cacheTrack}><span className={styles.cacheFill} style={{ width: `${Math.max(0, Math.min(100, cachePercent))}%` }} /></span>
        </div>

        {deepseekVisible && (
          <span className={styles.peakStatus} data-dsh-part="peak-status">
            {t(deepseekPeak ? 'usage.peak.on' : 'usage.peak.off', { time: deepseekBoundary })}
          </span>
        )}

        <ModelUsageTable rows={modelRows} />
      </section>

      {configuredBalanceRows.length > 0 && (
        <section className={`${styles.card} ${styles.balanceOverview}`} data-dsh-part="balance-card">
          <div className={styles.dashboardCardHead}>
            <span className={styles.dashboardTitle}>余额概览</span>
          </div>
          <div className={styles.balanceRows}>
            {configuredBalanceRows.map((provider) => <ProviderRow key={provider.provider} provider={provider} current={currentProvider} />)}
          </div>
          {snapshot.providers.some((provider) => isConfigured(provider) && provider.error !== undefined) && (
            <span className={styles.errorLine}>
              {snapshot.providers.filter((provider) => isConfigured(provider) && provider.error !== undefined).map((provider) => `${provider.displayName}: ${t('usage.provider.error', { error: provider.error ?? '' })}`).join(t('usage.errorListSeparator'))}
            </span>
          )}
        </section>
      )}
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

function ActivityHeatmap(props: { days: UsageOverviewView['usage']['days'] }): ReactNode {
  const cells = heatmapCells(props.days)
  const max = Math.max(1, ...cells.map((cell) => cell.tokens))
  const first = cells[0]?.date.slice(5) ?? ''
  const last = cells[cells.length - 1]?.date.slice(5) ?? ''
  return (
    <div className={styles.activityBody}>
      <div className={styles.heatmapGrid} aria-label="Token 活动热力图">
        {cells.map((cell) => {
          const level = cell.tokens <= 0 ? 0 : Math.max(1, Math.min(5, Math.ceil((cell.tokens / max) * 5)))
          const levelClass = level === 0 ? styles.activityCellEmpty : styles[`activityCellLevel${level}`]
          return <span key={cell.date} className={`${styles.activityCell} ${levelClass}`} title={`${cell.date} 使用了 ${formatTokens(cell.tokens)} 个 Token`} />
        })}
      </div>
      <span className={styles.activityAxis}><span>{first}</span><span>{last}</span></span>
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
          <ModelCell value={formatTokens(totalOf(row.totals))} label="总 token" />
          <ModelCell value={formatTokens(row.totals.calls)} label="调用" />
          <ModelCell value={formatTokens(inputOf(row.totals))} label="输入" />
          <ModelCell value={formatTokens(row.totals.outputTokens)} label="输出" />
          <ModelCell value={formatTokens(row.totals.reasoningTokens)} label="推理" />
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

function modelUsageRows(window: UsageWindowSummary | undefined, providers: ProviderSnapshotView[], currentProvider?: string, currentModel?: string): ModelUsageRow[] {
  if (window === undefined) return []
  const nameOf = (id: string): string => providers.find((provider) => provider.provider === id)?.displayName ?? id
  const rows: ModelUsageRow[] = []
  for (const provider of window.providers) {
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

function heatmapCells(days: UsageOverviewView['usage']['days']): Array<{ date: string; tokens: number }> {
  const byDate = new Map(days.map((day) => [day.date, totalOf(day.totals)]))
  const end = days[days.length - 1]?.date ?? localDateKey(Date.now())
  const keys = recentDateKeys(end, 30)
  return keys.map((date) => ({ date, tokens: byDate.get(date) ?? 0 }))
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
  const ordered = recentDateKeys(days[days.length - 1]?.date ?? localDateKey(Date.now()), Math.max(30, days.length))
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

/**
 * The Token 银行 card: the DeepSeek official family's retained-ledger usage
 * minted onto the whale-yuan note at 1,000,000 tokens per whale yuan. The window
 * prefers the host's whole-ledger aggregate and falls back to the 30-day
 * trend when an older host serves no `all`; the spend line prefers the
 * official balance watch and falls back to the fold-time estimate; the
 * artwork draw failure degrades to an error line and never takes the
 * section down.
 */
function VoucherCard(props: { window?: UsageWindowSummary; observedSpend?: ObservedSpendView }): ReactNode {
  const { window: ledger, observedSpend } = props
  const data = deepseekVoucherData(ledger)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [drawError, setDrawError] = useState<string | undefined>(undefined)
  const dataKey = data === undefined ? '' : `${data.from}|${data.to}|${data.tokens}|${data.calls}|${data.cost}`

  useEffect(() => {
    if (data === undefined) return
    const voucher = data
    let cancelled = false
    loadVoucherArt().then((art) => {
      if (cancelled) return
      const canvas = canvasRef.current
      if (canvas !== null) {
        try {
          drawVoucher(canvas, art, voucher)
        } catch (error) {
          if (!cancelled) setDrawError(error instanceof Error ? error.message : String(error))
        }
      }
    }, (error) => {
      if (!cancelled) setDrawError(error instanceof Error ? error.message : String(error))
    })
    return () => {
      cancelled = true
    }
  // dataKey covers every field the draw and the buttons read.
  }, [dataKey])

  const onSave = (): void => {
    const canvas = canvasRef.current
    if (canvas === null || data === undefined) return
    canvas.toBlob((blob) => {
      if (blob === null) return
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `dsh-whale-voucher-${data.to}.png`
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
    }, 'image/png')
  }

  const shareSupported = typeof navigator !== 'undefined' && typeof navigator.canShare === 'function'
  const onShare = (): void => {
    const canvas = canvasRef.current
    if (canvas === null || data === undefined || !shareSupported) return
    canvas.toBlob(async (blob) => {
      if (blob === null) return
      const file = new File([blob], `dsh-whale-voucher-${data.to}.png`, { type: 'image/png' })
      if (!navigator.canShare({ files: [file] })) return
      try {
        await navigator.share({ files: [file], title: t('usage.bank.title') })
      } catch {
        // A user-cancelled share sheet rejects; nothing to report.
      }
    }, 'image/png')
  }

  return (
    <div className={styles.card} data-dsh-part="bank-card">
      <span className={styles.cardTitle}>{t('usage.bank.title')}</span>
      {data === undefined
        ? <span className={styles.muted}>{t('usage.bank.noUsage')}</span>
        : <>
            <span className={styles.muted}>{t('usage.bank.hint')}</span>
            <div className={styles.voucherPreview} data-dsh-part="voucher-preview">
              <canvas ref={canvasRef} aria-label={t('usage.bank.title')} />
            </div>
            {drawError !== undefined && <span className={styles.errorLine}>{t('usage.bank.drawError', { error: drawError })}</span>}
            <div className={styles.providerRow}>
              <span className={styles.providerName}>{t('usage.bank.minted', { minted: formatDenomination(faceValue(data.tokens)), tokens: formatTokens(data.tokens) })}</span>
              <span className={styles.providerTokens}>{t('usage.calls', { n: data.calls })}</span>
            </div>
            <span className={styles.muted}>
              {observedSpend !== undefined
                ? t('usage.bank.spend.observed', { cost: observedSpend.cny.toFixed(2), since: formatDay(observedSpend.since) })
                : t('usage.bank.spend.estimated', { cost: data.cost.toFixed(2) })}
            </span>
            <span className={styles.muted}>{t('usage.bank.window', { from: data.from, to: data.to })}</span>
            <div className={styles.buttonRow}>
              <button type="button" className={styles.refreshBtn} onClick={onSave}>{t('usage.bank.save')}</button>
              {shareSupported && <button type="button" className={styles.refreshBtn} onClick={onShare}>{t('usage.bank.share')}</button>}
            </div>
          </>}
    </div>
  )
}

function PlanCard(props: { provider: ProviderSnapshotView; current?: string }): ReactNode {
  const { provider, current } = props
  return (
    <div className={`${styles.card} ${styles.planCard}`} data-dsh-part="plan-card">
      <div className={styles.planHead}>
        <span className={styles.planName}>
          {provider.displayName}
          {current === provider.provider && <span className={styles.currentBadge}>{t('usage.current')}</span>}
          {provider.plan?.planName !== undefined ? ` · ${provider.plan.planName}` : ''}
        </span>
      </div>
      {provider.error !== undefined && <span className={styles.errorLine}>{t('usage.provider.error', { error: provider.error })}</span>}
      {provider.credential === 'none' && provider.plan === undefined
        ? <span className={styles.muted}>{t('usage.balance.noCredential')}</span>
        : provider.plan === undefined || provider.plan.windows.length === 0
          ? <span className={styles.muted}>{t('usage.plan.noPlan')}</span>
          : provider.plan.windows.map((window) => (
            <div key={window.key} className={styles.windowRow} data-dsh-part="plan-window">
              <span className={styles.windowLabel}>
                <span>{window.name ?? t(`usage.plan.windows.${window.key}`)}</span>
                <span>{window.percent !== undefined ? `${window.percent >= 10 ? Math.round(window.percent) : window.percent.toFixed(1)}%` : ''}</span>
              </span>
              {window.percent !== undefined && (
                <span className={styles.bar}>
                  <span className={toneClass(window.percent)} style={{ width: `${Math.min(100, Math.max(0, window.percent))}%`, display: 'block' }} />
                </span>
              )}
              {window.resetsAt !== undefined && (
                <span className={styles.resetLine}>{t('usage.plan.reset', { date: new Date(window.resetsAt).toLocaleString() })}</span>
              )}
            </div>
          ))}
    </div>
  )
}

/**
 * The compact settings row. Both controls write through the shared form the
 * moment the user changes them, and the Host answers each write with a
 * boolean: a refused (or transport-failed) write is surfaced as a failed save,
 * because a value that did not land must never read as applied.
 */
function SettingsRow(props: {
  settings: UsageSectionProps['settings']
  snapshot?: ConfigFormSnapshot<UsageSettings>
  value: UsageSettings
}): ReactNode {
  const { settings, snapshot, value } = props
  const disabled = snapshot === undefined || !snapshot.writable
  const [failure, setFailure] = useState<string | undefined>(undefined)

  const write = (field: 'enabled' | 'pollIntervalSec', next: boolean | number): void => {
    setFailure(undefined)
    let answer: Promise<boolean>
    try {
      answer = settings.set(field, next)
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error))
      return
    }
    // false is the contract's refusal/skip answer (the Host rejected the value,
    // the entry is not writable, or the write was dropped); a rejecting
    // transport reports through the same failed-save surface.
    Promise.resolve(answer).then(
      (accepted) => { if (!accepted) setFailure('') },
      (error: unknown) => { setFailure(error instanceof Error ? error.message : String(error)) },
    )
  }

  return (
    <div className={styles.card} data-dsh-part="settings-row">
      <span className={styles.cardTitle}>{t('usage.config.title')}</span>
      <div className={styles.settingsGrid}>
        <label className={styles.settingItem}>
          <input
            type="checkbox"
            checked={value.enabled ?? true}
            disabled={disabled}
            onChange={(event) => { write('enabled', event.target.checked) }}
          />
          {t('usage.config.enabled')}
        </label>
        <label className={styles.settingItem}>
          {t('usage.config.pollIntervalSec')}
          <input
            type="number"
            min={30}
            max={3600}
            value={typeof value.pollIntervalSec === 'number' ? value.pollIntervalSec : 60}
            disabled={disabled}
            onChange={(event) => {
              const parsed = Number(event.target.value)
              if (Number.isFinite(parsed) && parsed >= 30 && parsed <= 3600) write('pollIntervalSec', Math.round(parsed))
            }}
          />
        </label>
      </div>
      {failure !== undefined && (
        <span className={styles.errorLine} role="status">
          {t('usage.config.saveFailed')}{failure === '' ? '' : ' - ' + failure}
        </span>
      )}
    </div>
  )
}
