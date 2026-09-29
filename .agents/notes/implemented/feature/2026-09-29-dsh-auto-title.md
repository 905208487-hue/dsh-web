# Agent Note: DSH auto-title host plugin

Status: implemented

## Problem

`oil-oil/oil-codex-title` solves session discoverability for Codex by running a trusted Stop Hook, reading recent local Codex turns, asking a small model for a stable title, and writing the result through Codex's title API. DSH Web has the same user problem but none of the same integration points: Codex plugin manifests, Hook trust, `$CODEX_HOME`, and Codex App Server title calls do not exist in DSH Web. Installing the Codex plugin therefore cannot rename DSH sessions.

## Decision

The repository now carries `packages/dsh-auto-title`, a DSH Web host plugin that ports the behavior at the DSH service boundary instead of the Codex Hook boundary. The plugin mounts as a Cordis bundle row, polls `session/list`, skips running and blank sessions, reads recent history through `session/follow`, and calls the optional `llm` service after a completed turn. It writes accepted titles only through `session/rename` and stores its own bookkeeping under `$DSH_HOME/auto-title/state-v1.json`.

The title model prompt keeps the `oil-codex-title` stability rules in DSH wording: use the recent user's main language, keep object names stable, prefer an object-then-goal title, and keep the old title on confirmation-only turns. The source does not embed category pictographs; the title model may still choose user-language wording at runtime.

The plugin is host-first. Its browser half is intentionally empty because the native DSH plugin configuration form already exposes the bundle Config. Every Config field is marked volatile: the Host projects a settings form only from volatile fields, and the settings write path refuses a non-volatile path, so a plain field would leave the plugin with no form and no GUI write at all. The Config therefore carries the enable switch, optional `provider/model` route, poll interval, excerpt size, recent-turn count, sessions-per-tick cap, subagent inclusion, and external-title protection; the row follows `loader/volatile-update` to re-arm the poll timer and re-resolve the model service at use time. When `modelRoute` is empty the plugin tries the session's last used model from the session-list projection.

Manual-title safety is best-effort because the current DSH Web session summary does not expose a durable marker that distinguishes host-generated titles from explicit human renames. The plugin protects titles after it has written them: if the visible title later differs from the last plugin-written title, that session is marked locked and automatic renaming stops for it.

## Alternatives considered

Adapting the original Codex plugin in place was rejected. Its Stop Hook, Codex CLI adapter, `$CODEX_HOME` layout, and Hook trust UX are Codex-specific; carrying those into DSH Web would either do nothing or require unsafe direct storage edits.

A browser-only plugin was rejected. The browser can observe the UI but cannot reliably read cold session history, call models without leaking policy into the client, or rename sessions after the tab closes. Host-side polling keeps the work in the process that already owns session and model services.

Directly editing session storage was rejected. DSH already exposes `session/rename`; writing storage files would bypass validation, projections, and future storage changes.

Adding this row to `dsh-web-all` immediately was deferred. The current working tree already has unrelated aggregate and client changes, and the first usable port should remain installable as a standalone bundle until the family aggregate can be updated in a clean change.

## Consequences

DSH Web users can install `@linxin666/dsh-auto-title` as a standalone bundle and get automatic completed-turn title maintenance without Codex. A running DSH Web service still needs a restart after the new bundle row is installed; repository rules forbid this plugin from restarting the user's active service during development.

The first automatic pass can rename a pre-existing human title when DSH cannot prove it was human-authored. After the plugin owns a title, later external changes are treated as locks. If DSH later exposes a manual-title projection, this plugin should switch to that stronger signal.
