# Agent Note: dsh-quick-restart 快速重启插件

Status: implemented

## Problem

The host process keeps every GUI-opened session in memory until the process
ends. Archived sessions therefore commonly refuse deletion with 「会话仍被 DSH
进程占用，重启服务或关闭该会话后可删除」; configuration and plugin changes
also only load at boot. A restart is the way out, but the service runs detached
(`nohup dsh web`), and reaching for a terminal each time is expensive. The
request: a web-side plugin button that restarts the service quickly.

## Decision

Ship a standalone bundle package `@linxin666/dsh-quick-restart`
(`packages/dsh-quick-restart/`) that seats a 「快速重启 DSH 服务」settings card.
DSH has no restart seam (`apps/cli/src/profile-boot.ts` drains SIGTERM
gracefully but nothing relaunches the service), so the restart is composed of
two steps:

1. `POST /api/dsh-quick-restart/restart` first arms a **dependency-free,
   detached** helper process (`node -e`, stdio ignored, `detached: true`,
   `.unref()`). It polls the loopback port until connections are refused (cap
   40s, interval 800ms), then relaunches `dsh web` from the recorded cwd (node
   plus the entry from `process.argv[1]` when it is a JS file, otherwise the
   `dsh` CLI on PATH), appending stdout/stderr to `/tmp/dsh-web.log` (override
   with `DSH_QUICK_RESTART_LOG`).
2. The route answers `200 {ok:true,reloading:true}` first, then SIGTERMs the
   current process after an 800ms grace; the host's own handler drains and
   exits 0; the helper sees the port free and boots the replacement; the GUI
   reconnects automatically.

### Safety and boundaries

- Every route is loopback-fenced (non-loopback clients get 403, mirroring
  dsh-session-archive semantics); restart accepts POST only; `terminate` runs
  only after the helper is armed and the response is written; failure answers
  500 without terminating.
- The helper must stay dependency-free (its source lives as a plain string in
  `host/restart.ts`'s `helperSource()`), importing no package modules and using
  no build artifacts — it outlives the host.
- This plugin never restarts the service on its own: it only provides the
  button. One manual restart is still needed after mounting to load it.
- Semantic attributes: root container `data-dsh-plugin="quick-restart"`, parts
  use bare `data-dsh-part` (hint/status/error/actions/restart-button). The
  contract-table plugin enumeration updates on the dsh-skins side (no network
  release path just now; recorded here first, the table gets the entry at the
  next dsh-skins contract update).

### Relationship to the in-flight release work

- Mounting this plugin into a profile takes effect immediately; it does not
  wait for 0.4.3. The archival-deletion cure (deferred-delete queue) still
  lives in `ae38511c` (0.4.3); the restart button is its complement and a
  transitional tool — even after the queue ships, restart stays an explicit
  operation users want.
- The running host is still the old dsh 0.1.7-rc.1 (a separate incident);
  this plugin declares `dsh.engines.dsh` and peer `>=0.1.7-rc.1`, matching the
  current family cohort.