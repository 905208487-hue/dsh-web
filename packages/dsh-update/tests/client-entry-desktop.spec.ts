// @vitest-environment jsdom
/**
 * The desktop shell's page and the browser page both carry no dsh-update footer
 * seat. The package keeps its locale namespace registered, while the visible
 * footer position belongs to Usage statistics and the phone-remote trigger.
 */
import { describe, expect, it } from 'vitest'
import { apply } from '../src/client/index.ts'

describe('desktop shell page', () => {
  it('operator: the update client registers dictionaries but no footer seat', () => {
    // Given the desktop shell's own delivery scheme on the ambient location
    const real = Object.getOwnPropertyDescriptor(globalThis, 'location')
    expect(real?.configurable).toBe(true)
    Object.defineProperty(globalThis, 'location', {
      value: { protocol: 'dsh-app:', hostname: 'app' },
      configurable: true,
      writable: true,
    })
    try {
      // And a client context carrying the slots and locale services
      expect(window.location.protocol).toBe('dsh-app:')
      expect(window.location.hostname).toBe('app')
      const injected: string[] = []
      const registered: unknown[] = []
      const dictionaries: string[] = []
      const ctx = {
        effect: (fn: () => unknown) => fn(),
        locale: {
          register: (ns: string) => {
            dictionaries.push(ns)
            return () => {}
          },
          bind: () => (key: string) => key,
        },
        slots: {
          inject: (key: string, factory?: () => unknown) => {
            injected.push(key)
            factory?.()
            return () => {}
          },
          register: (entry: unknown) => {
            registered.push(entry)
            return () => {}
          },
        },
      }
      // When the plugin applies
      apply(ctx as never)
      // Then the dictionaries still register and the footer seat stays unmounted
      expect(dictionaries).toEqual(['update'])
      expect(injected).toEqual([])
      expect(registered).toEqual([])
    } finally {
      Object.defineProperty(globalThis, 'location', real as PropertyDescriptor)
    }
  })
})
