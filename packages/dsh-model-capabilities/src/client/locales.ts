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