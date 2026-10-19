'use strict';
// ============================================================
// CHEQUEOS del AGENTE VANTS — los ojos del agente.
// Cada chequeo devuelve { id, label, estado: ok|aviso|fallo|omitido, detalle, ms }
// Inyectable (fetchImpl / memoria) para tests sin red.
// ============================================================

const VERSION = '1.0.0';
const TIMEOUT_MS = 15000;

function crearChequeos(cfg = {}) {
  const fetchImpl = cfg.fetchImpl || fetch;
  const urls = {
    web: (cfg.urls && cfg.urls.web) || 'https://vants.vants.workers.dev',
    workerFaceit: (cfg.urls && cfg.urls.workerFaceit) || 'https://vants-faceit-webhook.vants.workers.dev',
    matchmaking: (cfg.urls && cfg.urls.matchmaking) || '',
  };
  const gh = {
    token: (cfg.github && cfg.github.token) || '',
    repo: (cfg.github && cfg.github.repo) || 'feispla/vants',
  };
  const db = cfg.memoria || null; // solo si es pg → chequeos de datos

  function headers() {
    const h = { 'accept': 'application/json', 'user-agent': 'VANTS-Agente/' + VERSION };
    if (gh.token) h.authorization = 'Bearer ' + gh.token;
    return h;
  }

  async function pedir(url, opciones = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opciones.timeoutMs || TIMEOUT_MS);
    try {
      const r = await fetchImpl(url, { signal: ctrl.signal, headers: Object.assign(headers(), opciones.headers || {}) });
      const texto = await r.text();
      let json = null;
      try { json = JSON.parse(texto); } catch {}
      return { status: r.status, ok: r.ok, texto, json, ms: 0 };
    } finally {
      clearTimeout(timer);
    }
  }

  // --- 1) Web principal ------------------------------------------
  async function web() {
    const t0 = Date.now();
    try {
      const r = await pedir(urls.web + '/', { headers: { accept: 'text/html' } });
      const ms = Date.now() - t0;
      const okHtml = r.status === 200 && r.texto.includes('VANTS');
      return {
        id: 'web', label: 'Web (vants.vants.workers.dev)', ms,
        estado: okHtml ? (ms > 4000 ? 'aviso' : 'ok') : 'fallo',
        detalle: okHtml ? `HTTP ${r.status} · ${Math.round(r.texto.length / 1024)} KB · ${ms} ms`
          : `HTTP ${r.status} sin contenido VANTS`,
      };
    } catch (e) {
      return { id: 'web', label: 'Web (vants.vants.workers.dev)', ms: Date.now() - t0, estado: 'fallo', detalle: e.name === 'AbortError' ? 'timeout' : String(e.message).slice(0, 120) };
    }
  }

  // --- 2) Worker del webhook FACEIT --------------------------------
  async function workerFaceit() {
    const t0 = Date.now();
    try {
      const r = await pedir(urls.workerFaceit + '/healthz');
      const ms = Date.now() - t0;
      const ok = r.status === 200 && r.json && (r.json.ok === true || r.json.version >= 2);
      return { id: 'worker_faceit', label: 'Worker FACEIT webhook', ms, estado: ok ? 'ok' : 'fallo', detalle: ok ? `version ${r.json.version}` : `HTTP ${r.status}` };
    } catch (e) {
      return { id: 'worker_faceit', label: 'Worker FACEIT webhook', ms: Date.now() - t0, estado: 'fallo', detalle: String(e.message).slice(0, 120) };
    }
  }

  // --- 3) Launcher: release + latest.yml (cadena de auto-update) ----
  async function launcher() {
    const t0 = Date.now();
    try {
      const r = await pedir(`https://api.github.com/repos/${gh.repo}/releases?per_page=10`);
      const ms = Date.now() - t0;
      if (r.status === 404) return { id: 'launcher', label: 'Launcher (releases GitHub)', ms, estado: 'fallo', detalle: 'repo de releases no encontrado' };
      if (!Array.isArray(r.json)) return { id: 'launcher', label: 'Launcher (releases GitHub)', ms, estado: 'aviso', detalle: `GitHub respondio ${r.status} (rate limit?)` };
      const publicadas = r.json.filter((x) => !x.draft);
      const borradores = r.json.filter((x) => x.draft);
      const ultima = publicadas[0] || null;
      if (!ultima) {
        return { id: 'launcher', label: 'Launcher (releases GitHub)', ms, estado: borradores.length ? 'aviso' : 'fallo', detalle: borradores.length ? `hay ${borradores.length} borrador(es) sin publicar (v${borradores[0].tag_name})` : 'no hay releases publicadas' };
      }
      const exe = (ultima.assets || []).find((a) => a.name.endsWith('.exe'));
      const latestYml = (ultima.assets || []).find((a) => a.name === 'latest.yml');
      let versionYml = null;
      if (latestYml) {
        try {
          const y = await fetchImpl(latestYml.browser_download_url, { headers: { 'user-agent': 'VANTS-Agente' } });
          versionYml = (await y.text()).match(/^version:\s*(.+)$/m)?.[1]?.trim() || null;
        } catch {}
      }
      const tag = String(ultima.tag_name).replace(/^v/, '');
      const problemas = [];
      if (!exe) problemas.push('falta el instalador .exe');
      if (!latestYml) problemas.push('falta latest.yml (auto-update roto)');
      else if (versionYml && versionYml !== tag) problemas.push(`latest.yml ${versionYml} != tag ${tag}`);
      if (borradores.length) problemas.push(`${borradores.length} borrador(es) pendiente(s) de publicar`);
      return {
        id: 'launcher', label: 'Launcher (releases GitHub)', ms,
        estado: problemas.length ? 'fallo' : 'ok',
        detalle: problemas.length ? problemas.join('; ')
          : `${ultima.tag_name} publicada · ${exe ? exe.name : ''} · latest.yml ${versionYml || '?'}`,
        datos: { tag, version_yml: versionYml, borradores: borradores.length },
      };
    } catch (e) {
      return { id: 'launcher', label: 'Launcher (releases GitHub)', ms: Date.now() - t0, estado: 'aviso', detalle: String(e.message).slice(0, 120) };
    }
  }

  // --- 4) Workflows de GitHub (ultimo run de cada uno) ---------------
  // Clasificamos por RUTA del workflow (robusto) y, si GitHub no devuelve
  // el mapa de workflows, por tokens del nombre.
  const WF = [
    { id: 'cloudflare-deploy', path: 'cloudflare-deploy.yml', tokens: ['cloudflare'] },
    { id: 'neon-migrate', path: 'neon-migrate.yml', tokens: ['migra'] },
    { id: 'desktop-electron', path: 'desktop-electron.yml', tokens: ['electron', 'hub'] },
    { id: 'faceit-xp', path: 'faceit-xp.yml', tokens: ['faceit'] },
    { id: 'tests', path: 'tests.yml', tokens: ['prueba'] },
  ];
  function clasificar(run, mapaPaths) {
    const pathWf = mapaPaths[run.workflow_id] || '';
    if (pathWf) {
      const w = WF.find((x) => pathWf.includes(x.path));
      if (w) return w.id;
      return null; // workflow que no vigilamos
    }
    const nombre = String(run.name || '').toLowerCase();
    const w = WF.find((x) => x.tokens.some((t) => nombre.includes(t)));
    return w ? w.id : null;
  }
  async function acciones() {
    const t0 = Date.now();
    try {
      // mapa workflow_id → ruta (para clasificar sin depender del nombre)
      const mapaPaths = {};
      try {
        const wfs = await pedir(`https://api.github.com/repos/${gh.repo}/actions/workflows?per_page=30`);
        for (const w of (wfs.json && wfs.json.workflows) || []) mapaPaths[w.id] = w.path || '';
      } catch {}
      const r = await pedir(`https://api.github.com/repos/${gh.repo}/actions/runs?per_page=30`);
      const ms = Date.now() - t0;
      if (!r.json || !Array.isArray(r.json.workflow_runs)) return { id: 'workflows', label: 'Workflows (CI/CD)', ms, estado: 'aviso', detalle: `GitHub respondio ${r.status}` };
      const ultimo = {};
      for (const run of r.json.workflow_runs) {
        const wId = clasificar(run, mapaPaths);
        if (wId && !ultimo[wId]) ultimo[wId] = run;
      }
      const fallos = [], oks = [];
      for (const [wId, run] of Object.entries(ultimo)) {
        if (run.status !== 'completed') { oks.push(`${wId}: en curso`); continue; }
        if (run.conclusion === 'failure' || run.conclusion === 'timed_out') {
          fallos.push({ id: wId, nombre: run.name, runId: run.id, sha: String(run.head_sha || '').slice(0, 10), url: run.html_url });
        } else oks.push(`${wId}: ${run.conclusion || run.status}`);
      }
      return {
        id: 'workflows', label: 'Workflows (CI/CD)', ms,
        estado: fallos.length ? 'fallo' : 'ok',
        detalle: fallos.length ? fallos.map((f) => `${f.id} FALLÓ (${f.sha})`).join('; ') : oks.join(' · ') || 'sin runs recientes',
        fallos, oks,
      };
    } catch (e) {
      return { id: 'workflows', label: 'Workflows (CI/CD)', ms: Date.now() - t0, estado: 'aviso', detalle: String(e.message).slice(0, 120) };
    }
  }

  // --- 5) Base de datos Neon (solo con memoria pg) -------------------
  async function neon() {
    if (!db || db.tipo() !== 'pg') return { id: 'neon', label: 'Base de datos Neon', estado: 'omitido', detalle: 'sin acceso a datos en este modo' };
    try {
      const linea = async (sql) => { try { const r = await db.queryDirecto(sql); return r.rows[0] || {}; } catch { return {}; } };
      const pend = await linea("SELECT count(*)::int AS n FROM web_events WHERE processed = false");
      const faceit = await linea("SELECT count(*)::int AS n FROM faceit_webhook_events WHERE processed = false");
      const cola = await linea("SELECT count(*)::int AS n FROM mm_tickets WHERE status = 'queued'");
      const incidentes = await linea("SELECT count(*)::int AS n FROM agent_events WHERE estado = 'abierto'");
      const partes = [
        `web_events pendientes: ${pend.n ?? '?'}`,
        `faceit sin procesar: ${faceit.n ?? '?'}`,
        `cola matchmaking: ${cola.n ?? 0}`,
      ];
      const estado = (pend.n > 100 || faceit.n > 50) ? 'aviso' : 'ok';
      return { id: 'neon', label: 'Base de datos Neon', estado, detalle: partes.join(' · ') + ` · incidentes abiertos: ${incidentes.n ?? 0}` };
    } catch (e) {
      return { id: 'neon', label: 'Base de datos Neon', estado: 'fallo', detalle: String(e.message).slice(0, 120) };
    }
  }

  // --- 6) Servicio de matchmaking (opcional) -------------------------
  async function matchmaking() {
    if (!urls.matchmaking) return { id: 'matchmaking', label: 'Matchmaking service', estado: 'omitido', detalle: 'sin URL configurada' };
    const t0 = Date.now();
    try {
      const r = await pedir(urls.matchmaking.replace(/\/$/, '') + '/healthz');
      const ms = Date.now() - t0;
      return { id: 'matchmaking', label: 'Matchmaking service', ms, estado: r.status === 200 ? 'ok' : 'fallo', detalle: r.json ? `store:${r.json.store} db:${r.json.db} queued:${r.json.queued}` : `HTTP ${r.status}` };
    } catch (e) {
      return { id: 'matchmaking', label: 'Matchmaking service', ms: Date.now() - t0, estado: 'fallo', detalle: String(e.message).slice(0, 120) };
    }
  }

  return { web, workerFaceit, launcher, acciones, neon, matchmaking, todos: () => [web(), workerFaceit(), launcher(), acciones(), neon(), matchmaking()] };
}

module.exports = { crearChequeos, VERSION };
