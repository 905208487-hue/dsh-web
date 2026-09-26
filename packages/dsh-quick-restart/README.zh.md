# dsh-quick-restart

[English](README.md) | 中文

一个在浏览器里直接重启正在运行的 `dsh web` 服务的 DSH web GUI 插件。它在设置头部
「打开配置文件」旁提供一个需确认的「重启 DSH 服务」按钮，不新增左侧导航项。

## 为什么需要它

DSH 宿主在进程生命周期内会把所有在 GUI 打开的会话留在内存里，因此归档会话可能
显示「会话仍被 DSH 进程占用」并拒绝删除，直到服务重启或会话被关闭。重启也会让
只在启动时加载的配置与插件变更生效。这个头部按钮让你不用打开终端，直接触发重启。

## 工作原理

DSH 宿主没有内置重启接缝（`apps/cli/src/profile-boot.ts` 对 SIGTERM 做优雅退出，
但没有任何东西负责重新拉起服务），所以宿主半区用两步拼出重启：

1. `POST /api/dsh-quick-restart/restart` 先拉起一个**脱离终端**的辅助进程
   （`node -e`，零依赖，stdio 忽略），它会在宿主死后继续存活：轮询回环端口直到
   拒绝连接，然后用记录的 working directory 重新拉起 `dsh web`，stdout/stderr
   追加到服务日志。拉起后它会等端口重新应答，并在别的 supervisor 抢同一端口时
   重试拉起（最多三次）。
2. 路由先回 `200 { ok: true, reloading: true }`，随后在短暂宽限后给当前进程发
   SIGTERM（宿主自己的处理器会排空状态并以 0 退出；排空卡住时用硬退出兜底）。
   辅助进程看到端口释放后拉起替代进程。

浏览器半区随后等待替代进程：轮询状态路由，直到返回的 pid 与重启前捕获的不同，
然后刷新页面，因此 GUI 无需手动刷新即可恢复连接。

## 界面位置

- **设置头部动作**：`settings.action` 槽位里的紧凑「重启 DSH 服务」按钮，紧挨
  「打开配置文件」；它的 tooltip 承载重启提示，出错时承载错误信息。
- **无导航项**：插件不注册 `settings.section`，因此设置侧边栏里不会出现这一项。

## 已知限制

- 自带 supervisor 的部署（桌面版、launch agent、插件管理器里挂起的重启）会与本插件
  抢端口。辅助进程会重试到某一方成功伺服端口为止，最终由胜出的拉起方决定启动参数。
- 自动重连由页面刷新完成；浏览器若禁止 `window.location.reload`，就只能手动刷新。

若无法从 `process.argv[1]` 推导重启命令（不是 JS 文件），辅助进程回退到 PATH
上的 `dsh` CLI 的 `web` profile。

## 路由

所有路由都是回环围栏（隧道与局域网客户端一律 403）。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/api/dsh-quick-restart/status` | 实时状态：`pid`、`port`、`startedAt` |
| POST | `/api/dsh-quick-restart/restart` | 拉起辅助进程、应答、终止宿主 |

## 安装

独立装入 profile：

```sh
dsh plugin --profile web add link:<repo>/packages/dsh-quick-restart
```

在 dsh-web monorepo 内该包也属于聚合包：把 `../dsh-quick-restart` 加进
`packages/dsh-web-all/aggregate.yml`（patchFrom 与 deps）并重跑
`node scripts/aggregate.mjs`。

挂载后需要手动重启一次服务让插件加载（之后的重启就由这个按钮负责）。

## 配置

- `DSH_QUICK_RESTART_LOG`（宿主环境变量）：重新拉起进程追加写入的日志文件，
  默认 `/tmp/dsh-web.log`。

## 安全说明

- 重启会中断当前对话与后台任务；GUI 会自动重连（约 10–30 秒）。
- 宿主半区只有在回环客户端通过 POST 确认重启、且辅助进程已先拉起后才会终止
  进程。
- 这个插件不会自己重启服务——它只提供按钮，按不按由你决定。