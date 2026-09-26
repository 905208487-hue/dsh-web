# Agent Note: removing the Workshop GUI and the four satellite rows

Status: implemented

## Problem

The operator asked to drop 皮肤 (skins), 宠物 (pet) and 创意工坊 (workshop) from the
settings, and confirmed dropping 预设中心 (preset center) and 社区插件索引 (community
plugin index) along with them. The entries came from `dsh-market` (the Workshop
store plugin) and the four satellite external rows (skin-center / pet /
community-plugins / preset-center) in the aggregate. Disabling at the profile
layer was not enough: a repo-level removal was requested.

## Decision

On 2026-09-26 the family dropped: `packages/dsh-market` (the Workshop store
plugin), the four external rows and their dependencies
(`@linxin666/dsh-client-ui-skin-center`, `@linxin666/dsh-pet`,
`@linxin666/dsh-client-ui-community-plugins`,
`@linxin666/dsh-client-ui-preset-center`), plus the two empty-shell directories
`packages/dsh-preset-center` and `packages/skins`. The aggregate `rows:` is now
empty, the external dependencies were removed from
`packages/dsh-web-all/package.json`, and `market` joined the tombstone export
shells so old profiles can still import the retired sub-paths.

**Kept** is the dsh-market.com site and Worker (`market/`, `scripts/market-*`,
`deploy-market.yml`): the remote-web-ui pairing relay
(`https://<id>.dsh-market.com` register/unregister) and the anonymous telemetry
endpoint (`/api/telemetry/event`) are served by it. The four satellite
repositories stay as git submodules under `satellites/`, purely as content
inputs for the site build; their npm packages moved to root devDependencies
(site inputs) instead of the aggregate. The site build now reads
`market/src/core/installer-limits.ts` (formerly the `MAX_FILES_PER_ASSET` text
constant inside `packages/dsh-market/src/core/installer.ts`).

### Cascades

- The preset-center panel mounted into the workshop card's `dsh-workshop.panel`
  child slot, and the community plugin index was the workshop's data source;
  both went with it.
- The GUI family no longer installs or loads these five plugins. Profiles that
  already carried the rows are covered by the three `disabled: true` overrides
  in `~/.dsh/profiles/web/cordis.patch.yml` (2026-09-26); pre-existing profiles
  need no migration because the external rows are no longer in the manifest.

### Verification

- `node scripts/aggregate.mjs` regenerates cleanly; the patch carries no
  `web-ui-market` / `web-ui-pet` / `web-ui-skin-center` / `web-ui-preset-center`
  / `web-ui-community-plugins` rows.
- The site gate runs `pnpm market:fetch` (materializes the satellite content
  into `.market-inputs/`) followed by `market:check`.