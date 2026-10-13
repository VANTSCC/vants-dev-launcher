/// ============================================
// home-deluxe.js — Inicio cinematográfico VANTS (v2, tokens del tema)
// Sustituye la vista 'inicio' de app.js SIN editar app.js.
// Cargar DESPUÉS de app.js (usa DOC_CONTENT y sus helpers).
// Usa los design tokens de style.css → respeta modo claro/oscuro.
// Conserva: data-auth-cta (auth.js), window.VantDB, torneos, leaderboard.
// ============================================
(function () {
  'use strict';
  if (typeof DOC_CONTENT !== 'object') { console.warn('[home-deluxe] Cargar después de app.js'); return; }

  /* ============ CONFIG — edita aquí ============ */
  // video = ID de YouTube (lo que va tras watch?v=). Si un ID falla, la tarjeta muestra póster propio.
  const GAME_VIDEOS = [
    { name: 'VALORANT',          video: 'e_E9W2vsRbQ', accent: '#ff4655', desc: 'Habilidades, pulso y clutches. Ranked con MMR propio y torneos con árbitro.' },
    { name: 'Counter-Strike 2',  video: 'ed-QS1Piaa8', accent: '#f0a33c', desc: 'Precisión y economía de rondas. La arena táctica con servidores 128 tick.' },
    { name: 'League of Legends', video: 'aR-KAldshAE', accent: '#d0a85c', desc: 'Macro, objetivos y sinergia. Liga regular con draft competitivo.' },
  ];
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const INVITE = (typeof DISCORD_INVITE === 'string') ? DISCORD_INVITE : 'https://discord.gg/rCHE7jvRS4';

  /* ============ helpers con fallback (los reales viven en app.js) ============ */
  const escL = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const E = (typeof esc === 'function') ? esc : escL;
  const skelF = (typeof skeleton === 'function') ? skeleton : (n = 3) => `<div class="skeleton-list">${'<div class="skeleton-row"></div>'.repeat(n)}</div>`;
  const emptyF = (typeof emptyState === 'function') ? emptyState
    : (t, x, c) => `<div class="vx-empty"><b>${E(t)}</b><p>${E(x)}</p>${c || ''}</div>`;
  const errF = (typeof errorState === 'function') ? errorState
    : (e) => { console.error(e); return '<div class="auth-msg auth-msg-error">No se pudieron cargar los datos.</div>'; };
  const tCard = (typeof tournamentCard === 'function') ? tournamentCard
    : (t) => `<a class="vx-tcard" href="#/torneo/${encodeURIComponent(t.slug)}"><b>${E(t.name)}</b><span>${E(t.prize_pool || '')}</span></a>`;
  const lbRows = (typeof leaderboardRows === 'function') ? leaderboardRows
    : (rows) => rows.map((r, i) => `<a class="vx-lbrow" href="#/jugador/${encodeURIComponent(r.username)}"><i>${String(i + 1).padStart(2, '0')}</i><b>${E(r.display_name || r.username)}</b><span>${r.mmr || 0} MMR</span></a>`).join('');
  const ranksHTML = (typeof RANKS_STRIP === 'string') ? RANKS_STRIP : (() => {
    const R = [['Hierro',0,'#8a9099'],['Bronce',900,'#b87333'],['Plata',1100,'#c9d1d9'],['Oro',1300,'#e5b93c'],['Platino',1500,'#2ec4b6'],['Diamante',1700,'#9b6bff'],['Titán',1900,'#3ddc84'],['Escarlata',2100,'#ff4655']];
    return `<div class="vx-ranks">${R.map((r, i) => `<div class="vx-rank" style="--r:${r[2]}"><i>${String(i + 1).padStart(2, '0')}</i><b>${r[0]}</b><s>${i === 7 ? 'Top global' : r[1] + '+ MMR'}</s></div>`).join('')}</div>`;
  })();
  const plansHTML = (typeof planCards === 'function') ? planCards() : (() => {
    const P = [
      { k:'basic', n:'BASIC', p:9, f:['VANT Open','Perfil Ranked','Zona BASIC'] },
      { k:'pro', n:'PRO', p:19, hot:true, f:['Todo BASIC','Pro Series','Scrims privadas'] },
      { k:'elite', n:'ELITE', p:39, f:['Todo PRO','Elite Invitational','Canal Command'] },
    ];
    return `<div class="vx-plans">${P.map((x) => `<div class="vx-plan${x.hot ? ' hot' : ''}"><i>${x.n}</i><b>€${x.p}</b><em>pago único · temporada</em><ul>${x.f.map((f) => `<li>${f}</li>`).join('')}</ul><a class="btn btn-secondary vx-plan-btn" href="#/checkout/${x.k}">Elegir</a></div>`).join('')}</div>`;
  })();
  const ICONS = {
    google: '<svg viewBox="0 0 24 24"><path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.45a5.5 5.5 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.57-5.17 3.57-8.81z"/><path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.28v3.1A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.29 14.29A7.2 7.2 0 0 1 4.91 12c0-.8.14-1.57.38-2.29v-3.1H1.28A12 12 0 0 0 0 12c0 1.94.46 3.77 1.28 5.39l4.01-3.1z"/><path fill="#EA4335" d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.28 6.61l4.01 3.1C6.23 6.88 8.88 4.77 12 4.77z"/></svg>',
    discord: (typeof DISCORD_SVG === 'string') ? DISCORD_SVG : '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>',
    steam: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.98 0C5.67 0 .5 4.86.02 11.04l6.43 2.66a3.38 3.38 0 0 1 1.92-.6l.19.01 2.86-4.15v-.06a4.52 4.52 0 1 1 4.52 4.52h-.1l-4.08 2.91v.16a3.39 3.39 0 0 1-6.72.63L.4 15.5A12 12 0 1 0 11.98 0z"/></svg>',
    kick: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 4v16M12 12l7-8M12 12l7 8"/></svg>',
    mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
  };

  /* ============ CSS — 100% con los tokens de style.css ============ */
  const style = document.createElement('style');
  style.id = 'vx-home-style';
  style.textContent = `
  .vx{color:var(--color-text);font-family:var(--font-body)}
  .vx a{color:inherit}
  .vx ul{list-style:none;margin:0;padding:0}
  .vx-wrap{max-width:var(--content-full);margin:0 auto;padding:0 var(--space-6)}
  /* HERO */
  .vx-hero{position:relative;overflow:hidden;min-height:min(84vh,820px);display:flex;align-items:center;border-bottom:1px solid var(--color-border)}
  .vx-hero::before{content:"";position:absolute;inset:0;background:radial-gradient(60% 80% at 78% 18%,var(--color-primary-glow),transparent 60%),radial-gradient(50% 70% at 10% 88%,var(--color-accent-red-glow),transparent 60%);pointer-events:none}
  .vx-hero::after{content:"";position:absolute;inset:0;background-image:linear-gradient(var(--color-divider) 1px,transparent 1px),linear-gradient(90deg,var(--color-divider) 1px,transparent 1px);background-size:56px 56px;-webkit-mask-image:radial-gradient(70% 70% at 60% 40%,#000 30%,transparent 75%);mask-image:radial-gradient(70% 70% at 60% 40%,#000 30%,transparent 75%);pointer-events:none}
  .vx-sweep{position:absolute;inset:-40%;background:conic-gradient(from 0deg at 50% 50%,transparent 0 68%,rgba(255,70,85,.07) 76%,transparent 84%);background:conic-gradient(from 0deg at 50% 50%,transparent 0 68%,color-mix(in srgb,var(--color-primary) 8%,transparent) 76%,transparent 84%);animation:vxsweep 14s linear infinite;pointer-events:none}
  @keyframes vxsweep{to{transform:rotate(1turn)}}
  .vx-hero-in{position:relative;z-index:2;padding:var(--space-24) 0 var(--space-20);width:100%}
  .vx-kick{font-family:var(--font-mono);font-size:var(--text-xs);letter-spacing:.3em;color:var(--color-text-muted);text-transform:uppercase;display:flex;align-items:center;gap:var(--space-3)}
  .vx-kick::before{content:"";width:34px;height:2px;background:var(--color-primary)}
  .vx-h1{font-family:var(--font-display);font-size:clamp(3rem,9vw,7rem);line-height:.95;font-weight:900;letter-spacing:.01em;text-transform:uppercase;margin:var(--space-5) 0 var(--space-6);color:var(--color-text)}
  .vx-line{display:block;overflow:hidden}.vx-line>span{display:block;transform:translateY(112%);animation:vxup 1s cubic-bezier(.19,1,.22,1) forwards}
  .vx-line:nth-child(2)>span{animation-delay:.08s}.vx-line:nth-child(3)>span{animation-delay:.16s}
  @keyframes vxup{to{transform:none}}
  .vx-out{color:transparent;-webkit-text-stroke:2px var(--color-text)}
  .vx-h1 i{font-style:normal;color:var(--color-primary)}
  .vx-lead{max-width:56ch;color:var(--color-text-muted);font-size:var(--text-lg);line-height:1.5;margin:0}
  .vx-lead b{color:var(--color-text)}
  .vx-ctas{display:flex;gap:var(--space-3);margin-top:var(--space-6);flex-wrap:wrap}
  .vx-chips{display:flex;gap:var(--space-2);flex-wrap:wrap;margin-top:var(--space-6)}
  .vx-chips span{font-family:var(--font-mono);font-size:var(--text-xs);letter-spacing:.14em;border:1px solid var(--color-border);padding:var(--space-2) var(--space-4);color:var(--color-text-muted);text-transform:uppercase}
  .vx-fade{opacity:0;animation:vxfade .9s ease forwards}.vx-fade.d2{animation-delay:.25s}.vx-fade.d3{animation-delay:.4s}.vx-fade.d4{animation-delay:.55s}
  @keyframes vxfade{to{opacity:1}}
  /* MARQUEE */
  .vx-marquee{overflow:hidden;border-bottom:1px solid var(--color-border);background:var(--color-surface-offset)}
  .vx-mtrack{display:flex;width:max-content;animation:vxmar 30s linear infinite;padding:var(--space-3) 0}
  .vx-marquee:hover .vx-mtrack{animation-play-state:paused}
  @keyframes vxmar{to{transform:translateX(-50%)}}
  .vx-mitem{padding:0 var(--space-6);font-family:var(--font-mono);font-size:var(--text-xs);letter-spacing:.24em;color:var(--color-text-muted);white-space:nowrap;text-transform:uppercase}
  .vx-mitem::after{content:"//";color:var(--color-primary);margin-left:var(--space-12)}
  /* SECCIONES */
  .vx-sec{padding:var(--space-20) 0;border-top:1px solid var(--color-divider)}
  .vx-sec:first-of-type{border-top:0}
  .vx-knum{display:block;font-family:var(--font-mono);font-size:var(--text-xs);letter-spacing:.3em;color:var(--color-primary);margin-bottom:var(--space-2);text-transform:uppercase}
  .vx-shead{display:flex;align-items:flex-end;justify-content:space-between;gap:var(--space-4);margin-bottom:var(--space-6)}
  .vx-shead h2{font-family:var(--font-display);font-size:clamp(1.5rem,3.2vw,2.3rem);font-weight:900;text-transform:uppercase;letter-spacing:.02em;margin:0;border:0;padding:0;color:var(--color-text)}
  .vx-shead h2 i{font-style:normal;color:var(--color-primary)}
  .vx-shead>a{font-family:var(--font-mono);font-size:var(--text-xs);letter-spacing:.16em;color:var(--color-text-muted);text-decoration:none;text-transform:uppercase;white-space:nowrap;padding-bottom:var(--space-2)}
  .vx-shead>a:hover{color:var(--color-primary)}
  .vx-slead{color:var(--color-text-muted);max-width:64ch;margin:calc(-1 * var(--space-3)) 0 var(--space-6)}
  /* STATS */
  .vx-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--color-border);border:1px solid var(--color-border)}
  .vx-stat{background:var(--color-surface);padding:var(--space-6) var(--space-5)}
  .vx-stat b{display:block;font-family:var(--font-display);font-size:clamp(1.8rem,3.4vw,2.6rem);font-weight:800;color:var(--color-primary);font-variant-numeric:tabular-nums}
  .vx-stat span{font-family:var(--font-mono);font-size:var(--text-xs);letter-spacing:.18em;color:var(--color-text-muted);text-transform:uppercase}
  /* VÍDEOS */
  .vx-games{display:grid;grid-template-columns:repeat(3,1fr);gap:var(--space-4)}
  .vx-game{background:var(--color-surface);border:1px solid var(--color-border);transition:transform var(--transition-slow),border-color var(--transition-interactive)}
  .vx-game:hover{transform:translateY(-6px);border-color:var(--color-primary)}
  .vx-gbar{height:4px;background:var(--g)}
  .vx-video{position:relative;aspect-ratio:16/9;background:var(--color-surface-offset);overflow:hidden}
  .vx-vfacade{position:absolute;inset:0;width:100%;display:block;border:0;padding:0;cursor:pointer;background:none;text-align:left}
  .vx-vfacade img{width:100%;height:100%;object-fit:cover;transition:transform var(--transition-slow)}
  .vx-vfacade:hover img{transform:scale(1.05)}
  .vx-vplay{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:58px;height:58px;border-radius:50%;background:var(--color-primary);display:grid;place-items:center;transition:transform var(--transition-interactive);box-shadow:0 6px 24px var(--color-primary-glow)}
  .vx-vplay svg{width:20px;height:20px;fill:#fff;margin-left:2px}
  .vx-vfacade:hover .vx-vplay{transform:translate(-50%,-50%) scale(1.12)}
  .vx-vtag{position:absolute;left:var(--space-2);bottom:var(--space-2);font-family:var(--font-mono);font-size:.56rem;letter-spacing:.22em;background:rgba(0,0,0,.78);color:#fff;padding:var(--space-1) var(--space-2)}
  .vx-vfacade iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
  .vx-vfacade.nofill{display:grid;place-items:center;color:var(--color-text-muted);font-family:var(--font-mono);font-size:var(--text-xs);letter-spacing:.26em}
  .vx-game-body{padding:var(--space-4) var(--space-5) var(--space-5)}
  .vx-game-body h3{font-family:var(--font-display);margin:0 0 var(--space-2);font-size:1.1rem;font-weight:800;text-transform:uppercase;color:var(--color-text)}
  .vx-game-body p{margin:0;color:var(--color-text-muted);font-size:var(--text-sm)}
  /* DUO */
  .vx-duo{display:grid;grid-template-columns:1.15fr .85fr;gap:var(--space-12)}
  /* RANGOS (fallback) */
  .vx-ranks{display:grid;grid-template-columns:repeat(8,1fr);gap:var(--space-2)}
  .vx-rank{border:1px solid var(--color-border);background:var(--color-surface);padding:var(--space-4) var(--space-3);position:relative;overflow:hidden;transition:transform var(--transition-interactive),border-color var(--transition-interactive)}
  .vx-rank::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--r)}
  .vx-rank:hover{transform:translateY(-4px);border-color:var(--r)}
  .vx-rank i{font-style:normal;font-family:var(--font-mono);font-size:.58rem;letter-spacing:.2em;color:var(--color-text-faint)}
  .vx-rank b{display:block;font-family:var(--font-display);font-size:.98rem;margin:var(--space-2) 0 2px}
  .vx-rank s{text-decoration:none;font-family:var(--font-mono);font-size:.64rem;color:var(--color-text-muted)}
  /* BANNER DISCORD */
  .vx-banner{position:relative;border:1px solid var(--color-border);background:linear-gradient(135deg,var(--color-surface-offset) 0%,var(--color-bg) 100%);padding:var(--space-16) var(--space-8);display:flex;flex-wrap:wrap;gap:var(--space-6);align-items:center;justify-content:space-between;overflow:hidden}
  .vx-banner::before{content:"";position:absolute;inset:0;background:radial-gradient(ellipse at 20% 50%,var(--color-primary-glow),transparent 65%);pointer-events:none}
  .vx-banner>div{position:relative}
  .vx-banner h2{font-family:var(--font-display);font-size:clamp(1.6rem,3.6vw,2.5rem);font-weight:900;text-transform:uppercase;letter-spacing:.04em;margin:0 0 var(--space-3);border:0;padding:0;color:var(--color-text)}
  .vx-banner p{max-width:56ch;color:var(--color-text-muted);margin:0 0 var(--space-5)}
  /* PLANES (fallback) */
  .vx-plans{display:grid;grid-template-columns:repeat(3,1fr);gap:var(--space-4)}
  .vx-plan{border:1px solid var(--color-border);background:var(--color-surface);padding:var(--space-6);display:flex;flex-direction:column;gap:var(--space-2)}
  .vx-plan.hot{border-color:var(--color-primary);box-shadow:0 0 0 1px var(--color-primary)}
  .vx-plan i{font-style:normal;font-family:var(--font-mono);font-size:var(--text-xs);letter-spacing:.24em;color:var(--color-primary)}
  .vx-plan b{font-family:var(--font-display);font-size:2rem;font-weight:800}
  .vx-plan em{font-style:normal;font-family:var(--font-mono);font-size:var(--text-xs);color:var(--color-text-muted);letter-spacing:.08em}
  .vx-plan li{font-size:var(--text-sm);color:var(--color-text-muted);padding:var(--space-1) 0}
  .vx-plan-btn{margin-top:auto;width:100%;justify-content:center}
  /* MÉTODOS */
  .vx-methods{display:grid;grid-template-columns:repeat(5,1fr);gap:var(--space-3)}
  .vx-mcard{border:1px solid var(--color-border);background:var(--color-surface);padding:var(--space-8) var(--space-4);text-align:center;text-decoration:none;transition:all var(--transition-interactive)}
  .vx-mcard:hover{border-color:var(--color-primary);transform:translateY(-3px)}
  .vx-mico{width:48px;height:48px;margin:0 auto var(--space-3);display:grid;place-items:center}
  .vx-mico svg{width:30px;height:30px}
  .vx-mcard h3{font-family:var(--font-display);margin:0 0 var(--space-1);font-size:var(--text-sm);font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--color-text)}
  .vx-mcard p{margin:0;font-size:var(--text-xs);color:var(--color-text-muted)}
  /* ESTADOS / FALLBACKS */
  .vx-empty{border:1px dashed var(--color-border);padding:var(--space-6);color:var(--color-text-muted)}.vx-empty b{color:var(--color-text)}
  .vx-tcard{display:flex;justify-content:space-between;gap:var(--space-4);border:1px solid var(--color-border);background:var(--color-surface);padding:var(--space-4) var(--space-5);text-decoration:none;margin-bottom:var(--space-2)}
  .vx-tcard:hover{border-color:var(--color-primary)}.vx-tcard span{color:var(--color-primary);font-weight:700}
  .vx-lbrow{display:flex;align-items:center;gap:var(--space-3);border:1px solid var(--color-border);background:var(--color-surface);padding:var(--space-3) var(--space-4);text-decoration:none;margin-bottom:var(--space-2)}
  .vx-lbrow i{font-style:normal;font-family:var(--font-display);color:var(--color-primary);font-weight:800}.vx-lbrow b{flex:1}.vx-lbrow span{color:var(--color-text-muted);font-family:var(--font-mono);font-size:var(--text-xs)}
  /* REVEAL */
  .vx-reveal{opacity:0;transform:translateY(26px);transition:opacity .8s ease,transform .8s cubic-bezier(.19,1,.22,1)}
  .vx-reveal.in{opacity:1;transform:none}
  @media(max-width:960px){.vx-games,.vx-plans{grid-template-columns:1fr}.vx-duo{grid-template-columns:1fr}.vx-methods{grid-template-columns:repeat(2,1fr)}.vx-stats{grid-template-columns:1fr 1fr}.vx-ranks{grid-template-columns:repeat(4,1fr)}.vx-wrap{padding:0 var(--space-4)}}
  @media(max-width:520px){.vx-ranks{grid-template-columns:repeat(2,1fr)}.vx-methods{grid-template-columns:1fr 1fr}.vx-h1{font-size:clamp(2.6rem,13vw,4rem)}.vx-banner{padding:var(--space-10) var(--space-5)}}
  @media(prefers-reduced-motion:reduce){.vx *{animation:none!important;transition:none!important}.vx-reveal,.vx-fade{opacity:1;transform:none}.vx-line>span{transform:none}}
  `;
  document.head.appendChild(style);

  /* ============ plantillas ============ */
  const hero = `
  <section class="vx-hero" aria-label="VANTS">
    <div class="vx-sweep" aria-hidden="true"></div>
    <div class="vx-wrap vx-hero-in">
      <p class="vx-kick vx-fade">Beta abierta · Valorant · CS2 · LoL</p>
      <h1 class="vx-h1">
        <span class="vx-line"><span>JUEGA.</span></span>
        <span class="vx-line"><span class="vx-out">GANA.</span></span>
        <span class="vx-line"><span>COBRA<i>.</i></span></span>
      </h1>
      <p class="vx-lead vx-fade d2">La liga competitiva de la comunidad: ranked con <b>MMR real</b>, torneos con <b>premios</b> y bot de Discord conectado a tu perfil. Entra con Google, Discord, Steam, Kick o correo.</p>
      <div class="vx-ctas vx-fade d3">
        <a href="#/login" class="btn btn-primary btn-lg" data-auth-cta>JUGAR GRATIS</a>
        <a href="#/torneos" class="btn btn-secondary btn-lg">VER TORNEOS</a>
      </div>
      <div class="vx-chips vx-fade d4"><span>Ranked con MMR</span><span>Torneos con premio</span><span>Bot en Discord</span><span>Zona exclusiva</span></div>
    </div>
  </section>`;

  const MQ = ['VALORANT','Counter-Strike 2','League of Legends','Ranked VANTS','Torneos','Ligas','Scrims'];
  const half = MQ.map((t) => `<span class="vx-mitem">${t}</span>`).join('');
  const marquee = `<div class="vx-marquee" aria-hidden="true"><div class="vx-mtrack"><div style="display:flex">${half}</div><div style="display:flex">${half}</div></div></div>`;

  const games = GAME_VIDEOS.map((g, i) => `
    <article class="vx-game vx-reveal" style="--g:${g.accent};transition-delay:${i * 70}ms">
      <div class="vx-gbar"></div>
      <div class="vx-video" data-video="${g.video}" data-title="${E(g.name)}">
        <button type="button" class="vx-vfacade" aria-label="Reproducir tráiler de ${E(g.name)}">
          <img alt="Tráiler de ${E(g.name)}" loading="lazy" src="https://i.ytimg.com/vi/${g.video}/maxresdefault.jpg">
          <span class="vx-vplay"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span>
          <span class="vx-vtag">TRÁILER OFICIAL</span>
        </button>
      </div>
      <div class="vx-game-body"><h3>${E(g.name)}</h3><p>${g.desc}</p></div>
    </article>`).join('');

  // TODO dentro de .vx → los tokens del tema están disponibles en hero incluido
  const content = `<div class="vx">
  ${hero}${marquee}
    <section class="vx-sec"><div class="vx-wrap">
      <div class="vx-stats vx-reveal" data-async="home-stats">${skelF(1)}</div>
    </div></section>
    <section class="vx-sec"><div class="vx-wrap">
      <div class="vx-shead"><h2>ELIGE TU <i>ARENA</i></h2><a href="#/torneos">Ver torneos</a></div>
      <div class="vx-games">${games}</div>
    </div></section>
    <section class="vx-sec"><div class="vx-wrap vx-duo">
      <div><div class="vx-shead"><h2>PRÓXIMOS <i>TORNEOS</i></h2><a href="#/torneos">Ver todos</a></div>
        <div data-async="home-tournaments">${skelF(3)}</div></div>
      <div><div class="vx-shead"><h2>TOP <i>RANKED</i></h2><a href="#/ranked">Leaderboard</a></div>
        <div data-async="home-leaderboard">${skelF(5)}</div></div>
    </div></section>
    <section class="vx-sec"><div class="vx-wrap">
      <span class="vx-knum">Sistema de rangos</span>
      <div class="vx-shead"><h2>DE HIERRO A <i>ESCARLATA</i></h2></div>
      <p class="vx-slead">Ocho niveles por juego. Ganas VP por victoria, MVP y clutches; cada temporada conservas el 30% del VP acumulado.</p>
      <div class="vx-reveal">${ranksHTML}</div>
    </div></section>
    <section class="vx-sec"><div class="vx-wrap">
      <div class="vx-banner vx-reveal">
        <div><h2>EL SERVIDOR DONDE PASA TODO</h2>
        <p>Anuncios de torneos al instante, salas de voz, tryouts y el bot VANTS: usa /perfil, /ranking o /torneos.</p>
        <a class="btn btn-primary" href="${INVITE}" target="_blank" rel="noopener noreferrer">ENTRAR AL SERVIDOR</a></div>
      </div>
    </div></section>
    <section class="vx-sec"><div class="vx-wrap">
      <span class="vx-knum">Un pago por temporada</span>
      <div class="vx-shead"><h2>ELIGE TU <i>PLAN</i></h2><a href="#/precios">Comparativa completa</a></div>
      <div class="vx-reveal">${plansHTML}</div>
    </div></section>
    <section class="vx-sec"><div class="vx-wrap">
      <div class="vx-shead"><h2>ENTRA COMO <i>QUIERAS</i></h2></div>
      <div class="vx-methods vx-reveal">
        <a href="#/login" class="vx-mcard"><span class="vx-mico">${ICONS.google}</span><h3>Google</h3><p>Un clic y dentro</p></a>
        <a href="#/login" class="vx-mcard"><span class="vx-mico">${ICONS.discord}</span><h3>Discord</h3><p>Conectado al bot</p></a>
        <a href="#/login" class="vx-mcard"><span class="vx-mico">${ICONS.steam}</span><h3>Steam</h3><p>Ideal para CS2</p></a>
        <a href="#/login" class="vx-mcard"><span class="vx-mico">${ICONS.kick}</span><h3>Kick</h3><p>Para streamers</p></a>
        <a href="#/registro" class="vx-mcard"><span class="vx-mico">${ICONS.mail}</span><h3>Correo</h3><p>Registro clásico</p></a>
      </div>
    </div></section>
  </div>`;

  /* ============ comportamientos ============ */
  function runCounters(scope) {
    scope.querySelectorAll('.vx-num:not([data-done])').forEach((el) => {
      el.dataset.done = '1';
      const target = +el.dataset.target || 0;
      if (REDUCED) { el.textContent = target.toLocaleString('es-ES'); return; }
      const t0 = performance.now();
      (function f(now) {
        const t = Math.min(1, (now - t0) / 1400), e = 1 - Math.pow(1 - t, 3);
        el.textContent = Math.round(target * e).toLocaleString('es-ES');
        if (t < 1) requestAnimationFrame(f);
      })(t0);
    });
  }
  function bindVideos(scope) {
    scope.querySelectorAll('.vx-video[data-video]').forEach((v) => {
      if (v.dataset.vxv) return; v.dataset.vxv = '1';
      const btn = v.querySelector('.vx-vfacade'); if (!btn) return;
      const img = btn.querySelector('img'); let step = 0;
      if (img) img.addEventListener('error', () => {
        step++;
        if (step === 1) img.src = 'https://i.ytimg.com/vi/' + v.dataset.video + '/hqdefault.jpg';
        else { img.remove(); btn.classList.add('nofill'); btn.insertAdjacentHTML('beforeend', '<span>TRÁILER NO DISPONIBLE</span>'); }
      });
      btn.addEventListener('click', () => {
        if (v.classList.contains('is-playing')) return;
        v.classList.add('is-playing');
        btn.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + v.dataset.video + '?autoplay=1&rel=0&modestbranding=1" title="Tráiler de ' + E(v.dataset.title) + '" allow="autoplay; encrypted-media; fullscreen" allowfullscreen></iframe>';
      });
    });
  }
  function bindReveal(scope) {
    const els = scope.querySelectorAll('.vx-reveal');
    if (REDUCED || !('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('in')); return; }
    const io = new IntersectionObserver((es) => es.forEach((x) => { if (x.isIntersecting) { x.target.classList.add('in'); io.unobserve(x.target); } }), { threshold: .12 });
    els.forEach((e) => io.observe(e));
  }

  /* ============ vista 'inicio' (misma API que la original) ============ */
  DOC_CONTENT['inicio'] = {
    title: 'VANTS — Plataforma competitiva de esports',
    isHome: true,
    content,
    async load(main) {
      const DB = window.VantDB;
      const set = (k, html) => { const el = main.querySelector('[data-async="' + k + '"]'); if (el) el.innerHTML = html; };
      const stat = (n, l) => `<div class="vx-stat"><b class="vx-num" data-target="${n || 0}">0</b><span>${l}</span></div>`;

      if (DB && typeof DB.stats === 'function') {
        DB.stats().then((s) => {
          set('home-stats', stat(s.players, 'Jugadores registrados') + stat(s.tournaments, 'Torneos') + stat(s.events, 'Eventos próximos') + stat(s.matches, 'Partidas ranked'));
          runCounters(main);
        }).catch((e) => set('home-stats', errF(e)));
      } else set('home-stats', emptyF('Datos no disponibles', 'El cliente de datos no está cargado.'));

      if (DB && typeof DB.tournaments === 'function') {
        DB.tournaments().then((ts) => {
          const up = (ts || []).filter((t) => !['completed', 'finished', 'cancelled', 'draft'].includes(t.status)).slice(0, 3);
          set('home-tournaments', up.length
            ? `<div class="t-grid t-grid-stack">${up.map(tCard).join('')}</div>`
            : emptyF('Sin torneos abiertos', 'Los anunciamos primero en Discord.', `<a class="btn btn-secondary" href="${INVITE}" target="_blank" rel="noopener noreferrer">Avisarme en Discord</a>`));
        }).catch((e) => set('home-tournaments', errF(e)));
      }

      if (DB && typeof DB.activeSeason === 'function') {
        DB.activeSeason().then(async (s) => {
          const rows = (s && typeof DB.leaderboard === 'function') ? await DB.leaderboard(s.id, 5) : [];
          set('home-leaderboard', rows.length ? lbRows(rows)
            : emptyF('Leaderboard vacío', s ? 'Juega tus placements para aparecer aquí.' : 'La temporada ranked aún no comienza.', '<a class="btn btn-secondary" href="#/ranked">Cómo funciona</a>'));
        }).catch((e) => set('home-leaderboard', errF(e)));
      }

      bindVideos(main);
      bindReveal(main);
    },
  };
})();
