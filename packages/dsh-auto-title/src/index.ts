import type { Context, Volatile } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-gateway'
import type { LlmRuntime } from '@deepseek-ai/dsh-llm'
import z from '@deepseek-ai/schemastery'
import { mountOnce } from './mount-once.ts'
import { AutoTitleService, DEFAULT_AUTO_TITLE_CONFIG, type AutoTitleConfig } from './host/service.ts'

export const inject = ['typertGateway']

/**
 * Plugin config, validated by the same-named schemastery schema.
 *
 * This schema IS the plugin's settings form: the Host serves one configuration
 * form per profile entry from the entry's own Config, and it only does so for
 * fields marked volatile. A field without that marker is skipped by the form
 * projection and refused by the settings write path, so every editable field
 * here is volatile and read live at use time.
 */
export interface Config {
  /** Master switch for background title maintenance. */
  enabled?: Volatile<boolean>
  /** Optional `provider/model` route; empty falls back to the session's last used model. */
  modelRoute?: Volatile<string>
  /** Poll interval in milliseconds. */
  intervalMs?: Volatile<number>
  /** How many recent user turns are sent to the title model. */
  recentTurns?: Volatile<number>
  /** Maximum excerpt size in characters sent to the title model. */
  maxContextChars?: Volatile<number>
  /** Upper bound of sessions processed per poll. */
  maxSessionsPerTick?: Volatile<number>
  /** Whether subagent sessions are renamed too. */
  includeSubagents?: Volatile<boolean>
  /** Lock a session when its title is changed outside this plugin. */
  protectExternalTitles?: Volatile<boolean>
}

/**
 * The same fields as {@link Config}, widened to also accept plain values: a
 * programmatic mount (a test or a hand-built Host context) passes resolved
 * values while the Loader passes volatile references, and the reader below
 * answers both.
 */
export interface AutoTitleConfigInput {
  enabled?: Volatile<boolean> | boolean
  modelRoute?: Volatile<string> | string
  intervalMs?: Volatile<number> | number
  recentTurns?: Volatile<number> | number
  maxContextChars?: Volatile<number> | number
  maxSessionsPerTick?: Volatile<number> | number
  includeSubagents?: Volatile<boolean> | boolean
  protectExternalTitles?: Volatile<boolean> | boolean
}

/** The schema is inferred, not annotated: volatile fields accept a plain value and parse to a live reference. */
export const Config = z.object({
  enabled: z.boolean().default(DEFAULT_AUTO_TITLE_CONFIG.enabled).volatile(),
  modelRoute: z.string().default(DEFAULT_AUTO_TITLE_CONFIG.modelRoute).volatile(),
  intervalMs: z.number().min(5_000).max(600_000).default(DEFAULT_AUTO_TITLE_CONFIG.intervalMs).volatile(),
  recentTurns: z.number().min(1).max(10).default(DEFAULT_AUTO_TITLE_CONFIG.recentTurns).volatile(),
  maxContextChars: z.number().min(1_000).max(40_000).default(DEFAULT_AUTO_TITLE_CONFIG.maxContextChars).volatile(),
  maxSessionsPerTick: z.number().min(1).max(10).default(DEFAULT_AUTO_TITLE_CONFIG.maxSessionsPerTick).volatile(),
  includeSubagents: z.boolean().default(DEFAULT_AUTO_TITLE_CONFIG.includeSubagents).volatile(),
  protectExternalTitles: z.boolean().default(DEFAULT_AUTO_TITLE_CONFIG.protectExternalTitles).volatile(),
})

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * Volatile config values were committed into the running fiber without a
     * remount; dispatched to the owning fiber only. Spelled here because the
     * Loader package is not a dependency of this plugin, with the Loader's own
     * shape so the two declarations merge when a Host program carries both.
     * @param paths - changed config paths as key arrays; every value is committed before dispatch.
     * @mode emit
     */
    'loader/volatile-update'(paths: readonly (readonly string[])[]): void
  }
}

function resolveLlmRuntime(ctx: Context): LlmRuntime | undefined {
  try {
    const llm = ctx.get('llm') as LlmRuntime | undefined
    return llm !== undefined && typeof (llm as { stream?: unknown }).stream === 'function' ? llm : undefined
  } catch {
    return undefined
  }
}

/**
 * Read one config field's current value. The Loader hands schema-volatile
 * fields as stable references it commits in place, so a live value must be read
 * at use time rather than captured when the plugin activates.
 * @param field - the config field as the Loader handed it.
 * @param fallback - value to use when the field is absent.
 * @returns the effective field value.
 */
export function readConfigField<T>(field: Volatile<T> | T | undefined, fallback: T): T {
  if (field === undefined) return fallback
  if (typeof field === 'object' && field !== null && typeof (field as { get?: unknown }).get === 'function') {
    return (field as Volatile<T>).get() as T
  }
  return field as T
}

/** Snapshot the live config into the plain shape the service consumes. */
export function readAutoTitleConfig(config: AutoTitleConfigInput | undefined): AutoTitleConfig {
  return {
    enabled: readConfigField(config?.enabled, DEFAULT_AUTO_TITLE_CONFIG.enabled),
    modelRoute: readConfigField(config?.modelRoute, DEFAULT_AUTO_TITLE_CONFIG.modelRoute),
    intervalMs: readConfigField(config?.intervalMs, DEFAULT_AUTO_TITLE_CONFIG.intervalMs),
    recentTurns: readConfigField(config?.recentTurns, DEFAULT_AUTO_TITLE_CONFIG.recentTurns),
    maxContextChars: readConfigField(config?.maxContextChars, DEFAULT_AUTO_TITLE_CONFIG.maxContextChars),
    maxSessionsPerTick: readConfigField(config?.maxSessionsPerTick, DEFAULT_AUTO_TITLE_CONFIG.maxSessionsPerTick),
    includeSubagents: readConfigField(config?.includeSubagents, DEFAULT_AUTO_TITLE_CONFIG.includeSubagents),
    protectExternalTitles: readConfigField(config?.protectExternalTitles, DEFAULT_AUTO_TITLE_CONFIG.protectExternalTitles),
  }
}

export const apply = mountOnce('@linxin666/dsh-auto-title', (ctx: Context, config?: Config) => {
  // Both dependencies stay live: the llm service may activate after this row,
  // and volatile config commits change behavior without a remount.
  const service = new AutoTitleService(
    ctx.typertGateway,
    () => readAutoTitleConfig(config),
    () => resolveLlmRuntime(ctx),
  )
  ctx.effect(() => {
    service.applyConfig()
    return () => { service.dispose() }
  }, 'dsh-auto-title: completed-turn session naming')

  ctx.on('loader/volatile-update', () => { service.applyConfig() })
})
