# AGENTS.md — dsh-quick-restart

DSH web GUI plugin dsh-quick-restart（包名 `@linxin666/dsh-quick-restart`）。
本包只写本包特有约定，不重复根 AGENTS.md 与 packages/AGENTS.md 的全局/包级规则。

## 本包要点

- 在浏览器设置区提供「快速重启 DSH 服务」：宿主半区注册回环围栏的
  `/api/dsh-quick-restart/{status,restart}` 路由，浏览器半区在
  `settings.section` 槽位（id `dsh-quick-restart`，order 9000）挂载设置卡。
- 重启机制（host/restart.ts）：DSH 没有重启接缝，所以先拉起一个**零依赖、脱离
  终端**的 `node -e` 辅助进程等端口释放后重新 `dsh web`，再给自身发 SIGTERM
  （profile-boot 的优雅退出处理器负责 drain）。辅助进程源码在仓库内以纯字符串
  存在（helperSource），禁止把构建依赖写进去；改端口等待/轮询常数时同步改
  README 与 tests/restart.spec.ts 的断言。
- 安全红线：`restart` 路由只接受 POST、只接受回环客户端；`terminate` 只在
  辅助进程拉起成功后才调用；失败返回 500 且不终止。不要绕过这道顺序。
- 结构分区：`src/index.ts`（宿主入口，仅注册路由）、`src/host/`（路由与重启
  机制）、`src/client/`（设置卡与文案）。三者各自可独立 typecheck/test。
- 文案：zh 为 key 源，en 完整对照，ru 在 `packages/dsh-i18n/src/client/ru/
  dsh-quick-restart.ts`（改动 zh 键后必须同步 ru 并通过 `pnpm i18n:check`）。
- 语义属性：根容器 `data-dsh-plugin="quick-restart"`，部件用裸值 `data-dsh-part`
  （hint / status / error / actions / restart-button）。契约表的枚举更新在
  dsh-skins 侧（无网络发布时先在本包 Agent Note 记录）。

## 提交前检查

```sh
node scripts/...  # 走本仓通用门禁：pnpm typecheck && pnpm test && pnpm i18n:check && pnpm docs:check
node --run typecheck   # 或 ./node_modules/.bin/tsc --noEmit（本机 pnpm 直跑受限）
./node_modules/.bin/vitest run
./node_modules/.bin/tsdown
node scripts/lib-artifact-check.mjs --write   # 改客户端源码后重录聚合指纹
```