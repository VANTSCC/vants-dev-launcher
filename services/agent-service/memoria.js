'use strict';
// ============================================================
// MEMORIA del AGENTE VANTS — donde el agente guarda lo que ve y hace.
// DOS implementaciones de la MISMA interfaz (patron matchmaking-service):
//   crearMemoriaMemoria()  → RAM, para tests y modo degradado
//   crearMemoriaPg(pg)     → Neon (migración 25: agent_runs/events/comandos
//                            + migración 26: agent_memoria/agent_archivos/
//                            agent_sandbox_execs)
// Interfaz: tipo(), abrirRun, cerrarRun, ultimoRun, incidente, incidentesAbiertos,
//           resolverIncidente, marcarAccion, insertarComando, comandosPendientes,
//           responderComando, recordar, recordarBuscar, olvidar, memoriaListar,
//           archivoGuardar, archivoLeer, archivoListar, archivoBorrar,
//           sandboxRegistrar, sandboxExecs, cerrar()
// ============================================================

const TIPO = 'memoria';

function crearMemoriaMemoria() {
  const runs = [];
  const eventos = [];
  const comandos = [];
  const recuerdos = new Map(); // clave -> fila (memoria semántica)
  const archivos = new Map();  // ruta -> fila (disco de la sandbox)
  const execs = [];            // auditoría sandbox (capped)
  let seq = { run: 0, ev: 0, cmd: 0, ex: 0 };

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

    // ── SANDBOX AGENT: almacenes de memoria (RAM) ──
    async recordar(clave, valor, o = {}) {
      const f = { id: (recuerdos.get(clave) && recuerdos.get(clave).id) || recuerdos.size + 1, clave, valor: String(valor), tipo: o.tipo || 'hecho', importancia: Math.max(1, Math.min(5, o.importancia || 3)), expira_en: o.expiraEn || null, creado_por: o.creadoPor || 'agente', created_at: (recuerdos.get(clave) && recuerdos.get(clave).created_at) || new Date().toISOString(), updated_at: new Date().toISOString() };
      recuerdos.set(clave, f); return f.id;
    },
    async recordarBuscar(consulta, limite = 10) {
      const q = String(consulta || '').toLowerCase(); const ahora = Date.now();
      return [...recuerdos.values()]
        .filter((f) => (!f.expira_en || new Date(f.expira_en) > ahora) && (!q || f.clave.toLowerCase().includes(q) || f.valor.toLowerCase().includes(q) || f.tipo.toLowerCase().includes(q)))
        .sort((a, b) => b.importancia - a.importancia || b.updated_at.localeCompare(a.updated_at))
        .slice(0, limite);
    },
    async olvidar(clave) { return recuerdos.delete(clave); },
    async memoriaListar(limite = 50) { return [...recuerdos.values()].sort((a, b) => b.importancia - a.importancia).slice(0, limite); },

    async archivoGuardar(ruta, contenido, o = {}) {
      const bytes = Buffer.byteLength(String(contenido), 'utf8');
      if (bytes > (o.maxBytes || 262144)) throw new Error(`archivo supera el límite (${bytes} > ${o.maxBytes || 262144} bytes)`);
      const prev = archivos.get(ruta);
      const f = { id: (prev && prev.id) || archivos.size + 1, ruta, contenido: String(contenido), bytes, sha256: require('crypto').createHash('sha256').update(String(contenido)).digest('hex').slice(0, 16), run_id: o.runId || null, created_at: (prev && prev.created_at) || new Date().toISOString(), updated_at: new Date().toISOString() };
      archivos.set(ruta, f); return { id: f.id, bytes, sha256: f.sha256 };
    },
    async archivoLeer(ruta) { return archivos.get(ruta) || null; },
    async archivoListar(prefijo = '', limite = 50) { return [...archivos.values()].filter((f) => f.ruta.startsWith(prefijo)).sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, limite).map(({ contenido, ...resto }) => resto); },
    async archivoBorrar(ruta) { return archivos.delete(ruta); },

    async sandboxRegistrar(e) { const f = { id: ++seq.ex, comando: e.comando, exit_code: e.exitCode, stdout: (e.stdout || '').slice(0, 32768), stderr: (e.stderr || '').slice(0, 8192), duracion_ms: e.duracionMs, run_id: e.runId || null, created_at: new Date().toISOString() }; execs.push(f); if (execs.length > 100) execs.splice(0, execs.length - 100); return f.id; },
    async sandboxExecs(limite = 10) { return execs.slice(-limite).reverse(); },

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

    // ── SANDBOX AGENT: almacenes de memoria (Neon, migración 26) ──
    async recordar(clave, valor, o = {}) {
      const r = await q("SELECT agent_recordar($1,$2,$3,$4,$5,$6) AS id", [String(clave).slice(0, 200), String(valor).slice(0, 8192), o.tipo || 'hecho', o.importancia || 3, o.expiraEn || null, o.creadoPor || 'agente']);
      return r.rows[0].id;
    },
    async recordarBuscar(consulta, limite = 10) {
      const r = await q(
        "SELECT id, clave, valor, tipo, importancia, creado_por, updated_at FROM agent_memoria " +
        "WHERE (expira_en IS NULL OR expira_en > now()) AND ($1 = '' OR clave ILIKE '%' || $1 || '%' OR valor ILIKE '%' || $1 || '%' OR tipo ILIKE '%' || $1 || '%') " +
        "ORDER BY importancia DESC, updated_at DESC LIMIT $2",
        [String(consulta || '').slice(0, 200), limite]);
      return r.rows;
    },
    async olvidar(clave) {
      const r = await q("DELETE FROM agent_memoria WHERE clave=$1", [clave]);
      return r.rowCount > 0;
    },
    async memoriaListar(limite = 50) {
      const r = await q("SELECT id, clave, valor, tipo, importancia, creado_por, updated_at FROM agent_memoria ORDER BY importancia DESC, updated_at DESC LIMIT $1", [limite]);
      return r.rows;
    },

    async archivoGuardar(ruta, contenido, o = {}) {
      const bytes = Buffer.byteLength(String(contenido), 'utf8');
      if (bytes > (o.maxBytes || 262144)) throw new Error(`archivo supera el límite (${bytes} > ${o.maxBytes || 262144} bytes)`);
      const sha = require('crypto').createHash('sha256').update(String(contenido)).digest('hex').slice(0, 16);
      const r = await q(
        "INSERT INTO agent_archivos (ruta, contenido, bytes, sha256, run_id) VALUES ($1,$2,$3,$4,$5) " +
        "ON CONFLICT (ruta) DO UPDATE SET contenido=EXCLUDED.contenido, bytes=EXCLUDED.bytes, sha256=EXCLUDED.sha256, run_id=EXCLUDED.run_id, updated_at=now() RETURNING id, bytes, sha256",
        [String(ruta).slice(0, 300), String(contenido), bytes, sha, o.runId || null]);
      return r.rows[0];
    },
    async archivoLeer(ruta) {
      const r = await q("SELECT id, ruta, contenido, bytes, sha256, run_id, created_at, updated_at FROM agent_archivos WHERE ruta=$1", [ruta]);
      return r.rows[0] || null;
    },
    async archivoListar(prefijo = '', limite = 50) {
      const r = await q("SELECT id, ruta, bytes, sha256, run_id, created_at, updated_at FROM agent_archivos WHERE ruta LIKE $1 || '%' ORDER BY updated_at DESC LIMIT $2", [prefijo, limite]);
      return r.rows;
    },
    async archivoBorrar(ruta) {
      const r = await q("DELETE FROM agent_archivos WHERE ruta=$1", [ruta]);
      return r.rowCount > 0;
    },

    async sandboxRegistrar(e) {
      const r = await q(
        "INSERT INTO agent_sandbox_execs (comando, exit_code, stdout, stderr, duracion_ms, run_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
        [String(e.comando).slice(0, 2000), e.exitCode, (e.stdout || '').slice(0, 32768), (e.stderr || '').slice(0, 8192), e.duracionMs, e.runId || null]);
      return r.rows[0].id;
    },
    async sandboxExecs(limite = 10) {
      const r = await q("SELECT id, comando, exit_code, duracion_ms, created_at FROM agent_sandbox_execs ORDER BY id DESC LIMIT $1", [limite]);
      return r.rows;
    },

    async queryDirecto(sql) { return q(sql); },
    async cerrar() { if (client) { try { await client.end(); } catch {} client = null; } },
  };
}

// Fabrica unica: pg solo con DATABASE_URL postgres:// real (evita el
// DATABASE_URL fantasma no-postgres que ya mordio antes en este proyecto).
// El modulo pg se carga aquí dentro para que cualquier consumidor (cli, api,
// CI) no tenga que inyectarlo.
function crearMemoria(pg) {
  if (typeof process !== 'undefined' && /^postgres(ql)?:\/\//.test(String(process.env.DATABASE_URL || ''))) {
    return crearMemoriaPg(pg || require('pg'));
  }
  return crearMemoriaMemoria();
}

module.exports = { crearMemoria, crearMemoriaMemoria, crearMemoriaPg };
