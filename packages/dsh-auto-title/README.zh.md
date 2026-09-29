# dsh-auto-title

[English](README.md) | 中文

这是一个 DSH Web 宿主插件，用于在回合完成后更新会话标题。它把 Codex 插件 `oil-oil/oil-codex-title` 的命名思路适配到 DSH Web，不依赖 Codex Hook，也不读取 Codex 存储。

## 功能

- 在宿主侧轮询 DSH 会话列表。
- 只处理已经停止运行并出现完成回合的会话。
- 通过官方 session controller API 读取最近会话历史。
- 调用配置的模型路由；未配置时尝试使用该会话最近使用的模型。
- 通过官方 `session.rename` API 改名。
- 只在 `$DSH_HOME/auto-title/state-v1.json` 保存每个会话的处理游标和保护状态。

## 配置

所有字段都会出现在该插件条目的 DSH 插件设置表单里，并且修改后立即生效，不需要重启服务。下表列出字段、类型、默认值、取值范围与实际作用。

| 字段 | 类型 | 默认值 | 取值范围 | 作用 |
| --- | --- | --- | --- | --- |
| `enabled` | 布尔 | `true` | - | 总开关。关闭后轮询定时器完全停止，不再调用模型。 |
| `modelRoute` | 字符串 | `""` | `provider/model` 或留空 | 命名模型路由。留空时回退到该会话自己最近使用的模型；两者都取不到时跳过该会话。 |
| `intervalMs` | 数字 | `30000` | 5000..600000 | 轮询间隔，单位毫秒。 |
| `recentTurns` | 数字 | `5` | 1..10 | 发送给命名模型的最近用户轮次数。 |
| `maxContextChars` | 数字 | `12000` | 1000..40000 | 发送给命名模型的摘录最大字符数。 |
| `maxSessionsPerTick` | 数字 | `2` | 1..10 | 每次轮询最多处理的会话数。 |
| `includeSubagents` | 布尔 | `false` | - | 是否也给 subagent 会话命名。 |
| `protectExternalTitles` | 布尔 | `true` | - | 本插件写过标题后，如果标题被改成其他值，则锁定该会话，不再自动改名。 |

### 如何配置

打开 DSH Web 设置，找到 `dsh-auto-title` 的插件条目，在表单里直接修改。值会写入该条目在 profile 中的配置。

也可以手动编辑 profile patch：

```yaml
- id: ui-dsh-auto-title
  name: '@linxin666/dsh-auto-title'
  config:
    enabled: true
    intervalMs: 15000
    maxSessionsPerTick: 5
    modelRoute: your-provider/your-model
```

### 调参建议

- 吞吐量大致是 `maxSessionsPerTick` 个会话 / `intervalMs`。按默认值就是每 30 秒 2 个会话；把 `maxSessionsPerTick` 提到 `5`、`intervalMs` 降到 `10000`，处理大量积压会快约 7.5 倍，模型消耗也按比例上升。
- `modelRoute` 建议留空，跟随每个会话自己的模型，避免写死一个在部分部署里不可路由的供应商。
- 只有当你希望插件持续覆盖你手动改过的标题时，才把 `protectExternalTitles` 设为 `false`。

## 开发安装

```sh
pnpm --filter @linxin666/dsh-auto-title build
dsh plugin --profile web add link:/absolute/path/to/dsh-web/packages/dsh-auto-title
```

安装新的 bundle 行、或重新构建宿主半区之后，需要重启正在运行的 DSH Web 服务。插件不会自行重启服务。

## 限制

它不是 Codex 插件，不使用 Codex Stop Hook、`/hooks`、`$CODEX_HOME` 或 Codex App Server。它是 DSH Web 宿主插件，只访问官方 DSH 会话和模型服务。

DSH Web 当前没有可靠的手动标题标记。插件会保护自己写过之后又被外部修改的标题，但第一次自动处理时无法始终区分已有手动标题和宿主自动标题。

每个被改名的会话都会真实调用一次模型并消耗账号额度。没有产出可用候选的会话会被记录，直到出现更新的完成回合才会再次尝试。
