import { describe, expect, it } from 'vitest'
import {
  buildScopeView, createLedgerDocument, deserializeLedger, foldHours, foldUsage, ledgerDayKeys, localDateKey, pruneLedger, summarizeDays, totalTokens,
} from '../src/core/ledger.ts'
import { emptyTotals } from '../src/core/types.ts'

describe('localDateKey', () => {
  it('formats a local-date key', () => {
    // 2026-08-29 12:00 local, constructed via Date components to stay TZ-neutral.
    const date = new Date(2026, 7, 29, 12, 0, 0)
    expect(localDateKey(date.getTime())).toBe('2026-08-29')
  })
})

describe('foldUsage', () => {
  it('accumulates per day, provider, and model', () => {
    const doc = createLedgerDocument()
    const at = new Date(2026, 7, 29, 10, 0, 0).getTime()
    foldUsage(doc, at, 'kimi-coding', 'kimi-latest', { ...emptyTotals(), inputTokens: 100, outputTokens: 50, calls: 1 })
    foldUsage(doc, at, 'kimi-coding', 'kimi-latest', { ...emptyTotals(), inputTokens: 10, outputTokens: 5, calls: 1 })
    foldUsage(doc, at, 'kimi-coding', 'other', { ...emptyTotals(), outputTokens: 7, calls: 1 })
    expect(doc.days['2026-08-29']?.['kimi-coding']?.['kimi-latest']).toMatchObject({ inputTokens: 110, outputTokens: 55, calls: 2 })
    expect(doc.days['2026-08-29']?.['kimi-coding']?.['other']).toMatchObject({ outputTokens: 7, calls: 1 })
  })

  it('ignores empty reports', () => {
    const doc = createLedgerDocument()
    foldUsage(doc, Date.now(), 'p', 'm', emptyTotals())
    expect(Object.keys(doc.days)).toHaveLength(0)
  })
})

describe('pruneLedger', () => {
  it('drops days older than the retention window', () => {
    const doc = createLedgerDocument()
    doc.days['2026-07-01'] = {}
    doc.days['2026-08-28'] = {}
    doc.days['2026-08-29'] = {}
    const pruned = pruneLedger(doc, '2026-08-29', 30)
    expect(pruned).toBe(1)
    expect(doc.days['2026-07-01']).toBeUndefined()
    expect(doc.days['2026-08-28']).toBeDefined()
    expect(doc.days['2026-08-29']).toBeDefined()
  })
})

describe('deserializeLedger', () => {
  it('revives a serialized document', () => {
    const doc = createLedgerDocument()
    foldUsage(doc, new Date(2026, 7, 29, 10, 0, 0).getTime(), 'deepseek', 'deepseek-v4-pro', { ...emptyTotals(), inputTokens: 5, calls: 1 })
    const revived = deserializeLedger(JSON.parse(JSON.stringify(doc)))
    expect(revived.days['2026-08-29']?.deepseek?.['deepseek-v4-pro']).toMatchObject({ inputTokens: 5, calls: 1 })
  })

  it('never throws on garbage', () => {
    for (const garbage of [null, undefined, 42, 'x', {}, { days: null }, { days: { bad: 3 } }, { days: { '2026-13-99': { p: { m: { inputTokens: 'x' } } } } }]) {
      expect(() => deserializeLedger(garbage)).not.toThrow()
    }
    // Non-numeric buckets revive to zero, and an all-zero report folds to nothing.
    expect(deserializeLedger({ days: { '2026-08-29': { p: { m: { inputTokens: '7', calls: NaN } } } } }).days['2026-08-29']).toBeUndefined()
  })

  it('drops prototype-plumbing keys instead of polluting Object.prototype', () => {
    // JSON.parse creates own '__proto__'/'constructor' properties, so the
    // entries survive Object.entries and reach the fold.
    const poisoned = JSON.parse('{"days":{"2026-08-29":{"__proto__":{"evil":{"calls":1}},"constructor":{"evil2":{"calls":1}},"deepseek":{"deepseek-v4-pro":{"calls":1}}}}}')
    const doc = deserializeLedger(poisoned)
    expect(doc.days['2026-08-29']?.deepseek).toBeDefined()
    // Only the legitimate provider bucket survives; the plumbing-keyed
    // entries never become own properties.
    expect(Object.keys(doc.days['2026-08-29']!)).toEqual(['deepseek'])
    // The global prototype stays clean.
    expect((Object.prototype as unknown as Record<string, unknown>).evil).toBeUndefined()
    expect((Object.prototype as unknown as Record<string, unknown>).evil2).toBeUndefined()
  })

  it('rejects impossible and rollover dates instead of folding NaN days', () => {
    const doc = deserializeLedger({
      days: {
        '9999-99-99': { deepseek: { m: { calls: 1 } } },
        '2026-02-30': { deepseek: { m: { calls: 1 } } },
        '2026-08-29': { deepseek: { m: { calls: 1 } } },
      },
    })
    expect(Object.keys(doc.days)).toEqual(['2026-08-29'])
  })
})

describe('ledgerDayKeys + totalTokens', () => {
  it('sorts days ascending and totals all buckets', () => {
    const doc = createLedgerDocument()
    doc.days['2026-08-29'] = {}
    doc.days['2026-08-27'] = {}
    expect(ledgerDayKeys(doc)).toEqual(['2026-08-27', '2026-08-29'])
    expect(totalTokens({ ...emptyTotals(), inputTokens: 1, cacheReadTokens: 2, cacheWriteTokens: 3, outputTokens: 4 })).toBe(10)
  })
})

describe('summarizeDays', () => {
  const day = (provider: string, model: string, inputTokens: number, outputTokens = 0, calls = 1) => ({
    [provider]: { [model]: { ...emptyTotals(), inputTokens, outputTokens, calls } },
  })

  it('merges multiple days per provider and model, heaviest first', () => {
    const { totals, providers } = summarizeDays([day('kimi-coding', 'k2', 100), day('kimi-coding', 'k2', 50), day('kimi-coding', 'k1', 10), day('deepseek', 'v4', 7)])
    expect(totals.inputTokens).toBe(167)
    expect(totals.calls).toBe(4)
    expect(providers.map((row) => row.provider)).toEqual(['kimi-coding', 'deepseek'])
    expect(providers[0]?.models.map((model) => model.model)).toEqual(['k2', 'k1'])
    expect(providers[0]?.models[0]?.totals.inputTokens).toBe(150)
  })

  it('skips unsafe provider keys and malformed entries', () => {
    // JSON.parse is the only way an own '__proto__' key exists — exactly the
    // untrusted shape the guard exists for.
    const hostile = JSON.parse('{"__proto__": {"x": {"inputTokens": 999}}, "ok": {"m": {"inputTokens": 1, "calls": 1}}}')
    const { totals, providers } = summarizeDays([hostile])
    expect(providers.map((row) => row.provider)).toEqual(['ok'])
    expect(totals.inputTokens).toBe(1)
  })
})

describe('foldHours', () => {
  it('accumulates per local hour regardless of provider or model', () => {
    const doc = createLedgerDocument()
    const at = new Date(2026, 7, 29, 10, 0, 0).getTime()
    foldHours(doc, at, { ...emptyTotals(), inputTokens: 100, calls: 1 })
    foldHours(doc, at, { ...emptyTotals(), outputTokens: 20, calls: 1 })
    foldHours(doc, at + 3_600_000, { ...emptyTotals(), inputTokens: 5, calls: 1 })
    expect(doc.hours?.['2026-08-29']?.['10']).toMatchObject({ inputTokens: 100, outputTokens: 20, calls: 2 })
    expect(doc.hours?.['2026-08-29']?.['11']).toMatchObject({ inputTokens: 5, calls: 1 })
    expect(doc.days).toEqual({})
  })

  it('ignores empty reports', () => {
    const doc = createLedgerDocument()
    foldHours(doc, Date.now(), emptyTotals())
    expect(doc.hours).toBeUndefined()
  })
})

describe('pruneLedger hours', () => {
  it('drops the hour buckets of pruned days', () => {
    const doc = createLedgerDocument()
    const oldAt = new Date(2026, 0, 1, 9, 0, 0).getTime()
    const newAt = new Date(2026, 0, 10, 9, 0, 0).getTime()
    foldUsage(doc, oldAt, 'p', 'm', { ...emptyTotals(), inputTokens: 1, calls: 1 })
    foldHours(doc, oldAt, { ...emptyTotals(), inputTokens: 1, calls: 1 })
    foldHours(doc, newAt, { ...emptyTotals(), inputTokens: 2, calls: 1 })
    pruneLedger(doc, '2026-01-10', 8)
    expect(doc.days['2026-01-01']).toBeUndefined()
    expect(doc.hours?.['2026-01-01']).toBeUndefined()
    expect(doc.hours?.['2026-01-10']?.['9']).toMatchObject({ inputTokens: 2 })
  })
})

describe('deserializeLedger hours', () => {
  it('revives persisted hour buckets and drops malformed ones', () => {
    const doc = deserializeLedger({
      version: 1,
      days: { '2026-01-02': { p: { m: { inputTokens: 5, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, calls: 1, cost: 0 } } } },
      hours: {
        '2026-01-02': { '9': { inputTokens: 5, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, calls: 1, cost: 0 }, '99': { inputTokens: 9, calls: 9 } },
        'not-a-date': { '1': { inputTokens: 1, calls: 1 } },
      },
    })
    expect(doc.hours?.['2026-01-02']?.['9']).toMatchObject({ inputTokens: 5 })
    expect(doc.hours?.['2026-01-02']?.['99']).toBeUndefined()
    expect(doc.hours?.['not-a-date']).toBeUndefined()
  })

  it('tolerates documents without hours', () => {
    const doc = deserializeLedger({ version: 1, days: {} })
    expect(doc.hours).toBeUndefined()
  })
})

describe('buildScopeView', () => {
  const ledger = createLedgerDocument()
  const dayAt = new Date(2026, 0, 2, 9, 0, 0).getTime()
  foldUsage(ledger, dayAt, 'p', 'm', { ...emptyTotals(), inputTokens: 100, outputTokens: 50, calls: 2 })
  foldHours(ledger, dayAt, { ...emptyTotals(), inputTokens: 100, calls: 2 })
  const nextDay = new Date(2026, 1, 1, 8, 0, 0).getTime()
  foldUsage(ledger, nextDay, 'p2', 'm2', { ...emptyTotals(), inputTokens: 7, calls: 1 })

  it('serves one local day with 24 zero-filled hourly buckets', () => {
    const view = buildScopeView(ledger, 'day', '2026-01-02')
    expect(view?.kind).toBe('day')
    expect(view?.totals).toMatchObject({ inputTokens: 100, calls: 2 })
    expect(view?.providers).toHaveLength(1)
    expect(view?.hours).toHaveLength(24)
    expect(view?.hours?.[9]).toMatchObject({ inputTokens: 100, calls: 2 })
    expect(view?.hours?.[8]).toMatchObject({ inputTokens: 0, calls: 0 })
  })

  it('serves one natural month with per-day summaries', () => {
    const view = buildScopeView(ledger, 'month', '2026-01')
    expect(view?.kind).toBe('month')
    expect(view?.totals).toMatchObject({ inputTokens: 100, calls: 2 })
    expect(view?.days?.map((day) => day.date)).toEqual(['2026-01-02'])
  })

  it('returns undefined for malformed keys', () => {
    expect(buildScopeView(ledger, 'day', '2026-13-99')).toBeUndefined()
    expect(buildScopeView(ledger, 'month', '2026-1')).toBeUndefined()
    expect(buildScopeView(ledger, 'week', '2026-01')).toBeUndefined()
  })
})
