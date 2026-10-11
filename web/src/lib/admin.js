import { NEON_DATA_API } from '../config.js'
import { buildParams, fetchRows, countRows, clearCache } from './db.js'
import { session } from './auth.js'

// Escrituras del panel: siempre con sesion (Neon Data API). La seguridad real la
// dan los permisos/RLS de Neon; esta pagina solo oculta el panel a quien no es admin.
let tokenFn = null
export function setAdminTokenGetter(fn) {
  tokenFn = fn
}

export async function patchRows(table, filters, body) {
  const token = tokenFn ? await tokenFn() : null
  if (!token) throw new Error('Necesitas iniciar sesion')
  const params = buildParams({ filters })
  const res = await fetch(`${NEON_DATA_API}/${table}?${params}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const b = await res.json().catch(() => null)
    throw new Error((b && b.message) || res.statusText || 'No se pudo guardar')
  }
  clearCache()
}

/** Es admin si su cuenta de jugador tiene discord_user_id presente en bot_admins. */
export async function checkAdmin(sub) {
  const players = await fetchRows('players', { select: 'discord_user_id', filters: { auth_user_id: `eq.${sub}` }, limit: 1 })
  const did = players[0] && players[0].discord_user_id
  if (!did) return null
  const rows = await fetchRows('bot_admins', { filters: { discord_id: `eq.${did}` }, limit: 1 })
  return rows[0] || null
}

export const botStatus = (lastSeen) => {
  if (!lastSeen) return { key: 'unknown', label: 'Sin datos' }
  const secs = (Date.now() - new Date(lastSeen).getTime()) / 1000
  if (secs < 90) return { key: 'ok', label: 'En linea' }
  if (secs < 300) return { key: 'warn', label: 'Retrasado' }
  return { key: 'down', label: 'Caido' }
}

export const getHeartbeat = async () => (await fetchRows('bot_heartbeat', { filters: { id: 'eq.main' }, limit: 1 }))[0] || null
export const getSettings = () => fetchRows('bot_settings', { order: 'key.asc' })
export const getAlerts = (status) =>
  fetchRows('bot_alerts', { filters: status ? { status: `eq.${status}` } : {}, order: 'created_at.desc', limit: 60 })
export const getChannels = () => fetchRows('discord_channels', { order: 'category.asc' })
export const getCommandRuns = () => fetchRows('bot_command_runs', { order: 'created_at.desc', limit: 40 })
export const getAudit = () => fetchRows('audit_logs', { order: 'created_at.desc', limit: 40 })
export const getAlertCounts = async () => {
  const [pending, sent, failed] = await Promise.all(
    ['pending', 'sent', 'failed'].map((s) => countRows('bot_alerts', { status: `eq.${s}` })),
  )
  return { pending, sent, failed }
}
export const retryAlert = (id) => patchRows('bot_alerts', { id: `eq.${id}` }, { status: 'pending', attempts: 0, error: null })
export const setSetting = (key, enabled) =>
  patchRows('bot_settings', { key: `eq.${key}` }, { enabled, updated_at: new Date().toISOString() })
export { session }
