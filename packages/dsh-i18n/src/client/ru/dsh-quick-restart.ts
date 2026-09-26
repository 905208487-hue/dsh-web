/**
 * ru copy for dsh-quick-restart (namespace `dsh-quick-restart`).
 * Mirrors the zh key set of packages/dsh-quick-restart/src/client/locales.ts;
 * scripts/i18n-audit.mjs verifies coverage and placeholder parity.
 * @module @linxin666/dsh-i18n/client/ru/dsh-quick-restart
 */

export const ru: Record<string, string> = {
  'quick.title': 'Быстрый перезапуск DSH',
  'quick.status': 'PID службы {pid} · порт {port}',
  'quick.started': 'запущена в {time}',
  'quick.restart.button': 'Перезапустить DSH',
  'quick.restart.confirm': 'Перезапустить службу DSH? Текущий диалог и фоновые задачи будут прерваны; страница переподключится автоматически (примерно через 10–30 секунд).',
  'quick.restart.doing': 'Перезапуск… страница переподключится после восстановления службы.',
  'quick.restart.failed': 'Не удалось инициировать перезапуск: {error}',
  'quick.status.failed': 'Не удалось прочитать статус: {error}',
  'quick.hint': 'Подсказка: перезапуск освобождает сессии, удерживаемые процессом DSH, — архивные сессии с пометкой «удерживается процессом» можно удалить после перезапуска; изменения конфигурации и плагинов тоже вступают в силу после него.',
}