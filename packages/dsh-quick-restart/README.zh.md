# dsh-quick-restart

[English](README.md) | 中文

一个在浏览器里直接重启正在运行的 `dsh web` 服务的 DSH web GUI 插件。它提供一个
一级设置区（「快速重启 DSH 服务」），展示服务实时状态与一个需确认的重启按钮。

## 为什么需要它

DSH 宿主在进程生命周期内会把所有在 GUI 打开的会话留在内存里，因此归档会话可能
显示「会话仍被 DSH 进程占用」并拒绝删除，直到服务重启或会话被关闭。重启也会让
只在启动时加载的配置与插件变更生效。这个设置卡让你不用打开终端，直接触发重启。

## 工作原理

DSH 宿主没有内置重启接缝（`apps/cli/src/profile-boot.ts` 对 SIGTERM 做优雅退出，
但没有任何东西负责重新拉起服务），所以宿主半区用两步拼出重启：

1. `POST /api/dsh-quick-restart/restart` 先拉起一个**脱离终端**的辅助进程
   （`node -e`，零依赖，stdio 忽略），它会在宿主死后继续存活：轮询回环端口直到
   拒绝连接，然后用记录的 working directory 重新拉起 `dsh web`，stdout/stderr
   追加到服务日志。
2. 路由先回 `200 { ok: true, reloading: true }`，随后在短暂宽限后给当前进程发
   SIGTERM（宿主自己的处理器会排空状态并以 0 退出）。辅助进程看到端口释放后拉起
   替代进程，GUI 自动重连。

若无法从 `process.argv[1]` 推导重启命令（不是 JS 文件），辅助进程回退到 PATH
上的 `dsh` CLI 的 `web` profile。如果你的服务由 supervisor（例如桌面版）托管，
辅助进程的拉起会与 supervisor 竞争——那种部署请优先用 supervisor 自己的重启。

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