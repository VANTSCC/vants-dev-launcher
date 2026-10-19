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
//   participa(id,sub), reportar(id,sub,a,b), encolados(), cerrar()
// ============================================
'use strict';

const TICKET_ESTADOS = ['queued', 'matched', 'cancelled', 'expired'];

// ---------------------------------------------------------------
// MEMORIA — espejo fiel del SQL para tests y modo degradado
// ---------------------------------------------------------------
function crearStoreMemoria(opts = {}) {
  const elegibles = opts.elegibles instanceof Map ? opts.elegibles : new Map(Object.entries(opts.elegibles || {}));
  const ahora = opts.ahora || (() => new Date());
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
        // El índice anti-duplicados es PARCIAL (WHERE status='queued'):
        // ON CONFLICT con predicado de índice lo toma tal cual.
        const ins = await client.query(
          `INSERT INTO mm_tickets (ticket, sub, game, mode, region, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6::timestamptz)
           ON CONFLICT (sub, game) WHERE status = 'queued' DO NOTHING
           RETURNING ticket`,
          [d.ticket, d.sub, d.game, d.mode, d.region, new Date(Date.now() + d.ttl_ms).toISOString()],
        );
        if (ins.rowCount > 0) return { ok: true, reutilizado: false, ticket: d.ticket };
        const dup = await client.query(
          `SELECT ticket FROM mm_tickets
           WHERE sub = $1 AND game = $2 AND status = 'queued' LIMIT 1`,
          [d.sub, d.game],
        );
        if (dup.rowCount > 0) return { ok: true, reutilizado: true, ticket: dup.rows[0].ticket };
        return { ok: false, error: 'no_se_pudo_encolar' };
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
