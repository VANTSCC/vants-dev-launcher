import { PUBLIC_PROXY } from '../config.js'
import { getToken } from './db.js'

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

/** Llamada autenticada (token de Auth0). Lanza Error con mensaje legible. */
async function authCall(path, { method = 'GET', body } = {}) {
  const token = await getToken()
  if (!token) throw new Error('Inicia sesión para vincular FACEIT')
  const headers = { Authorization: `Bearer ${token}` }
  if (body) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error((data && data.message) || `Error ${res.status}`)
  return data
}

/** Cuenta FACEIT vinculada al jugador registrado (o null si no vinculó). */
export const getFaceitAccount = (username) =>
  get(`/player?username=${encodeURIComponent(username)}`)

/** Ultimas partidas CS2 de FACEIT del jugador registrado. */
export async function getFaceitMatches(username) {
  const list = await get(`/matches?username=${encodeURIComponent(username)}`)
  return Array.isArray(list) ? list : []
}

/** Mi cuenta FACEIT (requiere sesion). */
export const getMyFaceit = () => authCall('/me')
/** Vincula (o refresca) mi cuenta FACEIT por apodo. */
export const linkFaceit = (nickname) => authCall('/link', { method: 'POST', body: { nickname } })
/** Desvincula mi cuenta FACEIT. */
export const unlinkFaceit = () => authCall('/unlink', { method: 'POST' })

export function faceitSummary(matches) {
  const wins = matches.filter((m) => m.win).length
  const losses = matches.length - wins
  const wr = matches.length ? Math.round((wins / matches.length) * 100) : 0
  return { wins, losses, wr }
}
