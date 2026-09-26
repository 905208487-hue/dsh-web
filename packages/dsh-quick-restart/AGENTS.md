# AGENTS.md — dsh-quick-restart

DSH web GUI plugin dsh-quick-restart（包名 `@linxin666/dsh-quick-restart`）。
本包只写本包特有约定，不重复根 AGENTS.md 与 packages/AGENTS.md 的全局/包级规则。

## 本包要点

- 界面只有一处：设置头部动作 `settings.action`（id `quick-restart`，order 10，
  紧挨官方「打开配置文件」的 order 0）；**不注册 `settings.section`**，左侧导航里
  不出现本插件。宿主半区注册回环围栏的
  `/api/dsh-quick-restart/{status,restart}` 路由。
- 重启机制（host/restart.ts）：DSH 没有重启接缝，所以先拉起一个**零依赖、脱离
  终端**的 `node -e` 辅助进程等端口释放后重新 `dsh web`，再给自身发 SIGTERM
  （profile-boot 的优雅退出处理器负责 drain，`HARD_EXIT_AFTER_MS` 后硬退出兜底）。
  辅助进程拉起后会等端口重新应答，并在别的 supervisor 抢端口时重试
  （`SPAWN_ATTEMPTS` / `SPAWN_UP_WAIT_MS`）。辅助进程源码在仓库内以纯字符串
  存在（helperSource），禁止把构建依赖写进去；改等待/轮询常数时同步改 README、
  AGENTS 与 tests/restart.spec.ts 的断言。
- 浏览器侧重启流程：确认 → POST → `faces.waitUntilRestarted(previousPid)` 轮询
  status 直到 pid 变化 → `window.location.reload()`。status 轮询与刷新是该插件
  唯一的后台流量来源，不得常驻轮询。
- 安全红线：`restart` 路由只接受 POST、只接受回环客户端；`terminate` 只在
  辅助进程拉起成功后才调用；失败返回 500 且不终止。不要绕过这道顺序。
- 结构分区：`src/index.ts`（宿主入口，仅注册路由）、`src/host/`（路由与重启
  机制）、`src/client/`（头部按钮、face 类型与文案）。三者各自可独立 typecheck/test。
- 文案：zh 为 key 源，en 完整对照，ru 在 `packages/dsh-i18n/src/client/ru/
  dsh-quick-restart.ts`（改动 zh 键后必须同步 ru 并通过 `pnpm i18n:check`）。
- 语义属性：头部按钮外层容器打 `data-dsh-plugin="quick-restart"`（按钮本体是官方
  primitives Button，不携带部件枚举值）。契约表的插件枚举更新在 dsh-skins 侧
  （无网络发布时先在本包 Agent Note 记录）。

## 提交前检查

```sh
node scripts/...  # 走本仓通用门禁：pnpm typecheck && pnpm test && pnpm i18n:check && pnpm docs:check
node --run typecheck   # 或 ./node_modules/.bin/tsc --noEmit（本机 pnpm 直跑受限）
./node_modules/.bin/vitest run
./node_modules/.bin/tsdown
node scripts/lib-artifact-check.mjs --write   # 改客户端源码后重录聚合指纹
```