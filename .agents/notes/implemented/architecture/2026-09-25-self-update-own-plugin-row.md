# Agent Note: the family self-update is its own plugin row

Status: implemented

## Problem

The dsh-web family self-update surface — the sidebar download trigger, its panel, and the `/api/update` routes — shipped inside `dsh-remote-web-ui`. The sidebar foot renders one trigger per plugin row, so the update entry's lifecycle was the remote-access plugin's lifecycle: turning remote access off (`enabled: false`) or disabling the `web-ui-remote-web-ui` row removed the update trigger too. That outcome is reachable without any intent to give up self-update — a profile that disables remote access for security reasons loses its only in-GUI way to update the family.

## Decision

- **The capability owns its own package and row.** `packages/dsh-update` (`@linxin666/dsh-update`) declares row id `update`; the aggregate mounts it as `web-ui-update` / `@linxin666/dsh-web-all/update`, right after the remote-access row.
- **The host half moved with it.** `update.ts` (registry probe, profile anchoring, verified `pnpm update --latest`) and `update-routes.ts` (`/api/update/status`, `/api/update/run`) live in that package; its entry mounts the two exact routes behind the shared `isLoopbackRequest` fence. The fallback anchor package is this package (`SELF_PACKAGE = '@linxin666/dsh-update'`); `@linxin666/dsh-web-all` stays the primary anchor.
- **The browser half owns no visible footer seat.** It registers the `update` dictionary namespace and anonymous heartbeat only; the old `sidebar.footer.action` download trigger is not mounted in browser or desktop pages. The usage statistics trigger owns that visual slot.
- **`dsh-remote-web-ui` keeps only the channel facts about the path.** `/api/update/` stays in its gated-channel tables (the rewrite prefix and the physically-local list): a paired remote must not reach the endpoint, whichever package serves it.
- **The seat geometry stays with the shared footer owner.** The wide-foot row and rail-stacking rules remain in `dsh-remote-web-ui`'s CSS module — they are the official footer action seat's rules, shared by every occupant that opts into `data-dsh-part="entry"` or this plugin's `entryRow` marker.

## Testing

- The moved host specs follow the feature: `packages/dsh-update/tests/update.spec.ts` and `tests/update-routes.spec.ts`. Browser-entry specs assert the client registers dictionaries and heartbeat without any `sidebar.footer.action` contribution.
- New `packages/dsh-update/tests/update-routes.spec.ts` (6) exercises both routes over a real loopback HTTP server: the status/run JSON contracts, the 405 method gates, the non-loopback Host refusal and the cross-site refusal — each asserting the injected seams did not run.
- `pnpm i18n:check` covers the moved 42-key `update` namespace; the ru dictionary moved to `packages/dsh-i18n/src/client/ru/update.ts` and the audit package list gained its row.

## Alternatives considered

- Gating only the remote setting while keeping the update seat mounted inside one package: rejected — the row's own disable switch would still take the update trigger away, and a package named `dsh-remote-web-ui` owning the family updater keeps two capabilities under one owner.
- Two rows from one package: rejected — the client module scanner resolves one `dsh.client` face per package, so both rows would load the same client half and could not be toggled apart.
- Moving the seat geometry into the new package or the aggregate compat layer: rejected — it is the official seat's layout, shared by every occupant; one owner plus the shell's own fallback keeps one home per fact.

## Consequences

- Disabling remote access (the setting or the whole row) keeps the local update routes; disabling `dsh-update` keeps remote access. Each row is toggled on its own in the plugin manager.
- The aggregate carries a package and a row for the host update routes: profiles pinning `@linxin666/dsh-web-all` get `web-ui-update`, and a standalone install needs `@linxin666/dsh-update`.
- A standalone `dsh-update` install anchors on its own package manifest when `@linxin666/dsh-web-all` is absent.
- The ru dictionary, the sync manifest (console-output/http/loopback/mount-once/telemetry/vitest.setup copies) and the i18n audit package list each carry their new consumer row.
- The update package has no visible browser surface, so it contributes no semantic-attribute `entry` or `panel` parts.
