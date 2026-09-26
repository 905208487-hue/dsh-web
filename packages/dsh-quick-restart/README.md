# dsh-quick-restart

English | [中文](README.zh.md)

A DSH web GUI plugin that restarts the running `dsh web` service from the
browser. It seats a confirm-gated 「重启 DSH 服务」button in the settings header,
beside 「打开配置文件」, and adds no left-navigation entry.

## Why

The DSH host holds every GUI-opened session in memory for the process
lifetime, so archived sessions can report "会话仍被 DSH 进程占用" ("session
still held by the DSH process") and refuse deletion until the service
restarts or the session is closed. A restart also applies configuration and
plugin changes that only load at boot. Instead of opening a terminal, the
header button triggers the restart directly.

## How it works

The DSH host has no restart seam (SIGTERM is drained gracefully by
`apps/cli/src/profile-boot.ts` but nothing relaunches the service), so the
host half composes the restart from two steps:

1. `POST /api/dsh-quick-restart/restart` arms a **detached** helper
   (`node -e`, dependency-free, stdio ignored) that survives the host's
   death. The helper polls the loopback port until it refuses connections,
   then relaunches `dsh web` from the recorded working directory with
   stdout/stderr appended to the service log. It then waits for the port to
   answer again and retries the spawn (up to three attempts) when another
   supervisor races for the same port.
2. The route replies `200 { ok: true, reloading: true }` and then SIGTERMs
   the current process after a short grace (the host's own handler drains
   state and exits 0, with a hard exit as the fallback when the drain stalls).
   The helper sees the port free and boots the replacement.

The browser half then waits for the replacement: it polls the status route
until the reported pid differs from the one captured before the restart and
reloads the page, so the GUI reconnects without a manual refresh.

## Where it appears

- **Settings header action**: a compact 「重启 DSH 服务」button in the
  `settings.action` slot, beside 「打开配置文件」. Its tooltip carries the
  restart hint, or the failure message when one occurs.
- **No navigation entry**: the plugin registers no `settings.section`, so it
  adds nothing to the settings sidebar.

## Known limitations

- A deployment that runs its own supervisor for `dsh web` (the desktop app, a
  launch agent, a pending plugin-manager restart) races this plugin for the
  port. The helper retries until one of them serves the port, but the winning
  launcher decides the final invocation flags.
- The page reload is what completes the reconnect; a browser that blocks
  reloads (`window.location.reload`) leaves the operator with the manual
  refresh.

If the relaunch command cannot be derived (`process.argv[1]` is not a JS
file), the helper falls back to the `dsh` CLI on PATH with the `web`
profile.

## Routes

All routes are loopback-fenced (tunnels and LAN clients get 403).

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/dsh-quick-restart/status` | Live status: `pid`, `port`, `startedAt` |
| POST | `/api/dsh-quick-restart/restart` | Arm the helper, reply, terminate the host |

## Install

Standalone into a profile:

```sh
dsh plugin --profile web add link:<repo>/packages/dsh-quick-restart
```

Inside the dsh-web monorepo the package is also part of the aggregate: add
`../dsh-quick-restart` to `packages/dsh-web-all/aggregate.yml` (patchFrom and
deps) and rerun `node scripts/aggregate.mjs`.

After mounting, the service needs one manual restart for the plugin to load
(this plugin then provides the button for subsequent restarts).

## Configuration

- `DSH_QUICK_RESTART_LOG` (host environment): log file the relaunched
  process appends to; defaults to `/tmp/dsh-web.log`.

## Safety notes

- The restart interrupts the current conversation and background tasks; the
  GUI reconnects automatically (roughly 10–30 seconds).
- The host half never terminates the process unless a loopback client
  confirms a restart over POST and the helper is armed first.
- This plugin does not restart the service by itself — it only provides the
  button; you decide when to press it.