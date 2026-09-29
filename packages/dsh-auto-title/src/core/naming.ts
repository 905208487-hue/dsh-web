/** Pure naming helpers for the DSH auto-title host plugin. */

export interface NamingMessage {
  readonly role: 'user' | 'assistant'
  readonly text: string
  readonly seq: number
  readonly time: number
  readonly turn?: number
}

export interface NamingInput {
  readonly currentTitle?: string
  readonly messages: readonly NamingMessage[]
}

export interface NamingCandidate {
  readonly title: string
  readonly reason?: string
}

const TITLE_LIMIT = 80

/** Return a single-line bounded field supplied by an untrusted model. */
function cleanField(value: unknown, limit = TITLE_LIMIT): string {
  if (typeof value !== 'string') return ''
  const collapsed = value.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim()
  if (collapsed === '') return ''
  return collapsed.length <= limit ? collapsed : collapsed.slice(0, limit).trim()
}

/** Parse the title JSON object from a model reply. */
export function parseNamingReply(reply: string): NamingCandidate | undefined {
  const withoutFences = reply.replace(/```[a-zA-Z]*\s*/g, '')
  const start = withoutFences.indexOf('{')
  const end = withoutFences.lastIndexOf('}')
  if (start === -1 || end <= start) return undefined
  let value: unknown
  try {
    value = JSON.parse(withoutFences.slice(start, end + 1))
  } catch {
    return undefined
  }
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as { title?: unknown; reason?: unknown; action?: unknown }
  const action = cleanField(record.action, 16).toLowerCase()
  if (action === 'keep') return undefined
  const title = cleanField(record.title)
  if (!isValidTitle(title)) return undefined
  const reason = cleanField(record.reason, 160)
  return { title, ...(reason === '' ? {} : { reason }) }
}

/** Validate one title candidate before it reaches the Host rename API. */
export function isValidTitle(title: string): boolean {
  if (title === '') return false
  if (title.length > TITLE_LIMIT) return false
  if (/\s{2,}/.test(title)) return false
  if (/^[\p{P}\p{S}\s]+$/u.test(title)) return false
  return true
}

/** Extract plain text from a durable message content block. */
export function textFromContent(content: unknown): string {
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content) {
    if (typeof block !== 'object' || block === null) continue
    const item = block as { type?: unknown; text?: unknown }
    if (item.type === 'text' && typeof item.text === 'string') parts.push(item.text)
  }
  return parts.join('\n').trim()
}

/** Keep only the newest user turns and fit them within the model budget. */
export function compactMessages(messages: readonly NamingMessage[], recentTurns: number, maxChars: number): readonly NamingMessage[] {
  const ordered = [...messages].sort((a, b) => a.seq - b.seq)
  const userTurns: number[] = []
  for (const message of ordered) {
    if (message.role !== 'user') continue
    const marker = message.turn ?? message.seq
    if (userTurns[userTurns.length - 1] !== marker) userTurns.push(marker)
  }
  const keepTurns = new Set(userTurns.slice(-Math.max(1, recentTurns)))
  const tail = ordered.filter(message => message.role === 'assistant' || keepTurns.has(message.turn ?? message.seq))
  const kept: NamingMessage[] = []
  let used = 0
  for (const message of tail.reverse()) {
    const available = maxChars - used
    if (available <= 0) break
    const text = message.text.length <= available ? message.text : message.text.slice(message.text.length - available)
    kept.push({ ...message, text })
    used += text.length
  }
  return kept.reverse()
}

/** Build the model-facing prompt for one title update. */
export function buildNamingPrompt(input: NamingInput): string {
  const lines = [
    'You maintain concise DSH Web session titles after a conversation turn completes.',
    'Output one JSON object only: {"action":"rename","title":"...","reason":"..."} or {"action":"keep","reason":"..."}.',
    'Use the main language of the recent user requests. Keep product names, file names, and technical nouns stable.',
    'Prefer the structure "object | goal" for English or "对象｜目标" for Chinese. Keep it short and searchable.',
    'Do not replace the main subject with generic words such as continue, fix, check, push, or update.',
    'Keep the current title when the recent messages add no substantive new goal.',
  ]
  if (input.currentTitle !== undefined && input.currentTitle.trim() !== '') {
    lines.push(`Current title: ${input.currentTitle.trim()}`)
  }
  lines.push('Recent conversation excerpt:')
  for (const message of input.messages) {
    lines.push(`[${message.role}] ${message.text}`)
  }
  return lines.join('\n')
}

/** Return true when a user-visible title differs from the plugin's last write. */
export function isExternalTitleChange(currentTitle: string | undefined, generatedTitle: string | undefined): boolean {
  if (generatedTitle === undefined || generatedTitle.trim() === '') return false
  if (currentTitle === undefined || currentTitle.trim() === '') return false
  return currentTitle.trim() !== generatedTitle.trim()
}
