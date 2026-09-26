# AGENTS.md — dsh-model-capabilities

DSH web GUI plugin dsh-model-capabilities. 包级规则:只写本包特有约定,不重复根 AGENTS.md 与
packages/AGENTS.md 的全局/包级规则。

## 本包要点

- 本包占位官方 Models 设置页的两个插槽:
  - `settings.models.provider-card`(key `llm-pi-ai`):每张提供方卡片的
    **模型名称直改区**(`ModelNamePanel`)。每个模型行显示只读模型 ID + 可编辑
    「显示名称」;保存 = 一次 set 操作整体替换 `providers.<route>.models`
    数组(settings mutate 的 path op 不支持下标进数组),非本面板编辑的字段
    (id/input/contextWindow/maxTokens/compat/reasoningEfforts 等)原样保留。
  - `settings.models.footer`:列出路由已下线但 profile 仍在本包存档里的提供方,
    唯一恢复入口。
  - 原逐模型推理档位声明(三态编辑器)已移除:模型能力无需逐用户编辑,
    Models 页不显示能力选择器。
- host 半区不再注册任何服务:0.1.7 起插件自身的 Cordis `Config` 就是它的设置项,
  Host 由该 schema 生成设置页并伺服可写表单(只有 volatile 字段可写,故 `disabled`
  标注 volatile);host 半区只剩 schema 与一个空 apply(仍经 `src/mount-once.ts`
  sync-shared 生成副本防双源重复挂载)。存档读写全部走
  `remote.settings.describe/mutate` 官方线路,目标是本包条目与 `llm-pi-ai` 条目。
- 设置线路以「profile entry id」寻址且不携带包身份,因此本包自己的存档条目在
  浏览器半区按条目 id 解析(独立安装 `ui-model-capabilities`、聚合包
  `web-ui-model-capabilities`),两者都未命中时按表单 schema 形状兜底(仅含一个
  `disabled` any 字段;见 `src/core/provider-toggle.ts` 的 `resolveArchiveEntry`);
  解析不到时隐藏启用入口并报 unavailable,绝不猜写。
- **恢复走「restore + unset」**:启用 = 先 `set llm-pi-ai.providers.<route>` 原样
  恢复存档 profile,再 unset 本包条目 `disabled.<route>` 清档。顺序保证最坏情况
  是重复存档,绝不丢 profile;启用遇路线已有新配置必须拒绝(`route-exists`)。
  pi-ai schema 无原生 enabled/disabled 字段,勿寻找/伪造。存档条目只在路由仍
  下线时列出:路由回来(重新添加,或部分启用只恢复了 profile)后条目自动隐藏,
  存档本身仍保留可恢复。
- **移除的禁用路径**:卡片侧「禁用」按钮随能力面板一起删除,不再提供
  disableProvider/存档写入;提供方下线交给官方 Models 页的移除操作。
- 冲突姿态与官方卡片一致:携带读取时的 revision 作为 `expectedRevision`,
  收到 `settings/conflict` 后重新 describe 并提示用户重试,绝不盲写。
- **刷新只跟两个条目**:`settings/document-updated` 仅当 `llm-pi-ai` 或本包条目
  (两种可能行 id 拼写)变化时刷新;并发 `describe` 合并为一次 wire 调用;
  名称面板后台刷新保留未保存草稿,并把写入围栏钉在草稿读取时的 revision。

## 提交前检查

```sh
pnpm --filter @linxin666/dsh-client-ui-model-capabilities typecheck
pnpm --filter @linxin666/dsh-client-ui-model-capabilities test
pnpm --filter @linxin666/dsh-client-ui-model-capabilities build
```