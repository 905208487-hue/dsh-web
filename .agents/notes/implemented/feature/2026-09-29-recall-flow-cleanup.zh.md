# Agent Note: 撤回后的消息流清理（磁盘截断的客户端镜像）

Status: implemented

## Problem

`dsh-recall` 此前只在磁盘上截断会话事件日志，可见的消息流保持原样：被撤回的
一轮（用户消息及其回复）要等到重开会话或重启才从界面上消失，不符合操作者
“撤回操作后，对话内容中最新的对话内容以及回复内容（若存在）也要从界面删除”
的要求。

## Decision

撤回成功后，客户端立即在界面里镜像磁盘截断（`src/client/cleanup.ts`）：

- 锚定消息流里最后一条 `user`/`steering` kind 的行（官方 shell 自己的操作者
  消息标记，与磁盘侧真实用户消息锚点同义），删除所有 `data-chat-turn` 数字
  不小于该行的行——即 `core/rollback.ts` 切点的位置镜像。
- 被删行的身份键（`data-chat-anchor-key`）写入页面级样式表
  （`[data-chat-anchor-key=...]{display:none!important}`）并按会话持久化
  （localStorage，无 Storage 环境退化为页内 map）：shell 的 React 协调会从
  其 store 重渲染被删的行，这两层规则让重建出来的行在整个页面生命周期内保持隐藏。

## Alternatives

- **仅 DOM 移除**：下一次 React 协调即被消灭——shell 从（宿主内存）store 里
  重建这些行。
- **按轮次号隐藏**：重开后会崩——shell 按截断后的磁盘状态重新编号轮次，
  未来轮次可能撞上已记录的数字而误伤新内容。身份键来自事件身份，重发草稿
  和重开会话渲染的都是新键，残留规则保持惰性。

## Constraints

- 磁盘撤回语义仍是权威；此镜像只管显示，在没有 shell 流标记时是 no-op。
  重开/重启提示如今针对宿主内存一侧（运行中会话自身的上下文状态）。
- 不新增路由、宿主服务或 profile 写入；触发器胶囊的门控不变（仅最新一轮、
  非飞行中）。
- 测试：`tests/client-cleanup.spec.tsx`（每条用例经 `vi.resetModules` 取得
  干净模块状态；Node 26 的 jsdom 不带 localStorage，页内 map 退化路径由
  这些用例隐式覆盖）。
