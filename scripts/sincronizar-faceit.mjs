#!/usr/bin/env node
/* ============================================================
   VANTS · sincronizar-faceit.mjs — F8: adaptador FACEIT real
   ------------------------------------------------------------
   Tira del proveedor FACEIT (Data API v4 oficial, FACEIT_API_KEY)
   y UPSERT el catálogo público pt_* en Neon (source='faceit',
   is_demo=false — datos REALES, nunca etiquetados como demo).
   Sin scraping. Sin datos inventados: lo que la API no da, queda
   NULL.

   USO:
     FACEIT_API_KEY=… DATABASE_URL=… node scripts/sincronizar-faceit.mjs
       --juegos=cs2,valorant    (default cs2)
       --dry                    (muestra qué haría, sin escribir)

   SALIDAS HONESTAS:
   · Sin FACEIT_API_KEY → avisa y exit 0 (nada que sincronizar).
   · Sin DATABASE_URL   → avisa y exit 2 (no puede escribir).
   · API FACEIT caída   → intenta cada juego; si todos fallan,
     exit 3 (el CI lo marca rojo — no se disfraza de éxito).
   ============================================================ */
'use strict';

import pg from 'pg';
import { crearProveedorFaceit } from './proveedor-datos.mjs';

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const argJuegos = (args.find((a) => a.startsWith('--juegos=')) || '').split('=')[1];
const JUEGOS = (argJuegos || process.env.FACEIT_JUEGOS || 'cs2').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const KEY = process.env.FACEIT_API_KEY || '';
const DATABASE_URL = process.env.DATABASE_URL || '';

const log = (m) => console.log('[faceit-sync] ' + m);

if (!KEY) {
  log('FACEIT_API_KEY no configurada — sincronización omitida (no se inventan datos).');
  process.exit(0);
}
if (!DATABASE_URL && !DRY) {
  log('DATABASE_URL no configurada — no puedo escribir. Usa --dry para previsualizar.');
  process.exit(2);
}

/* ---------------- UPSERTS (idempotentes por source+external_id) ---------------- */

const SQL_TORNEO = `
INSERT INTO pt_torneos (slug, source, external_id, game_slug, nombre, descripcion, estado, major,
  region, location_type, prize_value, prize_currency, fee, max_teams, starts_at, ends_at,
  logo_url, banner_url, formato, is_demo)
VALUES ($1,'faceit',$2,$3,$4,$5,$6,false,$7,$8,$9,'USD',0,$10,$11,$12,$13,$14,$15,false)
ON CONFLICT (source, external_id) DO UPDATE SET
  nombre=EXCLUDED.nombre, descripcion=EXCLUDED.descripcion, estado=EXCLUDED.estado,
  region=EXCLUDED.region, max_teams=EXCLUDED.max_teams, starts_at=EXCLUDED.starts_at,
  ends_at=EXCLUDED.ends_at, logo_url=EXCLUDED.logo_url, updated_at=now()`;

const SQL_EQUIPO = `
INSERT INTO pt_teams (slug, nombre, tag, game_slug, region, logo_url, is_demo)
VALUES ($1,$2,$3,$4,$5,$6,false)
ON CONFLICT (slug) DO UPDATE SET
  nombre=EXCLUDED.nombre, logo_url=EXCLUDED.logo_url`;

const SQL_PARTIDA = `
INSERT INTO pt_matches (source, external_id, game_slug, tournament_id, equipo_a, equipo_b,
  score_a, score_b, estado, best_of, empieza_at, termino_at, is_demo)
VALUES ('faceit',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,false)
ON CONFLICT (source, external_id) DO UPDATE SET
  equipo_a=EXCLUDED.equipo_a, equipo_b=EXCLUDED.equipo_b, score_a=EXCLUDED.score_a,
  score_b=EXCLUDED.score_b, estado=EXCLUDED.estado, empieza_at=EXCLUDED.empieza_at,
  termino_at=EXCLUDED.termino_at`;

/** tournament_id en pt_matches es uuid FK → resolver pt_torneos.id por slug. */
async function idDeTorneo(client, tournamentSlug) {
  if (!tournamentSlug) return null;
  const r = await client.query('SELECT id FROM pt_torneos WHERE slug=$1 LIMIT 1', [tournamentSlug]);
  return r.rows.length ? r.rows[0].id : null;
}

async function upsertTorneo(client, t) {
  await client.query(SQL_TORNEO, [t.slug, t.external_id, t.game_slug, t.nombre, t.descripcion,
    t.estado, t.region, t.location_type, t.prize_value, t.max_teams, t.starts_at, t.ends_at,
    t.logo_url, t.banner_url, t.formato]);
}
async function upsertEquipo(client, e) {
  await client.query(SQL_EQUIPO, [e.slug, e.nombre, e.tag, e.game_slug, e.region, e.logo_url]);
}
async function upsertPartida(client, m) {
  const tid = await idDeTorneo(client, m.tournament_id);
  await client.query(SQL_PARTIDA, [m.external_id, m.game_slug, tid, m.equipo_a, m.equipo_b,
    m.score_a, m.score_b, m.estado, m.best_of, m.empieza_at, m.termino_at]);
}

/* ---------------- ESCRITURA (pool perezoso, 2 conexiones) ---------------- */
let pool = null;
async function poolConnect() {
  if (!pool) pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
  return pool.connect();
}

/* ---------------- MAIN ---------------- */

const proveedor = crearProveedorFaceit({ key: KEY, juegos: JUEGOS });
const resumen = { torneos: 0, equipos: 0, partidas: 0, errores: 0 };

for (const juego of JUEGOS) {
  // 1) Torneos por estado
  for (const estado of ['upcoming', 'ongoing', 'finished']) {
    let filas = [];
    try {
      filas = await proveedor.torneos({ juego, estado });
    } catch (e) {
      log('ERROR torneos ' + juego + '/' + estado + ': ' + e.message);
      resumen.errores++;
      continue;
    }
    for (const t of filas) {
      resumen.torneos++;
      log((DRY ? '[dry] torneo ' : 'torneo ') + t.slug + ' · ' + t.estado + ' · ' + t.nombre);
      if (!DRY) { const c = await poolConnect(); await upsertTorneo(c, t); c.release(); }
    }
  }
  // 2) Partidas (+ equipos derivados de facciones)
  let partidas = [];
  try {
    partidas = await proveedor.partidas({ juego });
  } catch (e) {
    log('ERROR partidas ' + juego + ': ' + e.message);
    resumen.errores++;
  }
  const equiposVistos = new Map();
  for (const m of partidas) {
    resumen.partidas++;
    log((DRY ? '[dry] partida ' : 'partida ') + m.external_id + ' · ' + m.estado + ' · ' + m.equipo_a + ' vs ' + m.equipo_b);
    if (!DRY) { const c = await poolConnect(); await upsertPartida(c, m); c.release(); }
    for (const f of ['equipo_a', 'equipo_b']) {
      const nombre = m[f];
      if (nombre && !equiposVistos.has(nombre)) equiposVistos.set(nombre, {
        slug: 'faceit-' + String(nombre).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40),
        nombre, tag: null, game_slug: m.game_slug, region: null, logo_url: null,
      });
    }
  }
  // Nota: los equipos de FACEIT con faction_id real los construye el proveedor
  // (filasEquiposDesdePartida vía p.equipos()); el fallback por nombre solo
  // completa equipos sin faction_id para que la ficha por nombre exista.
  let eqFaceit = [];
  try { eqFaceit = await proveedor.equipos(); } catch (e) { log('ERROR equipos: ' + e.message); }
  for (const eq of eqFaceit) { resumen.equipos++; log((DRY ? '[dry] equipo ' : 'equipo ') + eq.slug + ' · ' + eq.nombre); if (!DRY) { const c = await poolConnect(); await upsertEquipo(c, eq); c.release(); } }
}

/* ---------------- RESUMEN ---------------- */
log('RESUMEN' + (DRY ? ' (dry, nada escrito)' : '') + ': torneos=' + resumen.torneos + ' equipos=' + resumen.equipos + ' partidas=' + resumen.partidas + ' errores=' + resumen.errores);
if (pool) await pool.end();
process.exit(resumen.errores > 0 ? 3 : 0);
