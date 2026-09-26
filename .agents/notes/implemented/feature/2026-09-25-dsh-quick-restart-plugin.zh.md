# Agent Note: dsh-quick-restart 快速重启插件

Status: implemented

## Problem

宿主进程会把 GUI 里打开的每一个会话留在内存里，直到进程结束。归档会话因此经常报
「会话仍被 DSH 进程占用，重启服务或关闭该会话后可删除」而拒绝删除；配置与插件变更
也只在启动时加载。重启是用户的出路，但服务是脱终端后台运行的（`nohup dsh web`），
每次都要开终端找进程，成本高。需求：在 web 端加一个能快速重启服务的插件按钮。

## Decision

新增独立 bundle 包 `@linxin666/dsh-quick-restart`（`packages/dsh-quick-restart/`）。
浏览器半区在同一份 `face` 上挂两处界面：设置头部的紧凑重启按钮
（`settings.action`，id `quick-restart`，order 10，紧挨官方「打开配置文件」的
order 0）与一级设置区（`settings.section`，id `dsh-quick-restart`，order 9000，
承载提示与实时状态文档）。

DSH 没有重启接缝（`apps/cli/src/profile-boot.ts` 对 SIGTERM 做优雅退出但不负责
重新拉起），所以重启由两步拼成：

1. `POST /api/dsh-quick-restart/restart` 先拉起一个**零依赖、脱离终端**的辅助进程
   （`node -e`，stdio ignore，`detached: true`，.unref()）。它轮询回环端口直到拒绝
   连接（上限 40s、间隔 800ms），然后用记录下的 cwd 重新拉起 `dsh web`
   （`process.argv[1]` 是 JS 文件时用 node+entry，否则回退 PATH 上的 `dsh`），
   stdout/stderr 追加到 `/tmp/dsh-web.log`（可用 `DSH_QUICK_RESTART_LOG` 覆盖）。
   拉起后它会等端口重新应答，并在别的 supervisor 抢同一端口时重试拉起
   （三次、每次等 20s）。
2. 路由先应答 `200 {ok:true,reloading:true}`，再在 800ms 宽限后给自身发 SIGTERM：
   宿主的处理器 drain 后以 0 退出，drain 卡住则在 9s 后硬退出（辅助进程在等端口，
   不能让卡住的 drain 一直占着它）。辅助进程看到端口释放即拉起替代进程。

浏览器半区随后等待替代进程：轮询状态路由，直到返回的 pid 与重启前捕获的不同，再调用
`window.location.reload()`，因此 GUI 无需手动刷新即可恢复连接。

### 安全与边界

- 所有路由回环围栏（非 loopback 一律 403，语义同 dsh-session-archive）；restart 只
  接受 POST；`terminate` 只在辅助进程拉起成功、且应答写出后才调用；失败返回 500
  且不终止。
- 辅助进程必须保持零依赖（源码以纯字符串存在于 `host/restart.ts` 的
  `helperSource()`），不 import 本包模块、不用构建产物——它在宿主死后存活。
- 该插件**不会自己重启**服务：只提供按钮。挂载后仍需一次手动重启让插件加载。
- 自带 supervisor 的部署（桌面版、launch agent、插件管理器里挂起的重启）会与本插件
  抢端口：最终由胜出的拉起方伺服端口，输的一方在端口被占期间得到 EADDRINUSE，
  辅助进程的重试让插件这一侧无论如何都能收敛。
- 语义属性：根容器 `data-dsh-plugin="quick-restart"`，部件 `data-dsh-part` 用
  hint/status/error/actions/restart-button。契约表的插件枚举更新在 dsh-skins 侧
  （当前无网络发布通道，先在此记录；下次 dsh-skins 契约更新时补表）。

### 与既有发布工作的关系

- 插件挂载到 profile 即见效：不需要等 0.4.3。归档删除的根治（待删除队列）仍在
  `ae38511c`（0.4.3），重启按钮是它的互补与过渡手段：即便队列上线，重启仍是用户
  想要的显式操作。
- 本插件 `dsh.engines.dsh` 与 peer 都声明 `>=0.1.7-rc.1`，与家族当前 cohort 一致；
  它实际运行的宿主是 dsh 0.1.7-rc.2。
