/**
 * Conversation recall (撤回) core rules: the cut removes only the latest
 * turn, never completed history. Given a decoded session event log, when the
 * log ends with an in-flight turn, then the cut drops that turn at the last
 * `turn/end`; when the latest turn is completed, then the cut drops it at the
 * second-to-last `turn/end`; and a log with no completed turn has nothing to
 * recall.
 */

import { describe, expect, it } from 'vitest'
import { rollbackCut } from '../src/core/rollback.ts'

/** Build a small session event log with turns of given sizes (0 = no turn event). */
function log(turnEvents: Array<'start' | 'end' | 'other'>): string[] {
  const lines: string[] = [JSON.stringify({ type: 'session', id: 's' })]
  turnEvents.forEach((e, i) => {
    if (e === 'other') lines.push(JSON.stringify({ type: `note/${i}` }))
    else lines.push(JSON.stringify({ type: e === 'start' ? 'turn/start' : 'turn/end', turn: i }))
  })
  return lines
}

describe('conversation recall core', () => {
  it('user recalls the only completed turn down to the session header', () => {
    // Given a session with one completed turn
    const events = log(['start', 'end'])
    // When recalling the latest turn
    const cut = rollbackCut(events)
    // Then the cut keeps the header only and reports no in-flight turn
    expect(cut!.cut).toBe(0)
    expect(cut!.inFlight).toBe(false)
  })

  it('user recalls two completed turns keeping the first one intact', () => {
    // Given a session with two completed turns
    const events = log(['start', 'end', 'start', 'end'])
    const firstEnd = events.findIndex(l => l.includes('"turn/end"'))!
    // When recalling the latest turn
    const cut = rollbackCut(events)
    // Then the cut keeps up to the first turn's end
    expect(cut!.cut).toBe(firstEnd)
  })

  it('user recalls an in-flight trailing turn at the last turn end', () => {
    // Given a session whose latest turn is still running (no end event)
    const events = log(['start', 'end', 'start'])
    const lastEnd = events.findIndex(l => l.includes('"turn/end"'))
    // When recalling the latest content
    const cut = rollbackCut(events)
    // Then the in-flight turn is dropped right after the last turn end
    expect(cut!.cut).toBe(lastEnd)
    expect(cut!.inFlight).toBe(true)
  })

  it('user has nothing to recall in a session without completed turns', () => {
    // Given a log with no completed turn
    const events = log(['start'])
    // When asking for the recall cut
    const cut = rollbackCut(events)
    // Then there is nothing to recall
    expect(cut).toBeNull()
  })

  it('user keeps the recall cut inside the log for mixed turn event logs', () => {
    // Given a log with in-between bookkeeping events
    let events: string[] = []
    for (let t = 0; t < 3; t++) {
      events.push(JSON.stringify({ type: 'turn/start', turn: t }))
      events.push(JSON.stringify({ type: 'user/message', turn: t }))
      events.push(JSON.stringify({ type: 'assistant/message', turn: t }))
      events.push(JSON.stringify({ type: 'turn/end', turn: t }))
    }
    // When recalling the latest completed turn
    const cut = rollbackCut(events)
    // Then the cut sits at the second-to-last turn end, inside the log
    expect(cut!.cut).toBeGreaterThan(0)
    expect(cut!.cut).toBeLessThan(events.length - 1)
    expect(events[cut!.cut]).toContain('"turn/end"')
  })
})