# dsh-quick-restart

English | [中文](README.zh.md)

A DSH web GUI plugin that restarts the running `dsh web` service from the
browser. It seats a first-level settings section (「快速重启 DSH 服务」 /
"Quick restart DSH service") that shows the live service status and a
confirm-gated restart button.

## Why

The DSH host holds every GUI-opened session in memory for the process
lifetime, so archived sessions can report "会话仍被 DSH 进程占用" ("session
still held by the DSH process") and refuse deletion until the service
restarts or the session is closed. A restart also applies configuration and
plugin changes that only load at boot. Instead of opening a terminal, the
settings card triggers the restart directly.

## How it works

The DSH host has no restart seam (SIGTERM is drained gracefully by
`apps/cli/src/profile-boot.ts` but nothing relaunches the service), so the
host half composes the restart from two steps:

1. `POST /api/dsh-quick-restart/restart` arms a **detached** helper
   (`node -e`, dependency-free, stdio ignored) that survives the host's
   death. The helper polls the loopback port until it refuses connections,
   then relaunches `dsh web` from the recorded working directory with
   stdout/stderr appended to the service log.
2. The route replies `200 { ok: true, reloading: true }` and then SIGTERMs
   the current process after a short grace (the host's own handler drains
   state and exits 0). The helper sees the port free and boots the
   replacement; the GUI reconnects automatically.

If the relaunch command cannot be derived (`process.argv[1]` is not a JS
file), the helper falls back to the `dsh` CLI on PATH with the `web`
profile. If your service is launched by a supervisor (for example the
desktop app), the helper's relaunch races with the supervisor — prefer the
supervisor's own restart in that setup.

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