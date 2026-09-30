# Agent Note: 家族自更新成为独立插件行

Status: implemented

## 问题

dsh-web 家族的自更新面——侧栏下载触发器、其面板与 `/api/update` 路由——原先装在 `dsh-remote-web-ui` 里。侧栏底部每个插件行渲染自己的触发器，于是更新入口的生命周期就是远程访问插件的生命周期：关闭远程访问（`enabled: false`）或禁用 `web-ui-remote-web-ui` 行，更新触发器一起消失。这并不需要任何「放弃自更新」的意图——为安全关闭远程访问的 profile 会失去界面内唯一更新家族的途径。

## 决策

- **该能力拥有自己的包与行。** `packages/dsh-update`（`@linxin666/dsh-update`）声明行 id `update`；聚合包以 `web-ui-update` / `@linxin666/dsh-web-all/update` 挂载，紧跟远程访问行之后。
- **host 半区随功能一起迁出。** `update.ts`（registry 探测、profile 锚定、带核对的 `pnpm update --latest`）与 `update-routes.ts`（`/api/update/status`、`/api/update/run`）落在该包；其入口把两条精确路由挂在共享的 `isLoopbackRequest` 栅栏之后。回退锚点包改为本包（`SELF_PACKAGE = '@linxin666/dsh-update'`），`@linxin666/dsh-web-all` 仍是首选锚点。
- **browser 半区不拥有可见 footer 席位。** 它只注册 `update` 字典命名空间与匿名心跳；旧的 `sidebar.footer.action` 下载触发器不在浏览器页或桌面页挂载。使用统计触发器承接这个可视位置。
- **`dsh-remote-web-ui` 只保留与该路径相关的通道事实。** `/api/update/` 仍留在它的门控通道表（改写前缀与物理本地清单）里：不论由哪个包提供，配对远程都不能到达该端点。
- **席位几何保持在共享 footer 属主处。** 宽栏底栏行与栏轨堆叠规则仍留在 `dsh-remote-web-ui` 的 CSS module——它们是官方 footer action 席位的规则，供任何接受 `data-dsh-part="entry"` 或本插件 `entryRow` 标记的占据者共享。

## 测试

- 迁出的宿主测试随功能走：`packages/dsh-update/tests/update.spec.ts` 与 `tests/update-routes.spec.ts`。浏览器入口测试断言 client 只注册字典与心跳，不向 `sidebar.footer.action` 注入任何条目。
- 新增 `packages/dsh-update/tests/update-routes.spec.ts`（6）在真实 loopback HTTP 服务上跑两条路由：status/run 的 JSON 契约、405 方法门、非回环 Host 拒绝与跨站拒绝——每条都断言注入的接缝未被执行。
- `pnpm i18n:check` 覆盖迁出的 42 键 `update` 命名空间；ru 字典移至 `packages/dsh-i18n/src/client/ru/update.ts`，审计包清单同步加行。

## 备选方案

- 在同一个包里只给远程设置加开关、保留更新席位挂载：否决——行自身的禁用开关仍会把更新触发器带走，而名为 `dsh-remote-web-ui` 的包持有家族更新器会让两个能力同属一个属主。
- 同一个包出两行：否决——客户端模块扫描器对每个包只解析一份 `dsh.client` 面，两行会加载同一个客户端半区，无法分别开关。
- 把席位几何移进新包或聚合 compat 层：否决——它是官方席位的布局，所有占据者共享；单一属主加 shell 自带回落才符合「一个事实一个家」。

## 后果

- 关闭远程访问（设置或整行）保留本地更新路由；禁用 `dsh-update` 保留远程访问。每行在插件管理里各自开关。
- 聚合包携带一个提供宿主更新路由的包与行：钉住 `@linxin666/dsh-web-all` 的 profile 会拿到 `web-ui-update`；单独安装需要 `@linxin666/dsh-update`。
- 在缺少 `@linxin666/dsh-web-all` 时，单独安装的 `dsh-update` 以自己的包清单为锚点。
- ru 字典、同步清单（console-output/http/loopback/mount-once/telemetry/vitest.setup 副本）与 i18n 审计包清单都新增了对应的消费者行。
- update 包没有可见浏览器界面，因此不贡献语义属性 `entry` 或 `panel` 部件。
