import { fetchRows, cached } from './db.js'

/** Contenido publicado de los planes, ordenado. */
export const getPlanContent = () =>
  cached('plan_content', () =>
    fetchRows('plan_content', {
      select: 'id,tier,kind,title,body,cta_label,cta_url,sort_order',
      filters: { published: 'eq.true' },
      order: 'sort_order.asc',
      limit: 100,
    }),
  )

/** Agrupa filas por nivel (tier), conservando el orden de aparicion. */
export function groupByTier(rows) {
  const map = new Map()
  for (const r of rows) {
    const tier = r.tier || 'general'
    if (!map.has(tier)) map.set(tier, [])
    map.get(tier).push(r)
  }
  return [...map.entries()].map(([tier, items]) => ({ tier, items }))
}

/** Solo acepta enlaces http(s) para los botones. */
export function safeUrl(url) {
  if (!url) return null
  try {
    const u = new URL(url, 'https://example.invalid')
    return u.protocol === 'http:' || u.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}
