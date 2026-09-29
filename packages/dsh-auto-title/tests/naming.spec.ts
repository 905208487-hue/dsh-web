import { describe, expect, it } from 'vitest'
import { buildNamingPrompt, compactMessages, isExternalTitleChange, parseNamingReply, textFromContent } from '../src/core/naming.ts'

describe('auto-title naming helpers', () => {
  it('operator gets a parsed title from a model reply wrapped in prose and fences', () => {
    // Given a reply that puts a JSON title object inside a fenced block
    // When the reply is parsed
    // Then the title and reason are extracted and the surrounding prose is dropped
    expect(parseNamingReply('Sure\n```json\n{"action":"rename","title":"Login form | layout fix","reason":"new goal"}\n```')).toEqual({
      title: 'Login form | layout fix',
      reason: 'new goal',
    })
  })

  it('user keeps the current title when the model answers keep', () => {
    // Given a reply whose action is keep because the turn only confirmed work
    // When the reply is parsed
    // Then no candidate title is returned, so the session keeps its name
    expect(parseNamingReply('{"action":"keep","reason":"confirmation only"}')).toBeUndefined()
  })

  it('operator sees only the newest user turns inside the character budget', () => {
    // Given three user turns with assistant replies between them and a 100 character budget
    // When the excerpt is compacted to the two newest turns
    // Then the oldest turn is dropped and the order stays chronological
    const messages = compactMessages([
      { role: 'user', text: 'first', seq: 1, time: 1, turn: 1 },
      { role: 'assistant', text: 'reply one', seq: 2, time: 2, turn: 1 },
      { role: 'user', text: 'second task', seq: 3, time: 3, turn: 2 },
      { role: 'assistant', text: 'reply two', seq: 4, time: 4, turn: 2 },
      { role: 'user', text: 'third task', seq: 5, time: 5, turn: 3 },
    ], 2, 100)
    expect(messages.map(item => item.text)).toEqual(['reply one', 'second task', 'reply two', 'third task'])
  })

  it('operator gets text-only excerpts when a message also carries an image block', () => {
    // Given user content holding two text blocks around a non-text block
    // When the text is read out of that content
    // Then only the text blocks are joined and the image bytes never reach the title model
    expect(textFromContent([{ type: 'text', text: 'hello' }, { type: 'image', data: 'ignored' }, { type: 'text', text: 'world' }])).toBe('hello\nworld')
  })

  it('user gets protection only after the plugin has written that session title', () => {
    // Given a session the plugin never renamed, and one it renamed to Generated
    // When an external title is compared against the last plugin-written title
    // Then only the already-generated session counts as an external change worth locking
    expect(isExternalTitleChange('Manual', undefined)).toBe(false)
    expect(isExternalTitleChange('Manual', 'Generated')).toBe(true)
    expect(isExternalTitleChange('Generated', 'Generated')).toBe(false)
  })

  it('operator gets a prompt carrying the current title and the recent excerpt', () => {
    // Given a session whose current title is Old and one recent user request
    // When the naming prompt is built
    // Then the prompt states the current title and the excerpt the model must judge
    const prompt = buildNamingPrompt({ currentTitle: 'Old', messages: [{ role: 'user', text: 'Please fix login expiry', seq: 1, time: 1 }] })
    expect(prompt).toContain('Current title: Old')
    expect(prompt).toContain('[user] Please fix login expiry')
  })
})
