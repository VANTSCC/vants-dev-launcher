import { NEON_DATA_API, PUBLIC_PROXY } from '../config.js'

let tokenGetter = async () => null
export function setTokenGetter(fn) {
  tokenGetter = fn
}

const cache = new Map()
const TTL = 30 * 1000

export function clearCache() {
  cache.clear()
}

/** Construye los parametros PostgREST. Los filtros usan la forma { columna: 'eq.valor' }. */
export function buildParams({ select, filters = {}, order, limit } = {}) {
  const p = new URLSearchParams()
  if (select) p.set('select', select)
  for (const [col, expr] of Object.entries(filters)) p.set(col, expr)
  if (order) p.set('order', order)
  if (limit) p.set('limit', String(limit))
  return p
}

function parseCount(res) {
  const range = res.headers.get('content-range')
  const total = range ? parseInt(range.split('/')[1], 10) : NaN
  return Number.isNaN(total) ? 0 : total
}

/**
 * Lee filas de una tabla. Con sesion va a la Neon Data API; sin sesion, al proxy publico.
 * Devuelve siempre un array (o lanza un Error con .status).
 */
export async function fetchRows(table, opts = {}) {
  const params = buildParams(opts)
  const token = await tokenGetter()
  let res
  if (token) {
    res = await fetch(`${NEON_DATA_API}/${table}?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  } else {
    const proxy = new URL(PUBLIC_PROXY)
    proxy.searchParams.set('table', table)
    params.forEach((v, k) => proxy.searchParams.set(k, v))
    res = await fetch(proxy.toString())
  }
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const err = new Error((body && body.message) || res.statusText || 'Error de red')
    err.status = res.status
    throw err
  }
  return Array.isArray(body) ? body : []
}

/** Cuenta filas con el header content-range. */
export async function countRows(table, filters = {}) {
  const params = buildParams({ select: 'id', filters, limit: 1 })
  const token = await tokenGetter()
  let res
  if (token) {
    res = await fetch(`${NEON_DATA_API}/${table}?${params}`, {
      headers: { Authorization: `Bearer ${token}`, Prefer: 'count=exact' },
    })
  } else {
    const proxy = new URL(PUBLIC_PROXY)
    proxy.searchParams.set('table', table)
    proxy.searchParams.set('_count', 'exact')
    params.forEach((v, k) => proxy.searchParams.set(k, v))
    res = await fetch(proxy.toString())
  }
  if (!res.ok) throw new Error(res.statusText || 'Error de red')
  return parseCount(res)
}

export async function cached(key, fn) {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.t < TTL) return hit.v
  const v = await fn()
  cache.set(key, { t: Date.now(), v })
  return v
}

// ---------- Consultas de la app ----------
export const getStats = () =>
  cached('stats', async () => {
    const now = new Date().toISOString()
    const [players, tournaments, events, matches] = await Promise.all([
      countRows('players'),
      countRows('tournaments'),
      countRows('events', { starts_at: `gte.${now}` }),
      countRows('ranked_matches', { status: 'eq.completed' }),
    ])
    return { players, tournaments, events, matches }
  })

export const getActiveSeason = () =>
  cached('season', async () => {
    const rows = await fetchRows('seasons', { order: 'season_number.desc', limit: 5 })
    return rows.find((s) => s.status === 'active') || rows[0] || null
  })

export const getLeaderboard = (seasonId, limit = 5) =>
  cached(`lb:${seasonId}:${limit}`, async () => {
    if (!seasonId) return []
    return fetchRows('leaderboard', {
      filters: { season_id: `eq.${seasonId}` },
      order: 'mmr.desc',
      limit,
    })
  })

export const getUpcomingTournaments = (limit = 4) =>
  cached(`tournaments:${limit}`, () =>
    fetchRows('tournaments', {
      select: 'id,slug,name,game,status,prize_pool,starts_at,current_participants,max_participants',
      filters: { status: 'in.(registration,open,upcoming,in_progress,live)' },
      order: 'starts_at.asc.nullslast',
      limit,
    }),
  )

/** Todos los torneos (para la pagina de Torneos); el filtrado por estado se hace en la vista. */
export const getTournaments = (limit = 60) =>
  cached(`tournaments-all:${limit}`, () =>
    fetchRows('tournaments', {
      select: 'id,slug,name,game,status,prize_pool,starts_at,current_participants,max_participants',
      order: 'starts_at.desc.nullslast',
      limit,
    }),
  )

export async function getPlayerByAuthId(sub) {
  const rows = await fetchRows('players', {
    select: 'id,username,display_name,avatar_url,region,country,main_game,verified,created_at',
    filters: { auth_user_id: `eq.${sub}` },
    limit: 1,
  })
  return rows[0] || null
}

export const getGameAccounts = (sub) =>
  fetchRows('user_game_accounts', {
    select: 'game,handle,display_name,avatar_url,profile_url,verified',
    filters: { user_id: `eq.${sub}` },
  })

export async function getPlayerStanding(playerId) {
  const rows = await fetchRows('leaderboard', {
    filters: { player_id: `eq.${playerId}` },
    order: 'mmr.desc',
    limit: 1,
  })
  return rows[0] || null
}
