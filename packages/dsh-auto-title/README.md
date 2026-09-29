# dsh-auto-title

English | [中文](README.zh.md)

A DSH Web host plugin that updates session titles after completed turns. It adapts the naming workflow of the Codex plugin `oil-oil/oil-codex-title` to DSH Web without Codex hooks or Codex storage.

## What it does

- Polls the DSH session roster from the host side.
- Waits until a session is no longer running and has a completed turn.
- Reads only the recent session history through the official session controller API.
- Calls the configured model route, or the session's last used model when available.
- Renames the session through the official `session.rename` API.
- Stores only per-session bookkeeping under `$DSH_HOME/auto-title/state-v1.json`.

## Configuration

Every field is exposed by the DSH plugin settings form for this profile entry, and every field takes effect immediately without restarting the service. The table lists the field, type, default, accepted range, and effect.

| Field | Type | Default | Range | Effect |
| --- | --- | --- | --- | --- |
| `enabled` | boolean | `true` | - | Master switch. Off stops the poll timer entirely; no model call is made. |
| `modelRoute` | string | `""` | `provider/model` or empty | Title model route. Empty falls back to the session's own last used model; if neither resolves, that session is skipped. |
| `intervalMs` | number | `30000` | 5000..600000 | Poll interval in milliseconds. |
| `recentTurns` | number | `5` | 1..10 | How many recent user turns are sent to the title model. |
| `maxContextChars` | number | `12000` | 1000..40000 | Maximum excerpt size in characters sent to the title model. |
| `maxSessionsPerTick` | number | `2` | 1..10 | Upper bound of sessions processed per poll. |
| `includeSubagents` | boolean | `false` | - | Whether subagent sessions are renamed too. |
| `protectExternalTitles` | boolean | `true` | - | After this plugin wrote a title, a later different title locks that session against further automatic renames. |

### Configuring it

Open the DSH Web settings, find the plugin entry for `dsh-auto-title`, and edit the form there. The values are written into the profile configuration for this entry.

Editing the profile patch by hand also works:

```yaml
- id: ui-dsh-auto-title
  name: '@linxin666/dsh-auto-title'
  config:
    enabled: true
    intervalMs: 15000
    maxSessionsPerTick: 5
    modelRoute: your-provider/your-model
```

### Tuning notes

- Throughput is roughly `maxSessionsPerTick` sessions per `intervalMs`. With the defaults that is 2 sessions every 30 seconds; raising `maxSessionsPerTick` to `5` and lowering `intervalMs` to `10000` handles a large backlog about 7.5x faster at a proportionally higher model cost.
- Leave `modelRoute` empty to follow each session's own model, which avoids hardcoding a provider that may not be routable in every deployment.
- Set `protectExternalTitles` to `false` only if you want the plugin to keep overriding titles you edit by hand.

## Install while developing

```sh
pnpm --filter @linxin666/dsh-auto-title build
dsh plugin --profile web add link:/absolute/path/to/dsh-web/packages/dsh-auto-title
```

Restart the running DSH Web service after installing a new bundle row or after rebuilding the host half. The plugin does not restart the service by itself.

## Limits

This is not the Codex plugin. It does not use Codex Stop Hooks, `/hooks`, `$CODEX_HOME`, or the Codex App Server. It is a DSH Web host plugin and only talks to official DSH session and model services.

DSH Web does not currently expose a reliable manual-title marker. The plugin protects titles it previously wrote, but the first automatic pass cannot always distinguish a pre-existing manual title from a host-generated title.

A model call is required for each renamed session and consumes account quota. Sessions that produce no usable candidate are recorded and not retried until a newer completed turn appears.
