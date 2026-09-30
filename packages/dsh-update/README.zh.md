# dsh-update

[English](README.md) | 中文
> dsh web GUI 家族自更新宿主路由：仅限回环访问的端点探测 npm 上更新的 `@linxin666/dsh-web-*` 版本，并可在当前 profile 内执行 `pnpm update --latest`。

本仓库是 DeepSeek Harness（DSH）的外部插件包，双半区结构：host 半区挂载 `/api/update` 路由族，browser 半区只注册语言命名空间与心跳。Web GUI 不再渲染左侧栏下载/更新按钮；该脚部位置留给使用统计与手机远程触发器。

该能力刻意做成**独立插件行**（行 id `update`，聚合行 `web-ui-update`），而不是 `dsh-remote-web-ui` 的一个席位：关闭远程访问、甚至整体禁用远程访问插件，都不影响更新宿主路由。

## 功能

- **无左侧脚部触发器**：本包不再注册 `sidebar.footer.action`；旧下载按钮已移除，让使用统计占用该侧栏脚部位置。
- **无 UI 的浏览器半区**：客户端只注册 `update` 语言命名空间与遥测心跳。官方 DSH 桌面外壳使用自己的更新器，浏览器页面同样不放置 dsh-update 侧栏席位。
- **带核对的安装**：run 端点在该 Web GUI 启动的 profile 内执行
  `pnpm update --latest`，随后重新读取安装版本。pnpm 11 的 `minimumReleaseAge`
  门禁可能静默跳过当日发布，因此只看 pnpm 退出码为 0 不会报告成功。
- **发布说明**：面板拉取对应 GitHub Release 说明，并列出本次实际变动的组件版本。
- **重启提示**：更新成功后提示重启 `dsh web`——新版本要重启才会加载。

## 环境要求

- DSH `>= 0.2.0-rc.2`。
- profile 需通过 npm 持有家族包：聚合包 `@linxin666/dsh-web-all`，或直接安装的
  家族包。家族包以本地 `link:` 方式安装的 profile 会报告为**本地开发模式**并拒绝
  更新（请改为同步本地仓库）。

## 安装

```sh
# 推荐：直接从 npm 安装
dsh plugin --profile <profile> add @linxin666/dsh-update

# 或从检出安装（开发环）
dsh plugin --profile <profile> add link:<repo>/packages/dsh-update
```

装在全家桶里时该行已经存在；若某个 profile 不需要自更新，在插件管理里按行关闭即可。

## 配置

本插件不自带设置命名空间：profile 要么挂载该行、要么不挂载，插件管理里的按行开关是唯一控制项。宿主面是固定的——下面两条回环路由——浏览器半区刻意不注册侧栏脚部入口。

## 使用

本包在 Web GUI 中没有侧栏控制。宿主路由仍为受信任的本地调用方与后续更新表面保留；更新成功后重启 `dsh web` 让新版本生效。

## 路由

两条路由都是宿主 web server 上的精确匹配，且只对**本机**应答：

| 路由 | 方法 | 含义 |
| --- | --- | --- |
| `/api/update/status` | GET | 探测 registry：安装模式、所属 profile、各包当前/最新版本、发布说明 |
| `/api/update/run` | POST | 在所属 profile 内执行带版本核对的 `pnpm update --latest` |

已配对的远程桌面经 `dsh-remote-web-ui` 的门控 `/remote/api` 通道访问它们，这也是
该插件的通道规则继续把 `/api/update/` 留在配对路径上的原因。

## 安全模型

- **run 端点会在本机执行真实安装。** 它被限制在 loopback 权威内，并拒绝跨站浏览器
  标记，局域网或隧道来源无法直接触发。
- **更新目标来自宿主进程自身的模块图。** 锚点 manifest 由运行中的宿主解析
  （先 `@linxin666/dsh-web-all`，缺失时回退本包），因此更新永远写入正在提供页面
  的那个 profile，而不会采用客户端给出的路径。
- **本地 link 一律拒绝**，不做改写：`link:` 规格无法从 registry 更新，静默替换会
  让用户的检出脱离。
- 面板会原样展示捕获的 pnpm 输出，其中可能包含本地路径。本插件不读取也不写入任何
  凭据。

## 已知限制

- 家族包以本地 `link:` 规格安装的 profile 会报告本地开发模式，无法自更新；请改为
  同步本地检出。
- 宿主需能解析到 `pnpm`（`pnpm`、`corepack` 或 `npx`）；都不可用时面板会点名
  失败的候选命令。
- pnpm 11 的 `minimumReleaseAge` 门禁可能压住当日发布。安装版本没有变化时，面板
  会给出 `minimumReleaseAgeExclude` / `minimumReleaseAge: 0` 的处置办法。
- 捕获的 pnpm 输出会原样展示，其中可能包含本地路径。
- 本包目前不提供一等浏览器控制，只提供回环更新路由与客户端字典。

## 开发

```sh
pnpm --filter @linxin666/dsh-update typecheck
pnpm --filter @linxin666/dsh-update test
pnpm --filter @linxin666/dsh-update build
```

## 检查

聚焦门禁：`pnpm --filter @linxin666/dsh-update test`、`pnpm typecheck`、
`pnpm test:standards`，以及聚合重建后的 `pnpm libs:check`。

## 遥测

遵循 `docs/telemetry.md`：每个浏览器每个 UTC 日一次匿名安装心跳（仅包名，失败静默）。
不上报会话内容、路径或更新结果。

## 依赖说明

`@deepseek-ai/*` 是官方 SDK（类型与宿主面）；`react` / `react-dom` 是 GUI 自身的
平台模块；`@deepseek-ai/dsh-client-ui-primitives` 图标走平台模块表。
