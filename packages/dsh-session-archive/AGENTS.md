# Package rules for dsh-session-archive

包特有规则（通用规则见根 [AGENTS.md](../../AGENTS.md) 与 [packages/AGENTS.md](../../packages/AGENTS.md)）。

## 删除语义（本包的核心契约）

- 物理删除管线顺序固定：归档集合 → 工作区 `sessionIds` → 存储（rdb 行 / 会话目录）→
  投影缓存 → 归档台账。中断只会留下"已取消列表但数据还在"的可重试状态，绝不半删除。
- 会话族（直接选中 + 全部后代）中任一成员受保护（运行中 / 当前会话 / 在途操作）→
  整族跳过，reason `family-protected`。
- **重启后删除队列**（`$DSH_HOME/dsh-session-archive/pending-deletes.json`）：仅被活跃
  SessionStore 占用、且不满足任何"工作中"条件的会话（reason 恰好是 `attached`）不拒绝
  删除，而是入队，由下一次宿主 `start()` 在浏览器重新附着它们之前排空，结果记入
  `lastSweep`。判定方式固定：用同一批 ids 在去掉 `attached` 标记的保护表上重跑
  `planDelete`，只把"去掉占用后才会被删"的 id 入队（`deferrableTargets`）。运行中 /
  当前会话 / 在途操作 / 结构性结果（`not-found`、`unreadable`）永不入队；也绝不通过
  强制停止会话来推进删除。取消归档会撤销该会话的队列条目；`pending/clear` 路由用于
  用户显式取消。
- 保护原因优先级固定为 `attached` < `running` < `current` < `in-flight`（后者覆盖前者）；
  只有 `attached` 单独成立时才可延迟，因此运行中的活跃会话必须报 `running`。
- 队列排空时，feed 未能作答（`feedAvailable === false`）的 pass 不得因 `not-found`
  退队——那只能说明宿主此刻看不到它，不是"已不存在"。
- 归档台账（`$DSH_HOME/dsh-session-archive/archive-ledger.json`）是唯一归档时间事实源；
  台账中没有条目的归档会话按"归档时间未知"处理，永不进入自动删除。
- 删除路径只允许来自 `indexSessionDirs` 的解析结果，`removeSessionDir` 会再次校验
  realpath 在 sessions 根内；任何客户端提交的路径都是非法输入。

## SDK seam 约束

- 归档走公开的 `workspaceRegistry.archiveSession`；取消归档与工作区行清理走
  `requireState`/`setState` 与 entity `mutate`（alpha.2 运行时 seam，`workspace-store.ts`
  中特征检测，缺失时报 `missing-seam`，禁止直接改写 `workspace.json` 文件）。
- 运行中判定 = 宿主 feed 的 `running` 位 ∪ 活跃 SessionStore 成员 ∪ 客户端声明的
  当前会话；三路来源都在 `protectedReason` 里合并。活跃 SessionStore 成员没有任何
  公开释放接缝（`AgentHandle.dispose` 只属于创建者），因此运行期只能延迟，不能解除占用。
- 自动归档时间口径 = feed `updatedAt`（`lastActivityReliable`）；自动删除时间口径 =
  归档台账 `archivedAt`。两条口径写死在 `core/auto-rules.ts`，不许改从文件时间推断。

## 测试与门禁

- `pnpm --filter @linxin666/dsh-session-archive test` / `typecheck` / `build`。
- 共享模块（`mount-once.ts`、`dsh-home.ts`、`host/http.ts`、`host/loopback.ts`）是
  sync-shared 生成副本，改 `shared/` 源后 `pnpm sync-shared`。
- 改删除/归档语义必须同步更新 `tests/janitor.spec.ts` 与双语 README 的语义说明。
