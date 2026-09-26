/**
 * ru copy for dsh-model-capabilities (namespace `model-caps`).
 * Mirrors the zh key set of packages/dsh-model-capabilities/src/client/locales.ts;
 * scripts/i18n-audit.mjs verifies coverage and placeholder parity.
 * @module @linxin666/dsh-i18n/client/ru/model-capabilities
 */

export const ru: Record<string, string> = {
  'name.hint': 'Изменяйте отображаемые имена моделей; сохранение пишет в документ настроек и применяется сразу. Пустые имена используют ID модели.',
  'name.loading': 'Загрузка списка моделей…',
  'name.loadFailed': 'Не удалось загрузить: {error}',
  'name.reload': 'Обновить',
  'name.empty': 'У этого провайдера пока нет редактируемого каталога моделей. Сначала добавьте строки моделей в каталог выше, затем вернитесь сюда, чтобы изменить имена.',
  'name.readOnly': 'Документ настроек доступен только для чтения; изменения отключены.',
  'name.label': 'Отображаемое имя',
  'name.placeholder': 'При пустом значении используется ID модели',
  'name.save': 'Сохранить',
  'name.saving': 'Сохранение…',
  'name.discard': 'Сбросить',
  'name.saved': 'Сохранено',
  'name.conflict': 'Конфигурация изменена в другом окне; перечитано — повторите попытку.',
  'name.failed': 'Не удалось сохранить: {error}',
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