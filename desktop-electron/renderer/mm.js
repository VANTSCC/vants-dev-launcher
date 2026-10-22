// ============================================================
// VANTS · mm.js — BUSCAR PARTIDA (matchmaking real, Fase 4/5 + ready-check)
// ------------------------------------------------------------
// Módulo independiente (patrón Fase 2 del plan): no toca app.js,
// solo se enchufa a los elementos de #cajon-buscar y a vantsHub.
// Toda la lógica vive en SQL (migraciones 21–24, 30 y 31): mm_encolar,
// mm_ticket_estado, mm_salir, mm_reportar, mm_historial_de, las
// invitaciones (mm_invitar, mm_invites_pendientes,
// mm_responder_invite), el ready-check (mm_listo, mm_estado_ready,
// mm_anular_si_timeout) y el contador de cola (migra 31:
// cola_total/necesarios en mm_ticket_estado) — llamadas por
// PostgREST con el Bearer de la sesión.
// Reglas: 1 ticket activo por jugador y juego · duo 1v1 · team 5v5 ·
// TTL 10 min · ready-check 120 s (migra 30: si no confirman todos,
// la partida se anula y cada HUB se re-encola solo) · primer
// reporte gana · RR win +1.5 / draw +0.2 / loss -1.2 (escala entera
// *100 de la web).
// Cadena de arranque (nivel 2+3): PARTIDA ENCONTRADA → ESTOY LISTO
// → todos confirmaron → ExitLag (si hay config enabled) → juego
// lanzado en 3 s → reporte del resultado.
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
  const invEmail = $('#mm-inv-email');
  const invEnviar = $('#mm-inv-enviar');
  const invRecibidasEl = $('#mm-inv-recibidas');
  const invEnviadasEl = $('#mm-inv-enviadas');
  const invEstadoEl = $('#mm-inv-estado');

  let SESION = null;
  let ticket = null;
  let matchId = null;
  let sondeo = null;
  let sondeoReady = null;        // sondeo del ready-check (3 s, migra 30)
  let sondeoReloj = null;        // cuenta regresiva visual (1 s)
  let deadlineTs = null;         // ready_deadline en ms epoch (del server)
  let listoYa = false;           // ya confirmó en ESTA partida
  let lanzando = false;          // cadena de lanzamiento en curso
  let invSondeo = null;          // sondeo de invitaciones (15 s)
  let invOcupado = false;        // evita solapamiento del poll
  const invProcesadas = new Set(); // aceptaciones ya reaccionadas
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
      '.mm-ready{margin-top:12px;background:#131318;border:1px solid #26262e;border-radius:10px;padding:10px 12px}',
      '.mm-ready-linea{display:flex;gap:12px;align-items:center;flex-wrap:wrap}',
      '.mm-ready-linea b{letter-spacing:.08em;font-size:12px;color:#e8e8ee}',
      '.mm-ready-bar{height:6px;background:#26262e;border-radius:4px;margin:8px 0 6px;overflow:hidden}',
      '.mm-ready-bar i{display:block;height:100%;width:0;background:#39d98a;border-radius:4px;transition:width .4s ease}',
      '#cajon-buscar .tabla{margin-top:10px}'
    ].join('\n');
    document.head.appendChild(st);
  }

  function setEstado(txt) { if (estadoEl) estadoEl.textContent = txt; }
  function detenerSondeo() { if (sondeo) { clearInterval(sondeo); sondeo = null; } }
  function detenerTodo() {
    detenerSondeo();
    if (sondeoReady) { clearInterval(sondeoReady); sondeoReady = null; }
    if (sondeoReloj) { clearInterval(sondeoReloj); sondeoReloj = null; }
  }

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
      detenerTodo();
      sondeo = setInterval(poll, 3000);
      poll();
    } finally {
      btnEntrar.disabled = false;
    }
  }

  async function salir() {
    if (!ticket) return;
    detenerTodo();
    await rpc('mm_salir', { p_ticket: ticket });
    ticket = null;
    setEstado('fuera de la cola');
    btnEntrar.classList.remove('oculto');
    btnSalir.classList.add('oculto');
    const rp = $('#mm-ready');
    if (rp) rp.classList.add('oculto');
  }

  // ---------- sondeo del ticket ----------
  async function poll() {
    if (!ticket) return detenerSondeo();
    const r = await rpc('mm_ticket_estado', { p_ticket: ticket });
    if (!r.ok) {
      if (r.error === 'no_encontrado') { ticket = null; detenerSondeo(); setEstado('ticket caducado'); btnEntrar.classList.remove('oculto'); btnSalir.classList.add('oculto'); }
      return;
    }
    if (r.status === 'queued') {
      // migra 31: la cola muestra cuántos somos y cuántos faltan —
      // si el modo es team y no llena, el jugador entiende POR QUÉ
      // no sale y tiene una salida clara (duo/1v1 o invitar amigos).
      let txt = 'en cola';
      if (r.cola_total != null && r.necesarios) {
        txt += ' · ' + r.cola_total + '/' + r.necesarios + ' jugadores';
        const faltan = r.necesarios - r.cola_total;
        if (faltan > 0) {
          txt += ' · faltan ' + faltan;
          txt += r.necesarios === 10
            ? ' — probá DUO/1v1 para jugar ya'
            : ' — invitá a un amigo con el email de arriba';
        }
      }
      txt += ' · posición ' + (r.position || 1);
      setEstado(txt);
    }
    else if (r.status === 'matched' && r.match_id) { matchId = r.match_id; detenerTodo(); pintarMatch(); }
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
    // ready-check (migra 30): solo tiene sentido con la partida 'propuesto'
    // y sin score. Ya reportada/verificada → panel listo como antes.
    const enReady = !!(match && match.status === 'propuesto' && s1 == null);
    const rp = $('#mm-ready');
    if (rp) rp.classList.toggle('oculto', !enReady);
    const bLanzar = $('#mm-lanzar');
    listoYa = false; lanzando = false; deadlineTs = null;
    if (enReady) {
      pintarReady(0, jugadores.length);
      const bl = $('#mm-listo');
      if (bl) { bl.disabled = false; bl.textContent = 'ESTOY LISTO'; bl.classList.remove('oculto'); }
      if (bLanzar) bLanzar.classList.add('oculto');      // el lanzamiento pasa a ser automático
      readyEstado('confirmá que estás para jugar — 2 min para confirmar todos');
      reportarBox.classList.add('oculto');               // el reporte aparece cuando todos confirmen
      iniciarReadyPoll();
    } else {
      detenerTodo();
      if (bLanzar) bLanzar.classList.remove('oculto');
      // reportar visible solo si aún no hay score
      reportarBox.classList.toggle('oculto', !!(s1 != null || verificado));
    }
    historial();
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ============================================================
  // READY-CHECK (migra 30) + cadena de arranque (niveles 2+3).
  // PARTIDA ENCONTRADA → cada uno pulsa ESTOY LISTO (mm_listo) →
  // el HUB sondea mm_estado_ready cada 3 s → si no confirman todos
  // antes del deadline (120 s desde el match), el primer cliente que
  // lo ve llama mm_anular_si_timeout y TODOS se re-encolan solos →
  // si confirman todos: ExitLag (si hay config enabled; si no, no-op)
  // → lanzamiento automático del juego en 3 s → reporte.
  // ============================================================
  function readyEstado(txt) {
    const el = $('#mm-ready-estado');
    if (el) el.textContent = txt;
  }

  function pintarReady(listos, total) {
    const cont = $('#mm-ready-cont');
    if (cont) cont.textContent = 'LISTOS ' + (listos || 0) + '/' + (total || 0);
    const fill = $('#mm-ready-fill');
    if (fill && total > 0) fill.style.width = Math.round(((listos || 0) / total) * 100) + '%';
    const bl = $('#mm-listo');
    if (bl && listoYa) { bl.textContent = 'LISTO ✓'; bl.disabled = true; }
    reloj();
  }

  function reloj() {
    const t = $('#mm-ready-tiempo');
    if (!t) return;
    if (!deadlineTs) { t.textContent = ''; return; }
    const s = Math.max(0, Math.round((deadlineTs - Date.now()) / 1000));
    t.textContent = '· ' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function iniciarReadyPoll() {
    if (sondeoReady) return;
    sondeoReady = setInterval(readyPoll, 3000);
    sondeoReloj = setInterval(reloj, 1000);
    readyPoll();
  }

  async function readyPoll() {
    if (!matchId) return detenerTodo();
    const r = await rpc('mm_estado_ready', { p_match_id: matchId });
    if (!r.ok) {
      if (r.error === 'no_encontrado') partidaAnulada('partida inexistente');
      return;
    }
    if (r.status === 'anulado') return partidaAnulada('no confirmaron todos a tiempo');
    if (r.status !== 'propuesto') { detenerTodo(); return; } // ya reportada/verificada
    if (r.deadline) deadlineTs = new Date(r.deadline).getTime();
    pintarReady(r.listos, r.total);
    if (r.vencido) {
      const a = await rpc('mm_anular_si_timeout', { p_match_id: matchId });
      if (a.ok && a.anulado) partidaAnulada('no confirmaron todos a tiempo');
      return; // si no pudo anular (carrera), el próximo ciclo lo reintenta
    }
    if (r.total > 0 && r.listos >= r.total) todosListos();
  }

  async function marcarListo() {
    if (!matchId || listoYa || lanzando) return;
    const bl = $('#mm-listo');
    if (bl) bl.disabled = true;
    const r = await rpc('mm_listo', { p_match_id: matchId });
    if (!r.ok) {
      if (bl) bl.disabled = false;
      if (r.error === 'timeout') { readyPoll(); return; }
      readyEstado(r.error === 'partida_anulada' ? 'la partida fue anulada' : (r.error || 'no se pudo confirmar'));
      return;
    }
    listoYa = true;
    pintarReady(r.listos, r.total);
  }

  async function todosListos() {
    if (lanzando || !matchId) return;
    lanzando = true;
    detenerTodo();
    setEstado('TODOS LISTOS · preparando el juego…');
    const bl = $('#mm-listo');
    if (bl) bl.classList.add('oculto');
    const bLanzar = $('#mm-lanzar');
    if (bLanzar) bLanzar.classList.remove('oculto'); // queda como reintento manual
    // Nivel 3 · cadena ExitLag (PREPARADA, OFF por defecto): si existe
    // %APPDATA%\VANTS\exitlag.config.json con enabled:true y un perfil
    // para el juego, el perfil se activa ANTES de abrir el juego; sin
    // config responde {ok:false, reason:'disabled-…'} y sigue derecho.
    let msg = '';
    try {
      const el = await H.exitlag('activar-juego', { id: juegoEl.value, nombre: JUEGO_LABEL[juegoEl.value] || juegoEl.value });
      if (el && el.ok) msg = ' · ExitLag: ' + (el.perfil || 'activo');
    } catch (e) { /* sin puente exitlag: sigue derecho */ }
    readyEstado('todos confirmaron — lanzando en 3…' + msg);
    setTimeout(() => { if (lanzando) readyEstado('lanzando en 2…' + msg); }, 1000);
    setTimeout(() => { if (lanzando) readyEstado('lanzando en 1…' + msg); }, 2000);
    setTimeout(async () => {
      if (!lanzando) return;
      try { await lanzar(); } catch (e) { /* el botón manual queda como reintento */ }
      readyEstado('juego lanzado' + msg + ' — jueguen y reporten el resultado acá');
      reportarBox.classList.remove('oculto');
      historial();
    }, 3000);
  }

  function partidaAnulada(motivo) {
    detenerTodo();
    const rp = $('#mm-ready');
    if (rp) rp.classList.add('oculto');
    panelMatch.classList.add('oculto');
    reportarBox.classList.add('oculto');
    matchId = null; ticket = null; listoYa = false; lanzando = false; deadlineTs = null;
    setEstado('partida anulada (' + motivo + ') · volviendo a la cola…');
    btnEntrar.classList.remove('oculto');
    btnSalir.classList.add('oculto');
    // re-encolado automático con los parámetros del formulario (que
    // siguen siendo los de la partida anulada). mm_encolar acepta de
    // nuevo: el ticket viejo quedó 'matched', no bloquea.
    setTimeout(() => { if (!ticket && !matchId && SESION && SESION.sub) entrar(); }, 2500);
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

  // ============================================================
  // INVITACIONES (migración 24): convoca a un amigo a la cola.
  // Enviar: mm_invitar(email destino) con juego/modo/región del
  // formulario. Recibir: el HUB sondea mm_invites_pendientes cada
  // 15 s. Al aceptar, el destino queda encolado (mm_encolar) con
  // los parámetros de la invitación; el remitente lo ve en
  // "enviadas" y entra en cola también — el emparejador los cruza.
  // ============================================================
  function invEstado(txt) { if (invEstadoEl) invEstadoEl.textContent = txt; }

  async function invitar() {
    if (!SESION || !SESION.sub) { invEstado('inicia sesión primero'); return; }
    const email = (invEmail && invEmail.value || '').trim();
    if (!email || email.indexOf('@') < 1) { invEstado('escribe el email del jugador'); return; }
    if (invEnviar) invEnviar.disabled = true;
    invEstado('enviando…');
    try {
      const r = await rpc('mm_invitar', {
        p_to_email: email,
        p_game: juegoEl.value,
        p_mode: modoEl.value,
        p_region: regionEl.value,
      });
      if (!r.ok) {
        const msg = r.error === 'destino_no_encontrado' ? 'no hay jugador VANTS con ese email'
          : r.error === 'destino_es_tu_email' ? 'ese email es el tuyo'
          : r.error === 'no_elegible' ? 'tu perfil no es elegible'
          : r.error === 'sin_sesion' ? 'inicia sesión primero'
          : (r.error || 'no se pudo invitar');
        invEstado(msg);
        return;
      }
      invEstado(r.reutilizada ? 'ya hay una invitación tuya pendiente para ese jugador' : 'invitación enviada · vigencia 10 min');
      if (invEmail) invEmail.value = '';
      invPoll();
    } finally {
      if (invEnviar) invEnviar.disabled = false;
    }
  }

  async function invResponder(id, aceptar) {
    const r = await rpc('mm_responder_invite', { p_id: id, p_aceptar: !!aceptar });
    if (!r.ok) {
      invEstado(r.error === 'ya_no_vigente' ? 'la invitación ya no está vigente' : (r.error || 'no se pudo responder'));
      invPoll();
      return;
    }
    if (r.status === 'aceptada') {
      const cola = r.cola || {};
      if (cola.ok && cola.ticket) {
        ticket = cola.ticket;
        if (juegoEl && cola.game) { try { juegoEl.value = cola.game; } catch (e) {} }
        if (modoEl && cola.mode) { try { modoEl.value = cola.mode; } catch (e) {} }
        if (regionEl && cola.region) { try { regionEl.value = cola.region; } catch (e) {} }
        setEstado('en cola por invitación · ' + (JUEGO_LABEL[cola.game] || cola.game) + ' · ' + (cola.mode || '').toUpperCase());
        if (btnEntrar) btnEntrar.classList.add('oculto');
        if (btnSalir) btnSalir.classList.remove('oculto');
        detenerSondeo();
        sondeo = setInterval(poll, 3000);
        poll();
      } else {
        invEstado('aceptada, pero la cola dijo: ' + (cola.error || 'error desconocido'));
      }
    } else {
      invEstado('invitación ' + r.status);
    }
    invPoll();
  }

  function invPintar(d) {
    if (!invRecibidasEl) return;
    const rec = (d && d.recibidas) || [];
    const env = (d && d.enviadas) || [];

    invRecibidasEl.innerHTML = rec.length === 0
      ? '<div class="dim">sin invitaciones pendientes</div>'
      : rec.map((i) =>
        '<div class="mm-p"><span><b>' + escapeHtml(String(i.from_nombre || 'jugador')) + '</b>' +
        '<span class="dim mono"> · ' + escapeHtml((JUEGO_LABEL[i.game] || i.game || '?').toUpperCase()) +
        ' · ' + (i.mode || '?').toUpperCase() + ' · ' + escapeHtml(i.region || 'EU') + '</span></span>' +
        '<span>' +
        '<button class="btn primario" data-act="si" data-id="' + i.id + '" style="padding:6px 10px;font-size:11px">ACEPTAR</button> ' +
        '<button class="btn fantasma" data-act="no" data-id="' + i.id + '" style="padding:6px 10px;font-size:11px">RECHAZAR</button>' +
        '</span></div>').join('');

    if (invEnviadasEl) {
      invEnviadasEl.textContent = env.length === 0 ? ''
        : 'tus invitaciones: ' + env.map((i) =>
          (JUEGO_LABEL[i.game] || i.game) + ' ' + (i.mode || '') + ' → ' +
          (i.status === 'pendiente' ? 'pendiente' : i.status === 'aceptada' ? 'ACEPTADA ✓' : i.status)).join(' · ');
    }

    // badge del nav BUSCAR PARTIDA (elemento existente)
    const badge = $('#nav-buscar-n');
    if (badge) {
      badge.textContent = String(rec.length);
      badge.classList.toggle('oculto', rec.length === 0);
    }

    // el remitente reacciona a las aceptaciones: entra en cola igual
    for (const i of env) {
      if (i.status === 'aceptada' && !invProcesadas.has(i.id)) {
        invProcesadas.add(i.id);
        if (!ticket && !matchId && SESION && SESION.sub) {
          if (juegoEl && i.game) { try { juegoEl.value = i.game; } catch (e) {} }
          if (modoEl && i.mode) { try { modoEl.value = i.mode; } catch (e) {} }
          if (regionEl && i.region) { try { regionEl.value = i.region; } catch (e) {} }
          invEstado('tu invitación fue aceptada — entrando en cola…');
          entrar();
        }
      }
    }
  }

  async function invPoll() {
    if (!SESION || !SESION.sub || invOcupado) return;
    invOcupado = true;
    try {
      const d = await rpc('mm_invites_pendientes', { p_limite: 10 });
      if (d && d.ok) invPintar(d);
      else if (d && d.error === 'sin_sesion') invEstado('inicia sesión para ver invitaciones');
    } catch (e) {
      // silencioso: red/BD caída — el siguiente ciclo reintenta
    } finally {
      invOcupado = false;
    }
  }

  function invIniciarSondeo() {
    if (invSondeo) return;
    invPoll();
    invSondeo = setInterval(invPoll, 15000);
  }
  function invDetenerSondeo() {
    if (invSondeo) { clearInterval(invSondeo); invSondeo = null; }
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
    const bListo = $('#mm-listo');
    if (bListo) bListo.addEventListener('click', marcarListo);
    const bRef = $('#mm-historial-refrescar');
    if (bRef) bRef.addEventListener('click', historial);
    if (invEnviar) invEnviar.addEventListener('click', invitar);
    if (invRecibidasEl) invRecibidasEl.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-act]');
      if (!b) return;
      b.disabled = true;
      invResponder(b.getAttribute('data-id'), b.getAttribute('data-act') === 'si');
    });
    if (SESION && SESION.sub) { setEstado('listo'); invIniciarSondeo(); }
    else setEstado('inicia sesión para buscar partida');
    H.onEstado(async (d) => {
      SESION = d.sesion;
      if (SESION && SESION.sub) { setEstado('listo'); historial(); invIniciarSondeo(); }
      else {
        detenerTodo();
        invDetenerSondeo(); invPintar({ recibidas: [], enviadas: [] });
        const rp = $('#mm-ready');
        if (rp) rp.classList.add('oculto');
        if (panelMatch) panelMatch.classList.add('oculto');
        matchId = null; listoYa = false; lanzando = false; deadlineTs = null;
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
