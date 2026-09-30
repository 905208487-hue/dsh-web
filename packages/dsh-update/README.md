# dsh-update

English | [中文](README.zh.md)
> Family self-update host routes for the dsh web GUI: loopback-only endpoints probe npm for newer `@linxin666/dsh-web-*` releases and can run the owning profile's `pnpm update --latest` in place.

This repository is an external plugin package for DeepSeek Harness (DSH). It is a dual-face package: the host half mounts the `/api/update` route family, and the browser half only registers the locale namespace and heartbeat. The Web GUI no longer renders a left-sidebar download/update button; that footer position belongs to Usage statistics and the remote-access phone trigger.

The capability is deliberately **its own plugin row** (row id `update`, aggregate row `web-ui-update`) rather than a seat of `dsh-remote-web-ui`: turning remote access off — or disabling the remote-access plugin entirely — must never affect the update host routes.

## What it does

- **No left-footer trigger**: the package does not register into `sidebar.footer.action`; the former download button is removed so Usage statistics occupies that sidebar foot position.
- **Browser half without UI**: the client registers the `update` locale namespace and telemetry heartbeat only. The official DSH Desktop shell keeps its own updater, and browser pages also avoid a dsh-update sidebar seat.
- **Verified install**: the run endpoint executes `pnpm update --latest` in the
  profile the web GUI was booted from, then re-reads the installed versions. The
  pnpm 11 `minimumReleaseAge` gate can silently keep same-day releases, so a
  green exit alone is not reported as success.
- **Release notes**: the panel fetches the matching GitHub release notes and lists
  the component versions it moved.
- **Restart hint**: a successful update asks the user to restart `dsh web`, which
  is when the new package versions load.

## Requirements

- DSH `>= 0.2.0-rc.2`.
- The profile must own the family packages through npm: the aggregate
  `@linxin666/dsh-web-all`, or the family packages installed directly. A profile
  whose family is installed with local `link:` specs is reported as **local
  development mode** and the update is refused (sync the checkout instead).

## Install

```sh
# Recommended: install directly from npm
dsh plugin --profile <profile> add @linxin666/dsh-update

# Or from a checkout (development loop)
dsh plugin --profile <profile> add link:<repo>/packages/dsh-update
```

In the family aggregate the row is already present; disable it per row in the
plugin manager if a profile should not offer self-update.

## Configuration

The plugin ships no settings namespace of its own: a profile either mounts the row or not, and the plugin manager's per-row switch is the only control. The host surface is fixed — the two loopback routes below — and the browser half deliberately registers no sidebar footer entry.

## Use

There is no sidebar control for this package in the Web GUI. The host routes stay mounted for trusted local callers and future update surfaces; after a successful update run, restart `dsh web` for the new packages to load.

## Routes

Both routes are exact matches on the host web server and answer only to the local
machine:

| Route | Method | Meaning |
| --- | --- | --- |
| `/api/update/status` | GET | Registry probe: install mode, owning profile, per-package current/latest, release notes |
| `/api/update/run` | POST | Runs the verified `pnpm update --latest` in the owning profile |

A paired remote desktop reaches them through the `dsh-remote-web-ui` gated
`/remote/api` channel, which is why that plugin's channel rules keep
`/api/update/` on the paired path.

## Security model

- **The run endpoint executes a real install on this machine.** It is fenced to
  the loopback authority and refuses cross-site browser markers, so a LAN or
  tunnel origin can never trigger it directly.
- **The update target is the host process's own module graph.** The anchor
  manifest is resolved from the running host (`@linxin666/dsh-web-all` first,
  falling back to this package), so the update always writes the profile that
  serves the page — never a path supplied by the client.
- **Local links are refused**, not rewritten: a `link:` spec cannot be updated
  from the registry, and silently replacing it would detach the user's checkout.
- The panel prints the captured pnpm output, which can contain local paths. No
  credentials are read from or written to the profile by this plugin.

## Known limitations

- A profile whose family packages are installed with local `link:` specs reports
  local development mode and cannot self-update; sync the checkout instead.
- `pnpm` must be resolvable on the host (`pnpm`, `corepack`, or `npx`); the panel
  names the candidate that failed when none works.
- pnpm 11's `minimumReleaseAge` gate can hold back same-day releases. When the
  installed versions did not move, the panel explains the
  `minimumReleaseAgeExclude` / `minimumReleaseAge: 0` remedy.
- The captured pnpm output is shown verbatim and can contain local paths.
- This package currently exposes no first-party browser control; it only serves the loopback update routes and client dictionaries.

## Development

```sh
pnpm --filter @linxin666/dsh-update typecheck
pnpm --filter @linxin666/dsh-update test
pnpm --filter @linxin666/dsh-update build
```

## Checks

Focused gates: `pnpm --filter @linxin666/dsh-update test`, `pnpm typecheck`,
`pnpm test:standards`, and `pnpm libs:check` after the aggregate is rebuilt.

## Telemetry

One anonymous install heartbeat per browser per UTC day (package name only, silent
failure), following `docs/telemetry.md`. No session content, paths, or update
results are reported.

## Dependency rationale

`@deepseek-ai/*` entries are the official SDK used for types and host faces;
`react`/`react-dom` are the GUI's own platform modules. The
`@deepseek-ai/dsh-client-ui-primitives` icons ride the platform module table.
