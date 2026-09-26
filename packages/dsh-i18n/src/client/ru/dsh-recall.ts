/**
 * Russian dictionary for the "dsh-web-ui-recall" locale namespace.
 * Source package: packages/dsh-recall (its zh dictionary is the key source).
 * Maintained centrally by the dsh-i18n language pack; when a zh key is added
 * or changed upstream, mirror it here and run `pnpm i18n:check`.
 */

export const ru: Record<string, string> = {
  'recall.button': 'Отозвать последнее',
  'recall.hint': 'Отозвать последнее сообщение беседы (только последнее; история не затрагивается)',
  'recall.confirm': 'Отозвать последнее сообщение беседы? История остаётся без изменений.',
  'recall.done': 'Отозвано; переоткройте беседу или перезапустите dsh, чтобы применить',
  'recall.failed': 'Не удалось отозвать, попробуйте ещё раз',
}
