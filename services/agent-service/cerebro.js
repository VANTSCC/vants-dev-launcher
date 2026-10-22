'use strict';
// ============================================================
// CEREBRO del AGENTE VANTS — decide a partir de lo que ven los chequeos.
//   evaluar(resultados) → { estadoGlobal, incidentes[], acciones[], resumen }
//   interpretar(texto)  → { intencion, args }   (NLU en espanol, 0 dependencias)
// Modo reglas SIEMPRE disponible; el modulo llm.js (opcional) lo amplía a
// lenguaje libre cuando el dueno enchufe una API compatible con OpenAI.
// ============================================================

// severidad y dedupe por tipo de fallo
const REGLAS = {
  web:            { severity: 'critical', kind: 'web_down' },
  worker_faceit:  { severity: 'error',    kind: 'worker_faceit_down' },
  launcher:       { severity: 'error',    kind: 'release_inconsistente' },
  workflows:      { severity: 'warn',     kind: 'workflow_fallo' },
  neon:           { severity: 'error',    kind: 'bd_problema' },
  matchmaking:    { severity: 'warn',     kind: 'mm_problema' },
  vercel_deploy:  { severity: 'error',    kind: 'vercel_deploy_fallo' },
};

function normalizar(t) {
  return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/^[^a-z0-9]+/, '').trim();
}

// ---------- evaluación (reglas) ----------
function evaluar(resultados) {
  const lista = Array.isArray(resultados) ? resultados : [];
  const conDatos = lista.filter((c) => c && c.estado !== 'omitido');
  const fallos = conDatos.filter((c) => c.estado === 'fallo');
  const avisos = conDatos.filter((c) => c.estado === 'aviso');
  const criticos = fallos.filter((c) => (REGLAS[c.id] || {}).severity === 'critical');

  const estadoGlobal = !conDatos.length ? 'DESCONOCIDO' : criticos.length ? 'DOWN' : fallos.length ? 'DEGRADED' : avisos.length ? 'DEGRADED' : 'UP';

  const incidentes = [];
  for (const f of fallos) {
    const regla = REGLAS[f.id] || { severity: 'warn', kind: 'fallo_' + f.id };
    incidentes.push({
      dedupe_key: `${regla.kind}:${f.id}`,
      kind: regla.kind,
      severity: regla.severity,
      titulo: `${f.label}: ${f.detalle || 'fallo'}`,
      detalle: { id: f.id, ms: f.ms || null, datos: f.datos || null, fallos: f.fallos || null },
      accion_sugerida: f.id === 'web' ? 'redispatch_cloudflare'
        : f.id === 'workflows' ? 'rerun_fallidos'
        : f.id === 'launcher' ? 'revisar_release'
        : f.id === 'vercel_deploy' ? 'redeploy_vercel'
        : null,
    });
  }
  for (const a of avisos) {
    const regla = REGLAS[a.id] || { severity: 'info', kind: 'aviso_' + a.id };
    incidentes.push({
      dedupe_key: `aviso:${regla.kind}:${a.id}`,
      kind: regla.kind, severity: 'warn',
      titulo: `${a.label} (degradado): ${a.detalle || ''}`,
      detalle: { id: a.id, ms: a.ms || null },
      accion_sugerida: null,
    });
  }

  // acciones automáticas seguras que el núcleo puede ejecutar ya
  const acciones = [];
  const webFallo = fallos.find((f) => f.id === 'web');
  if (webFallo) acciones.push({ id: 'redispatch_cloudflare', seguridad: 'auto', motivo: 'Web caída' });
  const wfFallo = fallos.find((f) => f.id === 'workflows');
  if (wfFallo && Array.isArray(wfFallo.fallos) && wfFallo.fallos.length) {
    for (const f of wfFallo.fallos) {
      if (f.id === 'cloudflare-deploy') acciones.push({ id: 'redispatch_cloudflare', seguridad: 'auto', motivo: `workflow falló (${f.sha})`, sha: f.sha });
      else if (f.id === 'neon-migrate') acciones.push({ id: 'redispatch_neon_migrate', seguridad: 'auto', motivo: `workflow falló (${f.sha})`, sha: f.sha });
      else acciones.push({ id: 'rerun_fallidos', seguridad: 'auto', motivo: `workflow ${f.id} falló`, runId: f.runId });
    }
  }

  const vercelFallo = fallos.find((f) => f.id === 'vercel_deploy');
  if (vercelFallo && vercelFallo.datos && vercelFallo.datos.uid) {
    acciones.push({ id: 'redeploy_vercel', seguridad: 'auto', motivo: `deploy Vercel ${vercelFallo.datos.estado || 'fallido'} (${vercelFallo.datos.sha || vercelFallo.datos.uid})`, sha: vercelFallo.datos.sha, uid: vercelFallo.datos.uid });
  }

  const partes = conDatos.map((c) => `${c.id}:${c.estado}`).join(' ');
  const resumen = estadoGlobal === 'UP'
    ? `Todo en orden (${conDatos.length} chequeos OK · ${partes})`
    : `${estadoGlobal} — fallos: ${fallos.map((f) => f.id).join(', ') || '—'}; avisos: ${avisos.map((a) => a.id).join(', ') || '—'}`;

  return { estadoGlobal, incidentes, acciones, resumen, resultados: lista };
}

// ---------- informe legible (para Discord/DM) ----------
function informe(resultados, extra = {}) {
  const ev = evaluar(resultados);
  const lineas = [`ESTADO GLOBAL: ${ev.estadoGlobal}`, ''];
  for (const c of ev.resultados) {
    if (!c || c.estado === 'omitido') continue;
    const icono = c.estado === 'ok' ? 'OK' : c.estado === 'aviso' ? 'AVISO' : 'FALLO';
    lineas.push(`[${icono}] ${c.label} — ${c.detalle || ''}`);
  }
  if (extra.incidentesAbiertos) {
    lineas.push('', `Incidentes abiertos: ${extra.incidentesAbiertos}`);
  }
  return lineas.join('\n');
}

// ---------- NLU (español, sin acentos) ----------
function interpretar(texto) {
  const t = normalizar(texto);
  if (!t) return { intencion: 'ayuda', args: {} };
  let m;
  // ── sandbox agent (memoria + archivos + ejecución aislada) ──
  if ((m = t.match(/(?:recuerda|recordar)(?:\s+que)?\s+([^=]+?)\s*=\s*(.+)/))) return { intencion: 'recordar', args: { clave: m[1].trim(), valor: m[2].trim() } };
  if ((m = t.match(/^(?:olvida|borra de la memoria|borra el recuerdo)\s+(?:el\s+recuerdo\s+)?(.+)/))) return { intencion: 'olvidar', args: { clave: m[1].trim() } };
  if ((m = t.match(/(?:que recuerdas|que sabes de|busca en tu memoria|tu memoria)(?:\s+(?:de|sobre|esto))?:?\s*(.*)/))) return { intencion: 'buscar_memoria', args: { consulta: (m[1] || '').trim() } };
  if (/^(lista|listar|ver)\s+(los\s+)?(ficheros|archivos)/.test(t)) return { intencion: 'archivos', args: {} };
  if ((m = t.match(/^lee(?:\s+el)?\s+(?:archivo|fichero)\s+(.+)/))) return { intencion: 'leer_archivo', args: { ruta: m[1].trim() } };
  if ((m = t.match(/^(?:ejecuta|corre|run)\s+(?:en\s+la\s+sandbox\s+)?"?([^"].*?)"?$/))) return { intencion: 'sandbox', args: { comando: m[1].trim() } };
  // ── vigilancia clásica ──
  if ((m = t.match(/(?:resuelve|resolver|cierra|cerrar)[^0-9]*#?(\d+)/))) return { intencion: 'resolver', args: { id: Number(m[1]) } };
  if (/(despliega|deploy|publica|redespliega|redeploy).{0,20}(web|worker|pagina|site)|^despliega$/.test(t)) return { intencion: 'desplegar_web', args: {} };
  if (/(migra|migracion|migraciones|migrate)/.test(t)) return { intencion: 'migrar', args: {} };
  if (/(informe|reporte|report|diagnostico completo)/.test(t)) return { intencion: 'informe', args: {} };
  if (/(ciclo|revisa todo|revisa|chequea|escanea|vigila|chequeo)/.test(t)) return { intencion: 'ciclo', args: {} };
  if (/(incidente|incidentes|problema|problemas|alerta|alertas|que falla|que pasa)/.test(t)) return { intencion: 'incidentes', args: {} };
  if (/^(estado|salud|status|como va|como esta|todo bien|resumen)/.test(t)) return { intencion: 'estado', args: {} };
  if (/(ayuda|help|comandos|que sabes hacer)/.test(t)) return { intencion: 'ayuda', args: {} };
  return { intencion: 'desconocido', args: { texto } };
}

const AYUDA = [
  'Agente VANTS — entiendo:',
  '• estado · salud · "como va" → resumen rápido',
  '• informe → diagnóstico completo de todos los sistemas',
  '• revisa / ciclo → ejecuta un ciclo de vigilancia ahora',
  '• despliega la web → re-lanza el deploy de Cloudflare',
  '• migraciones → re-lanza neon-migrate',
  '• incidentes → lista lo que hay abierto',
  '• resuelve 12 → marca el incidente 12 como resuelto',
  '• recuerda clave = valor / ¿qué sabes de X? / olvida clave → memoria semántica',
  '• guarda el archivo X / lee el archivo X / lista archivos → disco de la sandbox',
  '• ejecuta "node -v" en la sandbox → comando aislado y auditado',
].join('\n');

module.exports = { evaluar, informe, interpretar, AYUDA, REGLAS };
