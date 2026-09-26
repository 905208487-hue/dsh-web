/**
 * Loopback fence shared by the dsh-quick-restart routes. Restarting the host
 * process is a destructive, service-wide action: tunnels and LAN clients get
 * 403, same as the session-archive management routes.
 * @module @linxin666/dsh-quick-restart/host/loopback
 */

import type { IncomingMessage } from 'node:http'

/** Loopback addresses the web server accepts the fence on. */
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

export function isLoopbackRequest(req: IncomingMessage): boolean {
  const address = req.socket.remoteAddress
  return address !== undefined && LOOPBACK.has(address)
}