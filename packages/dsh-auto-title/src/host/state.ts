import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export interface AutoTitleSessionState {
  lastProcessedSeq?: number
  generatedTitle?: string
  locked?: boolean
  lastError?: string
}

export interface AutoTitleState {
  schemaVersion: 1
  sessions: Record<string, AutoTitleSessionState>
}

export function emptyState(): AutoTitleState {
  return { schemaVersion: 1, sessions: {} }
}

export function parseState(value: unknown): AutoTitleState {
  if (typeof value !== 'object' || value === null) return emptyState()
  const record = value as { schemaVersion?: unknown; sessions?: unknown }
  if (record.schemaVersion !== 1 || typeof record.sessions !== 'object' || record.sessions === null) return emptyState()
  const sessions: Record<string, AutoTitleSessionState> = {}
  for (const [id, raw] of Object.entries(record.sessions as Record<string, unknown>)) {
    if (typeof raw !== 'object' || raw === null) continue
    const item = raw as AutoTitleSessionState
    sessions[id] = {
      ...(typeof item.lastProcessedSeq === 'number' ? { lastProcessedSeq: item.lastProcessedSeq } : {}),
      ...(typeof item.generatedTitle === 'string' ? { generatedTitle: item.generatedTitle } : {}),
      ...(item.locked === true ? { locked: true } : {}),
      ...(typeof item.lastError === 'string' ? { lastError: item.lastError } : {}),
    }
  }
  return { schemaVersion: 1, sessions }
}

export class AutoTitleStateStore {
  private state: AutoTitleState | undefined

  constructor(readonly path: string) {}

  async load(): Promise<AutoTitleState> {
    if (this.state !== undefined) return this.state
    try {
      this.state = parseState(JSON.parse(await readFile(this.path, 'utf8')))
    } catch (error) {
      if ((error as { code?: unknown }).code !== 'ENOENT') {
        console.warn('[dsh-auto-title] failed to read state; starting with an empty state', error)
      }
      this.state = emptyState()
    }
    return this.state
  }

  async mutate(mutator: (state: AutoTitleState) => void): Promise<void> {
    const state = await this.load()
    mutator(state)
    await this.save(state)
  }

  private async save(state: AutoTitleState): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true })
    const temp = `${this.path}.tmp-${process.pid}-${Date.now()}`
    await writeFile(temp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 })
    await rename(temp, this.path)
  }
}
