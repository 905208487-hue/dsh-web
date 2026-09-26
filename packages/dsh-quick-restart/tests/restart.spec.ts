/**
 * Host-half runtime evidence for dsh-quick-restart: the helper program the
 * restarter arms, the relaunch-command derivation, and the loopback-fenced
 * route behaviour (status document, POST-only restart with graceful
 * termination, no service call on forbidden clients).
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import {
  armRestart,
  helperSource,
  PORT_FREE_POLL_MS,
  PORT_FREE_WAIT_MS,
  relaunchCommand,
  type RelaunchCommand,
  type RestartTarget,
  type SpawnNode,
} from '../src/host/restart.ts'
import { makeQuickRestartRoutes, type QuickRestartService } from '../src/host/routes.ts'

const target: RestartTarget = { port: 3080, cwd: '/srv/dsh', log: '/tmp/dsh-web.log' }
const command: RelaunchCommand = { node: '/usr/local/bin/node', entry: '/usr/local/lib/node_modules/@deepseek-ai/dsh/lib/bin.js' }

function request(method: string, remoteAddress: string): IncomingMessage {
  return { method, socket: { remoteAddress } } as unknown as IncomingMessage
}

function responder(): {
  res: ServerResponse
  status(): number
  body(): string
} {
  let status = -1
  let body = ''
  const res = {
    writeHead(code: number, _headers?: unknown) {
      status = code
    },
    end(payload: string) {
      body = payload
    },
  }
  return { res: res as unknown as ServerResponse, status: () => status, body: () => body }
}

/** Capture the spawn call and hand back a fake child with unref recorded. */
function capturingSpawn(calls: Array<{ args: string[]; options: unknown }>): SpawnNode {
  return (args, options) => {
    calls.push({ args, options })
    return { unref: () => undefined }
  }
}

describe('dsh-quick-restart helper program', () => {
  it('operator can rely on the helper waiting for the port to free before it relaunches dsh web detached', () => {
    // Given a host that still holds the port while it drains
    // When the helper polls the loopback port and the host has exited
    // Then the helper relaunches `dsh web` detached from the recorded directory
    const source = helperSource()
    expect(source).toContain("net.connect({ host: '127.0.0.1', port: RS_PORT })")
    expect(source).toContain('detached: true')
    expect(source).toContain("'dsh', 'web'")
    expect(source).toContain(`process.exit(1)`)
    expect(source).toContain(`${PORT_FREE_WAIT_MS}`)
    expect(source).toContain(`${PORT_FREE_POLL_MS}`)
  })
})

describe('relaunchCommand', () => {
  it('operator gets a relaunch through the host entry script when argv[1] names a JS file', () => {
    // Given a host booted from a real bin.js entry
    // When the plugin derives the relaunch command from argv
    // Then the derived command runs node with that entry for the web profile
    const derived = relaunchCommand(['/usr/local/bin/node', '/usr/local/lib/node_modules/@deepseek-ai/dsh/lib/bin.js', 'web'], '/usr/local/bin/node')
    expect(derived).toEqual({ node: '/usr/local/bin/node', entry: '/usr/local/lib/node_modules/@deepseek-ai/dsh/lib/bin.js' })
  })

  it('operator gets a relaunch through the dsh CLI when argv[1] is not a script', () => {
    // Given a host whose argv does not name a JS entry file
    // When the plugin derives the relaunch command
    // Then it falls back to the dsh CLI on PATH
    const derived = relaunchCommand(['dsh', 'web'], '/usr/local/bin/node')
    expect(derived.entry).toBeNull()
  })
})

describe('armRestart', () => {
  it('operator sees the helper spawn detached with the target carried in env and unrefed', () => {
    // Given a restartable host with a known port, cwd and log
    // When the plugin arms the helper
    // Then the helper is spawned detached, stdio ignored, with RS_* env and unrefed
    const calls: Array<{ args: string[]; options: unknown }> = []
    const outcome = armRestart(target, command, capturingSpawn(calls))
    expect(outcome.ok).toBe(true)
    expect(calls).toHaveLength(1)
    const { args, options } = calls[0]!
    expect(args[0]).toBe('-e')
    expect(args[1]).toBe(helperSource())
    const { env, detached, stdio } = options as { env: Record<string, string>; detached: boolean; stdio: 'ignore' }
    expect(detached).toBe(true)
    expect(stdio).toBe('ignore')
    expect(env.RS_PORT).toBe('3080')
    expect(env.RS_CWD).toBe('/srv/dsh')
    expect(env.RS_LOG).toBe('/tmp/dsh-web.log')
    expect(env.RS_ENTRY).toBe('/usr/local/lib/node_modules/@deepseek-ai/dsh/lib/bin.js')
  })

  it('operator gets a reported failure instead of a thrown error when the spawn itself fails', () => {
    // Given a spawn that throws EPERM
    // When the plugin tries to arm the helper
    // Then it returns ok:false with the error surfaced
    const failing: SpawnNode = () => {
      throw new Error('EPERM')
    }
    const outcome = armRestart(target, command, failing)
    expect(outcome.ok).toBe(false)
    expect(outcome.error).toContain('EPERM')
  })
})

describe('dsh-quick-restart routes', () => {
  it('operator reads the live status document from a loopback client', async () => {
    // Given a running host with a known pid, port and start time
    // When a loopback client GETs the status route
    // Then the response carries the status document
    const service: QuickRestartService = {
      status: () => ({ pid: 42, port: 3080, startedAt: 1_700_000_000_000 }),
      restart: () => ({ ok: true }),
      terminate: () => undefined,
    }
    const [route] = makeQuickRestartRoutes(service)
    const out = responder()
    await route.handler(request('GET', '127.0.0.1'), out.res)
    expect(out.status()).toBe(200)
    expect(JSON.parse(out.body())).toMatchObject({ ok: true, pid: 42, port: 3080, startedAt: 1_700_000_000_000 })
  })

  it('operator is refused on every route from a non-loopback client without touching the service', async () => {
    // Given a client coming from a LAN address
    // When it calls any of the routes
    // Then every route answers 403 and leaves the service untouched
    const restart = vi.fn(() => ({ ok: true }))
    const service: QuickRestartService = { status: () => ({ pid: 1, port: 3080, startedAt: 0 }), restart, terminate: () => undefined }
    const routes = makeQuickRestartRoutes(service)
    for (const route of routes) {
      const out = responder()
      await route.handler(request('GET', '10.0.0.2'), out.res)
      expect(out.status()).toBe(403)
    }
    expect(restart).not.toHaveBeenCalled()
  })

  it('operator gets a 405 instead of a restart when the restart route is reached without POST', async () => {
    // Given the restart route on the web server
    // When a loopback client GETs it without POST
    // Then the route answers 405 and never terminates the host
    const terminate = vi.fn()
    const service: QuickRestartService = { status: () => ({ pid: 1, port: 3080, startedAt: 0 }), restart: () => ({ ok: true }), terminate }
    const [, route] = makeQuickRestartRoutes(service)
    const out = responder()
    await route.handler(request('GET', '127.0.0.1'), out.res)
    expect(out.status()).toBe(405)
    expect(terminate).not.toHaveBeenCalled()
  })

  it('operator sees the reloading reply and a graceful termination after a confirmed POST', async () => {
    // Given a confirmed POST from a loopback client
    // When the route arms the helper and replies
    // Then the response says reloading and the host terminates exactly once
    const restart = vi.fn(() => ({ ok: true }))
    const terminate = vi.fn()
    const service: QuickRestartService = { status: () => ({ pid: 1, port: 3080, startedAt: 0 }), restart, terminate }
    const [, route] = makeQuickRestartRoutes(service)
    const out = responder()
    await route.handler(request('POST', '127.0.0.1'), out.res)
    expect(out.status()).toBe(200)
    expect(JSON.parse(out.body())).toMatchObject({ ok: true, reloading: true })
    expect(restart).toHaveBeenCalledTimes(1)
    expect(terminate).toHaveBeenCalledTimes(1)
  })

  it('operator gets a 500 and no termination when arming the helper fails', async () => {
    // Given a restart that fails to arm the helper
    // When a loopback client POSTs the restart route
    // Then the route answers 500 and never terminates the host
    const terminate = vi.fn()
    const service: QuickRestartService = {
      status: () => ({ pid: 1, port: 3080, startedAt: 0 }),
      restart: () => ({ ok: false, error: 'EPERM' }),
      terminate,
    }
    const [, route] = makeQuickRestartRoutes(service)
    const out = responder()
    await route.handler(request('POST', '127.0.0.1'), out.res)
    expect(out.status()).toBe(500)
    expect(terminate).not.toHaveBeenCalled()
  })
})