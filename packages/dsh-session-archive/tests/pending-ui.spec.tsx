// @vitest-environment jsdom
/**
 * Runtime evidence for the deferred-delete surface: the confirm dialog states
 * how many confirmed targets are host-held, the finished batch says how many
 * sessions moved into the restart queue, and the section renders the queue
 * itself (title, hint, last-start counts, cancel action) plus the per-row
 * "held by process" chip.
 */
import { createElement } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ConfigForm, ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { ArchiveApi } from '../src/client/api.ts'
import { ArchiveController } from '../src/client/archive-controller.ts'
import { SessionArchiveCard } from '../src/client/SessionArchiveCard.tsx'
import { BatchDialog, DeleteConfirmDialog } from '../src/client/dialogs.tsx'
import type { ArchiveSessionRow, InventoryView } from '../src/core/types.ts'
import type { SessionArchiveConfig } from '../src/core/config.ts'
import type { ConfirmDeleteState } from '../src/client/archive-store.ts'

function row(overrides: Partial<ArchiveSessionRow> & { id: string }): ArchiveSessionRow {
  return {
    workspaceIds: [],
    archived: true,
    lastActivityReliable: true,
    running: false,
    attached: false,
    blank: false,
    childIds: [],
    childCount: 0,
    issues: [],
    ...overrides,
  }
}

function inventory(rows: ArchiveSessionRow[], pendingIds: string[] = []): InventoryView {
  return {
    generatedAt: 0,
    rows,
    workspaces: [],
    archivedSessionIds: rows.filter((entry) => entry.archived).map((entry) => entry.id),
    auto: { cycleRunning: false },
    pending: { ids: pendingIds },
  }
}

/** ConfigForm double: the card only reads it through the AutoSettingsPanel child. */
class FakeForm implements ConfigForm<SessionArchiveConfig> {
  // One stable snapshot object: React's useSyncExternalStore compares
  // snapshots by identity, so a fresh object per read would loop forever.
  private readonly snapshot: ConfigFormSnapshot<SessionArchiveConfig>

  constructor(value: Partial<SessionArchiveConfig> = {}) {
    this.snapshot = { status: 'ready', value, base: {}, user: {}, revision: 1, writable: true, mode: 'host' }
  }

  getSnapshot(): ConfigFormSnapshot<SessionArchiveConfig> {
    return this.snapshot
  }

  subscribe(listener: () => void): () => void {
    listener()
    return () => {}
  }

  async set(): Promise<boolean> {
    return true
  }

  async unset(): Promise<boolean> {
    return true
  }

  async mutate(): Promise<boolean> {
    return true
  }
}

function scope(): ConfigForm<SessionArchiveConfig> {
  return new FakeForm()
}

function confirmState(overrides: Partial<ConfirmDeleteState> = {}): ConfirmDeleteState {
  return { ids: ['session-a'], total: 3, descendants: 2, skippedProtected: 0, totalBytes: 0, deferred: 0, strong: false, ...overrides }
}

describe('deferred-delete surface', () => {
  it('operator sees the deferred count in the delete confirmation', () => {
    // Given a delete confirmation whose plan includes two host-held sessions
    // When the dialog renders
    const { container } = render(createElement(DeleteConfirmDialog, {
      state: confirmState({ deferred: 2 }),
      onConfirm: () => {},
      onCancel: () => {},
    }))

    // Then the operator is told those two move to the restart queue
    expect(container.textContent).toContain('其中 2 个被 DSH 进程占用，将在下次重启 DSH 服务时自动删除')
  })

  it('operator sees no deferred line when nothing is host-held', () => {
    // Given a delete confirmation whose plan holds only cold sessions
    // When the dialog renders
    const { container } = render(createElement(DeleteConfirmDialog, {
      state: confirmState(),
      onConfirm: () => {},
      onCancel: () => {},
    }))

    // Then the restart-queue sentence is absent, so the plan reads as immediate
    expect(container.textContent).not.toContain('被 DSH 进程占用')
  })

  it('operator sees the restart queue in the finished batch dialog with a per-id reason', () => {
    // Given a finished delete batch where one target was queued instead of removed
    // When the batch dialog renders
    const { container } = render(createElement(BatchDialog, {
      batch: {
        kind: 'delete',
        total: 2,
        processed: 2,
        running: false,
        error: null,
        freedBytes: 0,
        results: [
          { id: 'session-ok', status: 'ok' },
          { id: 'session-live', status: 'skipped', reason: 'queued' },
        ],
      },
      onClose: () => {},
      onRetryFailed: () => {},
    }))

    // Then both the batch summary and the per-id row explain the restart queue
    expect(container.textContent).toContain('已加入重启后删除队列：1 个会话，重启 DSH 服务后自动删除')
    expect(container.textContent).toContain('已加入重启后删除队列，重启 DSH 服务后自动删除')
  })

  it('operator sees the queue strip and the held-by-process chip, and cancels through the host route', async () => {
    // Given an inventory holding one process-attached session and one cold session
    // When the archive card mounts and the operator cancels the restart queue
    const clearCalls: string[] = []
    const api: ArchiveApi = {
      inventory: () => Promise.resolve(inventory([
        row({ id: 'session-live', title: 'held one', attached: true }),
        row({ id: 'session-cold', title: 'cold one' }),
      ], ['session-live'])),
      preview: () => Promise.reject(new Error('not used')),
      archive: () => Promise.reject(new Error('not used')),
      unarchive: () => Promise.reject(new Error('not used')),
      deleteSessions: () => Promise.reject(new Error('not used')),
      clearPending: (ids) => {
        clearCalls.push(ids === undefined ? 'all' : ids.join(','))
        return Promise.resolve({ ids: [] })
      },
      autoPreview: () => Promise.reject(new Error('not used')),
      autoRun: () => Promise.reject(new Error('not used')),
    }
    const controller = new ArchiveController({ api })
    const { container } = render(createElement(SessionArchiveCard, { controller, settings: scope(), close: () => {} }))

    await screen.findByText('重启后删除队列：1 个会话')

    // Then the queue strip names the queued session, the held chip is shown, and the
    // cancel action reaches the host route as a clear-all
    const pendingStrip = container.querySelector('[data-dsh-part="pending"]')
    expect(pendingStrip?.textContent).toContain('重启后删除队列')
    expect(container.textContent).toContain('进程占用')
    fireEvent.click(screen.getByText('取消重启后删除'))
    await waitFor(() => { expect(clearCalls).toEqual(['all']) })
  })
})
