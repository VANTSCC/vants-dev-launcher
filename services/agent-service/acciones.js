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
  const vercel = {
    token: (cfg.vercel && cfg.vercel.token) || process.env.VERCEL_TOKEN || '',
    teamId: (cfg.vercel && cfg.vercel.teamId) || process.env.VERCEL_TEAM_ID || 'team_aVpm4mk3HtCuZPnzf7uSeSao',
    proyecto: (cfg.vercel && cfg.vercel.proyecto) || process.env.VERCEL_PROJECT_NAME || 'vants',
  };

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

  // Marca la acción en memoria con FAIL-SAFE: si la memoria no está
  // disponible (Neon caído / error), la acción NO se ejecuta — antes la
  // guarda se omitía silenciosamente y un bucle del agente podía
  // re-disparar workflows sin límite.
  async function marcarConGuarda(clave, titulo, detalle) {
    if (!memoria) return 'sin-memoria';
    try {
      const nueva = await memoria.marcarAccion(clave, titulo, detalle);
      return nueva ? 'nueva' : 'repetida';
    } catch (eMem) {
      return 'memoria-indispuesta';
    }
  }

  async function redispatch(workflowId, motivo, sha) {
    if (!token) return { ejecutada: false, resultado: 'sin GITHUB_TOKEN — solo propuesta' };
    // Guarda anti-bucle: una vez por sha (o por minuto si no hay sha)
    const clave = `redispatch:${workflowId}:${sha || new Date().toISOString().slice(0, 16)}`;
    const estado = await marcarConGuarda(clave, `Re-despliegue ${workflowId} (${motivo})`, { workflowId, sha, motivo });
    if (estado === 'repetida') return { ejecutada: false, resultado: 'ya ejecutada para este commit (guarda anti-bucle)' };
    if (estado === 'memoria-indispuesta') return { ejecutada: false, resultado: 'memoria no disponible — acción no ejecutada (fail-safe anti-bucle)' };
    const r = await ghApi(`/repos/${repo}/actions/workflows/${workflowId}/dispatches`, { method: 'POST', body: { ref: 'main' } });
    if (r.status === 204) return { ejecutada: true, resultado: `${workflowId} re-lanzado en main (${motivo})` };
    return { ejecutada: false, resultado: `GitHub respondio ${r.status} al lanzar ${workflowId}` };
  }

  // Re-lanza en Vercel el deploy fallido (mismo commit: deploymentId = uid).
  // Guarda anti-bucle como redispatch: por sha, y como máximo 2 intentos
  // (claves …:1 y …:2); al tercer fallo del mismo commit queda solo el incidente.
  const MAX_INTENTOS_VERCEL = 2;
  async function redeployVercel(a) {
    if (!vercel.token) return { ejecutada: false, resultado: 'sin VERCEL_TOKEN — solo propuesta' };
    if (!a.uid) return { ejecutada: false, resultado: 'sin uid del deploy fallido — solo propuesta' };
    const sha = a.sha || a.uid;
    let intento = 0;
    for (let n = 1; n <= MAX_INTENTOS_VERCEL; n++) {
      const estado = await marcarConGuarda(`redeploy_vercel:${sha}:${n}`, `Redeploy Vercel intento ${n} (${a.motivo || 'agente'})`, { uid: a.uid, sha, motivo: a.motivo });
      if (estado === 'memoria-indispuesta') return { ejecutada: false, resultado: 'memoria no disponible — acción no ejecutada (fail-safe anti-bucle)' };
      if (estado === 'nueva' || estado === 'sin-memoria') { intento = n; break; }
    }
    if (!intento) return { ejecutada: false, resultado: `ya re-lanzado ${MAX_INTENTOS_VERCEL} veces para ${sha} (guarda anti-bucle)` };
    const r = await fetchImpl(`https://api.vercel.com/v13/deployments?teamId=${encodeURIComponent(vercel.teamId)}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${vercel.token}`, 'content-type': 'application/json', 'user-agent': 'VANTS-Agente' },
      body: JSON.stringify({ name: vercel.proyecto, deploymentId: a.uid, target: 'production' }),
    });
    const texto = await r.text();
    let json = null; try { json = JSON.parse(texto); } catch {}
    if (r.ok && json && (json.id || json.uid)) {
      return { ejecutada: true, resultado: `Vercel re-lanzado (intento ${intento}/${MAX_INTENTOS_VERCEL}, commit ${sha}) → ${json.inspectorUrl || json.url || json.id}` };
    }
    const err = json && json.error ? `${json.error.code || ''} ${json.error.message || ''}`.trim() : '';
    return { ejecutada: false, resultado: `Vercel respondio ${r.status}${err ? ' (' + err.slice(0, 100) + ')' : ''} al redeploy de ${a.uid}` };
  }

  const MAPA = {
    redeploy_vercel: (a) => redeployVercel(a),
    redispatch_cloudflare: (a) => redispatch('cloudflare-deploy.yml', a.motivo || 'agente', a.sha),
    redispatch_neon_migrate: (a) => redispatch('neon-migrate.yml', a.motivo || 'agente', a.sha),
    rerun_fallidos: async (a) => {
      if (!token || !a.runId) return { ejecutada: false, resultado: 'sin token o runId — solo propuesta' };
      const clave = `rerun:${a.runId}`;
      const estado = await marcarConGuarda(clave, `Re-run workflow #${a.runId}`, { runId: a.runId });
      if (estado === 'repetida') return { ejecutada: false, resultado: 'ya re-lanzado (guarda)' };
      if (estado === 'memoria-indispuesta') return { ejecutada: false, resultado: 'memoria no disponible — acción no ejecutada (fail-safe anti-bucle)' };
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
