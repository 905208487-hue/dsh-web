/**
 * ru copy for dsh-model-capabilities (namespace `model-caps`).
 * Mirrors the zh key set of packages/dsh-model-capabilities/src/client/locales.ts;
 * scripts/i18n-audit.mjs verifies coverage and placeholder parity.
 * @module @linxin666/dsh-i18n/client/ru/model-capabilities
 */

export const ru: Record<string, string> = {
  'caps.conflict': 'Конфигурация изменена в другом окне; перечитано — повторите попытку.',
  'caps.failed': 'Не удалось выполнить операцию: {error}',
  'caps.action.enable': 'Включить',
  'caps.busy.enabling': 'Включение…',
  'caps.footer.title': 'Отключённые провайдеры',
  'caps.footer.hint': 'Конфигурации этих провайдеров заархивированы; включение восстановит исходный профиль и вернёт их в селектор моделей и в список субагентов.',
  'caps.error.routeExists': 'У провайдера уже есть новая конфигурация; восстановить архив нельзя. Сначала удалите текущую конфигурацию, затем включите.',
  'caps.error.partialEnable': 'Включено, но не удалось очистить архив: {error}',
  'caps.error.unavailable': 'Нельзя переключить: архивное пространство имён плагина не зарегистрировано.',
}