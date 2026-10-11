// ============================================
// VANTCALL Esports — App & Router (datos reales de Neon Data API)
// ============================================

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DISCORD_INVITE = 'https://discord.gg/rCHE7jvRS4';

const GAMES = { valorant: 'VALORANT', cs2: 'Counter-Strike 2', lol: 'League of Legends' };

// Rango VANTS: 8 niveles (vision/rangos). Umbrales orientativos por MMR.
const VANTS_RANKS = [
  { key: 'hierro', name: 'Hierro', min: 0, color: '#8a9099' },
  { key: 'bronce', name: 'Bronce', min: 900, color: '#b87333' },
  { key: 'plata', name: 'Plata', min: 1100, color: '#c9d1d9' },
  { key: 'oro', name: 'Oro', min: 1300, color: '#e5b93c' },
  { key: 'platino', name: 'Platino', min: 1500, color: '#2ec4b6' },
  { key: 'diamante', name: 'Diamante', min: 1700, color: '#9b6bff' },
  { key: 'titan', name: 'Titán', min: 1900, color: '#3ddc84' },
  { key: 'escarlata', name: 'Escarlata', min: 2100, color: '#ff4655' },
];
function rankFor(stat) {
  if (!stat) return VANTS_RANKS[0];
  const byName = stat.rank && VANTS_RANKS.find((r) => stat.rank.toLowerCase().startsWith(r.key.slice(0, 4)));
  if (byName) return byName;
  let r = VANTS_RANKS[0];
  for (const x of VANTS_RANKS) if ((stat.mmr || 0) >= x.min) r = x;
  return r;
}
function rankBadge(stat) {
  const r = rankFor(stat);
  const icon = window.VantsRanks ? VantsRanks.emblemUse(r.key, 'rank-badge-emblem') : '<span class="rank-gem"></span>';
  return `<span class="rank-badge" style="--rank:${r.color}">${icon}${esc(stat && stat.rank ? stat.rank : r.name)}</span>`;
}

const fmtDate = (d, opts) => d ? new Date(d).toLocaleDateString('es-ES', opts || { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const fmtTime = (d) => d ? new Date(d).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '';
const fmtDay = (d) => new Date(d).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' });
const initials = (s) => esc(String(s || '?').replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || '?');

const STATUS_LABEL = {
  draft: 'Borrador', single_elimination: 'Eliminación simple', double_elimination: 'Doble eliminación', round_robin: 'Liga (round robin)', swiss: 'Suizo', upcoming: 'Próximo', registration: 'Inscripción abierta', open: 'Inscripción abierta',
  in_progress: 'En curso', live: 'En vivo', active: 'Activo', completed: 'Finalizado', finished: 'Finalizado',
  cancelled: 'Cancelado', closed: 'Cerrado', scheduled: 'Programado', pending: 'Pendiente', registered: 'Inscrito',
  checked_in: 'Check-in', withdrawn: 'Retirado', disqualified: 'Descalificado',
};
const statusLabel = (s) => STATUS_LABEL[s] || (s ? String(s) : '—');
const statusPill = (s) => `<span class="pill pill-${esc(s || 'none')}">${esc(statusLabel(s))}</span>`;

function emptyState(title, text, cta) {
  return `<div class="empty-state">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M8 10L12 16L16 10"/><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
    <h3>${esc(title)}</h3><p>${esc(text)}</p>${cta || ''}</div>`;
}
function errorState(err) {
  console.error(err);
  return `<div class="auth-msg auth-msg-error" role="alert">No se pudieron cargar los datos. ${esc(err && err.message ? err.message : '')} <button type="button" class="link-btn" onclick="router()">Reintentar</button></div>`;
}
function skeleton(rows = 3) {
  return `<div class="skeleton-list">${'<div class="skeleton-row"></div>'.repeat(rows)}</div>`;
}
function liveTag() {
  return `<span class="live-data-tag" title="Datos en tiempo real"><span class="dot"></span>Datos en vivo</span>`;
}

// ============================================
// BLOQUES REUTILIZABLES
// ============================================

function tournamentCard(t) {
  return `<a class="t-card" href="#/torneo/${encodeURIComponent(t.slug)}">
    <div class="t-card-top">${statusPill(t.status)}${t.tier ? `<span class="t-tier">${esc(String(t.tier).toUpperCase())}</span>` : ''}</div>
    <h3>${esc(t.name)}</h3>
    <p>${esc(t.description || 'Torneo VANTCALL')}</p>
    <div class="t-card-meta">
      <span>${esc(statusLabel(t.format) || 'Formato por definir')}</span>
      <span>${t.current_participants || 0}${t.max_participants ? ' / ' + t.max_participants : ''} jugadores</span>
      <span>${fmtDate(t.starts_at)}</span>
    </div>
    ${t.prize_pool ? `<div class="t-prize">Premio: ${esc(t.prize_pool)}</div>` : ''}
  </a>`;
}

function leaderboardRows(rows) {
  return rows.map((r, i) => `
    <a class="ranking-row" href="#/jugador/${encodeURIComponent(r.username)}">
      <div class="ranking-pos${i === 0 ? ' top1' : i === 1 ? ' top2' : i === 2 ? ' top3' : ''}">${String(r.position || i + 1).padStart(2, '0')}</div>
      <div class="ranking-team">
        <div class="ranking-team-logo">${r.avatar_url ? `<img src="${esc(r.avatar_url)}" alt="" loading="lazy">` : initials(r.username)}</div>
        <div><div class="ranking-team-name">${esc(r.display_name || r.username)}</div><div class="ranking-sub">@${esc(r.username)} · ${r.wins || 0}V ${r.losses || 0}D</div></div>
      </div>
      <div class="ranking-right">${rankBadge(r)}<div class="ranking-points">${r.mmr || 0} MMR</div></div>
    </a>`).join('');
}

function matchRow(m) {
  const n1 = m.p1 ? (m.p1.display_name || m.p1.username) : 'Por determinar';
  const n2 = m.p2 ? (m.p2.display_name || m.p2.username) : 'Por determinar';
  const has = ['completed', 'finished', 'in_progress', 'live'].includes(m.status) && m.player1_score != null && m.player2_score != null;
  const w1 = m.winner_id && m.winner_id === m.player1_id;
  const w2 = m.winner_id && m.winner_id === m.player2_id;
  const live = m.status === 'in_progress' || m.status === 'live';
  return `<div class="match-card">
    <div class="match-time${live ? ' live' : ''}">${live ? '<span class="live-indicator">LIVE</span>' : fmtTime(m.scheduled_at)}</div>
    <div class="match-team"><div class="match-team-logo">${initials(n1)}</div><span class="match-team-name${m.p1 ? '' : ' tbd'}">${esc(n1)}</span></div>
    <div class="match-score">${has ? `<span class="match-score-num${w1 ? ' winner' : ''}">${m.player1_score}</span><span class="match-score-sep">:</span><span class="match-score-num${w2 ? ' winner' : ''}">${m.player2_score}</span>` : '<span class="match-score-sep">VS</span>'}</div>
    <div class="match-team right"><span class="match-team-name${m.p2 ? '' : ' tbd'}">${esc(n2)}</span><div class="match-team-logo">${initials(n2)}</div></div>
    <div class="match-format">
      ${m.tournament ? `<a class="match-comp" href="#/torneo/${encodeURIComponent(m.tournament.slug)}">${esc(m.tournament.name)}</a>` : ''}
      <span class="match-phase">Ronda ${m.round || 1} · Partida ${m.match_number || 1}</span>
      <span class="match-format-tag">${esc(statusLabel(m.status))}</span>
    </div>
  </div>`;
}

function eventRow(e) {
  return `<div class="match-card event-card" data-event="${esc(e.id)}">
    <div class="match-time">${fmtTime(e.starts_at)}</div>
    <div class="event-body">
      <div class="event-title">${esc(e.title)}</div>
      <div class="event-sub">${esc(e.event_type || 'Evento')}${e.location ? ' · ' + esc(e.location) : ''}${e.max_attendees ? ` · ${e.current_attendees || 0}/${e.max_attendees} plazas` : ''}</div>
    </div>
    <div class="match-format">${statusPill(e.status)}<button type="button" class="btn btn-secondary btn-sm" data-rsvp="${esc(e.id)}">Asistiré</button></div>
  </div>`;
}

function groupByDay(items, dateKey) {
  const groups = new Map();
  for (const it of items) {
    const d = new Date(it[dateKey]);
    const k = d.toISOString().slice(0, 10);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(it);
  }
  return [...groups.entries()];
}

const RANKS_STRIP = `<div class="ranks-strip">${VANTS_RANKS.map((r, i) => `
  <div class="rank-tile${i >= 5 ? ' rank-tile-elite' : ''}${i === 7 ? ' rank-tile-apex' : ''}" style="--rank:${r.color}">
    <span class="rank-tier">${window.VantsRanks ? VantsRanks.RANK_ART[r.key].tier : i + 1}</span>
    <div class="rank-emblem">${window.VantsRanks ? VantsRanks.emblemUse(r.key, 'rank-svg') : ''}</div>
    <div class="rank-name">${r.name}</div><div class="rank-min">${i === 7 ? 'Top global' : r.min + '+ MMR'}</div>
  </div>`).join('')}</div>`;

const DISCORD_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>';

const KICK_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>';

// ============================================
// PLANES (bloque compartido Inicio + Precios)
// ============================================
const PLAN_CARDS = [
  { key: 'basic', name: 'BASIC', tier: 'T1', price: 9, emblem: 'plata', tag: 'Para empezar a competir', pitch: 'Tu pase a la escena: torneos abiertos, perfil Ranked y la comunidad VANTS.',
    features: ['Inscripción a VANT Open', 'Perfil Ranked (Bronce–Oro)', 'Zona exclusiva BASIC', 'Rol BASIC en Discord', 'Soporte estándar'], cta: 'Empezar con BASIC' },
  { key: 'pro', name: 'PRO', tier: 'T2', price: 19, emblem: 'diamante', tag: 'El favorito de los equipos', pitch: 'Ranked completo, Pro Series y scrims privadas para subir de nivel cada semana.', badge: 'MÁS POPULAR',
    features: ['Todo lo de BASIC', 'VANT Pro Series', 'Sala privada y scrims', 'Prioridad en tryouts', 'Rol Operator en Discord', 'Soporte prioritario'], cta: 'Quiero PRO' },
  { key: 'elite', name: 'ELITE', tier: 'T3', price: 39, emblem: 'escarlata', tag: 'Acceso total', pitch: 'Elite Invitational, canal Command y tu marca visible en todo el Ranked.', badge: 'ACCESO TOTAL',
    features: ['Todo lo de PRO', 'VANT Elite Invitational', 'Canal Command con el staff', 'Badge Elite en tu perfil', 'Verificación prioritaria', 'Acceso anticipado a novedades'], cta: 'Ser ELITE' },
];
const CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
function planCards() {
  return `<div class="vp-grid">${PLAN_CARDS.map((p) => `
    <article class="vp-card vp-${p.key}${p.key === 'pro' ? ' vp-featured' : ''}">
      <div class="vp-glow" aria-hidden="true"></div>
      ${p.badge ? `<div class="vp-badge">${p.badge}</div>` : ''}
      <header class="vp-head">
        <img class="vp-emblem" src="./assets/ranks/${p.emblem}.svg" alt="" width="64" height="64" loading="lazy">
        <div><div class="vp-tier">${p.tier} · VANT</div><h3 class="vp-name">${p.name}</h3><div class="vp-tag">${p.tag}</div></div>
      </header>
      <div class="vp-price"><span class="vp-cur">€</span><span class="vp-num">${p.price}</span><span class="vp-per">pago único<br>toda la temporada</span></div>
      <p class="vp-pitch">${p.pitch}</p>
      <ul class="vp-features">${p.features.map((f) => `<li>${CHECK_SVG}<span>${f}</span></li>`).join('')}</ul>
      <a href="#/checkout/${p.key}" class="btn ${p.key === 'basic' ? 'btn-secondary' : p.key === 'pro' ? 'btn-primary' : 'btn-gold'} vp-btn">${p.cta}</a>
      <div class="vp-foot">IVA incluido · Activación automática</div>
    </article>`).join('')}</div>
    <div class="vp-trust">
      <span>${CHECK_SVG} Pago seguro con Stripe</span><span>${CHECK_SVG} Plan activo al instante en tu cuenta</span><span>${CHECK_SVG} Sin suscripción ni cargos ocultos</span><span>${CHECK_SVG} Ventajas sincronizadas con Discord</span>
    </div>`;
}

function pageHero(num, kicker, title, lead, extra = '') {
  return `<header class="page-hero">
    <div class="page-hero-kicker"><span class="page-hero-num">${num}</span>${kicker}</div>
    <h1>${title}</h1>
    <p class="page-hero-lead">${lead}</p>
    <div class="page-hero-meta">${liveTag()}${extra}</div>
  </header>`;
}

// ============================================
// PÁGINAS
// ============================================

const DOC_CONTENT = {
  'inicio': {
    title: 'VANTCALL Esports — Plataforma competitiva',
    isHome: true,
    content: `
      <section class="valorant-hero">
        <div class="hero-media" aria-hidden="true"></div>
        <div class="hero-grid" aria-hidden="true"></div>
        <div class="hero-badge"><span class="live-dot"></span> BETA ABIERTA · VALORANT · CS2 · LOL</div>
        <h1>VANT<span class="hero-accent">CALL</span></h1>
        <p class="hero-tagline">La liga competitiva de la comunidad: ranked con MMR real, torneos con premios y un bot de Discord conectado a tu perfil. Entra con Google, Discord, Steam, Kick o correo.</p>
        <div class="hero-cta">
          <a href="#/login" class="btn btn-primary btn-lg" data-auth-cta>JUGAR GRATIS</a>
          <a href="#/torneos" class="btn btn-secondary btn-lg">VER TORNEOS</a>
        </div>
        <div class="hero-meta" aria-label="Lo que incluye VANTS">
          <span>Ranked con MMR</span><span>Torneos con premio</span><span>Bot de Discord en vivo</span><span>Zona exclusiva para miembros</span>
        </div>
        <span class="hero-scroll" aria-hidden="true"></span>
      </section>

      <div class="marquee" aria-hidden="true">
        <div class="marquee-track">
          ${Array(2).fill(['VALORANT', 'Counter-Strike 2', 'League of Legends', 'Ranked VANTS', 'Torneos', 'Ligas', 'Scrims']).flat().map((t) => `<span class="marquee-item">${t}</span>`).join('')}
        </div>
      </div>

      <div class="stats-strip" data-async="home-stats">${skeleton(1)}</div>

      <section class="valorant-section home-grid-section">
        <div class="home-grid">
          <div>
            <div class="section-head"><h2>PRÓXIMOS TORNEOS</h2><a href="#/torneos">Ver todos</a></div>
            <div data-async="home-tournaments">${skeleton(3)}</div>
          </div>
          <div>
            <div class="section-head"><h2>TOP RANKED</h2><a href="#/ranked">Leaderboard</a></div>
            <div class="rankings-list" data-async="home-leaderboard">${skeleton(5)}</div>
          </div>
        </div>
      </section>

      <section class="valorant-section">
        <div class="section-header"><h2>RANGO VANTS</h2></div>
        <p class="section-lead">Ocho niveles, un recorrido por juego. Ganas VP por victoria, MVP y clutches; cada temporada conservas el 30% del VP acumulado.</p>
        ${RANKS_STRIP}
      </section>

      <section class="valorant-banner">
        <div class="banner-content">
          <h2>EL SERVIDOR DONDE PASA TODO</h2>
          <p>Anuncios de torneos al instante, salas de voz para VALORANT y CS2, tryouts y el bot VANTS: usa /perfil, /ranking o /torneos y mira tus datos de la web en Discord.</p>
          <a href="${DISCORD_INVITE}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-lg">ENTRAR AL SERVIDOR</a>
        </div>
      </section>

      <!-- Pricing Preview -->
      <section class="valorant-section valorant-pricing">
        <div class="section-header"><h2>ELIGE TU PLAN</h2></div>
        <p class="section-lead">Un pago por temporada. Desbloquea torneos privados, scrims, roles en Discord y tu zona exclusiva.</p>
        ${planCards()}
        <p class="pricing-note" style="text-align:center; margin-top: var(--space-6);"><a href="#/precios" class="link-inline">Ver la comparativa completa</a></p>
      </section>

      <!-- Login Methods -->
      <section class="valorant-section">
        <div class="section-header"><h2>ENTRA COMO QUIERAS</h2></div>
        <div class="login-methods-home login-methods-5">
          <a href="#/login" class="login-method-card"><div class="login-method-icon google-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.45a5.5 5.5 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.57-5.17 3.57-8.81z"/><path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.28v3.1A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.29 14.29A7.2 7.2 0 0 1 4.91 12c0-.8.14-1.57.38-2.29v-3.1H1.28A12 12 0 0 0 0 12c0 1.94.46 3.77 1.28 5.39l4.01-3.1z"/><path fill="#EA4335" d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.28 6.61l4.01 3.1C6.23 6.88 8.88 4.77 12 4.77z"/></svg></div><h3>Google</h3><p>Un clic con tu cuenta de Google</p></a>
          <a href="#/login" class="login-method-card"><div class="login-method-icon discord-icon">${DISCORD_SVG}</div><h3>Discord</h3><p>Tu perfil queda conectado al bot VANTS</p></a>
          <a href="#/login" class="login-method-card"><div class="login-method-icon steam-icon"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11.98 0C5.67 0 .5 4.86.02 11.04l6.43 2.66a3.38 3.38 0 0 1 1.92-.6l.19.01 2.86-4.15v-.06a4.52 4.52 0 1 1 4.52 4.52h-.1l-4.08 2.91v.16a3.39 3.39 0 0 1-6.72.63L.4 15.5A12 12 0 1 0 11.98 0z"/></svg></div><h3>Steam</h3><p>Ideal para CS2: cuenta verificada por Valve</p></a>
          <a href="#/login" class="login-method-card"><div class="login-method-icon kick-icon">${KICK_SVG}</div><h3>Kick</h3><p>Para streamers: tu canal conectado</p></a>
          <a href="#/registro" class="login-method-card"><div class="login-method-icon mail-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg></div><h3>Correo</h3><p>Registro clásico con verificación por email</p></a>
        </div>
      </section>

    `,
    async load(main) {
      const DB = window.VantDB;
      const set = (k, html) => { const el = main.querySelector(`[data-async="${k}"]`); if (el) el.innerHTML = html; };
      DB.stats().then((s) => set('home-stats', `
        <div class="stat"><div class="stat-num">${s.players}</div><div class="stat-label">Jugadores registrados</div></div>
        <div class="stat"><div class="stat-num">${s.tournaments}</div><div class="stat-label">Torneos</div></div>
        <div class="stat"><div class="stat-num">${s.events}</div><div class="stat-label">Eventos próximos</div></div>
        <div class="stat"><div class="stat-num">${s.matches}</div><div class="stat-label">Partidas ranked</div></div>
        <div class="stat stat-live">${liveTag()}</div>`)).catch((e) => set('home-stats', errorState(e)));
      DB.tournaments().then((ts) => {
        const up = ts.filter((t) => !['completed', 'finished', 'cancelled', 'draft'].includes(t.status)).slice(0, 3);
        set('home-tournaments', up.length ? `<div class="t-grid t-grid-stack">${up.map(tournamentCard).join('')}</div>` : emptyState('Sin torneos abiertos', 'Aún no hay torneos publicados. Los anunciamos primero en Discord.', `<a class="btn btn-secondary" href="${DISCORD_INVITE}" target="_blank" rel="noopener noreferrer">Avisarme en Discord</a>`));
      }).catch((e) => set('home-tournaments', errorState(e)));
      DB.activeSeason().then(async (s) => {
        const rows = s ? await DB.leaderboard(s.id, 5) : [];
        set('home-leaderboard', rows.length ? leaderboardRows(rows) : emptyState('Leaderboard vacío', s ? 'Juega tus partidas de placement para aparecer aquí.' : 'La primera temporada ranked aún no ha comenzado.', '<a class="btn btn-secondary" href="#/ranked">Cómo funciona</a>'));
      }).catch((e) => set('home-leaderboard', errorState(e)));
    },
  },

  'calendario': {
    title: 'Calendario — VANTCALL Esports',
    content: `
      ${pageHero('02', 'Calendario', 'Lo que se juega <span class="hero-accent">esta semana</span>', 'Partidas de torneo, scrims, streams y eventos de la comunidad en un solo lugar. Confirma tu asistencia y recibe el aviso en Discord.', '<span class="page-hero-chip">Usa /calendario en Discord</span>')}
      <div class="calendar-filters" role="tablist">
        <button class="calendar-filter active" data-filter="all">TODO</button>
        <button class="calendar-filter" data-filter="match">PARTIDAS</button>
        <button class="calendar-filter" data-filter="event">EVENTOS</button>
        <button class="calendar-filter" data-filter="tournament">TORNEOS</button>
      </div>
      <div class="auth-msg" data-page-msg role="status" aria-live="polite" hidden></div>
      <div data-async="calendar">${skeleton(5)}</div>`,
    async load(main) {
      const DB = window.VantDB;
      const box = main.querySelector('[data-async="calendar"]');
      try {
        const [matches, events, tournaments] = await Promise.all([DB.scheduledMatches(), DB.events(), DB.tournaments()]);
        const items = [
          ...matches.map((m) => ({ kind: 'match', at: m.scheduled_at, html: matchRow(m) })),
          ...events.filter((e) => e.starts_at).map((e) => ({ kind: 'event', at: e.starts_at, html: eventRow(e) })),
          ...tournaments.filter((t) => t.starts_at).map((t) => ({ kind: 'tournament', at: t.starts_at, html: `<div class="match-card"><div class="match-time">${fmtTime(t.starts_at)}</div><div class="event-body"><div class="event-title">Inicio: ${esc(t.name)}</div><div class="event-sub">${esc(t.format || '')}</div></div><div class="match-format">${statusPill(t.status)}<a class="btn btn-secondary btn-sm" href="#/torneo/${encodeURIComponent(t.slug)}">Ver</a></div></div>` })),
        ].sort((a, b) => new Date(a.at) - new Date(b.at));
        const render = (f) => {
          const list = items.filter((i) => f === 'all' || i.kind === f);
          if (!list.length) { box.innerHTML = emptyState('Calendario vacío', 'No hay partidas, eventos ni torneos programados todavía.'); return; }
          const today = new Date().toISOString().slice(0, 10);
          box.innerHTML = groupByDay(list, 'at').map(([k, arr]) => `
            <div class="match-day"><div class="match-day-header"><span class="match-day-date">${fmtDay(arr[0].at)}</span>${k === today ? '<span class="match-day-badge">HOY</span>' : ''}</div>
            ${arr.map((i) => i.html).join('')}</div>`).join('');
          bindRsvp(main);
        };
        render('all');
        main.querySelectorAll('.calendar-filter').forEach((b) => b.addEventListener('click', () => {
          main.querySelectorAll('.calendar-filter').forEach((x) => x.classList.remove('active'));
          b.classList.add('active'); render(b.dataset.filter);
        }));
      } catch (e) { box.innerHTML = errorState(e); }
    },
  },

  'ranked': {
    title: 'Ranked — VANTCALL Esports',
    content: `
      ${pageHero('03', 'Ranked VANTS', 'Sube de <span class="hero-accent">Hierro a Escarlata</span>', 'Cada partida mueve tu MMR. Ocho rangos, temporadas con recompensas y un leaderboard que se actualiza en tiempo real.', '<span class="page-hero-chip">Usa /ranking y /perfil en Discord</span>')}
      <div class="dash-grid" data-async="ranked-season">${skeleton(1)}</div>
      <h2>Rango VANTS</h2>
      ${RANKS_STRIP}
      <h2>Leaderboard</h2>
      <div class="rankings-list rankings-full" data-async="ranked-lb">${skeleton(6)}</div>
      <h2>Reglas vigentes</h2>
      <div data-async="ranked-rules">${skeleton(2)}</div>
      <div class="bot-panel">
        <h3>Comandos del bot VANTS en Discord</h3>
        <div class="bot-commands" data-async="bot-commands">${skeleton(2)}</div>
        <p class="login-note">Los comandos se gestionan desde la base de datos y responden con tus datos reales de la web. Entra con Discord o vincúlalo en Mi cuenta para usarlos.</p>
      </div>`,
    async load(main) {
      const DB = window.VantDB;
      const set = (k, h) => { const el = main.querySelector(`[data-async="${k}"]`); if (el) el.innerHTML = h; };
      DB.client.from('bot_commands').select('name, description, min_plan, category').order('sort_order').then(({ data, error }) => {
        if (error) return set('bot-commands', errorState(error));
        set('bot-commands', (data || []).map((c) => `<div class="bot-cmd"><code>/${esc(c.name)}</code><span class="desc">${esc(c.description)}${c.min_plan !== 'free' ? ` · <b class="cmd-plan cmd-plan-${esc(c.min_plan)}">${esc(c.min_plan.toUpperCase())}</b>` : ''}</span></div>`).join('') || emptyState('Sin comandos', 'El staff aún no ha activado comandos.'));
      });
      const RULE_LABEL = { placement_matches: 'Partidas de placement', mmr_per_win: 'MMR por victoria', mmr_per_loss: 'MMR por derrota', queue_timeout: 'Tiempo máximo en cola (s)', min_players_per_match: 'Jugadores mínimos por partida' };
      DB.rules().then((rs) => set('ranked-rules', rs.length ? `<div class="rules-grid">${rs.map((r) => `<div class="rule"><div class="rule-val">${esc(r.rule_value)}</div><div class="rule-key">${esc(RULE_LABEL[r.rule_key] || r.description || r.rule_key)}</div></div>`).join('')}</div>` : emptyState('Sin reglas', 'Las reglas se publicarán al abrir la temporada.'))).catch((e) => set('ranked-rules', errorState(e)));
      try {
        const s = await DB.activeSeason();
        set('ranked-season', s ? `
          <div class="dash-card"><div class="label">Temporada</div><div class="value">${esc(s.name || 'T' + s.season_number)}</div><div class="sub">${statusPill(s.status)}</div></div>
          <div class="dash-card"><div class="label">Inicio</div><div class="value">${fmtDate(s.start_date, { day: 'numeric', month: 'short' })}</div><div class="sub">${fmtDate(s.start_date)}</div></div>
          <div class="dash-card"><div class="label">Fin</div><div class="value">${fmtDate(s.end_date, { day: 'numeric', month: 'short' })}</div><div class="sub">${fmtDate(s.end_date)}</div></div>`
          : `<div class="dash-card dash-card-wide"><div class="label">Temporada</div><div class="value">Próximamente</div><div class="sub">La temporada 1 se anunciará en Discord.</div></div>`);
        const rows = s ? await DB.leaderboard(s.id, 50) : [];
        set('ranked-lb', rows.length ? leaderboardRows(rows) : emptyState('Aún no hay jugadores clasificados', 'Completa las partidas de placement desde el bot de Discord para entrar en el leaderboard.', `<a class="btn btn-secondary" href="${DISCORD_INVITE}" target="_blank" rel="noopener noreferrer">Abrir Discord</a>`));
      } catch (e) { set('ranked-season', errorState(e)); set('ranked-lb', ''); }
    },
  },

  'torneos': {
    title: 'Torneos — VANTCALL Esports',
    content: `
      ${pageHero('04', 'Torneos', 'Compite por <span class="hero-accent">premios reales</span>', 'VANT Open para todos, Pro Series para PRO y Elite Invitational para ELITE. Inscríbete en la web o con /torneo inscribir en Discord.', '<a class="page-hero-chip page-hero-chip-link" href="#/precios">Desbloquear torneos privados</a>')}
      <div data-async="tournaments">${skeleton(4)}</div>`,
    async load(main) {
      const box = main.querySelector('[data-async="tournaments"]');
      try {
        const ts = await window.VantDB.tournaments();
        if (!ts.length) { box.innerHTML = emptyState('Todavía no hay torneos', 'Los organizadores publicarán aquí los torneos de VALORANT, CS2 y LoL. Inscríbete desde la web o con /torneo registrar en Discord.', `<a class="btn btn-primary" href="${DISCORD_INVITE}" target="_blank" rel="noopener noreferrer">Seguir en Discord</a>`); return; }
        const open = ts.filter((t) => ['registration', 'open', 'upcoming', 'in_progress', 'live', 'active'].includes(t.status));
        const past = ts.filter((t) => ['completed', 'finished', 'cancelled', 'closed'].includes(t.status));
        const other = ts.filter((t) => !open.includes(t) && !past.includes(t));
        const sec = (title, arr) => arr.length ? `<h2>${title}</h2><div class="t-grid">${arr.map(tournamentCard).join('')}</div>` : '';
        box.innerHTML = sec('Abiertos y en curso', open) + sec('Próximamente', other) + sec('Finalizados', past);
      } catch (e) { box.innerHTML = errorState(e); }
    },
  },

  'jugadores': {
    title: 'Jugadores — VANTCALL Esports',
    content: `
      ${pageHero('05', 'Jugadores', 'La comunidad <span class="hero-accent">VANTS</span>', 'Busca rivales, compañeros de equipo y fichajes. Cada perfil muestra rango, MMR, historial ranked y torneos jugados.', '<span class="page-hero-chip">Usa /perfil @jugador en Discord</span>')}
      <form class="search-bar" data-player-search role="search">
        <input class="login-form-input" name="q" type="search" placeholder="Buscar por nombre de jugador" aria-label="Buscar jugador" autocomplete="off">
        <button class="btn btn-primary" type="submit">Buscar</button>
      </form>
      <div data-async="players">${skeleton(6)}</div>`,
    async load(main) {
      const box = main.querySelector('[data-async="players"]');
      const run = async (qs) => {
        box.innerHTML = skeleton(6);
        try {
          const ps = await window.VantDB.players(qs);
          box.innerHTML = ps.length ? `<div class="player-grid">${ps.map((p) => `
            <a class="player-card" href="#/jugador/${encodeURIComponent(p.username)}">
              <div class="player-avatar">${p.avatar_url ? `<img src="${esc(p.avatar_url)}" alt="" loading="lazy">` : initials(p.username)}</div>
              <div class="player-info"><div class="player-name">${esc(p.display_name || p.username)}${p.verified ? ' <span class="verified" title="Verificado">✓</span>' : ''}</div>
              <div class="player-sub">@${esc(p.username)}${p.region ? ' · ' + esc(p.region) : ''}${p.main_game ? ' · ' + esc(GAMES[p.main_game] || p.main_game) : ''}</div></div>
            </a>`).join('')}</div>`
            : emptyState(qs ? 'Sin resultados' : 'Aún no hay jugadores', qs ? 'Prueba con otro nombre.' : 'Sé el primero: crea tu cuenta con Discord o correo.', qs ? '' : '<a class="btn btn-primary" href="#/registro">Crear cuenta</a>');
        } catch (e) { box.innerHTML = errorState(e); }
      };
      main.querySelector('[data-player-search]').addEventListener('submit', (e) => { e.preventDefault(); run(e.target.q.value.trim()); });
      run('');
    },
  },

  // ---- PRECIOS (Enhanced Monetization) ----
  'precios': {
    title: 'Planes y Precios — VANTCALL Esports',
    group: 'Plataforma',
    content: `
      ${pageHero('06', 'Planes VANT', 'Juega en <span class="hero-accent">otra liga</span>', 'Un único pago por temporada, sin suscripciones. Tu plan se activa al instante en tu cuenta, en la zona exclusiva y en tus roles de Discord.', '<span class="page-hero-chip">IVA incluido</span><span class="page-hero-chip">Pagos con Stripe</span>')}
      ${planCards()}

      <h2 class="vp-compare-title">Comparativa de planes</h2>

      <div class="pricing-comparison">
        <table>
          <thead>
            <tr>
              <th>Característica</th>
              <th>BASIC</th>
              <th>PRO</th>
              <th>ELITE</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Perfil Ranked</td><td class="check">✓</td><td class="check">✓</td><td class="check">✓</td></tr>
            <tr><td>VANT Open</td><td class="check">✓</td><td class="check">✓</td><td class="check">✓</td></tr>
            <tr><td>VANT Pro Series</td><td class="cross">—</td><td class="check">✓</td><td class="check">✓</td></tr>
            <tr><td>Elite Invitational</td><td class="cross">—</td><td class="cross">—</td><td class="check">✓</td></tr>
            <tr><td>Sala privada / scrims</td><td class="cross">—</td><td class="check">✓</td><td class="check">✓</td></tr>
            <tr><td>Prioridad en tryouts</td><td class="cross">—</td><td class="check">✓</td><td class="check">✓</td></tr>
            <tr><td>Badge Elite en perfil</td><td class="cross">—</td><td class="cross">—</td><td class="check">✓</td></tr>
            <tr><td>Canal Command</td><td class="cross">—</td><td class="cross">—</td><td class="check">✓</td></tr>
            <tr><td>Soporte prioritario</td><td class="cross">—</td><td class="check">✓</td><td class="check">✓</td></tr>
            <tr><td>Verificación prioritaria</td><td class="cross">—</td><td class="cross">—</td><td class="check">✓</td></tr>
            <tr><td>Zona exclusiva en la web</td><td class="check">✓</td><td class="check">✓</td><td class="check">✓</td></tr>
            <tr><td>Rol en Discord</td><td class="check">BASIC</td><td class="check">Operator</td><td class="check">Elite</td></tr>
          </tbody>
        </table>
      </div>

      <div class="vp-faq">
        <h2>Preguntas frecuentes</h2>
        <details><summary>¿Es una suscripción?</summary><p>No. Pagas una vez y el plan dura toda la temporada en curso. No hay renovaciones automáticas.</p></details>
        <details><summary>¿Cuándo se activa mi plan?</summary><p>En cuanto Stripe confirma el pago (normalmente en segundos). Lo verás en Mi cuenta, en la Zona exclusiva y con /zona en Discord.</p></details>
        <details><summary>¿Puedo mejorar de BASIC a PRO o ELITE?</summary><p>Sí. Compra el plan superior cuando quieras y se aplicará el de mayor nivel.</p></details>
        <details><summary>¿Qué métodos de pago aceptáis?</summary><p>Tarjeta, Apple Pay y Google Pay a través de Stripe. PayPal aparece si está activo en el checkout.</p></details>
      </div>
      <p class="pricing-footer-note">Pagos procesados por Stripe. ¿Dudas con tu compra? Escribe a <a href="mailto:feispla@hotmail.com" class="pricing-link">feispla@hotmail.com</a></p>
    `
  },

};

// ---- rutas dinámicas ----
function tournamentPage(slug) {
  return {
    title: 'Torneo — VANTCALL Esports',
    content: `<p class="breadcrumb"><a href="#/torneos">Torneos</a> <span>/</span> <span data-crumb>…</span></p><div data-async="t">${skeleton(5)}</div>`,
    async load(main) {
      const box = main.querySelector('[data-async="t"]');
      try {
        const t = await window.VantDB.tournament(slug);
        if (!t) { box.innerHTML = emptyState('Torneo no encontrado', 'Puede que el enlace sea antiguo.', '<a class="btn btn-secondary" href="#/torneos">Ver torneos</a>'); return; }
        document.title = t.name + ' — VANTCALL Esports';
        main.querySelector('[data-crumb]').textContent = t.name;
        const rounds = {};
        for (const m of t.matches) (rounds[m.round || 1] = rounds[m.round || 1] || []).push(m);
        const canRegister = ['registration', 'open', 'upcoming'].includes(t.status);
        box.innerHTML = `
          <div class="t-hero">
            <div>${statusPill(t.status)}${t.tier ? `<span class="t-tier">${esc(String(t.tier).toUpperCase())}</span>` : ''}</div>
            <h1>${esc(t.name)}</h1>
            <p>${esc(t.description || '')}</p>
            <div class="auth-msg" data-page-msg role="status" aria-live="polite" hidden></div>
            ${canRegister ? `<div class="t-actions"><button type="button" class="btn btn-primary" data-register="${esc(t.id)}">Inscribirme</button><button type="button" class="btn btn-secondary" data-unregister="${esc(t.id)}" hidden>Cancelar inscripción</button></div>` : ''}
          </div>
          <div class="dash-grid">
            <div class="dash-card"><div class="label">Formato</div><div class="value value-sm">${esc(statusLabel(t.format))}</div></div>
            <div class="dash-card"><div class="label">Participantes</div><div class="value">${t.entries.length}${t.max_participants ? ' / ' + t.max_participants : ''}</div></div>
            <div class="dash-card"><div class="label">Inicio</div><div class="value value-sm">${fmtDate(t.starts_at)}</div><div class="sub">${fmtTime(t.starts_at)}</div></div>
            <div class="dash-card"><div class="label">Premio</div><div class="value value-sm">${esc(t.prize_pool || '—')}</div></div>
          </div>
          ${t.registration_closes_at ? `<p class="login-note" style="text-align:left">Inscripción hasta el ${fmtDate(t.registration_closes_at)} a las ${fmtTime(t.registration_closes_at)}.</p>` : ''}
          <h2>Bracket</h2>
          ${Object.keys(rounds).length ? `<div class="bracket">${Object.entries(rounds).map(([r, ms]) => `<div class="bracket-round"><div class="bracket-title">Ronda ${esc(r)}</div>${ms.map(matchRow).join('')}</div>`).join('')}</div>` : emptyState('Bracket pendiente', 'El bracket se genera cuando se cierra la inscripción.')}
          <h2>Inscritos</h2>
          ${t.entries.length ? `<div class="player-grid">${t.entries.map((e) => e.player ? `<a class="player-card" href="#/jugador/${encodeURIComponent(e.player.username)}"><div class="player-avatar">${e.player.avatar_url ? `<img src="${esc(e.player.avatar_url)}" alt="" loading="lazy">` : initials(e.player.username)}</div><div class="player-info"><div class="player-name">${e.seed ? '#' + e.seed + ' ' : ''}${esc(e.player.display_name || e.player.username)}</div><div class="player-sub">${esc(statusLabel(e.status))}</div></div></a>` : '').join('')}</div>` : emptyState('Nadie inscrito aún', 'Sé el primero en inscribirte.')}
          ${t.rules ? `<h2>Reglas</h2><div class="rules-text">${esc(t.rules).replace(/\n/g, '<br>')}</div>` : ''}`;
        if (window.VantAuth) window.VantAuth.bindTournament(main, t);
      } catch (e) { box.innerHTML = errorState(e); }
    },
  };
}

function playerPage(username) {
  return {
    title: 'Jugador — VANTCALL Esports',
    content: `<p class="breadcrumb"><a href="#/jugadores">Jugadores</a> <span>/</span> @${esc(username)}</p><div data-async="p">${skeleton(5)}</div>`,
    async load(main) {
      const box = main.querySelector('[data-async="p"]');
      try {
        const p = await window.VantDB.player(username);
        if (!p) { box.innerHTML = emptyState('Jugador no encontrado', 'Revisa el nombre de usuario.', '<a class="btn btn-secondary" href="#/jugadores">Ver jugadores</a>'); return; }
        document.title = (p.display_name || p.username) + ' — VANTCALL Esports';
        const cur = p.stats.find((s) => s.season && s.season.status === 'active') || p.stats[0];
        const total = p.stats.reduce((a, s) => ({ w: a.w + (s.wins || 0), l: a.l + (s.losses || 0) }), { w: 0, l: 0 });
        const wr = total.w + total.l ? Math.round((total.w / (total.w + total.l)) * 100) : 0;
        box.innerHTML = `
          <div class="profile-head">
            <div class="player-avatar player-avatar-lg">${p.avatar_url ? `<img src="${esc(p.avatar_url)}" alt="">` : initials(p.username)}</div>
            <div>
              <h1>${esc(p.display_name || p.username)}${p.verified ? ' <span class="verified" title="Verificado">✓</span>' : ''}</h1>
              <div class="player-sub">@${esc(p.username)}${p.region ? ' · ' + esc(p.region) : ''}${p.main_game ? ' · ' + esc(GAMES[p.main_game] || p.main_game) : ''} · Desde ${fmtDate(p.created_at, { month: 'short', year: 'numeric' })}</div>
              ${cur ? `<div style="margin-top:var(--space-3)">${rankBadge(cur)}</div>` : ''}
            </div>
          </div>
          ${p.profile && p.profile.bio ? `<p class="profile-bio">${esc(p.profile.bio)}</p>` : ''}
          <div class="dash-grid">
            <div class="dash-card"><div class="label">MMR actual</div><div class="value">${cur ? cur.mmr : '—'}</div><div class="sub">${cur && cur.season ? esc(cur.season.name || 'Temporada ' + cur.season.season_number) : 'Sin temporada'}</div></div>
            <div class="dash-card"><div class="label">Victorias</div><div class="value">${total.w}</div></div>
            <div class="dash-card"><div class="label">Derrotas</div><div class="value">${total.l}</div></div>
            <div class="dash-card"><div class="label">Winrate</div><div class="value">${wr}%</div></div>
          </div>
          <h2>Historial ranked</h2>
          ${p.matches.length ? `<ul class="history-list">${p.matches.map((m) => {
            const isP1 = m.player1_id === p.id;
            const won = (m.result === 'player1_win' && isP1) || (m.result === 'player2_win' && !isP1);
            const delta = isP1 ? m.mmr_change_p1 : m.mmr_change_p2;
            const label = m.result === 'draw' ? 'Empate' : m.status !== 'completed' ? statusLabel(m.status) : won ? 'Victoria' : 'Derrota';
            return `<li class="${won ? 'win' : m.status === 'completed' && m.result !== 'draw' ? 'loss' : ''}"><span>${label}</span><span>${delta != null ? (delta > 0 ? '+' : '') + delta + ' MMR' : ''}</span><span>${fmtDate(m.completed_at || m.created_at)}</span></li>`;
          }).join('')}</ul>` : emptyState('Sin partidas', 'Este jugador aún no ha jugado ranked.')}
          <h2>Torneos</h2>
          ${p.entries.length ? `<ul class="history-list">${p.entries.map((e) => e.tournament ? `<li><a href="#/torneo/${encodeURIComponent(e.tournament.slug)}">${esc(e.tournament.name)}</a><span>${esc(statusLabel(e.status))}</span><span>${fmtDate(e.tournament.starts_at)}</span></li>` : '').join('')}</ul>` : emptyState('Sin torneos', 'Todavía no se ha inscrito en ningún torneo.')}`;
      } catch (e) { box.innerHTML = errorState(e); }
    },
  };
}

function bindRsvp(main) {
  main.querySelectorAll('[data-rsvp]').forEach((b) => {
    if (b.dataset.bound) return;
    b.dataset.bound = '1';
    b.addEventListener('click', () => window.VantAuth && window.VantAuth.rsvp(b.dataset.rsvp, b, main.querySelector('[data-page-msg]')));
  });
}

// ============================================
// ROUTER
// ============================================

let adminScriptPromise = null;
function loadAdminScript() {
  if (!adminScriptPromise) {
    adminScriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = './admin.js?v=2';
      s.onload = resolve;
      s.onerror = () => { adminScriptPromise = null; reject(new Error('No se pudo cargar admin.js')); };
      document.body.appendChild(s);
    });
  }
  return adminScriptPromise;
}

function resolvePage(pageId) {
  if (pageId === 'admin' && !DOC_CONTENT.admin) {
    return {
      title: 'Admin — VANTCALL Esports',
      content: '<div class="adm" data-adm><div class="skeleton-list"><div class="skeleton-row"></div></div></div>',
      async load(main) {
        try {
          await loadAdminScript();
          const page = DOC_CONTENT.admin;
          if (page && typeof page.load === 'function') return page.load(main);
          if (page) main.querySelector('[data-async], [data-adm]') && (main.innerHTML = `<div class="content-wrapper"><div class="content">${page.content}</div></div>`);
        } catch (e) {
          main.innerHTML = '<div class="login-page"><h1>Error</h1><p class="login-sub">No se pudo cargar el panel. Recarga la página.</p></div>';
        }
      },
    };
  }
  if (DOC_CONTENT[pageId]) return DOC_CONTENT[pageId];
  const [head, ...rest] = pageId.split('/');
  const arg = decodeURIComponent(rest.join('/'));
  if (head === 'torneo' && arg) return tournamentPage(arg);
  if (head === 'jugador' && arg) return playerPage(arg);
  return null;
}

const PAGE_META = {
  inicio: 'VANTCALL Esports: ranked con MMR real, torneos con premios y ligas de VALORANT, CS2 y League of Legends. Entra gratis con Google, Discord, Steam o correo.',
  calendario: 'Calendario competitivo de VANTS: próximos torneos, inicios de temporada ranked y partidas programadas de VALORANT, CS2 y League of Legends.',
  ranked: 'El leaderboard de VANTS: jugadores ordenados por MMR, ocho rangos de Hierro a Escarlata, y cómo subir de nivel en VALORANT, CS2 y LoL.',
  torneos: 'Torneos de esports con premios reales: VANT Open gratis para todos, Pro Series para miembros PRO y Elite Invitational. Inscripción abierta.',
  jugadores: 'Perfiles de jugadores de VANTS: MMR, rango, historial de partidas ranked y torneos jugados en VALORANT, CS2 y League of Legends.',
  precios: 'Planes de VANTS: gratis para jugar ranked, PRO para torneos Pro Series y ELITE para la Zona VIP y el Elite Invitational.',
};

function setMeta(name, content, attr = 'name') {
  if (!content) return;
  let el = document.head.querySelector(`meta[${attr}="${name}"]`);
  if (!el) { el = document.createElement('meta'); el.setAttribute(attr, name); document.head.appendChild(el); }
  el.setAttribute('content', content);
}

function trackPageView(pageId) {
  if (typeof gtag !== 'function') return;
  gtag('event', 'page_view', {
    page_title: document.title,
    page_location: location.origin + location.pathname + location.hash,
    page_path: '/' + pageId,
  });
}

function updatePageMeta(pageId, page) {
  const section = pageId.split('/')[0];
  const desc = PAGE_META[section] || PAGE_META.inicio;
  setMeta('description', desc);
  setMeta('og:title', page.title, 'property');
  setMeta('og:description', desc, 'property');
  setMeta('twitter:title', page.title);
  setMeta('twitter:description', desc);
}

function renderPage(pageId) {
  const page = resolvePage(pageId);
  if (!page) { window.location.hash = '#/inicio'; return; }
  const main = document.getElementById('main');
  document.title = page.title;
  updatePageMeta(pageId, page);
  trackPageView(pageId);
  main.innerHTML = `
    <div class="content-wrapper${page.isHome ? ' content-wrapper-home' : ''}">
      <div class="content${page.isHome ? ' content-home' : ''}">${page.content}</div>
    </div>`;
  const section = pageId.split('/')[0];
  const navKey = section === 'torneo' ? 'torneos' : section === 'jugador' ? 'jugadores' : pageId;
  document.querySelectorAll('.nav-item, .mobile-nav-item').forEach((link) => {
    link.classList.toggle('active', link.getAttribute('href') === `#/${navKey}`);
  });
  const mobileNav = document.getElementById('mobile-nav');
  if (mobileNav) mobileNav.classList.remove('show');
  window.scrollTo(0, 0);
  if (typeof page.load === 'function') {
    if (!window.VantDB || !window.VantDB.client) {
      main.querySelectorAll('[data-async]').forEach((el) => { el.innerHTML = errorState(new Error('No se pudo cargar el cliente.')); });
    } else {
      page.load(main);
    }
  }
  if (window.VantAuth) window.VantAuth.afterRender(pageId);
}

const BASE = location.pathname.startsWith('/Vants') ? '/Vants' : (location.pathname.startsWith('/Vantcall') ? '/Vantcall' : '');

function currentRoute() {
  if (location.hash.startsWith('#/')) return location.hash.replace('#/', '').split('?')[0];
  const p = location.pathname.replace(new RegExp('^' + BASE + '/?'), '').replace(/\/$/, '');
  return p || 'inicio';
}

function navigateTo(route) {
  if (location.pathname !== BASE + '/' + route) {
    history.pushState(null, '', BASE + '/' + route);
  }
  renderPage(route);
}

function router() {
  renderPage(currentRoute());
}

// Interceptar clicks en enlaces internos #/... para navegar sin recargar
document.addEventListener('click', (ev) => {
  const a = ev.target.closest('a[href^="#/"]');
  if (!a) return;
  const route = a.getAttribute('href').replace(/^#\//, '').split('?')[0];
  if (!route) return;
  ev.preventDefault();
  navigateTo(route);
});

window.addEventListener('popstate', router);

function initTheme() {
  const toggle = document.querySelector('[data-theme-toggle]');
  const root = document.documentElement;
  let theme = 'dark';
  root.setAttribute('data-theme', theme);
  updateThemeIcon(toggle, theme);
  toggle && toggle.addEventListener('click', () => {
    theme = theme === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', theme);
    updateThemeIcon(toggle, theme);
  });
}

function updateThemeIcon(toggle, theme) {
  if (!toggle) return;
  toggle.setAttribute('aria-label', 'Cambiar a modo ' + (theme === 'dark' ? 'claro' : 'oscuro'));
  toggle.innerHTML = theme === 'dark'
    ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>'
    : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
}

function initMobileMenu() {
  const menuToggle = document.getElementById('menu-toggle');
  const mobileNav = document.getElementById('mobile-nav');
  if (!menuToggle || !mobileNav) return;
  menuToggle.addEventListener('click', () => mobileNav.classList.toggle('show'));
}

function init() {
  initTheme();
  initMobileMenu();
  router();
}

document.addEventListener('DOMContentLoaded', init);
window.addEventListener('hashchange', router);
