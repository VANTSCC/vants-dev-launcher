import { fetchRows, cached } from './db.js'

const PLAYER_COLS = 'id,username,display_name,avatar_url,region,country,main_game,verified,created_at'

/** Lista de jugadores (para la pagina Jugadores). */
export const getPlayers = (limit = 100) =>
  cached(`players:${limit}`, () =>
    fetchRows('players', { select: PLAYER_COLS, order: 'created_at.desc', limit }),
  )

/** Un jugador por id. */
export async function getPlayerById(id) {
  const rows = await fetchRows('players', {
    select: PLAYER_COLS,
    filters: { id: `eq.${id}` },
    limit: 1,
  })
  return rows[0] || null
}

/** Colocaciones del jugador en todas las temporadas (una fila de leaderboard por temporada). */
export async function getPlayerSeasons(playerId) {
  const [rows, seasons] = await Promise.all([
    fetchRows('leaderboard', { filters: { player_id: `eq.${playerId}` }, order: 'mmr.desc', limit: 20 }),
    fetchRows('seasons', { order: 'season_number.desc', limit: 50 }),
  ])
  const byId = new Map(seasons.map((s) => [s.id, s]))
  return rows.map((r) => ({ ...r, season: byId.get(r.season_id) || null }))
}

/** Eventos del calendario, del mas proximo al mas lejano. */
export const getEvents = (limit = 100) =>
  cached(`events:${limit}`, () =>
    fetchRows('events', { select: '*', order: 'starts_at.asc.nullslast', limit }),
  )

/** Agrupa eventos por mes (clave AAAA-MM). Los que no tienen fecha valida se descartan. */
export function groupEventsByMonth(events) {
  const groups = new Map()
  for (const e of events) {
    const d = new Date(e.starts_at)
    if (!e.starts_at || Number.isNaN(d.getTime())) continue
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (!groups.has(key)) groups.set(key, { key, date: d, items: [] })
    groups.get(key).items.push(e)
  }
  return [...groups.values()]
}
