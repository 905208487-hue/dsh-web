/**
 * dsh-model-capabilities locale dictionaries (zh/en). The zh dictionary is
 * the key source; `en` mirrors its full key set (packages/AGENTS.md bilingual
 * discipline). Russian copy ships centrally in dsh-i18n.
 * @module @linxin666/dsh-client-ui-model-capabilities/client/locales
 */

/** Dictionary namespace this package registers. */
export const NS = 'model-caps'

/** Chinese copy (key source). */
export const zh = {
  'name.hint': '直接修改模型显示名称，保存写入设置文档并立即生效；留空则使用模型 ID。',
  'name.loading': '正在读取模型列表…',
  'name.loadFailed': '读取失败：{error}',
  'name.reload': '重新读取',
  'name.empty': '此提供方还没有可编辑的模型目录。先在上方模型目录中添加模型行，再回到这里修改名称。',
  'name.readOnly': '当前设置文档只读，无法修改。',
  'name.label': '显示名称',
  'name.placeholder': '留空时使用模型 ID',
  'name.save': '保存',
  'name.saving': '保存中…',
  'name.discard': '重置',
  'name.saved': '已保存',
  'name.conflict': '配置已被其他界面修改，已重新读取，请重试。',
  'name.failed': '保存失败：{error}',
  'caps.conflict': '配置已被其他界面修改，已重新读取，请重试。',
  'caps.failed': '操作失败：{error}',
  'caps.action.enable': '启用',
  'caps.busy.enabling': '启用中…',
  'caps.footer.title': '已禁用的提供方',
  'caps.footer.hint': '这些提供方的配置已存档；启用后恢复原配置，并重新出现在模型选择器与子代理可选列表中。',
  'caps.error.routeExists': '该提供方已存在新配置，无法恢复存档；请先移除现有配置再启用。',
  'caps.error.partialEnable': '已启用，但清理存档失败：{error}',
  'caps.error.unavailable': '无法切换：未找到插件的存档设置项。',
}

export type CapsKey = keyof typeof zh

/** English copy (full key parity with zh). */
export const en: Record<CapsKey, string> = {
  'name.hint': 'Edit model display names here; saving writes the settings document and applies immediately. Empty names fall back to the model ID.',
  'name.loading': 'Loading model list…',
  'name.loadFailed': 'Failed to load: {error}',
  'name.reload': 'Reload',
  'name.empty': 'No editable model catalog for this provider yet. Add model rows in the catalog above, then come back here to edit names.',
  'name.readOnly': 'The settings document is read-only; changes are disabled.',
  'name.label': 'Display name',
  'name.placeholder': 'Uses the model ID when empty',
  'name.save': 'Save',
  'name.saving': 'Saving…',
  'name.discard': 'Reset',
  'name.saved': 'Saved',
  'name.conflict': 'The configuration changed in another surface; reloaded — please retry.',
  'name.failed': 'Save failed: {error}',
  'caps.conflict': 'The configuration changed in another surface; reloaded — please retry.',
  'caps.failed': 'Operation failed: {error}',
  'caps.action.enable': 'Enable',
  'caps.busy.enabling': 'Enabling…',
  'caps.footer.title': 'Disabled providers',
  'caps.footer.hint': 'These providers have archived configurations; enabling restores the original profile and puts it back into the model picker and the subagent selection.',
  'caps.error.routeExists': 'The provider already has a newer configuration; the archive cannot be restored. Remove the current configuration first, then enable.',
  'caps.error.partialEnable': 'Enabled, but clearing the archive failed: {error}',
  'caps.error.unavailable': 'Cannot toggle: the plugin archive settings entry is not served.',
}

/**
 * Active dictionary, picked by the document language at call time (the same
 * tiny resolution every family settings card uses).
 */
export function dictionary(): Record<CapsKey, string> {
  const lang = typeof document !== 'undefined' ? document.documentElement.lang : 'zh'
  return lang.toLowerCase().startsWith('en') ? en : zh
}

/** Translate a key with optional `{name}` template params; missing keys degrade to the key. */
export function t(key: CapsKey, params?: Record<string, unknown>): string {
  let text: string = dictionary()[key] ?? key
  if (params !== undefined) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replaceAll(`{${name}}`, String(value))
    }
  }
  return text
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** dsh-model-capabilities UI copy. */
    'model-caps': CapsKey
  }
}