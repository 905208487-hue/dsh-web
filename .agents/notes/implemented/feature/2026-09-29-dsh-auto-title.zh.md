# Agent Note: DSH 自动标题宿主插件

Status: implemented

## Problem

`oil-oil/oil-codex-title` 通过受信任的 Codex Stop Hook 解决会话可检索性问题：读取最近几轮本地 Codex 对话、用小模型生成稳定标题，再通过 Codex 标题 API 写回。DSH Web 有同样的用户问题，但没有相同的集成点：Codex 插件清单、Hook 信任、`$CODEX_HOME` 和 Codex App Server 改名调用都不存在于 DSH Web。因此安装 Codex 插件不能给 DSH 会话改名。

## Decision

仓库现在包含 `packages/dsh-auto-title`，这是一个 DSH Web 宿主插件，它把行为移植到 DSH 服务边界，而不是 Codex Hook 边界。插件作为 Cordis bundle 行挂载，轮询 `session/list`，跳过运行中和空白会话，通过 `session/follow` 读取最近历史，并在完成回合后调用可选的 `llm` 服务。它只通过 `session/rename` 写入标题，并把自己的处理状态保存在 `$DSH_HOME/auto-title/state-v1.json`。

标题模型提示词保留 `oil-codex-title` 的稳定性规则，并改写为 DSH 语境：使用最近用户请求的主要语言，保持对象名称稳定，优先使用对象在前、目标在后的标题；遇到仅确认的回合则保留旧标题。源码不内置类别图形符号；运行时标题模型仍可按用户语言选择措辞。

插件以宿主半区为主。浏览器半区故意为空，因为 DSH 原生插件配置表单已经能暴露 bundle Config。Config 的每个字段都标记为 volatile：宿主只从 volatile 字段投影出设置表单，而设置写入路径会拒绝非 volatile 路径，所以普通字段会让插件完全没有表单、也无法从界面写入。Config 因此包含启用开关、可选 `provider/model` 路由、轮询间隔、摘录大小、最近轮次数、每次处理会话上限、是否包含 subagent，以及外部标题保护；插件行跟随 `loader/volatile-update` 重新武装轮询定时器，并在使用时重新解析模型服务。`modelRoute` 为空时，插件会尝试从会话列表投影读取该会话最近使用的模型。

手动标题安全是尽力而为，因为当前 DSH Web 会话摘要没有暴露一个能区分宿主自动标题与用户显式改名的持久标记。插件会在自己写过标题后提供保护：如果可见标题后来不同于最后一个插件写入的标题，就把该会话标记为 locked，停止后续自动改名。

## Alternatives considered

直接原地适配 Codex 插件被否决。它的 Stop Hook、Codex CLI 适配器、`$CODEX_HOME` 布局和 Hook 信任 UX 都是 Codex 专属；搬到 DSH Web 中要么不起作用，要么需要不安全地直接改存储。

纯浏览器插件被否决。浏览器可以观察 UI，但不能可靠读取冷会话历史、不能在不把策略泄露到客户端的情况下调用模型，也不能在标签页关闭后继续改名。宿主侧轮询把工作留在已经拥有会话服务和模型服务的进程里。

直接编辑会话存储被否决。DSH 已经暴露 `session/rename`；写存储文件会绕过校验、投影和未来存储变更。

立即把该行加入 `dsh-web-all` 被暂缓。当前工作树已经有无关的 aggregate 与客户端改动；首个可用移植版本应先作为独立 bundle 安装，等全家桶聚合能在干净变更里更新时再纳入。

## Consequences

DSH Web 用户可以把 `@linxin666/dsh-auto-title` 作为独立 bundle 安装，在不依赖 Codex 的情况下获得完成回合后的自动标题维护。安装新的 bundle 行后，正在运行的 DSH Web 服务仍需要重启；仓库规则禁止本插件在开发过程中重启用户当前服务。

当 DSH 无法证明某个既有标题是人工写入时，第一次自动处理可能会改掉一个既有人工标题。插件拥有某个标题之后，后续外部修改会被视为锁定。如果 DSH 之后暴露手动标题投影，本插件应切换到那个更强的信号。
