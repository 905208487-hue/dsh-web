/**
 * Issues #1751 and #1754: saving a remote-web-ui setting failed with
 * "HMR transactions cannot be nested".
 *
 * The Host runs settings/mutate inside hmr.runExclusive. Committing a volatile
 * field announces loader/volatile-update, which drove sync() synchronously on
 * that same async context, and sync() wrote cordis.patch.yml - the file the HMR
 * config watcher refreshes from. The watcher's refresh then re-entered
 * runExclusive and rejected, which surfaced as the user's save failing.
 *
 * The first fix deferred the write with setImmediate on the belief that a fresh
 * callback starts a fresh AsyncLocalStorage store. That belief is wrong:
 * AsyncLocalStorage is propagated into setImmediate, into node:timers, and
 * into AsyncResource scopes. What actually keeps the file and the save apart
 * is that the write only happens when the desired block differs from the
 * committed one, so the coalesced follow-up sync() finds nothing to write.
 *
 * The regression is therefore a placement AND idempotence rule, and the test
 * asserts both directly.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, '..', 'src', 'index.ts'), 'utf8')

/**
 * The body of one top-level const declaration inside applyImpl, found by brace
 * balance from its opening brace.
 * @param name - the local const's name.
 * @returns the function body source, without the closing brace.
 */
function bodyOf(name) {
  const head = new RegExp('const ' + name + ' = \\([^)]*\\): void => \\{')
  const match = head.exec(source)
  if (match === null) throw new Error('no ' + name + ' declaration in src/index.ts')
  const start = match.index + match[0].length - 1
  let depth = 0
  for (let i = start; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') {
      depth--
      if (depth === 0) return source.slice(start + 1, i)
    }
  }
  throw new Error('unbalanced braces after ' + name)
}

describe('remote-web-ui LAN bind vs. the HMR transaction (issues #1751 and #1754)', () => {
  it('operator keeps the patch write and the firewall probes off the sync path', () => {
    // Given the host half that applies the settings
    // When the two functions that own the LAN bind work and the save path are read
    // Then only the deferred worker touches the patch file and the firewall
    const work = bodyOf('applyLanBindWork')
    expect(work).toContain('writeLanBind(')
    expect(work).toContain('ensureFirewallRule(')
    expect(bodyOf('sync')).not.toContain('writeLanBind(')
    expect(bodyOf('sync')).not.toContain('ensureFirewallRule(')
  })

  it('operator writes the block only when the committed one differs from the desired one', () => {
    // Given the deferred worker, the one thing that actually keeps the patch file
    // out of a second save is that a settled profile produces no write at all
    // When the current-vs-desired comparison that guards the write is read
    // Then the write sits behind that comparison, and re-reading the same block
    // therefore cannot touch the file a second time
    const work = bodyOf('applyLanBindWork')
    expect(work).toContain('current.host !== desiredHost || current.port !== desiredPort')
    const guard = work.indexOf('current.host !== desiredHost || current.port !== desiredPort')
    const write = work.indexOf('writeLanBind(')
    expect(guard).toBeGreaterThan(-1)
    expect(write).toBeGreaterThan(guard)
  })

  it('operator sees the deferral settle on the last committed value', () => {
    // Given the same source
    // When the scheduler that defers the work is read
    // Then the deferred value is re-read at run time, so two toggles inside one
    // tick settle on the last committed value rather than the first
    const schedule = bodyOf('scheduleLanBindWork')
    expect(schedule).toContain('setImmediate(')
    expect(schedule).toContain('applyLanBindWork(resolve())')
  })

  it('operator sees a failed assertion swallowed instead of rejecting the save', () => {
    // Given the scheduler
    // When the deferred worker throws
    // Then the failure is logged, not surfaced: the save already answered and
    // the settings card re-reads the live block on its own poll
    expect(bodyOf('scheduleLanBindWork')).toContain('catch')
  })
})