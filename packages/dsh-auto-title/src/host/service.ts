import { join } from 'node:path'
import type { TypertGateway } from '@deepseek-ai/dsh-api-gateway'
import { createUserMessage, type GenerateOptions, type LlmRuntime } from '@deepseek-ai/dsh-llm'
import type { SessionAddress, SessionHistoryRecord, SessionListValue, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { dshHome } from '../dsh-home.ts'
import { buildNamingPrompt, compactMessages, isExternalTitleChange, parseNamingReply, textFromContent, type NamingMessage } from '../core/naming.ts'
import { AutoTitleStateStore } from './state.ts'

interface GatewayRequest {
  namespace: string
  method: string
  args: Record<string, unknown>
  signal?: AbortSignal
}

interface GatewayFace {
  invoke(request: GatewayRequest): Promise<unknown>
  stream?(request: GatewayRequest): Promise<AsyncIterable<unknown>>
}

type TitledSessionSummary = SessionSummary & { title?: string }

type SnapshotRecord = { type?: string; cursor?: number; records?: readonly SessionHistoryRecord[]; hasMore?: boolean }

export interface AutoTitleConfig {
  enabled: boolean
  modelRoute: string
  intervalMs: number
  recentTurns: number
  maxContextChars: number
  maxSessionsPerTick: number
  includeSubagents: boolean
  protectExternalTitles: boolean
}

export const DEFAULT_AUTO_TITLE_CONFIG: AutoTitleConfig = {
  enabled: true,
  modelRoute: '',
  intervalMs: 30_000,
  recentTurns: 5,
  maxContextChars: 12_000,
  maxSessionsPerTick: 2,
  includeSubagents: false,
  protectExternalTitles: true,
}

const MODEL_TIMEOUT_MS = 90_000

function sessionAddress(sessionId: string): SessionAddress {
  return { kind: 'session', sessionId: sessionId as SessionId }
}

function invokeWireArgs(namespace: string, method: string, request: Record<string, unknown>): Record<string, unknown> {
  if (namespace === 'session' && method === 'list') return { _request: request }
  return { request }
}

function splitModelRoute(route: string): { provider: string; model: string } | undefined {
  const slash = route.indexOf('/')
  if (slash <= 0 || slash === route.length - 1) return undefined
  const provider = route.slice(0, slash).trim()
  const model = route.slice(slash + 1).trim()
  return provider === '' || model === '' ? undefined : { provider, model }
}

function summaryModelRoute(summary: SessionSummary): { provider: string; model: string } | undefined {
  const values = summary.projections?.values as { modelSelection?: { lastUsed?: unknown; next?: unknown } } | undefined
  const candidate = values?.modelSelection?.lastUsed ?? values?.modelSelection?.next
  if (typeof candidate !== 'object' || candidate === null) return undefined
  const model = candidate as { provider?: unknown; model?: unknown }
  if (typeof model.provider !== 'string' || typeof model.model !== 'string') return undefined
  return { provider: model.provider, model: model.model }
}

function eventSeq(record: SessionHistoryRecord): number {
  return record.event.seq
}

function eventTime(record: SessionHistoryRecord): number {
  return record.event.time
}

function eventTurn(data: unknown): number | undefined {
  if (typeof data !== 'object' || data === null) return undefined
  const turn = (data as { turn?: unknown }).turn
  return typeof turn === 'number' ? turn : undefined
}

function completedTurnEndSeq(records: readonly SessionHistoryRecord[]): number | undefined {
  let latest: number | undefined
  for (const record of records) {
    if (record.event.type !== 'turn/end') continue
    const reason = (record.event.data as { reason?: { kind?: unknown } } | undefined)?.reason
    if (reason?.kind !== 'completed') continue
    latest = latest === undefined ? eventSeq(record) : Math.max(latest, eventSeq(record))
  }
  return latest
}

function messageText(record: SessionHistoryRecord): string {
  const data = record.event.data as { content?: unknown; message?: { content?: unknown; source?: { kind?: unknown } }; source?: { kind?: unknown } } | undefined
  const message = data?.message ?? data
  return textFromContent(message?.content)
}

function isHumanUserRecord(record: SessionHistoryRecord): boolean {
  if (record.event.type !== 'user/message') return false
  const data = record.event.data as { source?: { kind?: unknown }; message?: { source?: { kind?: unknown } } } | undefined
  const source = data?.message?.source ?? data?.source
  return source?.kind === 'user'
}

function historyMessages(records: readonly SessionHistoryRecord[]): NamingMessage[] {
  const messages: NamingMessage[] = []
  for (const record of records) {
    if (isHumanUserRecord(record)) {
      const text = messageText(record)
      if (text !== '') messages.push({ role: 'user', text, seq: eventSeq(record), time: eventTime(record), turn: eventTurn(record.event.data) })
    } else if (record.event.type === 'assistant/message') {
      const text = messageText(record)
      if (text !== '') messages.push({ role: 'assistant', text, seq: eventSeq(record), time: eventTime(record), turn: eventTurn(record.event.data) })
    }
  }
  return messages
}

export class AutoTitleService {
  private timer: ReturnType<typeof setInterval> | undefined
  private disposed = false
  private ticking = false
  private readonly gateway: GatewayFace
  private readonly store: AutoTitleStateStore

  /** Interval the live timer was armed with, so a config commit can re-arm only on change. */
  private armedIntervalMs: number | undefined

  constructor(
    gateway: TypertGateway | GatewayFace,
    private readonly getConfig: () => AutoTitleConfig,
    private readonly getLlm: () => LlmRuntime | undefined,
    statePath = join(dshHome(), 'auto-title', 'state-v1.json'),
  ) {
    this.gateway = gateway as GatewayFace
    this.store = new AutoTitleStateStore(statePath)
  }

  /**
   * Arm the poll timer from the current config. Called once at activation and
   * again after every Volatile config commit, so an enable switch, a disabled
   * row and an interval edit all take effect without a remount.
   */
  applyConfig(): void {
    if (this.disposed) return
    const config = this.getConfig()
    if (!config.enabled) {
      if (this.timer !== undefined) clearInterval(this.timer)
      this.timer = undefined
      this.armedIntervalMs = undefined
      return
    }
    if (this.timer !== undefined && this.armedIntervalMs === config.intervalMs) return
    if (this.timer !== undefined) clearInterval(this.timer)
    this.timer = setInterval(() => { void this.tick() }, config.intervalMs)
    this.armedIntervalMs = config.intervalMs
    void this.tick()
  }

  dispose(): void {
    this.disposed = true
    if (this.timer !== undefined) clearInterval(this.timer)
    this.timer = undefined
  }

  async tick(): Promise<void> {
    const config = this.getConfig()
    if (this.disposed || this.ticking || this.getLlm() === undefined || !config.enabled) return
    this.ticking = true
    try {
      const list = await this.invoke('session', 'list', {}) as SessionListValue
      const candidates = [...list.items]
        .filter(item => !item.running && !item.blank)
        .filter(item => config.includeSubagents || item.origin !== 'subagent')
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, config.maxSessionsPerTick)
      for (const summary of candidates) {
        if (this.disposed) break
        await this.process(summary as TitledSessionSummary)
      }
    } catch (error) {
      console.warn('[dsh-auto-title] title maintenance tick failed', error)
    } finally {
      this.ticking = false
    }
  }

  private async process(summary: TitledSessionSummary): Promise<void> {
    const config = this.getConfig()
    const sessionId = summary.sessionId as string
    const state = await this.store.load()
    const previous = state.sessions[sessionId]
    if (previous?.locked === true) return
    if (config.protectExternalTitles && isExternalTitleChange(summary.title, previous?.generatedTitle)) {
      await this.store.mutate(next => {
        next.sessions[sessionId] = { ...next.sessions[sessionId], locked: true }
      })
      return
    }

    const records = await this.readSnapshot(sessionId)
    const turnSeq = completedTurnEndSeq(records)
    if (turnSeq === undefined || (previous?.lastProcessedSeq !== undefined && previous.lastProcessedSeq >= turnSeq)) return
    const messages = compactMessages(historyMessages(records), config.recentTurns, config.maxContextChars)
    if (!messages.some(message => message.role === 'user')) {
      await this.markProcessed(sessionId, turnSeq, previous?.generatedTitle)
      return
    }
    const route = splitModelRoute(config.modelRoute.trim()) ?? summaryModelRoute(summary)
    if (route === undefined) return
    const candidate = await this.generateTitle(route, summary.title, messages, sessionId)
    if (candidate === undefined) {
      await this.markProcessed(sessionId, turnSeq, previous?.generatedTitle)
      return
    }
    if (candidate === summary.title) {
      await this.markProcessed(sessionId, turnSeq, previous?.generatedTitle ?? candidate)
      return
    }
    const renamed = await this.invoke('session', 'rename', { sessionId, title: candidate }) as { title?: unknown }
    const accepted = typeof renamed.title === 'string' ? renamed.title : candidate
    await this.markProcessed(sessionId, turnSeq, accepted)
  }

  private async markProcessed(sessionId: string, seq: number, generatedTitle: string | undefined): Promise<void> {
    await this.store.mutate(state => {
      state.sessions[sessionId] = {
        ...state.sessions[sessionId],
        lastProcessedSeq: seq,
        ...(generatedTitle === undefined ? {} : { generatedTitle }),
        lastError: undefined,
      }
    })
  }

  private async generateTitle(route: { provider: string; model: string }, currentTitle: string | undefined, messages: readonly NamingMessage[], sessionId: string): Promise<string | undefined> {
    const controller = new AbortController()
    const timer = setTimeout(() => { controller.abort() }, MODEL_TIMEOUT_MS)
    try {
      const options: GenerateOptions = {
        provider: route.provider,
        model: route.model,
        purpose: 'session-title',
        sessionId: sessionId as SessionId,
        system: buildNamingPrompt({ currentTitle, messages }),
        messages: [createUserMessage({ content: [{ type: 'text', text: 'Generate or keep the session title for this completed turn.' }], source: { kind: 'user' } })],
        signal: controller.signal,
      }
      let reply = ''
      for await (const chunk of this.getLlm()?.stream(options) ?? []) {
        if (chunk.type === 'text-delta') reply += chunk.text
      }
      return parseNamingReply(reply)?.title
    } catch (error) {
      await this.store.mutate(state => {
        state.sessions[sessionId] = { ...state.sessions[sessionId], lastError: error instanceof Error ? error.message : String(error) }
      })
      return undefined
    } finally {
      clearTimeout(timer)
    }
  }

  private async readSnapshot(sessionId: string): Promise<readonly SessionHistoryRecord[]> {
    if (this.gateway.stream === undefined) return []
    const stream = await this.stream('session', 'follow', { address: sessionAddress(sessionId), maxMessages: 120 })
    const iterator = stream[Symbol.asyncIterator]()
    const next = await iterator.next()
    if (typeof iterator.return === 'function') await iterator.return()
    const snapshot = next.done === true ? undefined : next.value as SnapshotRecord
    if (snapshot?.type !== 'snapshot' || snapshot.records === undefined) return []
    return snapshot.records
  }

  private invoke(namespace: string, method: string, request: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
    return this.gateway.invoke({ namespace, method, args: invokeWireArgs(namespace, method, request), ...(signal === undefined ? {} : { signal }) })
  }

  private stream(namespace: string, method: string, request: Record<string, unknown>, signal?: AbortSignal): Promise<AsyncIterable<unknown>> {
    if (this.gateway.stream === undefined) throw new Error('gateway stream is unavailable')
    return this.gateway.stream({ namespace, method, args: invokeWireArgs(namespace, method, request), ...(signal === undefined ? {} : { signal }) })
  }
}
