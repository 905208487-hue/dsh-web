/**
 * Client locale dictionary for the recall namespace (zh is the key source).
 * @module @linxin666/dsh-recall/client/locales
 */

export const NS = 'dsh-web-ui-recall'

export const zh = {
  'recall.button': '撤回最新',
  'recall.hint': '撤回最新一条对话内容（仅最新；历史对话不可撤回）',
  'recall.confirm': '确定撤回最新一条对话内容？历史对话不受影响。',
  'recall.done': '已撤回，重新打开会话或重启 dsh 后生效',
  'recall.failed': '撤回失败，请重试',
}

export const en = {
  'recall.button': 'Recall latest',
  'recall.hint': 'Recall the latest conversation turn (latest only; history stays untouched)',
  'recall.confirm': 'Recall the latest conversation turn? History stays untouched.',
  'recall.done': 'Recalled; reopen the conversation or restart dsh to apply',
  'recall.failed': 'Recall failed, try again',
}
/** Dictionary keys of the recall namespace. */
export type RecallKey = keyof typeof zh

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** dsh-recall UI copy. */
    'dsh-web-ui-recall': RecallKey
  }
}
