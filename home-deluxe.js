// ============================================
// home-deluxe.js — Inicio cinematográfico VANTS
// Sustituye la vista 'inicio' de app.js SIN editar app.js.
// Cargar DESPUÉS de app.js (usa DOC_CONTENT y sus helpers).
// Conserva: data-auth-cta (auth.js), window.VantDB, torneos, leaderboard.
// ============================================
(function () {
  'use strict';
  if (typeof DOC_CONTENT !== 'object') { console.warn('[home-deluxe] Cargar después de app.js'); return; }

  /* ============ CONFIG — edita aquí ============ */
  // video = ID de YouTube (lo que va tras watch?v=). Si un ID falla, la tarjeta muestra póster propio.
  const GAME_VIDEOS = [
    { name: 'VALORANT',           video: 'e_E9W2vsRbQ', accent: '#ff4655', desc: 'Habilidades, pulso y clutches. Ranked con MMR propio y torneos con árbitro.' },
    { name: 'Counter-Strike 2',   video: 'ed-QS1Piaa8', accent: '#f0a33c', desc: 'Precisión y economía de rondas. La arena táctica con servidores 128 tick.' },
    { name: 'League of Legends',  video: 'aR-KAldshAE', accent: '#d0a85c', desc: 'Macro, objetivos y sinergia. Liga regular con draft competitivo.' },
  ];
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const INVITE = (typeof DISCORD_INVITE === 'string') ? DISCORD_INVITE : 'https://discord.gg/rCHE7jvRS4';

  /* ============ helpers con fallback ============ */
  const escL = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const E = (typeof esc === 'function') ? esc : escL;
  const skelL = (n = 3) => Array(n).fill('<div class="vx-skel"></div>').join('');
  const skelF = (typeof skeleton === 'function') ? skeleton : skelL;
  const emptyF = (typeof emptyState === 'function') ? emptyState
    : (t, x, c) => `<div class="vx-empty"><b>${E(t)}</b><p>${E(x)}</p>${c || ''}</div>`;
  const errF = (typeof errorState === 'function') ? errorState
    : (e) => { console.error(e); return '<div class="vx-errmsg">No se pudieron cargar los datos.</div>'; };
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
    return `<div class="vx-plans">${P.map((x) => `<div class="vx-plan${x.hot ? ' hot' : ''}"><i>${x.n}</i><b>€${x.p}</b><em>pago único · temporada</em><ul>${x.f.map((f) => `<li>${f}</li>`).join('')}</ul><a class="vx-btn vx-btn-ghost" href="#/checkout/${x.k}">Elegir</a></div>`).join('')}</div>`;
  })();
  const ICONS = {
    google: '<svg viewBox="0 0 24 24"><path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.45a5.5 5.5 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.57-5.17 3.57-8.81z"/><path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.28v3.1A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.29 14.29A7.2 7.2 0 0 1 4.91 12c0-.8.14-1.57.38-2.29v-3.1H1.28A12 12 0 0 0 0 12c0 1.94.46 3.77 1.28 5.39l4.01-3.1z"/><path fill="#EA4335" d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.28 6.61l4.01 3.1C6.23 6.88 8.88 4.77 12 4.77z"/></svg>',
    discord: (typeof DISCORD_SVG === 'string') ? DISCORD_SVG : '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>',
    steam: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.98 0C5.67 0 .5 4.86.02 11.04l6.43 2.66a3.38 3.38 0 0 1 1.92-.6l.19.01 2.86-4.15v-.06a4.52 4.52 0 1 1 4.52 4.52h-.1l-4.08 2.91v.16a3.39 3.39 0 0 1-6.72.63L.4 15.5A12 12 0 1 0 11.98 0z"/></svg>',
    kick: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 4v16M12 12l7-8M12 12l7 8"/></svg>',
    mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
  };

  /* ============ CSS (namespaced vx-) ============ */
  const style = document.createElement('style');
  style.id = 'vx-home-style';
  style.textContent = `
  .vx{--acc:#ff4655;--ink:#eef1f4;--mut:#98a2ad;--line:rgba(255,255,255,.09);--bg:#0b0f14;--bg2:#0d141d;color:var(--ink)}
  .vx a{color:inherit}.vx ul{list-style:none;margin:0;padding:0}
  .vx-wrap{max-width:1240px;margin:0 auto;padding:0 clamp(18px,4vw,48px)}
  .vx-btn{display:inline-flex;align-items:center;gap:10px;padding:15px 26px;font-weight:700;letter-spacing:.14em;font-size:.8rem;text-transform:uppercase;text-decoration:none;border:1px solid transparent;transition:.25s}
  .vx-btn-acc{background:var(--acc);color:#fff}.vx-btn-acc:hover{background:#ff5f6c;transform:translateY(-2px)}
  .vx-btn-ghost{border-color:rgba(255,255,255,.25)}.vx-btn-ghost:hover{border-color:var(--acc);color:var(--acc)}
  /* HERO */
  .vx-hero{position:relative;overflow:hidden;min-height:min(86vh,840px);display:flex;align-items:center;border-bottom:1px solid var(--line)}
  .vx-hero::before{content:"";position:absolute;inset:0;background:radial-gradient(60% 80% at 78% 18%,rgba(255,70,85,.16),transparent 60%),radial-gradient(50% 70% at 12% 85%,rgba(64,140,255,.10),transparent 60%),linear-gradient(180deg,#0b0f14,#0b0f14 100%)}
  .vx-hero::after{content:"";position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.04) 1px,transparent 1px);background-size:56px 56px;-webkit-mask-image:radial-gradient(70% 70% at 60% 40%,#000 30%,transparent 75%);mask-image:radial-gradient(70% 70% at 60% 40%,#000 30%,transparent 75%)}
  .vx-sweep{position:absolute;inset:-40%;background:conic-gradient(from 0deg at 50% 50%,transparent 0 68%,rgba(255,70,85,.07) 76%,transparent 84%);animation:vxsweep 14s linear infinite}
  @keyframes vxsweep{to{transform:rotate(1turn)}}
  .vx-hero-in{position:relative;z-index:2;padding:100px 0 72px;width:100%}
  .vx-kick{font-size:.72rem;letter-spacing:.3em;color:var(--mut);text-transform:uppercase;display:flex;align-items:center;gap:12px}
  .vx-kick::before{content:"";width:34px;height:2px;background:var(--acc)}
  .vx-h1{font-size:clamp(3.2rem,9vw,7.2rem);line-height:.95;font-weight:900;letter-spacing:.01em;margin:22px 0 26px}
  .vx-line{display:block;overflow:hidden}.vx-line>span{display:block;transform:translateY(112%);animation:vxup 1s cubic-bezier(.19,1,.22,1) forwards}
  .vx-line:nth-child(2)>span{animation-delay:.08s}.vx-line:nth-child(3)>span{animation-delay:.16s}
  @keyframes vxup{to{transform:none}}
  .vx-out{color:transparent;-webkit-text-stroke:2px var(--ink)}
  .vx-h1 i{font-style:normal;color:var(--acc)}
  .vx-lead{max-width:560px;color:var(--mut);font-size:1.05rem}.vx-lead b{color:var(--ink)}
  .vx-ctas{display:flex;gap:14px;margin-top:28px;flex-wrap:wrap}
  .vx-chips{display:flex;gap:10px;flex-wrap:wrap;margin-top:30px}
  .vx-chips span{font-size:.62rem;letter-spacing:.2em;border:1px solid var(--line);padding:8px 14px;color:var(--mut)}
  .vx-fade{opacity:0;animation:vxfade .9s ease forwards}.vx-fade.d2{animation-delay:.25s}.vx-fade.d3{animation-delay:.4s}.vx-fade.d4{animation-delay:.55s}
  @keyframes vxfade{to{opacity:1}}
  /* MARQUEE */
  .vx-marquee{overflow:hidden;border-bottom:1px solid var(--line);background:var(--bg2)}
  .vx-mtrack{display:flex;width:max-content;animation:vxmar 30s linear infinite;padding:13px 0}
  .vx-marquee:hover .vx-mtrack{animation-play-state:paused}
  @keyframes vxmar{to{transform:translateX(-50%)}}
  .vx-mitem{padding:0 26px;font-size:.76rem;letter-spacing:.24em;color:var(--mut);white-space:nowrap;text-transform:uppercase}
  .vx-mitem::after{content:"//";color:var(--acc);margin-left:52px}
  /* SECCIONES */
  .vx-sec{padding:clamp(54px,9vh,92px) 0;border-top:1px solid var(--line)}
  .vx-sec:first-of-type{border-top:0}
  .vx-knum{display:block;font-size:.66rem;letter-spacing:.3em;color:var(--acc);margin-bottom:10px;text-transform:uppercase}
  .vx-shead{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;margin-bottom:26px}
  .vx-shead h2{font-size:clamp(1.5rem,3.2vw,2.3rem);font-weight:900;text-transform:uppercase;margin:0}
  .vx-shead h2 i{font-style:normal;color:var(--acc)}
  .vx-shead>a{font-size:.68rem;letter-spacing:.2em;color:var(--mut);text-decoration:none;text-transform:uppercase;white-space:nowrap}
  .vx-shead>a:hover{color:var(--acc)}
  .vx-slead{color:var(--mut);max-width:620px;margin:-8px 0 26px}
  /* STATS */
  .vx-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--line);border:1px solid var(--line)}
  .vx-stat{background:var(--bg);padding:26px 22px}
  .vx-stat b{display:block;font-size:clamp(1.8rem,3.4vw,2.6rem);font-weight:900;color:var(--acc);font-variant-numeric:tabular-nums}
  .vx-stat span{font-size:.62rem;letter-spacing:.22em;color:var(--mut);text-transform:uppercase}
  /* VÍDEOS */
  .vx-games{display:grid;grid-template-columns:repeat(3,1fr);gap:22px}
  .vx-game{background:var(--bg2);border:1px solid var(--line);transition:transform .35s cubic-bezier(.19,1,.22,1),border-color .3s}
  .vx-game:hover{transform:translateY(-6px);border-color:rgba(255,255,255,.22)}
  .vx-gbar{height:4px;background:var(--g)}
  .vx-video{position:relative;aspect-ratio:16/9;background:#090d12;overflow:hidden}
  .vx-vfacade{position:absolute;inset:0;width:100%;display:block;border:0;padding:0;cursor:pointer;background:none;text-align:left}
  .vx-vfacade img{width:100%;height:100%;object-fit:cover;transition:transform .6s cubic-bezier(.19,1,.22,1);filter:saturate(.95)}
  .vx-vfacade:hover img{transform:scale(1.05)}
  .vx-vplay{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:58px;height:58px;border-radius:50%;background:var(--acc);display:grid;place-items:center;transition:transform .3s;box-shadow:0 6px 24px rgba(255,70,85,.4)}
  .vx-vplay svg{width:20px;height:20px;fill:#fff;margin-left:2px}
  .vx-vfacade:hover .vx-vplay{transform:translate(-50%,-50%) scale(1.12)}
  .vx-vtag{position:absolute;left:10px;bottom:10px;font-size:.56rem;letter-spacing:.22em;background:rgba(0,0,0,.78);color:#fff;padding:6px 9px}
  .vx-vfacade iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
  .vx-vfacade.nofill{display:grid;place-items:center;color:var(--mut);font-size:.6rem;letter-spacing:.26em}
  .vx-game-body{padding:18px 20px 22px}.vx-game-body h3{margin:0 0 6px;font-size:1.1rem;font-weight:800;text-transform:uppercase}.vx-game-body p{margin:0;color:var(--mut);font-size:.88rem}
  /* DUO */
  .vx-duo{display:grid;grid-template-columns:1.15fr .85fr;gap:clamp(24px,4vw,56px)}
  /* RANGOS */
  .vx-ranks{display:grid;grid-template-columns:repeat(8,1fr);gap:10px}
  .vx-rank{border:1px solid var(--line);background:var(--bg2);padding:14px 12px;position:relative;overflow:hidden;transition:transform .3s,border-color .3s}
  .vx-rank::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--r)}
  .vx-rank:hover{transform:translateY(-4px);border-color:var(--r)}
  .vx-rank i{font-style:normal;font-size:.58rem;letter-spacing:.2em;color:var(--mut)}
  .vx-rank b{display:block;font-size:.98rem;margin:6px 0 2px}
  .vx-rank s{text-decoration:none;font-size:.64rem;color:var(--mut)}
  /* BANNER */
  .vx-banner{border:1px solid var(--line);background:linear-gradient(120deg,rgba(255,70,85,.14),rgba(255,70,85,.03) 45%,transparent),var(--bg2);padding:clamp(30px,5vw,52px);display:flex;flex-wrap:wrap;gap:26px;align-items:center;justify-content:space-between}
  .vx-banner h2{font-size:clamp(1.6rem,3.6vw,2.5rem);font-weight:900;text-transform:uppercase;margin:0 0 10px}
  .vx-banner p{max-width:560px;color:var(--mut);margin:0 0 18px}
  /* PLANES / MÉTODOS */
  .vx-plans{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
  .vx-plan{border:1px solid var(--line);background:var(--bg2);padding:24px;display:flex;flex-direction:column;gap:10px}
  .vx-plan.hot{border-color:var(--acc)}
  .vx-plan i{font-style:normal;font-size:.66rem;letter-spacing:.24em;color:var(--acc)}
  .vx-plan b{font-size:2rem}.vx-plan em{font-style:normal;font-size:.66rem;color:var(--mut);letter-spacing:.1em}
  .vx-plan li{font-size:.84rem;color:var(--mut);padding:3px 0}
  .vx-plan .vx-btn{margin-top:auto;justify-content:center}
  .vx-methods{display:grid;grid-template-columns:repeat(5,1fr);gap:14px}
  .vx-mcard{border:1px solid var(--line);background:var(--bg2);padding:22px 14px;text-align:center;text-decoration:none;transition:.3s}
  .vx-mcard:hover{border-color:var(--acc);transform:translateY(-4px)}
  .vx-mico{width:44px;height:44px;margin:0 auto 12px;display:grid;place-items:center;border:1px solid var(--line);border-radius:12px}
  .vx-mico svg{width:20px;height:20px}
  .vx-mcard h3{margin:0 0 4px;font-size:.9rem}.vx-mcard p{margin:0;font-size:.74rem;color:var(--mut)}
  /* ESTADOS */
  .vx-skel{height:64px;margin-bottom:10px;border:1px solid var(--line);background:linear-gradient(90deg,var(--bg2),#131b26,var(--bg2));background-size:200% 100%;animation:vxskk 1.2s linear infinite}
  @keyframes vxskk{to{background-position:-200% 0}}
  .vx-empty{border:1px dashed var(--line);padding:26px;color:var(--mut)}.vx-empty b{color:var(--ink)}
  .vx-errmsg{border-left:3px solid var(--acc);padding:14px 16px;color:var(--mut)}
  .vx-tcard{display:flex;justify-content:space-between;gap:14px;border:1px solid var(--line);background:var(--bg2);padding:16px 18px;text-decoration:none;margin-bottom:10px}
  .vx-tcard:hover{border-color:var(--acc)}.vx-tcard span{color:var(--acc);font-weight:700}
  .vx-lbrow{display:flex;align-items:center;gap:14px;border:1px solid var(--line);background:var(--bg2);padding:12px 16px;text-decoration:none;margin-bottom:8px}
  .vx-lbrow i{font-style:normal;color:var(--acc);font-weight:800}.vx-lbrow b{flex:1}.vx-lbrow span{color:var(--mut);font-size:.82rem}
  /* REVEAL */
  .vx-reveal{opacity:0;transform:translateY(26px);transition:opacity .8s ease,transform .8s cubic-bezier(.19,1,.22,1)}
  .vx-reveal.in{opacity:1;transform:none}
  @media(max-width:960px){.vx-games,.vx-plans{grid-template-columns:1fr}.vx-duo{grid-template-columns:1fr}.vx-methods{grid-template-columns:repeat(2,1fr)}.vx-stats{grid-template-columns:1fr 1fr}.vx-ranks{grid-template-columns:repeat(4,1fr)}}
  @media(max-width:520px){.vx-ranks{grid-template-columns:repeat(2,1fr)}.vx-h1{font-size:clamp(2.8rem,14vw,4rem)}}
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
        <a href="#/login" class="vx-btn vx-btn-acc" data-auth-cta>JUGAR GRATIS</a>
        <a href="#/torneos" class="vx-btn vx-btn-ghost">VER TORNEOS</a>
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

  const content = `
  ${hero}${marquee}
  <div class="vx">
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
        <a class="vx-btn vx-btn-acc" href="${INVITE}" target="_blank" rel="noopener noreferrer">ENTRAR AL SERVIDOR</a></div>
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
            : emptyF('Sin torneos abiertos', 'Los anunciamos primero en Discord.', `<a class="vx-btn vx-btn-ghost" href="${INVITE}" target="_blank" rel="noopener noreferrer">Avisarme en Discord</a>`));
        }).catch((e) => set('home-tournaments', errF(e)));
      }

      if (DB && typeof DB.activeSeason === 'function') {
        DB.activeSeason().then(async (s) => {
          const rows = (s && typeof DB.leaderboard === 'function') ? await DB.leaderboard(s.id, 5) : [];
          set('home-leaderboard', rows.length ? lbRows(rows)
            : emptyF('Leaderboard vacío', s ? 'Juega tus placements para aparecer aquí.' : 'La temporada ranked aún no comienza.', '<a class="vx-btn vx-btn-ghost" href="#/ranked">Cómo funciona</a>'));
        }).catch((e) => set('home-leaderboard', errF(e)));
      }

      bindVideos(main);
      bindReveal(main);
    },
  };
})();
