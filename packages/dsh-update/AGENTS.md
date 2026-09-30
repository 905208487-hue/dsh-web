# AGENTS.md — dsh-update

DSH web GUI 插件 dsh-update（家族自更新）。包级规则：只写本包特有约定，不重复根
AGENTS.md 与 packages/AGENTS.md 的全局/包级规则。

- 本包是**独立行**（row id `update`，聚合行 `web-ui-update`）：自更新能力自
  dsh-remote-web-ui 拆出，关闭/禁用远程访问插件不再影响更新宿主路由。不要把更新
  能力重新挂回远程访问插件，或让它依赖该插件运行。
- 宿主半区只挂两条 loopback 精确路由 `/api/update/status` 与 `/api/update/run`，
  一律经 `isLoopbackRequest` 门禁：run 会在用户 profile 目录里真实执行 pnpm
  install，任何非本机来源都必须 403。
- 更新目标由宿主进程自身的模块图锚定（先 `@linxin666/dsh-web-all`，缺失时回退本包
  `@linxin666/dsh-update`）；改锚点或回退包名时同步 README 的 `## 安全模型`。
- 安全语义（真实安装执行、本地 link 模式拒绝、版本核对）修改时必须同步更新
  README 双语与本包测试。
- 浏览器半区**不注册可见的左侧 footer 下载/更新按钮**：旧的
  `sidebar.footer.action` 位置归 `dsh-usage` 的使用统计按钮与远程访问手机触发器。
  不要重新把 `[data-dsh-plugin="update"]` footer trigger 挂回该席位，除非用户明确
  要恢复下载按钮。
- `src/client/page-target.ts` 仍保留桌面外壳判定帮助函数，供测试或外部调用保持语义；
  当前 `apply()` 在所有页面都只注册字典与心跳，不注册 footer 入口。
