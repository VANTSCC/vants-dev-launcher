'use strict';
// ============================================================
// ACCIONES del AGENTE VANTS — las manos. Lista BLANCA de acciones
// que el agente puede ejecutar contra GitHub. Cada accion automatica
// lleva guarda anti-bucle: una sola vez por commit (dedupe en Neon).
// Sin token -> las acciones quedan propuestas (no ejecutadas).
// ============================================================

function crearAcciones(cfg = {}) {
  const repo = cfg.repo || process.env.GITHUB_REPOSITORY || 'feispla/vants';
  const token = cfg.token || process.env.GITHUB_TOKEN || '';
  const memoria = cfg.memoria || null;
  const fetchImpl = cfg.fetchImpl || fetch;

  async function ghApi(path, opciones = {}) {
    const r = await fetchImpl(`https://api.github.com${path}`, {
      method: opciones.method || 'GET',
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': 'VANTS-Agente',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(opciones.body ? { 'content-type': 'application/json' } : {}),
      },
      ...(opciones.body ? { body: JSON.stringify(opciones.body) } : {}),
    });
    const texto = await r.text();
    let json = null; try { json = JSON.parse(texto); } catch {}
    return { status: r.status, ok: r.ok, json };
  }

  async function redispatch(workflowId, motivo, sha) {
    if (!token) return { ejecutada: false, resultado: 'sin GITHUB_TOKEN — solo propuesta' };
    // Guarda anti-bucle: una vez por sha (o por minuto si no hay sha)
    const clave = `redispatch:${workflowId}:${sha || new Date().toISOString().slice(0, 16)}`;
    if (memoria) {
      const nueva = await memoria.marcarAccion(clave, `Re-despliegue ${workflowId} (${motivo})`, { workflowId, sha, motivo });
      if (!nueva) return { ejecutada: false, resultado: 'ya ejecutada para este commit (guarda anti-bucle)' };
    }
    const r = await ghApi(`/repos/${repo}/actions/workflows/${workflowId}/dispatches`, { method: 'POST', body: { ref: 'main' } });
    if (r.status === 204) return { ejecutada: true, resultado: `${workflowId} re-lanzado en main (${motivo})` };
    return { ejecutada: false, resultado: `GitHub respondio ${r.status} al lanzar ${workflowId}` };
  }

  const MAPA = {
    redispatch_cloudflare: (a) => redispatch('cloudflare-deploy.yml', a.motivo || 'agente', a.sha),
    redispatch_neon_migrate: (a) => redispatch('neon-migrate.yml', a.motivo || 'agente', a.sha),
    rerun_fallidos: async (a) => {
      if (!token || !a.runId) return { ejecutada: false, resultado: 'sin token o runId — solo propuesta' };
      const clave = `rerun:${a.runId}`;
      if (memoria) {
        const nueva = await memoria.marcarAccion(clave, `Re-run workflow #${a.runId}`, { runId: a.runId });
        if (!nueva) return { ejecutada: false, resultado: 'ya re-lanzado (guarda)' };
      }
      const r = await ghApi(`/repos/${repo}/actions/runs/${a.runId}/rerun`, { method: 'POST' });
      return r.status === 202 ? { ejecutada: true, resultado: `run #${a.runId} re-lanzado` } : { ejecutada: false, resultado: `GitHub respondio ${r.status}` };
    },
  };

  return {
    repo,
    conToken: () => !!token,
    async ejecutar(id, args = {}) {
      const fn = MAPA[id];
      if (!fn) return { ejecutada: false, resultado: `accion desconocida: ${id}` };
      try { return await fn(args); }
      catch (e) { return { ejecutada: false, resultado: String(e.message).slice(0, 140) }; }
    },
    idsDisponibles: () => Object.keys(MAPA),
  };
}

module.exports = { crearAcciones };
