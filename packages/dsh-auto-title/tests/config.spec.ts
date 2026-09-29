import { describe, expect, it } from 'vitest'
import { Config, readAutoTitleConfig } from '../src/index.ts'
import { DEFAULT_AUTO_TITLE_CONFIG } from '../src/host/service.ts'

describe('auto-title config surface', () => {
  it('operator sees every field in the plugin settings form', () => {
    // Given the plugin Config schema the Host projects the settings form from
    // When each declared field is inspected
    // Then all eight fields exist and every one is volatile, which is what makes the form appear and accept writes
    const dict = (Config as unknown as { dict: Record<string, { meta?: { volatile?: boolean } }> }).dict
    const fields = Object.keys(dict)
    expect(fields.sort()).toEqual([
      'enabled',
      'includeSubagents',
      'intervalMs',
      'maxContextChars',
      'maxSessionsPerTick',
      'modelRoute',
      'protectExternalTitles',
      'recentTurns',
    ])
    for (const field of fields) {
      expect(dict[field]?.meta?.volatile, `${field} must be volatile`).toBe(true)
    }
  })

  it('operator gets the documented defaults when the loader passes no config', () => {
    // Given a profile entry that carries no config block
    // When the effective config is read
    // Then the plugin runs on the documented schema defaults
    expect(readAutoTitleConfig(undefined)).toEqual(DEFAULT_AUTO_TITLE_CONFIG)
  })

  it('operator sees an edited settings value take effect without a remount', () => {
    // Given a config whose interval arrives as a live volatile reference
    // When the effective config is read, the reference is committed, and it is read again
    // Then the second read reports the newly committed interval
    const live = { value: 45_000 }
    const config = {
      enabled: true,
      modelRoute: 'deepseek/deepseek-chat',
      intervalMs: { get: () => live.value },
      recentTurns: 3,
      maxContextChars: 8_000,
      maxSessionsPerTick: 4,
      includeSubagents: true,
      protectExternalTitles: false,
    }
    expect(readAutoTitleConfig(config)).toEqual({
      enabled: true,
      modelRoute: 'deepseek/deepseek-chat',
      intervalMs: 45_000,
      recentTurns: 3,
      maxContextChars: 8_000,
      maxSessionsPerTick: 4,
      includeSubagents: true,
      protectExternalTitles: false,
    })
    live.value = 60_000
    expect(readAutoTitleConfig(config).intervalMs).toBe(60_000)
  })
})
