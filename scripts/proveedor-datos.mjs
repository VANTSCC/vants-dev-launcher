/* ============================================================
   VANTS · proveedor-datos.mjs — EsportsDataProvider (F8)
   ------------------------------------------------------------
   INTERFAZ (contrato que cumplen TODOS los adaptadores):
     await p.torneos({ juego, estado })  → [fila pt_torneos]
     await p.torneo(slug)                → fila | null
     await p.equipos()                   → [fila pt_teams]
     await p.equipos({ juego })          → [fila pt_teams]
     await p.jugadores()                 → [fila pt_players]
     await p.partidas({ juego, estado }) → [fila pt_matches]
   Las filas siguen el ESQUEMA pt_* de db/migrations/28 y 29
   (slug, source, external_id, game_slug, estado, is_demo…).

   ADAPTADORES:
   · crearProveedorDemo()            → fixtures is_demo=true con
     nombres "DEMO ·" (NUNCA pasan por reales). Fuente: db/
     migrations/28 + 29. Sirve para desarrollo/QA sin red.
   · crearProveedorFaceit({ key })   → Data API v4 de FACEIT
     (open.faceit.com, FACEIT_API_KEY). is_demo=false, source=
     'faceit'. Sin scraping: API oficial documentada.

   REGLA DE LA CASA: un proveedor NUNCA inventa datos. Si la
   fuente falla, devuelve [] o lanza — el consumidor decide.
   ============================================================ */

/* ---------- helpers de mapeo FACEIT → pt_* (puros, testeables) ---------- */

/** Estado de championship FACEIT → estado pt_torneos. */
export function mapEstadoTorneo(status) {
  const s = String(status || '').toUpperCase();
  if (s === 'ONGOING') return 'ongoing';
  if (s === 'FINISHED' || s === 'COMPLETED') return 'finished';
  if (s === 'CANCELLED' || s === 'ABORTED') return 'cancelled';
  return 'upcoming'; // UPCOMING y desconocidos: conservador
}

/** Estado de match FACEIT → estado pt_matches. */
export function mapEstadoPartida(status) {
  const s = String(status || '').toUpperCase();
  if (s === 'LIVE' || s === 'IN_PROGRESS') return 'live';
  if (s === 'FINISHED' || s === 'COMPLETED') return 'finished';
  if (s === 'CANCELLED' || s === 'ABORTED') return 'cancelled';
  return 'upcoming'; // SCHEDULED y desconocidos
}

/** game_id de FACEIT → slug de pt_games (solo juegos catalogados). */
export function mapJuego(gameId) {
  const g = String(gameId || '').toLowerCase();
  if (g === 'cs2' || g === 'csgo') return 'cs2';
  if (g === 'valorant') return 'valorant';
  if (g === 'dota2') return 'dota2';
  if (g === 'lol' || g === 'leagueoflegends') return 'lol';
  if (g === 'r6siege' || g === 'r6s') return 'r6s';
  return null; // juego no catalogado → la fila se descarta (no se inventa)
}

const FACEIT_BASE = 'https://open.faceit.com/data/v4';

/** championship FACEIT → fila pt_torneos (null si el juego no está catalogado). */
export function filaTorneoDesdeFaceit(ch) {
  if (!ch || !ch.id || !ch.game_id) return null;
  const juego = mapJuego(ch.game_id);
  if (!juego) return null;
  return {
    slug: ('faceit-' + String(ch.id)).toLowerCase(),
    source: 'faceit',
    external_id: String(ch.id),
    game_slug: juego,
    nombre: String(ch.name || 'Championship FACEIT').slice(0, 120),
    descripcion: ch.description ? String(ch.description).slice(0, 500) : null,
    estado: mapEstadoTorneo(ch.status),
    major: false,
    region: ch.region ? String(ch.region).toUpperCase().slice(0, 8) : null,
    location_type: null,            // FACEIT no lo expone: no se inventa
    prize_value: null,              // solo si la API lo trae (no hay scraping)
    prize_currency: 'USD',
    fee: 0,
    max_teams: Number.isFinite(ch.slots) ? ch.slots : null,
    starts_at: ch.started_at ? new Date(ch.started_at * 1000).toISOString() : null,
    ends_at: ch.finished_at ? new Date(ch.finished_at * 1000).toISOString() : null,
    logo_url: ch.featured_image || null,
    banner_url: ch.background_image || null,
    formato: null,
    is_demo: false,
  };
}

/** match FACEIT → fila pt_matches (null si el juego no está catalogado). */
export function filaPartidaDesdeFaceit(m) {
  if (!m || !m.match_id || !m.game_id) return null;
  const juego = mapJuego(m.game_id);
  if (!juego) return null;
  const f1 = m.teams && m.teams.faction1 ? m.teams.faction1 : null;
  const f2 = m.teams && m.teams.faction2 ? m.teams.faction2 : null;
  if (!f1 || !f2) return null;
  const res = m.results || {};
  return {
    source: 'faceit',
    external_id: String(m.match_id),
    game_slug: juego,
    tournament_id: null,            // el sync lo resuelve por championship_id
    equipo_a: String(f1.name || '—').slice(0, 80),
    equipo_b: String(f2.name || '—').slice(0, 80),
    score_a: res.score1 != null ? Number(res.score1) : null,
    score_b: res.score2 != null ? Number(res.score2) : null,
    estado: mapEstadoPartida(m.status),
    best_of: Number.isFinite(m.best_of) ? m.best_of : null,
    empieza_at: m.scheduled_at ? new Date(m.scheduled_at * 1000).toISOString() : (m.started_at ? new Date(m.started_at * 1000).toISOString() : null),
    termino_at: m.finished_at ? new Date(m.finished_at * 1000).toISOString() : null,
    is_demo: false,
  };
}

/** Facciones de un match → filas pt_teams (dedup por faction_id). */
export function filasEquiposDesdePartida(m) {
  const out = [];
  const vistos = new Set();
  const f1 = m && m.teams && m.teams.faction1 ? m.teams.faction1 : null;
  const f2 = m && m.teams && m.teams.faction2 ? m.teams.faction2 : null;
  for (const f of [f1, f2]) {
    if (!f || !f.faction_id || vistos.has(f.faction_id)) continue;
    vistos.add(f.faction_id);
    const juego = mapJuego(m.game_id);
    if (!juego) continue;
    out.push({
      slug: ('faceit-' + String(f.faction_id)).toLowerCase(),
      nombre: String(f.name || '—').slice(0, 80),
      tag: null,
      game_slug: juego,
      region: null,
      logo_url: f.avatar || null,
      source: 'faceit',
      external_id: String(f.faction_id),
      is_demo: false,
    });
  }
  return out;
}

/* ---------- ADAPTADOR DEMO (fixtures etiquetadas, nunca reales) ---------- */

const DEMO_JUGADORES = [
  ['demo-jugador-alex', 'DEMO · Alex «Fx» Morales', 'valorant', 'demo-equipo-fenix', 'IGL', 'VE'],
  ['demo-jugador-kira', 'DEMO · Kira «K9» Rojas', 'valorant', 'demo-equipo-fenix', 'Duelista', 'MX'],
  ['demo-jugador-bruno', 'DEMO · Bruno «B7» Cano', 'valorant', 'demo-equipo-lobo', 'IGL', 'PE'],
  ['demo-jugador-koldo', 'DEMO · Koldo «KD» Sáez', 'cs2', 'demo-equipo-stratos', 'IGL', 'ES'],
  ['demo-jugador-lena', 'DEMO · Lena «LN» Vidal', 'cs2', 'demo-equipo-stratos', 'AWPer', 'ES'],
  ['demo-jugador-pau', 'DEMO · Pau «P4» Gil', 'cs2', 'demo-equipo-nova', 'IGL', 'ES'],
];

export function crearProveedorDemo() {
  const TORNEOS = [
    { slug: 'demo-copa-comunidad-s5', source: 'demo', external_id: 'demo-copa-comunidad-s5', game_slug: 'valorant', nombre: 'DEMO · Copa Comunidad S5', estado: 'upcoming', major: false, region: 'LATAM', location_type: 'online', prize_value: 500, prize_currency: 'USD', fee: 0, max_teams: 16, formato: 'Eliminación simple · Bo1', is_demo: true },
    { slug: 'demo-liga-nocturna-s5', source: 'demo', external_id: 'demo-liga-nocturna-s5', game_slug: 'valorant', nombre: 'DEMO · Liga Nocturna S5', estado: 'ongoing', major: false, region: 'LATAM', location_type: 'online', prize_value: 250, prize_currency: 'USD', fee: 0, max_teams: 32, formato: 'Liga suiza · Bo1', is_demo: true },
    { slug: 'demo-stratos-major-s5', source: 'demo', external_id: 'demo-stratos-major-s5', game_slug: 'cs2', nombre: 'DEMO · Stratos Major S5', estado: 'upcoming', major: true, region: 'EU', location_type: 'lan', prize_value: 1000, prize_currency: 'USD', fee: 0, max_teams: 24, formato: 'Doble eliminación · Bo3', is_demo: true },
    { slug: 'demo-copita-cs2-archivada', source: 'demo', external_id: 'demo-copita-cs2-archivada', game_slug: 'cs2', nombre: 'DEMO · Copita CS2 (archivo)', estado: 'finished', major: false, region: 'EU', location_type: 'online', prize_value: 300, prize_currency: 'USD', fee: 0, max_teams: 8, formato: 'Eliminación simple · Bo1', is_demo: true },
  ];
  const EQUIPOS = [
    { slug: 'demo-equipo-fenix', source: 'demo', external_id: 'demo-equipo-fenix', nombre: 'DEMO · Equipo Fénix', tag: 'FNX', game_slug: 'valorant', region: 'LATAM', is_demo: true },
    { slug: 'demo-equipo-lobo', source: 'demo', external_id: 'demo-equipo-lobo', nombre: 'DEMO · Equipo Lobo', tag: 'LBO', game_slug: 'valorant', region: 'LATAM', is_demo: true },
    { slug: 'demo-equipo-stratos', source: 'demo', external_id: 'demo-equipo-stratos', nombre: 'DEMO · Equipo Stratos', tag: 'STS', game_slug: 'cs2', region: 'EU', is_demo: true },
    { slug: 'demo-equipo-nova', source: 'demo', external_id: 'demo-equipo-nova', nombre: 'DEMO · Equipo Nova', tag: 'NVA', game_slug: 'cs2', region: 'EU', is_demo: true },
  ];
  const PARTIDAS = [
    { source: 'demo', external_id: 'demo-m1', game_slug: 'valorant', equipo_a: 'DEMO · Equipo Fénix', equipo_b: 'DEMO · Equipo Lobo', estado: 'live', best_of: 1, is_demo: true },
    { source: 'demo', external_id: 'demo-m2', game_slug: 'valorant', equipo_a: 'DEMO · Equipo Lobo', equipo_b: 'DEMO · Equipo Fénix', estado: 'upcoming', best_of: 1, is_demo: true },
    { source: 'demo', external_id: 'demo-m3', game_slug: 'cs2', equipo_a: 'DEMO · Equipo Stratos', equipo_b: 'DEMO · Equipo Nova', score_a: 2, score_b: 1, estado: 'finished', best_of: 3, is_demo: true },
  ];
  return {
    nombre: 'demo',
    esDemo: true,
    async torneos(q) {
      let r = [...TORNEOS];
      if (q && q.juego) r = r.filter((t) => t.game_slug === q.juego);
      if (q && q.estado) r = r.filter((t) => t.estado === q.estado);
      return r;
    },
    async torneo(slug) {
      return TORNEOS.find((t) => t.slug === slug) || null;
    },
    async equipos(q) {
      let r = [...EQUIPOS];
      if (q && q.juego) r = r.filter((t) => t.game_slug === q.juego);
      return r;
    },
    async jugadores() {
      return DEMO_JUGADORES.map(([slug, nombre, game_slug, team_slug, rol, pais]) => ({
        slug, source: 'demo', external_id: slug, nombre, game_slug, team_slug, rol, pais, is_demo: true,
      }));
    },
    async partidas(q) {
      let r = [...PARTIDAS];
      if (q && q.juego) r = r.filter((m) => m.game_slug === q.juego);
      if (q && q.estado) r = r.filter((m) => m.estado === q.estado);
      return r;
    },
  };
}

/* ---------- ADAPTADOR FACEIT (Data API v4 oficial, sin scraping) ---------- */

export function crearProveedorFaceit({ key, juegos = ['cs2'], fetchImpl = fetch, limite = 10 } = {}) {
  if (!key) throw new Error('crearProveedorFaceit: falta FACEIT_API_KEY');
  const crudos = new Map(); // external_id → match crudo (para derivar facciones/equipos)
  async function api(ruta) {
    const r = await fetchImpl(FACEIT_BASE + ruta, {
      headers: { Authorization: 'Bearer ' + key, Accept: 'application/json' },
    });
    if (!r.ok) {
      const err = new Error('FACEIT ' + ruta + ' → HTTP ' + r.status);
      err.status = r.status;
      throw err;
    }
    return r.json();
  }
  return {
    nombre: 'faceit',
    esDemo: false,
    /** Lista championships por juego y tipo (upcoming/ongoing/past).
     *  CUALQUIER error HTTP (key inválida, cuota, red) LANZA — nunca se
     *  disfraza de "vacío" (regla anti datos inventados/éxito falso). */
    async torneos(q = {}) {
      const juego = q.juego || juegos[0];
      const tipo = q.estado === 'ongoing' ? 'ongoing' : q.estado === 'finished' ? 'past' : 'upcoming';
      const d = await api('/championships?game=' + encodeURIComponent(juego) + '&type=' + tipo + '&limit=' + limite);
      return (d.items || []).map(filaTorneoDesdeFaceit).filter(Boolean);
    },
    async torneo(slug) {
      const id = String(slug || '').replace(/^faceit-/, '');
      if (!id) return null;
      try {
        return filaTorneoDesdeFaceit(await api('/championships/' + encodeURIComponent(id)));
      } catch (e) {
        if (e.status === 404) return null;
        throw e;
      }
    },
    async equipos() {
      // Los equipos llegan de las facciones de los matches CRUDOS (con faction_id).
      // Reutiliza los matches ya traídos por partidas(); si no hay, los trae.
      if (crudos.size === 0) await this.partidas({});
      const mapa = new Map();
      for (const m of crudos.values()) {
        for (const eq of filasEquiposDesdePartida(m)) {
          if (!mapa.has(eq.external_id)) mapa.set(eq.external_id, eq);
        }
      }
      return [...mapa.values()];
    },
    async jugadores() {
      // FACEIT v4 no expone rosters de championship sin scopes de organizador:
      // se devuelve [] honesto (NO se inventan plantillas).
      return [];
    },
    async partidas(q = {}) {
      const juego = q.juego || juegos[0];
      const tipos = q.estado === 'finished' ? ['past'] : q.estado === 'upcoming' ? ['upcoming'] : ['ongoing', 'upcoming'];
      const filas = [];
      for (const tipo of tipos) {
        const d = await api('/championships?game=' + encodeURIComponent(juego) + '&type=' + tipo + '&limit=' + limite);
        const champs = d.items || [];
        for (const c of champs.slice(0, 3)) {
          // un championship individual roto no mata la corrida (se salta)
          let ms = [];
          try {
            const d2 = await api('/championships/' + c.id + '/matches?limit=20');
            ms = d2.items || [];
          } catch (e) { continue; }
          for (const m of ms) {
            const f = filaPartidaDesdeFaceit(m);
            if (f) {
              f.tournament_id = ('faceit-' + String(c.id)).toLowerCase();
              crudos.set(String(m.match_id), m); // crudo para equipos() (faction_id)
            }
            if (f && (!q.estado || f.estado === q.estado)) filas.push(f);
          }
        }
      }
      return filas;
    },
  };
}

/** Resolución de provider por nombre (factory única de la casa). */
export function crearProveedor(nombre, opciones = {}) {
  if (nombre === 'demo') return crearProveedorDemo();
  if (nombre === 'faceit') return crearProveedorFaceit(opciones);
  throw new Error('Proveedor desconocido: ' + nombre + ' (usar demo | faceit)');
}
