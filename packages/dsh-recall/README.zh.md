# dsh-recall

[English](README.md) | 中文

在 DeepSeek Harness Web 界面撤回最新一条对话内容（撤回）——仅限最新一轮，
已完成的历史对话不受影响。

## 工作原理

- 在打开会话的消息流尾部显示一个小的「撤回最新」胶囊按钮。它只出现在
  **最新一轮**，且仅当没有轮次正在流式生成时显示；历史轮次从不提供撤回入口。
- 点击后先确认，再向 `/api/dsh-recall/rollback` POST 当前会话 id。宿主解码
  该会话的 zstd 事件日志（`$DSH_HOME/sessions/<工作区>/<会话id>/` 下的
  `session.v4.jsonl.zstd`），在最新一轮边界截断（丢弃进行中的尾轮，或最新
  已完成的一轮），原子写回并留下带时间戳的 `.recall-bak-` 备份，然后返回结果。
- 由于运行中的 harness 会把已完成的会话缓存在内存里，且没有消息级 API，
  撤回先落在磁盘上：按钮会提示你重新打开会话或重启 `dsh` 以看到撤回后的状态。

## 限制

- 撤回在构造上就是**仅限最新一轮**（按最后一个 `turn/end` 边界做位置截断）；
  历史内容永不被触碰。
- 路由仅限回环、仅 POST；恶意的会话 id 会被拒绝。
- 压缩使用 Node 内置 `zlib` 的 zstd（需要 Node >= 24）。

## 开发

- `src/core/rollback.ts` —— 纯截断切点函数（基于合成日志单测）。
- `src/host/*` —— 路由与磁盘撤回（用真实 zstd 往返做夹具测试）。
- `src/client/*` —— 触发器胶囊、门控与语言字典。
- `pnpm test` 跑测试；`pnpm i18n:check` 覆盖 zh/en/ru 键。
