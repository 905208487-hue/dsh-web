# dsh-model-capabilities

[English](README.md) | 中文

Models 设置页的 `llm-pi-ai` 适配器家族两个扩展区:每张提供方卡片上的供应商名称直改区,以及页面底部的已禁用提供方存档列表(一键恢复存档配置)。

官方卡片只对手填(user 层)的提供方提供「显示名称」字段;配置在 base/profile 层的提供方在官方编辑器里没有名称输入框。本插件的卡片扩展区为每条 pi-ai 路线恢复这个编辑入口。

原有的逐模型编辑器(推理档位声明,随后是模型显示名称)均不提供:本扩展只修改提供方自身的身份。

## 功能

- **供应商名称直改**:注册 `settings.models.provider-card` 插槽(`llm-pi-ai` 适配器家族)。每张提供方卡片显示路线 ID(只读)和可编辑的「供应商名称」输入框,保存为 `providers.<route>.displayName`,走官方设置线路、携带 revision 防冲突。名称留空时移除该字段,路线回退为 ID;配置被并发修改时重新读取并提示重试,绝不盲写覆盖。
- **提供方恢复**:注册 `settings.models.footer` 插槽,列出 profile 仍处于存档状态、离线于模型目录(输入框模型选择器与子代理可选列表共同读取)的提供方。一键原样恢复存档的 profile 并清除存档条目(API 密钥存放在凭据服务中,恢复完全不会触及)。若路线在存档后已出现新配置,恢复会被拒绝,存档绝不会覆盖更新的配置。

## 安装

### 通过家族聚合包

`dsh-web-all` 聚合 bundle 已包含本插件,挂载聚合包即可。

### 独立挂载(开发)

```sh
git clone https://github.com/zhu1090093659/dsh-web.git
cd dsh-web
pnpm install
pnpm -r build
dsh plugin --profile web add link:$(pwd)/packages/dsh-model-capabilities
```

重启 `dsh web`。打开 Web 设置的 Models 页,每张提供方卡片显示供应商名称编辑区,已禁用的提供方列在页面底部。

## 配置

插件自己的设置项里只存放已禁用提供方的存档(即插件配置 schema 的 `disabled` 字段,设置页由宿主按该 schema 生成),没有需要手工配置的项。提供方 profile 与其禁用状态分别保存在官方 `llm-pi-ai` 设置项和这个存档里。

## 语义须知

- **存档只列已下线的提供方**:仅当路线在所有设置层都不存在时,条目才会出现。重新添加的路线(或恢复 restore 后 route 已回来的部分恢复)会自动隐藏条目;存档本身保留 profile,配置不会丢。
- **恢复 = 先恢复、后清除**:profile 先写回 pi-ai 命名空间、存档条目后清除,即使某一步失败,最坏也只是留下一条无害的重复存档,绝不会丢配置。提供方下线期间,对它的委派在 host 侧直接失败(`NO_ADAPTER`),不只是 UI 上不显示。
- **供应商改名是单字段写入**:改名只对 `providers.<route>.displayName` 做一次 set(清空则 unset),不触碰任何模型数据。写入携带面板读取时的 revision;配置被并发修改时重新读取并提示重试,绝不盲写覆盖。
- **推理档位只存在于配置中**:profile 可以携带 `reasoningEfforts` 字段值(官方 pi-ai schema 允许),但本插件没有任何 UI 询问档位。

## 已知限制

- 不覆盖 DeepSeek 直连适配器(`llm-deepseek`):它的目录固定,推理强度控制已存在于 Models 页。
- 存档只列出本插件自己设置项里的 profile;未经存档直接移除的提供方没有可恢复的内容。