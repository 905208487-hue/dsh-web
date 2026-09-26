/**
 * Restart orchestration for the dsh-quick-restart plugin.
 *
 * The DSH host does not expose a restart seam: `apps/cli/src/profile-boot.ts`
 * registers SIGTERM -> graceful teardown (exit 0) but nothing relaunches the
 * service. So the restart is two steps:
 *
 *   1. armRestart() spawns a *detached* helper (`node -e`, stdio ignored) that
 *      survives the host's death, polls the loopback port until it refuses
 *      connections, then relaunches `dsh web` from the recorded working
 *      directory with stdout/stderr appended to the same log file.
 *   2. scheduleTermination() SIGTERMs the current process after a short grace
 *      so the HTTP response flushes first; the host's own handler drains and
 *      exits, the helper sees the port free and boots the replacement.
 *
 * The helper is deliberately dependency-free (raw `node -e`, no imports) so it
 * keeps running after the host dies and needs no installed module tree.
 * @module @linxin666/dsh-quick-restart/host/restart
 */

import { spawn } from 'node:child_process'

/** Where the relaunched `dsh web` should end up. */
export interface RestartTarget {
  /** Loopback port the current web server listens on. */
  port: number
  /** Working directory for the relaunched process. */
  cwd: string
  /** Log file the relaunched process appends stdout/stderr to. */
  log: string
}

/** How to relaunch `dsh web` on this host. */
export interface RelaunchCommand {
  /** The node executable that runs the current host. */
  node: string
  /** The host entry script (process.argv[1]) when it looks like a JS file. */
  entry: string | null
}

/** Minimal spawn result the restarter needs. */
export interface SpawnedChild {
  unref(): void
}

export type SpawnNode = (
  args: string[],
  options: { env: NodeJS.ProcessEnv; detached: boolean; stdio: 'ignore' },
) => SpawnedChild

/** How long the helper waits for the port to free before giving up (ms). */
export const PORT_FREE_WAIT_MS = 40_000

/** Poll interval while waiting for the port to free (ms). */
export const PORT_FREE_POLL_MS = 800

/**
 * Derive the relaunch command from the running process. When `dsh web` boots
 * `lib/bin.js`, argv[1] is that script and node spawns it directly; otherwise
 * fall back to the `dsh` CLI on PATH.
 */
export function relaunchCommand(argv: string[] = process.argv, execPath: string = process.execPath): RelaunchCommand {
  const candidate = typeof argv[1] === 'string' ? argv[1] : ''
  const entry = /\.(c|m)?js$/i.test(candidate) ? candidate : null
  return { node: execPath, entry }
}

/**
 * The detached helper program. Carried over env: RS_PORT (listening port),
 * RS_CWD (working directory), RS_LOG (append log path), RS_NODE / RS_ENTRY
 * (relaunch command; empty RS_ENTRY means the `dsh` CLI on PATH).
 */
export function helperSource(): string {
  return [
    "const RS_PORT = Number(process.env.RS_PORT) || 3080;",
    "const RS_CWD = process.env.RS_CWD || process.cwd();",
    "const RS_LOG = process.env.RS_LOG || '/tmp/dsh-web.log';",
    "const RS_NODE = process.env.RS_NODE || process.execPath;",
    "const RS_ENTRY = process.env.RS_ENTRY || '';",
    "const net = require('net');",
    "const fs = require('fs');",
    "const { spawn } = require('child_process');",
    "const free = () => new Promise((resolve) => {",
    "  const socket = net.connect({ host: '127.0.0.1', port: RS_PORT });",
    "  socket.once('connect', () => { socket.destroy(); resolve(false); });",
    "  socket.once('error', () => resolve(true));",
    "});",
    "const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));",
    '(async () => {',
    '  const deadline = Date.now() + ' + PORT_FREE_WAIT_MS + ';',
    '  let down = false;',
    '  while (Date.now() < deadline) {',
    '    if (await free()) { down = true; break; }',
    '    await sleep(' + PORT_FREE_POLL_MS + ');',
    '  }',
    '  if (!down) process.exit(1);',
    "  const fd = fs.openSync(RS_LOG, 'a');",
    "  const args = RS_ENTRY ? [RS_ENTRY, 'web'] : ['dsh', 'web'];",
    "  const command = RS_ENTRY ? RS_NODE : 'dsh';",
    '  const child = spawn(command, args, { cwd: RS_CWD, detached: true, stdio: [\'ignore\', fd, fd], env: process.env });',
    '  child.unref();',
    '})().catch(() => process.exit(2));',
  ].join('\n')
}

export interface RestartOutcome {
  ok: boolean
  error?: string
}

/**
 * Spawn the detached relaunch helper. Returns ok once the helper is running;
 * the helper itself decides later whether a replacement actually boots.
 */
export function armRestart(
  target: RestartTarget,
  command: RelaunchCommand,
  spawnNode: SpawnNode = (args, options) => spawn(command.node, args, options),
): RestartOutcome {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    RS_PORT: String(target.port),
    RS_CWD: target.cwd,
    RS_LOG: target.log,
    RS_NODE: command.node,
    RS_ENTRY: command.entry ?? '',
  }
  try {
    const child = spawnNode(['-e', helperSource()], { env, detached: true, stdio: 'ignore' })
    child.unref()
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * SIGTERM this process after a grace period so the HTTP response flushes.
 * The host's profile-boot handler drains and exits 0; `exit(0)` is a fallback
 * in case the signal handler is unavailable.
 */
export function scheduleTermination(graceMs = 800): void {
  setTimeout(() => {
    try {
      process.kill(process.pid, 'SIGTERM')
    } catch {
      process.exit(0)
    }
  }, graceMs)
}