// ============================================
// VANTS — store.js · Fase 4 (persistencia matchmaking)
// --------------------------------------------
// Dos implementaciones de la MISMA interfaz para el matchmaking-service:
//   · crearStoreMemoria({ elegibles }) → tests y arranque sin Neon.
//   · crearStorePg(pool)               → producción (Neon), SQL de la
//     migración 21 (mm_tickets / mm_matches / mm_match_players +
//     mm_intentar_emparejar, atómico con SKIP LOCKED).
//
// Interfaz (todas async, nunca lanzan — devuelven { ok } o fila/null):
//   tipo, elegible(sub), encolar(datos), ticket(t), salir(t),
//   posicion(t), emparejar(game,mode,region), match(id),
//   participa(id,sub), reportar(id,sub,a,b), verificar(id),
//   historial(sub,limite), encolados(), cerrar()
// ============================================
'use strict';

const TICKET_ESTADOS = ['queued', 'matched', 'cancelled', 'expired'];

// ---------------------------------------------------------------
// MEMORIA — espejo fiel del SQL para tests y modo degradado
// ---------------------------------------------------------------
function crearStoreMemoria(opts = {}) {
  const elegibles = opts.elegibles instanceof Map ? opts.elegibles : new Map(Object.entries(opts.elegibles || {}));
  const ahora = opts.ahora || (() => new Date());
  // ratings simula players.rating (escala 0.50–1.60); default placement 0.95.
  const ratings = opts.ratings instanceof Map ? opts.ratings : new Map(Object.entries(opts.ratings || {}));
  const tickets = new Map(); // ticket -> fila
  const matches = new Map(); // id -> { match, players: [] }
  const activosPorJugador = new Map(); // `sub|game` -> ticket (índice parcial)

  function esViva(f) {
    return f.status === 'queued' && Date.parse(f.expires_at) > ahora().getTime();
  }

  return {
    tipo: 'memoria',
    async elegible(sub) {
      if (elegibles.has(sub)) return { ok: true, player_id: elegibles.get(sub) };
      return { ok: false };
    },
    async encolar(d) {
      const clave = `${d.sub}|${d.game}`;
      const existente = activosPorJugador.get(clave);
      if (existente && esViva(tickets.get(existente))) {
        return { ok: true, reutilizado: true, ticket: existente };
      }
      if (existente) activosPorJugador.delete(clave);
      const fila = {
        ticket: d.ticket,
        sub: d.sub,
        game: d.game,
        mode: d.mode,
        region: d.region,
        status: 'queued',
        match_id: null,
        enqueued_at: ahora().toISOString(),
        expires_at: new Date(ahora().getTime() + d.ttl_ms).toISOString(),
        updated_at: ahora().toISOString(),
      };
      tickets.set(d.ticket, fila);
      activosPorJugador.set(clave, d.ticket);
      return { ok: true, reutilizado: false, ticket: d.ticket };
    },
    async ticket(t) {
      const f = tickets.get(t) || null;
      return f ? { ...f } : null;
    },
    async salir(t) {
      const f = tickets.get(t);
      if (!f || f.status !== 'queued') return false;
      f.status = 'cancelled';
      f.updated_at = ahora().toISOString();
      activosPorJugador.delete(`${f.sub}|${f.game}`);
      return true;
    },
    async posicion(t) {
      const f = tickets.get(t);
      if (!f) return 0;
      let n = 1;
      for (const o of tickets.values()) {
        if (o.ticket !== t && esViva(o) && o.game === f.game && o.mode === f.mode && o.region === f.region) {
          if (Date.parse(o.enqueued_at) < Date.parse(f.enqueued_at)) n += 1;
        }
      }
      return n;
    },
    // Equivalente en memoria de mm_intentar_emparejar(): FIFO, tamaños
    // duo=2 / team=10, lados por mitades; solo si hay exactamente N vivos.
    async emparejar(game, mode, region, tam) {
      const vivos = [...tickets.values()]
        .filter((f) => esViva(f) && f.game === game && f.mode === mode && f.region === region)
        .sort((a, b) => Date.parse(a.enqueued_at) - Date.parse(b.enqueued_at));
      if (vivos.length < tam) return null;
      const grupo = vivos.slice(0, tam);
      const id = 'mm-' + crypto.randomUUID();
      const mitad = Math.ceil(tam / 2);
      matches.set(id, {
        match: {
          id,
          game,
          mode,
          region,
          status: 'propuesto',
          score_a: null,
          score_b: null,
          report_sub: null,
          report_at: null,
          verify_source: null,
          created_at: ahora().toISOString(),
        },
        players: grupo.map((f, i) => ({ sub: f.sub, team: i < mitad ? 1 : 2 })),
      });
      for (const f of grupo) {
        f.status = 'matched';
        f.match_id = id;
        f.updated_at = ahora().toISOString();
        activosPorJugador.delete(`${f.sub}|${f.game}`);
      }
      return id;
    },
    async match(id) {
      const m = matches.get(id);
      return m ? JSON.parse(JSON.stringify(m)) : null;
    },
    async participa(id, sub) {
      const m = matches.get(id);
      return !!m && m.players.some((p) => p.sub === sub);
    },
    async reportar(id, sub, scoreA, scoreB) {
      const m = matches.get(id);
      if (!m) return { ok: false, error: 'no_encontrado' };
      if (m.match.status !== 'propuesto') return { ok: false, error: 'ya_reportado' };
      m.match.status = 'reportado';
      m.match.score_a = scoreA;
      m.match.score_b = scoreB;
      m.match.report_sub = sub;
      m.match.report_at = ahora().toISOString();
      return { ok: true };
    },
    // Espejo en memoria de mm_aplicar_resultado() (migración 22):
    // win +0.015 / draw +0.002 / loss -0.012, clamp [0.50,1.60],
    // placement 0.95; RR entero = round(rating*100). Idempotente.
    async verificar(id) {
      const m = matches.get(id);
      if (!m) return { ok: false, error: 'no_encontrado' };
      if (m.match.status === 'verificado') return { ok: true, ya: true };
      if (m.match.status !== 'reportado') return { ok: false, error: 'estado_invalido' };
      const a = m.match.score_a;
      const b = m.match.score_b;
      let aplicados = 0;
      let omitidos = 0;
      for (const p of m.players) {
        if (!elegibles.has(p.sub)) { omitidos += 1; continue; }
        const res = p.team === 1
          ? (a > b ? 'win' : a < b ? 'loss' : 'draw')
          : (b > a ? 'win' : b < a ? 'loss' : 'draw');
        const antes = ratings.has(p.sub) ? ratings.get(p.sub) : 0.95;
        const desp = Math.max(0.50, Math.min(1.60, antes + (res === 'win' ? 0.015 : res === 'draw' ? 0.002 : -0.012)));
        ratings.set(p.sub, desp);
        p.rr_before = Math.round(antes * 100);
        p.rr_after = Math.round(desp * 100);
        aplicados += 1;
      }
      m.match.status = 'verificado';
      m.match.verify_source = 'auto';
      m.match.verify_payload = { aplicados, omitidos };
      return { ok: true, aplicados, omitidos };
    },
    async historial(sub, limite = 50) {
      const out = [];
      for (const [id, m] of matches) {
        const p = m.players.find((x) => x.sub === sub);
        if (!p) continue;
        const delta = p.rr_after != null && p.rr_before != null ? p.rr_after - p.rr_before : null;
        out.push({
          match_id: id,
          game: m.match.game,
          mode: m.match.mode,
          region: m.match.region,
          status: m.match.status,
          score_a: m.match.score_a,
          score_b: m.match.score_b,
          team: p.team,
          rr_before: p.rr_before != null ? p.rr_before : null,
          rr_after: p.rr_after != null ? p.rr_after : null,
          rr_delta: delta,
          resultado: delta == null ? null : delta > 0 ? 'win' : delta < 0 ? 'loss' : 'draw',
          played_at: m.match.created_at,
        });
      }
      out.sort((x, y) => (x.played_at < y.played_at ? 1 : -1));
      return out.slice(0, Math.max(1, Math.min(limite, 100)));
    },
    // Historial RR COMPLETO (migración 27: motivo·partida·temporada·fecha).
    // En memoria solo existen los internos; el store PG añade los de FACEIT
    // con la vista rr_historial_jugador. Mismo contrato + campos fuente.
    async rrHistorial(sub, limite = 50) {
      const base = await this.historial(sub, limite);
      return base.map((e) => ({
        ...e,
        motivo: 'match_interno',
        fuente: 'interno',
        partida_id: e.match_id || '',
        temporada: null,
        fecha: e.played_at,
      }));
    },
    async encolados() {
      let n = 0;
      for (const f of tickets.values()) if (esViva(f)) n += 1;
      return n;
    },
    async cerrar() { /* nada */ },
  };
}

// ---------------------------------------------------------------
// PG (Neon) — SQL de la migración 21
// ---------------------------------------------------------------
function crearStorePg(pool) {
  return {
    tipo: 'pg',
    async elegible(sub) {
      const r = await pool.query('SELECT id FROM players WHERE auth0_sub = $1 LIMIT 1', [sub]);
      if (r.rowCount > 0) return { ok: true, player_id: r.rows[0].id };
      return { ok: false };
    },
    async encolar(d) {
      const client = await pool.connect();
      try {
        // Fuente única: mm_encolar (migración 23) — reutiliza el ticket vivo,
        // valida elegibilidad y evita duplicados por índice parcial.
        // Sin request.jwt.claim.sub (conexión directa) el guard de identidad no aplica.
        const r = await client.query(
          'SELECT mm_encolar($1, $2, $3, $4, $5) AS res',
          [d.sub, d.game, d.mode, d.region, Math.round(d.ttl_ms / 1000)],
        );
        const res = r.rows[0] && r.rows[0].res;
        if (!res || res.ok !== true) {
          return { ok: false, error: (res && res.error) || 'no_se_pudo_encolar' };
        }
        return {
          ok: true,
          reutilizado: !!res.reutilizado,
          ticket: res.ticket,
          expires_at: res.expires_at || null,
        };
      } finally {
        client.release();
      }
    },
    async ticket(t) {
      const r = await pool.query('SELECT * FROM mm_tickets WHERE ticket = $1', [t]);
      return r.rows[0] || null;
    },
    async salir(t) {
      const r = await pool.query(
        `UPDATE mm_tickets SET status = 'cancelled', updated_at = now()
         WHERE ticket = $1 AND status = 'queued'`,
        [t],
      );
      return r.rowCount > 0;
    },
    async posicion(t) {
      const r = await pool.query(
        `SELECT count(*)::int + 1 AS pos
         FROM mm_tickets
         WHERE status = 'queued'
           AND game = (SELECT game FROM mm_tickets WHERE ticket = $1)
           AND mode = (SELECT mode FROM mm_tickets WHERE ticket = $1)
           AND region = (SELECT region FROM mm_tickets WHERE ticket = $1)
           AND enqueued_at < (SELECT enqueued_at FROM mm_tickets WHERE ticket = $1)`,
        [t],
      );
      return r.rows[0] ? r.rows[0].pos : 0;
    },
    async emparejar(game, mode, region) {
      const r = await pool.query('SELECT mm_intentar_emparejar($1, $2, $3) AS id', [game, mode, region]);
      return r.rows[0] && r.rows[0].id ? r.rows[0].id : null;
    },
    async match(id) {
      const r = await pool.query(
        `SELECT row_to_json(m.*) AS match,
                coalesce(jsonb_agg(jsonb_build_object('sub', p.sub, 'team', p.team) ORDER BY p.team, p.sub), '[]'::jsonb) AS players
         FROM mm_matches m LEFT JOIN mm_match_players p ON p.match_id = m.id
         WHERE m.id = $1
         GROUP BY m.id`,
        [id],
      );
      return r.rows[0] ? { match: r.rows[0].match, players: r.rows[0].players } : null;
    },
    async participa(id, sub) {
      const r = await pool.query('SELECT 1 FROM mm_match_players WHERE match_id = $1 AND sub = $2', [id, sub]);
      return r.rowCount > 0;
    },
    async reportar(id, sub, scoreA, scoreB) {
      const r = await pool.query(
        `UPDATE mm_matches
         SET status = 'reportado', score_a = $2, score_b = $3,
             report_sub = $4, report_at = now(), updated_at = now()
         WHERE id = $1 AND status = 'propuesto'`,
        [id, scoreA, scoreB, sub],
      );
      if (r.rowCount > 0) return { ok: true };
      const ex = await pool.query('SELECT 1 FROM mm_matches WHERE id = $1', [id]);
      return ex.rowCount > 0 ? { ok: false, error: 'ya_reportado' } : { ok: false, error: 'no_encontrado' };
    },
    // SELECT mm_aplicar_resultado (migración 22) — atómico e idempotente.
    async verificar(id) {
      const r = await pool.query('SELECT mm_aplicar_resultado($1) AS res', [id]);
      return r.rows[0] ? r.rows[0].res : { ok: false, error: 'no_encontrado' };
    },
    async historial(sub, limite = 50) {
      const r = await pool.query(
        'SELECT * FROM mm_historial WHERE sub = $1 LIMIT $2',
        [sub, Math.max(1, Math.min(limite, 100))],
      );
      return r.rows;
    },
    // Historial RR completo (migración 27): motivo · partida · temporada ·
    // fecha, incluyendo cambios aplicados por partidas FACEIT.
    async rrHistorial(sub, limite = 50) {
      const r = await pool.query(
        `SELECT h.* FROM rr_historial_jugador h
         JOIN players p ON p.id = h.player_id
         WHERE p.auth0_sub = $1
         ORDER BY h.fecha DESC
         LIMIT $2`,
        [sub, Math.max(1, Math.min(limite, 100))],
      );
      return r.rows;
    },
    async encolados() {
      const r = await pool.query(
        `SELECT count(*)::int AS n FROM mm_tickets
         WHERE status = 'queued' AND expires_at >= now()`,
      );
      return r.rows[0] ? r.rows[0].n : 0;
    },
    async cerrar() {
      await pool.end();
    },
  };
}

module.exports = { crearStoreMemoria, crearStorePg, TICKET_ESTADOS };
