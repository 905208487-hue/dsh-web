/**
 * dsh-quick-restart browser copy. zh is the key source; en mirrors it exactly;
 * the ru mirror lives in packages/dsh-i18n (scripts/i18n-audit.mjs verifies
 * per-namespace coverage and placeholder parity).
 * @module @linxin666/dsh-quick-restart/client/locales
 */

export const NS = 'dsh-quick-restart'

export const zh: Record<string, string> = {
  'quick.title': '快速重启 DSH 服务',
  'quick.status': '服务 PID {pid} · 端口 {port}',
  'quick.started': '启动于 {time}',
  'quick.restart.button': '重启 DSH 服务',
  'quick.restart.confirm': '确认重启 DSH 服务？当前对话与后台任务会被中断，页面稍后会自动重连（约 10–30 秒）。',
  'quick.restart.doing': '正在重启…页面将在服务恢复后自动重连。',
  'quick.restart.failed': '重启触发失败：{error}',
  'quick.status.failed': '状态读取失败：{error}',
  'quick.hint': '提示：重启会释放仍被 DSH 进程占用的会话——归档中被标记「进程占用」的会话在重启后即可删除；配置或插件变更也会在重启后生效。',
}

export const en: Record<string, string> = {
  'quick.title': 'Quick restart DSH service',
  'quick.status': 'Service PID {pid} · port {port}',
  'quick.started': 'started at {time}',
  'quick.restart.button': 'Restart DSH service',
  'quick.restart.confirm': 'Restart the DSH service now? The current conversation and background tasks are interrupted; the page reconnects automatically (roughly 10–30 seconds).',
  'quick.restart.doing': 'Restarting… the page reconnects once the service is back.',
  'quick.restart.failed': 'Restart failed to trigger: {error}',
  'quick.status.failed': 'Status read failed: {error}',
  'quick.hint': 'Hint: a restart releases sessions still held by the DSH process — archived sessions marked "held by process" become deletable after the restart; configuration and plugin changes also take effect after it.',
}

/**
 * Minimal placeholder formatter used by the card (mirrors the family
 * `locales.ts` helpers; the registry's bound function is preferred when one
 * is available through ctx.locale).
 */
export function t(key: string, vars?: Record<string, string>): string {
  const template = zh[key] ?? key
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (_, name: string) => vars[name] ?? `{${name}}`)
}