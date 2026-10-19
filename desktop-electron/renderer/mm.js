// ============================================================
// VANTS HUB · mm.js — BUSCAR PARTIDA (matchmaking real, Fase 4/5)
// ------------------------------------------------------------
// Módulo independiente (patrón Fase 2 del plan): no toca app.js,
// solo se enchufa a los elementos de #cajon-buscar y a vantsHub.
// Toda la lógica vive en SQL (migraciones 21–23): mm_encolar,
// mm_ticket_estado, mm_salir, mm_reportar, mm_historial_de —
// llamadas por PostgREST con el Bearer de la sesión del HUB.
// Reglas: 1 ticket activo por jugador y juego · duo 1v1 · team 5v5 ·
// TTL 10 min · primer reporte gana · RR win +1.5 / draw +0.2 / loss -1.2
// (escala entera *100 de la web).
// ============================================================
(function () {
  'use strict';
  if (window.__VANTS_MM) return; // guarda anti-doble-carga
  window.__VANTS_MM = true;

  const H = window.vantsHub;
  if (!H) return;
  const $ = (s) => document.querySelector(s);

  const estadoEl = $('#mm-estado');
  const juegoEl = $('#mm-juego');
  const modoEl = $('#mm-modo');
  const regionEl = $('#mm-region');
  const btnEntrar = $('#mm-entrar');
  const btnSalir = $('#mm-salir');
  const panelMatch = $('#mm-panel-match');
  const matchBox = $('#mm-match');
  const matchIdEl = $('#mm-match-id');
  const reportarBox = $('#mm-reportar');
  const reportarEstado = $('#mm-reportar-estado');
  const historialEl = $('#mm-historial');

  let SESION = null;
  let ticket = null;
  let matchId = null;
  let sondeo = null;
  const JUEGO_LABEL = { valorant: 'VALORANT', cs2: 'Counter-Strike 2' };

  // ---------- estilos propios (prefijo mm-, opt-in como components.js) ----------
  function estilos() {
    if ($('#vants-mm-styles')) return;
    const st = document.createElement('style');
    st.id = 'vants-mm-styles';
    st.textContent = [
      '.mm-form{display:flex;flex-wrap:wrap;gap:12px;align-items:end;margin-top:14px}',
      '.mm-form label{display:flex;flex-direction:column;gap:6px;font-size:11px;letter-spacing:.08em;color:#8b8b96;font-weight:700}',
      '.mm-form select,.mm-form input{background:#131318;border:1px solid #26262e;color:#e8e8ee;border-radius:8px;padding:9px 10px;font:600 13px/1 inherit;min-width:130px}',
      '.mm-botones{display:flex;gap:10px;align-items:end}',
      '.mm-match{display:flex;flex-wrap:wrap;gap:10px;margin-top:12px}',
      '.mm-side{flex:1;min-width:180px;background:#131318;border:1px solid #26262e;border-radius:10px;padding:10px 12px}',
      '.mm-side h4{margin:0 0 8px;font-size:12px;letter-spacing:.1em;color:#8b8b96}',
      '.mm-p{display:flex;justify-content:space-between;font-size:13px;padding:3px 0}',
      '.mm-score{font-size:26px;font-weight:900;color:#e8e8ee;margin:6px 0 10px;font-variant-numeric:tabular-nums}',
      '.mm-verde{color:#39d98a}.mm-rojo{color:#ff5c5c}.mm-gris{color:#8b8b96}',
      '#cajon-buscar .tabla{margin-top:10px}'
    ].join('\n');
    document.head.appendChild(st);
  }

  function setEstado(txt) { if (estadoEl) estadoEl.textContent = txt; }
  function detenerSondeo() { if (sondeo) { clearInterval(sondeo); sondeo = null; } }

  // ---------- llamadas rpc (POST cuerpo → PostgREST) ----------
  async function rpc(nombre, cuerpo) {
    const r = await H.api('/rpc/' + nombre, { metodo: 'POST', cuerpo: cuerpo });
    if (r && r.__noauth) return { ok: false, error: 'sin_sesion' };
    if (r && r.__error) return { ok: false, error: r.__error };
    return r || { ok: false, error: 'respuesta_vacia' };
  }

  // ---------- entrar / salir de la cola ----------
  async function entrar() {
    if (!SESION || !SESION.sub) { setEstado('inicia sesión primero'); return; }
    btnEntrar.disabled = true;
    try {
      const r = await rpc('mm_encolar', {
        p_sub: SESION.sub,
        p_game: juegoEl.value,
        p_mode: modoEl.value,
        p_region: regionEl.value,
        p_ttl_seg: 600,
      });
      if (!r.ok) {
        const msg = r.error === 'no_elegible' ? 'tu perfil no es elegible: creá tu perfil de jugador en la web'
          : r.error === 'sin_sesion' ? 'inicia sesión primero'
          : (r.error || 'no se pudo encolar');
        setEstado(msg);
        return;
      }
      ticket = r.ticket;
      setEstado((r.reutilizado ? 'ya estabas en cola · ' : 'en cola · ') + JUEGO_LABEL[juegoEl.value] + ' · ' + modoEl.value.toUpperCase());
      btnEntrar.classList.add('oculto');
      btnSalir.classList.remove('oculto');
      detenerSondeo();
      sondeo = setInterval(poll, 3000);
      poll();
    } finally {
      btnEntrar.disabled = false;
    }
  }

  async function salir() {
    if (!ticket) return;
    detenerSondeo();
    await rpc('mm_salir', { p_ticket: ticket });
    ticket = null;
    setEstado('fuera de la cola');
    btnEntrar.classList.remove('oculto');
    btnSalir.classList.add('oculto');
  }

  // ---------- sondeo del ticket ----------
  async function poll() {
    if (!ticket) return detenerSondeo();
    const r = await rpc('mm_ticket_estado', { p_ticket: ticket });
    if (!r.ok) {
      if (r.error === 'no_encontrado') { ticket = null; detenerSondeo(); setEstado('ticket caducado'); btnEntrar.classList.remove('oculto'); btnSalir.classList.add('oculto'); }
      return;
    }
    if (r.status === 'queued') setEstado('en cola · posición ' + (r.position || 1));
    else if (r.status === 'matched' && r.match_id) { matchId = r.match_id; detenerSondeo(); pintarMatch(); }
    else if (r.status === 'expired') { ticket = null; detenerSondeo(); setEstado('la cola caducó (10 min) — volvé a entrar'); btnEntrar.classList.remove('oculto'); btnSalir.classList.add('oculto'); }
  }

  // ---------- match encontrado ----------
  async function pintarMatch() {
    setEstado('PARTIDA ENCONTRADA');
    btnEntrar.classList.add('oculto');
    btnSalir.classList.add('oculto');
    panelMatch.classList.remove('oculto');
    matchIdEl.textContent = String(matchId).slice(0, 8);
    matchBox.innerHTML = '<div class="dim">cargando equipos…</div>';
    const [m, ps] = await Promise.all([
      H.api('/mm_matches?id=eq.' + encodeURIComponent(matchId) + '&select=game,mode,region,status,score_a,score_b'),
      H.api('/mm_match_players?match_id=eq.' + encodeURIComponent(matchId) + '&select=sub,team,rr_before,rr_after&order=team,sub'),
    ]);
    const match = Array.isArray(m) ? m[0] : null;
    const jugadores = Array.isArray(ps) ? ps : [];
    const yo = SESION && SESION.sub;
    const miTeam = (jugadores.find((p) => p.sub === yo) || {}).team || 1;
    const lado = (t) => jugadores.filter((p) => p.team === t)
      .map((p) => '<div class="mm-p"><span>' + (p.sub === yo ? '<b>vos</b>' : escapeHtml(String(p.sub).slice(0, 18))) + '</span><span class="mono">' + (p.rr_after != null ? p.rr_after + ' RR' : '—') + '</span></div>')
      .join('') || '<div class="dim">esperando…</div>';
    const s1 = match ? match.score_a : null;
    const s2 = match ? match.score_b : null;
    const verificado = match && match.status === 'verificado';
    matchBox.innerHTML =
      '<div class="mm-side"><h4>EQUIPO 1' + (miTeam === 1 ? ' · VOS' : '') + '</h4>' + lado(1) + '</div>' +
      '<div class="mm-side" style="max-width:150px"><h4>RESULTADO</h4>' +
      '<div class="mm-score">' + (s1 != null ? s1 + ' : ' + s2 : '— : —') + '</div>' +
      (verificado ? '<span class="mm-verde">VERIFICADO · RR aplicado</span>' : (s1 != null ? '<span class="mm-gris">reportado</span>' : '<span class="mm-gris">reportá el resultado al terminar</span>')) +
      '</div>' +
      '<div class="mm-side"><h4>EQUIPO 2' + (miTeam === 2 ? ' · VOS' : '') + '</h4>' + lado(2) + '</div>';
    // reportar visible solo si aún no hay score
    reportarBox.classList.toggle('oculto', !!(s1 != null || verificado));
    historial();
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------- reportar ----------
  async function reportar() {
    if (!matchId || !SESION) return;
    const a = parseInt($('#mm-sa').value, 10) || 0;
    const b = parseInt($('#mm-sb').value, 10) || 0;
    reportarEstado.textContent = 'enviando…';
    const r = await rpc('mm_reportar', { p_match_id: matchId, p_sub: SESION.sub, p_score_a: a, p_score_b: b });
    if (!r.ok) {
      reportarEstado.textContent = r.error === 'ya_reportado' ? 'ya estaba reportado' : (r.error || 'error al reportar');
      return;
    }
    reportarEstado.textContent = 'resultado reportado · RR aplicado ✓'.replace('✓', '');
    reportarBox.classList.add('oculto');
    pintarMatch();
  }

  // ---------- lanzar el juego ----------
  async function lanzar() {
    const juego = juegoEl.value;
    const bib = await H.biblioteca();
    const lista = (bib && bib.juegos) || [];
    const objetivo = lista.find((j) => (j.id === juego) || (j.nombre || '').toLowerCase().includes(juego === 'cs2' ? 'counter-strike' : juego));
    if (objetivo) { await H.jugar(objetivo); return; }
    // sin biblioteca local: abrir por vía conocida
    if (juego === 'cs2') await H.abrir('steam://rungameid/730');
    else await H.abrir('https://playvalorant.com/');
  }

  // ---------- historial ----------
  async function historial() {
    if (!SESION || !SESION.sub) return;
    const filas = await rpc('mm_historial_de', { p_sub: SESION.sub, p_limite: 20 });
    if (!Array.isArray(filas) || filas.length === 0) {
      historialEl.innerHTML = '<div class="dim">sin partidas todavía</div>';
      return;
    }
    historialEl.innerHTML = filas.map((f) => {
      const d = f.rr_delta > 0 ? '<span class="mm-verde">+' + f.rr_delta + '</span>'
        : f.rr_delta < 0 ? '<span class="mm-rojo">' + f.rr_delta + '</span>'
        : '<span class="mm-gris">±0</span>';
      const res = f.resultado ? f.resultado.toUpperCase() : (f.status === 'verificado' ? '—' : 'EN CURSO');
      const fecha = f.played_at ? new Date(f.played_at).toLocaleDateString() : '';
      return '<div class="mm-p"><span class="mono dim">' + fecha + '</span>' +
        '<span>' + escapeHtml((JUEGO_LABEL[f.game] || f.game || '?').toUpperCase()) + ' · ' + (f.mode || '?').toUpperCase() + '</span>' +
        '<span>' + res + '</span><span>' + (f.score_a != null ? f.score_a + ':' + f.score_b : '—') + '</span>' +
        '<span class="mono">' + d + '</span></div>';
    }).join('');
  }

  // ---------- arranque ----------
  async function iniciar() {
    estilos();
    SESION = await H.sesion();
    if (btnEntrar) btnEntrar.addEventListener('click', entrar);
    if (btnSalir) btnSalir.addEventListener('click', salir);
    const bEnviar = $('#mm-enviar');
    if (bEnviar) bEnviar.addEventListener('click', reportar);
    const bLanzar = $('#mm-lanzar');
    if (bLanzar) bLanzar.addEventListener('click', lanzar);
    const bRef = $('#mm-historial-refrescar');
    if (bRef) bRef.addEventListener('click', historial);
    if (SESION && SESION.sub) setEstado('listo');
    else setEstado('inicia sesión para buscar partida');
    H.onEstado(async (d) => {
      SESION = d.sesion;
      if (SESION && SESION.sub) { setEstado('listo'); historial(); }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
