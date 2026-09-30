// @vitest-environment jsdom
/**
 * The browser half's registration contract: this package registers its locale
 * dictionaries and heartbeat but intentionally no longer mounts a visible
 * `sidebar.footer.action` download trigger. The left footer seat is reserved for
 * Usage statistics plus the remote-access phone trigger.
 */
import { describe, expect, it } from 'vitest'
import { apply } from '../src/client/index.ts'
import { isApplicationDeliveredPage, shouldMountUpdateSeat } from '../src/client/page-target.ts'

/** Client context double exposing only the services this plugin declares. */
function ctxDouble(): {
  ctx: never
  injected: string[]
  registered: Array<{ name: string; id: string; locale?: string }>
  dictionaries: string[]
} {
  const injected: string[] = []
  const registered: Array<{ name: string; id: string; locale?: string }> = []
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
      register: (entry: { name: string; id: string; locale?: string }) => {
        registered.push(entry)
        return () => {}
      },
    },
  }
  return { ctx: ctx as never, injected, registered, dictionaries }
}

describe('update client entry registration', () => {
  it('operator: a web page registers dictionaries but no sidebar footer download seat', () => {
    // Given the jsdom page origin (http:) and a client context carrying both
    // locale and slot services
    const { ctx, injected, registered, dictionaries } = ctxDouble()
    // When the plugin applies
    apply(ctx)
    // Then only the update dictionary registers; the former download trigger is gone
    expect(dictionaries).toEqual(['update'])
    expect(injected).toEqual([])
    expect(registered).toEqual([])
  })
})

describe('update seat placement helper', () => {
  it('operator: desktop-shell detection still identifies application-delivered pages', () => {
    // Given the DSH Desktop shell's own delivery scheme
    // When the placement helper runs
    // Then the helper still recognizes the application page for callers that use it
    expect(isApplicationDeliveredPage('dsh-app:')).toBe(true)
    expect(shouldMountUpdateSeat('dsh-app:')).toBe(false)
  })

  it('operator: web transports remain classified as web pages even though this package no longer mounts a seat', () => {
    // Given the web transports and the documents a web page mints
    const webSchemes = ['http:', 'https:', 'blob:', 'data:', 'about:', 'filesystem:']
    // When the placement helper runs for each scheme
    // Then every web page remains a web page for compatibility with external callers
    for (const scheme of webSchemes) {
      expect(shouldMountUpdateSeat(scheme), scheme).toBe(true)
    }
  })
})
