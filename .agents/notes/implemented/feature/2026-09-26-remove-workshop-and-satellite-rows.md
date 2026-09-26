# Agent Note: 移除创意工坊 GUI 与四个卫星行

Status: implemented

## Problem

用户要求从设置里去掉「皮肤」「宠物」「创意工坊」（并连带确认去掉「预设中心」「社区
插件索引」）。这三类入口来自聚合包里的 `dsh-market`（创意工坊商店）与四张卫星外部行
（skin-center / pet / community-plugins / preset-center）。工业界习惯做法是仅在大厅
停用，但用户要求仓库级删除。

## Decision

2026-09-26 从家族中移除：`packages/dsh-market`（创意工坊商店插件）、四张外部行与
其依赖（`@linxin666/dsh-client-ui-skin-center`、`@linxin666/dsh-pet`、
`@linxin666/dsh-client-ui-community-plugins`、`@linxin666/dsh-client-ui-preset-center`），
以及 `packages/dsh-preset-center`、`packages/skins` 两个空壳目录。聚合
`rows:` 置空、`dsh-web-all/package.json` 的外部依赖删除、`market` 加入 tombstone
导出空壳（老 profile 仍可 import 旧子路径）。

**保留** dsh-market.com 站点与 Worker（`market/`、`scripts/market-*`、
`deploy-market.yml`）：远程 Web UI 的配对中继（`https://<id>.dsh-market.com` 的
relay 注册/反注册）与匿名遥测端点（`/api/telemetry/event`）由它承载。四个卫星仓
保留为 `satellites/` 下的 git submodule，纯做站点构建内容输入；其 npm 包改为根
devDependencies（站点输入），不再随聚合安装。站点构建改读
`market/src/core/installer-limits.ts`（原本读 `packages/dsh-market/src/core/
installer.ts` 里的 `MAX_FILES_PER_ASSET` 文本常量）。

### 连锁

- 预设中心的面板挂在创意工坊卡片的 `dsh-workshop.panel` 子槽位；社区插件索引是
  工坊的数据源。二者随之移除。
- GUI 侧不再安装/加载这五个插件；用户当前 profile 里由
  `~/.dsh/profiles/web/cordis.patch.yml` 的三条 `disabled: true` 覆盖确保老
  profile 重启后不加载（2026-09-26 之前的配置不需要迁移：外部行已不在清单里）。

### 验证

- `node scripts/aggregate.mjs` 重生成通过；patch 中无 `web-ui-market` /
  `web-ui-pet` / `web-ui-skin-center` / `web-ui-preset-center` /
  `web-ui-community-plugins`。
- 站点门禁在跑 `pnpm market:fetch`（拉取卫星内容到 `.market-inputs/`）后由
  `market:check` 验证。