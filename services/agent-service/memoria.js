'use strict';
// ============================================================
// MEMORIA del AGENTE VANTS — donde el agente guarda lo que ve y hace.
// DOS implementaciones de la MISMA interfaz (patron matchmaking-service):
//   crearMemoriaMemoria()  → RAM, para tests y modo degradado
//   crearMemoriaPg(pg)     → Neon (tablas agent_runs / agent_events /
//                            agent_comandos, migracion 25)
// Interfaz: tipo(), abrirRun, cerrarRun, ultimoRun, incidente, incidentesAbiertos,
//           resolverIncidente, marcarAccion, insertarComando, comandosPendientes,
//           responderComando, cerrar()
// ============================================================

const TIPO = 'memoria';

function crearMemoriaMemoria() {
  const runs = [];
  const eventos = [];
  const comandos = [];
  let seq = { run: 0, ev: 0, cmd: 0 };

  function incidente(e) {
    const existente = eventos.find((x) => x.dedupe_key === e.dedupe_key);
    if (existente) {
      if (existente.estado === 'resuelto' || existente.estado === 'archivado') {
        // reabrir: vuelve a estar pasando
        Object.assign(existente, {
          estado: 'abierto', notificado: false, titulo: e.titulo,
          severity: e.severity, detalle: e.detalle || {}, resolucion: null,
          resolved_at: null, updated_at: new Date().toISOString(),
          accion_sugerida: e.accion_sugerida || existente.accion_sugerida,
        });
      } else {
        existente.updated_at = new Date().toISOString();
      }
      return { id: existente.id, creado: false };
    }
    const fila = {
      id: ++seq.ev, dedupe_key: e.dedupe_key, kind: e.kind, severity: e.severity || 'info',
      titulo: e.titulo, detalle: e.detalle || {}, accion_sugerida: e.accion_sugerida || null,
      estado: 'abierto', resolucion: null, notificado: false,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(), resolved_at: null,
    };
    eventos.push(fila);
    return { id: fila.id, creado: true };
  }

  return {
    tipo: () => TIPO,
    async abrirRun(m) { const r = { id: ++seq.run, fuente: m.fuente || 'cli', modo: m.modo || 'ciclo', comando: m.comando || null, estado_global: 'DESCONOCIDO', resumen: null, error: null, started_at: new Date().toISOString(), finished_at: null }; runs.push(r); return r.id; },
    async cerrarRun(id, d) { const r = runs.find((x) => x.id === id); if (r) Object.assign(r, { estado_global: d.estado_global || r.estado_global, hallazgos: d.hallazgos || [], acciones: d.acciones || [], resumen: d.resumen || null, error: d.error || null, finished_at: new Date().toISOString() }); },
    async ultimoRun() { return runs.length ? runs[runs.length - 1] : null; },
    async incidente(e) { return incidente(e); },
    async incidentesAbiertos(limite = 20) { return eventos.filter((e) => e.estado === 'abierto').sort((a, b) => b.id - a.id).slice(0, limite); },
    async resolverIncidente(id, resolucion) { const e = eventos.find((x) => x.id === Number(id)); if (!e) return false; Object.assign(e, { estado: 'resuelto', resolucion: resolucion || null, resolved_at: new Date().toISOString(), updated_at: new Date().toISOString() }); return true; },
    async marcarAccion(dedupeKey, titulo, detalle) {
      const r = incidente({ dedupe_key: dedupeKey, kind: 'accion_auto', severity: 'info', titulo, detalle: detalle || {} });
      const e = eventos.find((x) => x.id === r.id);
      if (e) { e.estado = 'resuelto'; e.notificado = true; e.resolved_at = new Date().toISOString(); e.updated_at = new Date().toISOString(); }
      return r.creado;
    },
    async insertarComando(m) { const c = { id: ++seq.cmd, texto: m.texto, creado_por: m.creado_por || 'api', estado: 'pendiente', respuesta: null, entregado: false, created_at: new Date().toISOString(), respondido_at: null }; comandos.push(c); return c.id; },
    async comandosPendientes(limite = 10) { return comandos.filter((c) => c.estado === 'pendiente').slice(0, limite); },
    async responderComando(id, respuesta, ok = true) { const c = comandos.find((x) => x.id === Number(id)); if (!c) return false; Object.assign(c, { estado: ok ? 'hecho' : 'error', respuesta, respondido_at: new Date().toISOString() }); return true; },
    async cerrar() {},
  };
}

// ------------------------------------------------------------
function crearMemoriaPg(pg) {
  const TIPO_PG = 'pg';
  let client = null;

  async function conn() {
    if (!client) {
      client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: /sslmode=disable/.test(String(process.env.DATABASE_URL)) ? false : { rejectUnauthorized: false } });
      await client.connect();
    }
    return client;
  }

  async function q(sql, params) { const c = await conn(); return c.query(sql, params); }

  return {
    tipo: () => TIPO_PG,
    async abrirRun(m) {
      const r = await q(
        "INSERT INTO agent_runs (fuente, modo, comando) VALUES ($1,$2,$3) RETURNING id",
        [m.fuente || 'cli', m.modo || 'ciclo', m.comando || null]);
      return r.rows[0].id;
    },
    async cerrarRun(id, d) {
      await q(
        "UPDATE agent_runs SET estado_global=$2, hallazgos=$3::jsonb, acciones=$4::jsonb, resumen=$5, error=$6, finished_at=now() WHERE id=$1",
        [id, d.estado_global || 'DESCONOCIDO', JSON.stringify(d.hallazgos || []), JSON.stringify(d.acciones || []), d.resumen || null, d.error || null]);
    },
    async ultimoRun() {
      const r = await q("SELECT id, fuente, modo, comando, estado_global, hallazgos, acciones, resumen, error, started_at, finished_at FROM agent_runs ORDER BY id DESC LIMIT 1");
      return r.rows[0] || null;
    },
    async incidente(e) {
      // agent_reabrir_evento (migracion 25): inserta o reabre si estaba resuelto
      const r = await q("SELECT agent_reabrir_evento($1,$2,$3,$4,$5::jsonb,$6) AS id",
        [e.dedupe_key, e.titulo, e.kind, e.severity || 'info', JSON.stringify(e.detalle || {}), e.accion_sugerida || null]);
      const row = await q("SELECT (xmax = 0) AS nuevo, id FROM agent_events WHERE id=$1", [r.rows[0].id]);
      return { id: row.rows[0].id, creado: !!row.rows[0].nuevo };
    },
    async incidentesAbiertos(limite = 20) {
      const r = await q("SELECT id, dedupe_key, kind, severity, titulo, detalle, accion_sugerida, created_at FROM agent_events WHERE estado='abierto' ORDER BY id DESC LIMIT $1", [limite]);
      return r.rows;
    },
    async resolverIncidente(id, resolucion) {
      const r = await q("UPDATE agent_events SET estado='resuelto', resolucion=$2, resolved_at=now(), updated_at=now() WHERE id=$1 AND estado IN ('abierto','gestionando') RETURNING id", [id, resolucion || null]);
      return r.rowCount > 0;
    },
    async marcarAccion(dedupeKey, titulo, detalle) {
      const r = await q(
        "INSERT INTO agent_events (dedupe_key, kind, severity, titulo, estado, notificado, detalle) " +
        "VALUES ($1,'accion_auto','info',$2,'resuelto',true,$3::jsonb) ON CONFLICT (dedupe_key) DO NOTHING RETURNING id",
        [dedupeKey, titulo, JSON.stringify(detalle || {})]);
      return r.rowCount > 0;
    },
    async insertarComando(m) {
      const r = await q("INSERT INTO agent_comandos (texto, creado_por) VALUES ($1,$2) RETURNING id", [m.texto, m.creado_por || 'api']);
      return r.rows[0].id;
    },
    async comandosPendientes(limite = 10) {
      const r = await q("SELECT id, texto, creado_por, created_at FROM agent_comandos WHERE estado='pendiente' ORDER BY id ASC LIMIT $1", [limite]);
      return r.rows;
    },
    async responderComando(id, respuesta, ok = true) {
      const r = await q("UPDATE agent_comandos SET estado=$3, respuesta=$2, respondido_at=now() WHERE id=$1 AND estado='pendiente' RETURNING id", [id, respuesta, ok ? 'hecho' : 'error']);
      return r.rowCount > 0;
    },
    async queryDirecto(sql) { return q(sql); },
    async cerrar() { if (client) { try { await client.end(); } catch {} client = null; } },
  };
}

// Fabrica unica: pg solo con DATABASE_URL postgres:// real (evita el
// DATABASE_URL fantasma no-postgres que ya mordio antes en este proyecto).
function crearMemoria(pg) {
  if (typeof process !== 'undefined' && /^postgres(ql)?:\/\//.test(String(process.env.DATABASE_URL || ''))) {
    return crearMemoriaPg(pg);
  }
  return crearMemoriaMemoria();
}

module.exports = { crearMemoria, crearMemoriaMemoria, crearMemoriaPg };
