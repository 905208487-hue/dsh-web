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

/** How many times the helper spawns a replacement before giving up. */
export const SPAWN_ATTEMPTS = 3

/** How long the helper waits for a spawned replacement to answer (ms). */
export const SPAWN_UP_WAIT_MS = 20_000

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
 *
 * The helper waits for the port to free, spawns the replacement, then *verifies*
 * the port is served again — another supervisor (the plugin manager's pending
 * restart, a launch agent) may race for the same port, so a spawn that dies with
 * EADDRINUSE is retried until either the port answers or the attempt budget
 * runs out.
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
    "const probe = () => new Promise((resolve) => {",
    "  const socket = net.connect({ host: '127.0.0.1', port: RS_PORT });",
    "  socket.once('connect', () => { socket.destroy(); resolve(true); });",
    "  socket.once('error', () => resolve(false));",
    "});",
    "const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));",
    '(async () => {',
    '  const freeDeadline = Date.now() + ' + PORT_FREE_WAIT_MS + ';',
    '  while (Date.now() < freeDeadline) {',
    '    if (!(await probe())) break;',
    '    await sleep(' + PORT_FREE_POLL_MS + ');',
    '  }',
    '  if (await probe()) process.exit(1);',
    "  const fd = fs.openSync(RS_LOG, 'a');",
    "  const args = RS_ENTRY ? [RS_ENTRY, 'web'] : ['dsh', 'web'];",
    "  const command = RS_ENTRY ? RS_NODE : 'dsh';",
    '  for (let attempt = 0; attempt < ' + SPAWN_ATTEMPTS + '; attempt += 1) {',
    "    const child = spawn(command, args, { cwd: RS_CWD, detached: true, stdio: ['ignore', fd, fd], env: process.env });",
    '    child.unref();',
    '    const upDeadline = Date.now() + ' + SPAWN_UP_WAIT_MS + ';',
    '    while (Date.now() < upDeadline) {',
    '      await sleep(1000);',
    '      if (await probe()) process.exit(0);',
    '    }',
    '  }',
    '  process.exit(3);',
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
 * The host's profile-boot handler drains and exits 0. A stalled drain must not
 * leave the port bound forever (the helper waits for it), so a hard `exit(0)`
 * fires when the graceful path has not finished within {@link HARD_EXIT_AFTER_MS}.
 */
export function scheduleTermination(graceMs = 800): void {
  setTimeout(() => {
    try {
      process.kill(process.pid, 'SIGTERM')
    } catch {
      process.exit(0)
    }
  }, graceMs)
  setTimeout(() => {
    process.exit(0)
  }, graceMs + HARD_EXIT_AFTER_MS).unref?.()
}

/** How long the graceful shutdown may take before the hard exit (ms). */
export const HARD_EXIT_AFTER_MS = 9_000