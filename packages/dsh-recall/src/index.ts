/**
 * Host entry of the dsh-recall plugin: currently a stub — the host-side
 * rollback route (zstd read, core cut, atomic write) and the browser recall
 * trigger land in the next steps.
 * @module @linxin666/dsh-recall
 */

export const name = 'dsh-recall'

/** Stub apply; the real route is wired in a later step. */
export function apply(): void {
  // noop until the rollback route lands
}
