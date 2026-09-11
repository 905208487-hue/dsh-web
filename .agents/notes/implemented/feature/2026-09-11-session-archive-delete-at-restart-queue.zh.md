# Agent Note: 被宿主占用的会话改为「重启后删除队列」

Status: implemented

## Problem

维护者反馈：删除会话归档时总是得到「会话仍被 DSH 进程占用，重启服务或关闭该会话后可删除」——这句话由[会话归档后续修复](../../implemented/bug-fix/2026-08-31-session-archive-followup-fixes.md)引入。对运行中 GUI 做只读探测（以 `expectedTotal: 0` 发起删除请求，命中 plan mismatch 会在任何写入前中止）显示了问题规模：21 个会话中 18 个是 `attached`，其中包含全部 6 个归档会话，也就是说该安装上的删除动作实际上已经失效。

机理在宿主侧，不是判定条件写错了。浏览器一次只 stage 一个会话，打开它会触发宿主 `follow` → `promote` → `ctx.agents.resume`；得到的 `AgentHandle` 归 session-controller 插件 fiber（即整个进程）所有，`AgentRegistry` 没有按 id 释放的公开方法，也不存在 close/detach RPC。因此凡在浏览器标签里打开过的会话都会留在 `ctx.sessions` 里，直到 `dsh web` 退出。[DSH 休眠标签页研究](../../../../docs/archive/dsh-sleeping-tabs-research.md)把同一个缺口记为缺失的 L3（`serverReap`）能力。与此同时，提示语里「关闭该会话」在 GUI 里并没有对应入口。

## Decision

只被「进程占用」这一条挡住的会话不再被拒绝删除。宿主把它们记入持久队列，并在下一次启动时、浏览器尚未附着任何会话之前完成删除。

- `deferrableTargets` 用同一批 id 在去掉 `attached` 标记的保护表上重跑 `planDelete`，把因此变得可删的部分作为延迟集合。只有"仅被占用"的才会延迟；其他保护语义一概不变。
- 保护原因优先级改为由弱到强：`attached` < `running` < `current` < `in-flight`，因此同时处于运行中的活跃会话报 `running` 而不是 `attached`。这是安全前提而非措辞问题：否则运行中的会话会被误判成"仅被占用"，从而被排进下次启动的删除队列。
- 队列落在 `$DSH_HOME/dsh-session-archive/pending-deletes.json`，存用户确认的直接选中 id，族级联在排空时按权威规则重算。批量结果把入队项改标为新的 `queued` 原因；面板展示队列数量、上次排空的计数与取消动作，取消走 `POST /api/dsh-session-archive/pending/clear`。
- `start()` 负责排空队列（在 `start()` 内 await，而插件以 `void` 调用它，因此不会拖慢宿主启动）；之后的调度 tick 会重试。id 在以下情况退出队列：被删除、结构性失败、或 feed 确认它已不存在；仍受保护、或 feed 根本看不到（`feedAvailable === false`）的 id 继续留在队列里。
- 取消归档会撤销延迟删除：恢复会话即表达"保留它"。
- 自动删除策略同样会把"仅被占用"的候选入队；它的候选筛选现在只排除正在工作的会话，空闲但被占用的会话不再永久逃过保留期策略。
- 清单为每行带上 `attached` 事实并携带队列内容，因此面板能标注被占用的会话，删除确认框能提前说明有多少确认目标会落到下次启动。

## Alternatives considered

- **立即强制删除、接受幽灵条目。** 内存中的活跃副本在存储被删后依然存在：宿主 feed 仍会列出活跃会话，因此该行仍在客户端列表里，可以被重新打开并从内存读出内容，任何新发言都会把它重新落盘。删除会变成用户看不穿的假象，因此否决。
- **删除前强制停止活跃 agent**（`agent.ctx.fiber.dispose()` 一类的私有路径）。不存在公开接缝，而且伸手进另一个插件的 fiber 杀会话，正是本包契约明确拒绝的「绝不强制停止会话」。
- **只改文案。** 原提示本身是如实的；维护者的抱怨是它挡住了动作，而不是它说不清楚。
- **等上游暴露释放接缝。** 这个依赖真实存在但没有期限；延迟到下次启动在当前 SDK 上即可工作，且上游将来提供接缝时方案依然成立（队列为空时启动期排空是空操作）。
- **在运行进程内用定时器排空。** 一旦会话被附着，它在该进程生命周期内不会脱离，进程内重试什么都释放不了，只有重启能改变结果。tick 仍会顺带重试，代价很低，用于兜住因其他原因失败的排空。

## Testing

`tests/janitor.spec.ts` 用 fake host 端到端覆盖队列：入队而非拒绝、重启后排空（新进程、清空 `liveIds`）真正删除存储并清空队列、浏览器抢跑导致仍被占用时继续留在队列、feed 确认已消失时退队、feed 无法作答时保留、`running`/`current` 永不入队、取消归档撤销、`clearPending`、逐行 `attached` 事实，以及自动策略对"仅被占用"候选的入队。`tests/controller.spec.ts` 覆盖确认框的延迟计数、`queued` 结果在批量对话框中的呈现，以及取消调用。

## Consequences

- 删除归档会话现在总有结果：要么立即完成（冷会话），要么在下一次 DSH 服务启动时完成（被占用会话），面板会说明是哪种。
- 延迟队列是新的持久文档，`queued` 是新的原因码；客户端、ru 字典、包 README 双语对与[包级 AGENTS.md](../../../../packages/dsh-session-archive/AGENTS.md)都已承载该规则。
- 被占用会话的空间只在重启时释放；若某个被排队的会话恰好是启动时浏览器自动打开的那一个，它会留在队列里等再下一次启动。两条事实都写进了 README 的已知限制。
- 队列写入失败与台账同样被吞掉（`flushPending`），因此队列只会随记录它的进程一起丢失；内存中的队列仍会在下次 tick 重试。
