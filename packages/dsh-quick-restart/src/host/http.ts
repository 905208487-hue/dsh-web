/**
 * Minimal JSON response helper for the dsh-quick-restart routes.
 * @module @linxin666/dsh-quick-restart/host/http
 */

import type { ServerResponse } from 'node:http'

export function writeJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    ...headers,
  })
  res.end(payload)
}