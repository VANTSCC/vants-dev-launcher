import { PUBLIC_PROXY } from '../config.js'

// Neon Function "vantsdata" -> /faceit/*. La API key de FACEIT vive solo en el servidor.
const BASE = new URL('faceit', PUBLIC_PROXY).toString()

async function get(path) {
  try {
    const res = await fetch(`${BASE}${path}`)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

/** Cuenta FACEIT vinculada al jugador registrado (o null si no vinculó). */
export const getFaceitAccount = (username) =>
  get(`/player?username=${encodeURIComponent(username)}`)

/** Ultimas partidas CS2 de FACEIT del jugador registrado. */
export async function getFaceitMatches(username) {
  const list = await get(`/matches?username=${encodeURIComponent(username)}`)
  return Array.isArray(list) ? list : []
}

export function faceitSummary(matches) {
  const wins = matches.filter((m) => m.win).length
  const losses = matches.length - wins
  const wr = matches.length ? Math.round((wins / matches.length) * 100) : 0
  return { wins, losses, wr }
}
