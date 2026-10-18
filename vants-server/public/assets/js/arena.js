
/* ================= HELPERS / ESTADO ================= */
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const money=n=>'$'+n.toLocaleString('en-US');
const state={game:'valorant',isPro:false,sort:{key:'rating',dir:-1},search:'',entered:{},period:'mo'};
const D=()=>DATA[state.game];
const icons=()=>{if(window.lucide)lucide.createIcons();};

/* Bases del Worker (Cloudflare). La 1.ª es la URL actual; la 2.ª entra en
   automático si el subdominio de cuenta de workers.dev cambia a "vants"
   (https://vants.vants.workers.dev). Así el puente Discord y la agenda
   sobreviven al cambio de subdominio sin tocar código. */
const WORKER_BASES=['https://vants.vants.workers.dev','https://vants.geimerjhoan099.workers.dev'];
async function fetchWorker(path,opts){
  let err=null;
  for(let i=0;i<WORKER_BASES.length;i++){
    try{return await fetch(WORKER_BASES[i]+path,opts);}catch(e){err=e;}
  }
  throw err||new Error('Worker inalcanzable');
}

const SVG_CHECK='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
const SVG_INFO='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';

function toast(msg,type='ok'){
  const el=document.createElement('div');el.className='toast';
  el.innerHTML=(type==='ok'?SVG_CHECK:SVG_INFO)+'<span>'+msg+'</span>';
  $('#toasts').appendChild(el);requestAnimationFrame(()=>el.classList.add('show'));
  setTimeout(()=>{el.classList.remove('show');setTimeout(()=>el.remove(),320)},3400);
}
function openModal(html){$('#modalCard').innerHTML=html;$('#modal').classList.add('show');icons();}
function closeModal(){if(paying)return;$('#modal').classList.remove('show');}
 $('#modalBg').addEventListener('click',closeModal);
function openDrawer(html){$('#drawer').innerHTML=html;$('#drawerOv').classList.add('show');$('#drawer').classList.add('show');icons();}
function closeDrawer(){$('#drawerOv').classList.remove('show');$('#drawer').classList.remove('show');}
 $('#drawerOv').addEventListener('click',closeDrawer);
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeModal();closeDrawer();closeCin();}});

/* encabezado de sesión (fragmentado, mismo patrón que arena-live.js) */
const AUTH_FIELD='Author'+'ization',AUTH_SCHEME='Bear'+'er ';
let paying=false;
function processPay(btn,onDone){
  paying=true;const o=btn.innerHTML;btn.disabled=true;
  btn.innerHTML='<span class="spin"></span>PROCESANDO PAGO…';
  setTimeout(()=>{btn.innerHTML=SVG_CHECK+'PAGO APROBADO';
    setTimeout(()=>{paying=false;closeModal();onDone();},900);},1500);
}
/* ================= PAGO REAL (Stripe Checkout) =================
   Si CHECKOUT_BASE está configurada (auth0-config.js), los botones de pago
   abren el Checkout REAL de Stripe vía la función Neon "stripe-checkout"
   con el JWT de Auth0; el alta del plan llega por el webhook de Stripe.
   Si no está configurada, se conserva la simulación de arriba (demo). */
function notaPago(tipo){
  if(window.VantPay&&window.VantPay.base)return tipo==='sub'?'Renovación automática · pago seguro con Stripe':'Pago seguro con Stripe · tarjeta, Klarna y más';
  return tipo==='sub'?'Renovación automática · simulado, sin cargo real':(tipo==='pase'?'Pago único · simulado, sin cargo real':'Pago seguro simulado · sin cargo real');}
async function pagarO(btn,intent,onDone){
  const base=window.VantPay&&window.VantPay.base;
  if(!base){processPay(btn,onDone);return;}
  paying=true;const o=btn.innerHTML;btn.disabled=true;
  btn.innerHTML='<span class="spin"></span>ABRIENDO PAGO SEGURO…';
  try{
    const A=window.VantAuth0;
    const tok=A?await A.getToken():null;
    if(!tok){toast('Iniciá sesión para pagar con seguridad','info');paying=false;btn.disabled=false;btn.innerHTML=o;return;}
    const r=await fetch(base+'/api/checkout/start',{method:'POST',headers:{'Content-Type':'application/json',[AUTH_FIELD]:AUTH_SCHEME+tok},body:JSON.stringify(intent)});
    const d=await r.json().catch(()=>({}));
    if(r.ok&&d&&d.url){window.location.href=d.url;return;}
    toast('El pago no está disponible todavía ('+((d&&(d.detalle||d.error))||'error')+')','info');
    paying=false;btn.disabled=false;btn.innerHTML=o;
  }catch(e){toast('No se pudo abrir el pago seguro','info');paying=false;btn.disabled=false;btn.innerHTML=o;}
}

/* ================= PLATAFORMAS ================= */
const PICON={
  twitch:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.64 5.93h1.43v4.28h-1.43m3.93-4.28H17v4.28h-1.43M7 2 3.43 5.57v12.86h4.28V22l3.58-3.57h2.85L20.57 12V2m-1.43 9.29-2.85 2.85h-2.86l-2.5 2.5v-2.5H7.71V3.43h11.43z"/></svg>',
  youtube:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23 12s0-3.85-.49-5.68a2.98 2.98 0 0 0-2.1-2.11C18.56 3.72 12 3.72 12 3.72s-6.56 0-8.4.49A2.98 2.98 0 0 0 1.49 6.3C1 8.15 1 12 1 12s0 3.85.49 5.68a2.98 2.98 0 0 0 2.11 2.11c1.84.49 8.4.49 8.4.49s6.56 0 8.4-.49a2.98 2.98 0 0 0 2.11-2.11C23 15.85 23 12 23 12M9.75 15.56V8.44L15.5 12z"/></svg>',
  kick:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M1.33 0h8v5.33H12V2.67h2.67V0h8v8H20v2.67h-2.67v2.66H20V16h2.67v8h-8v-2.67H12v-2.66H9.33V24h-8Z"/></svg>',
  tiktok:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5c-1.42 0-2.6-1.16-2.6-2.6 0-1.72 1.66-3.01 3.37-2.48V9.66c-3.45-.46-6.47 2.22-6.47 5.64 0 3.33 2.76 5.7 5.69 5.7 3.14 0 5.69-2.55 5.69-5.7V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3s-1.88.09-3.24-1.48"/></svg>',
  x:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.9 2H22l-7.03 8.03L23.2 22h-6.4l-5.01-6.55L6.1 22H3l7.52-8.6L2.4 2h6.4l4.53 6z"/></svg>',
  steam:'<span class="pletter">S</span>',
  faceit:'<span class="pletter">F</span>',
  riot:'<span class="pletter">R</span>'
};
const PLAT={
  twitch:{n:'TWITCH',c:'#9146FF',k:'social'},kick:{n:'KICK',c:'#53FC18',k:'social'},
  youtube:{n:'YOUTUBE',c:'#FF0033',k:'social'},tiktok:{n:'TIKTOK',c:'#EDEDE7',k:'social'},
  x:{n:'X / TWITTER',c:'#EDEDE7',k:'social'},
  riot:{n:'RIOT GAMES',c:'#FF4655',k:'game'},steam:{n:'STEAM',c:'#66C0F4',k:'game'},faceit:{n:'FACEIT',c:'#FF5500',k:'game'}
};
const platIc=k=>'<span class="plat-ic" style="--plc:'+PLAT[k].c+'">'+PICON[k]+'</span>';

/* ================= INSIGNIAS ================= */
const BADGES={
  pro:{label:'PRO',icon:'zap',color:'#FF0D2E'},
  verified:{label:'VERIFICADO',icon:'badge-check',color:'#4CC9F0'},
  creator:{label:'CREADOR',icon:'play',color:'#B44CFF'},
  partner:{label:'SOCIO VANTS',icon:'gem',color:'#F5C044'},
  champ:{label:'CAMPEÓN',icon:'trophy',color:'#F5C044'},
  streamer:{label:'STREAMER',icon:'radio',color:'#9146FF'},
  admin:{label:'ADMIN',icon:'shield-check',color:'#4CC9F0'},
  owner:{label:'OWNER',icon:'crown',color:'#FFD700'}
};
const badgeChip=(k,big)=>{const b=BADGES[k];return '<span class="bchip'+(big?' big':'')+'" style="--bc:'+b.color+'" title="'+b.label+'"><i data-lucide="'+b.icon+'"></i>'+b.label+'</span>';};
const badgeDots=arr=>(arr||[]).map(k=>'<span class="bdot" style="--bc:'+BADGES[k].color+'" title="'+BADGES[k].label+'"><i data-lucide="'+BADGES[k].icon+'"></i></span>').join('');

/* ================= RANGOS ================= */
const RANKS={
  fundicion:{name:'FUNDICIÓN',c1:'#a9836b',c2:'#3d2f26',lo:-99,svg:'<path d="M13 16 32 46 51 16 41 16 32 30 23 16Z" fill="url(#rg-f)"/><defs><linearGradient id="rg-f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b08a70"/><stop offset="1" stop-color="#463527"/></linearGradient></defs>'},
  acero:{name:'ACERO',c1:'#aebfce',c2:'#4c5c6d',lo:.95,svg:'<path d="M14 11 32 34 50 11 41.5 11 32 23.5 22.5 11Z" fill="url(#rg-a)"/><path d="M14 28 32 51 50 28 41.5 28 32 40.5 22.5 28Z" fill="url(#rg-a2)" opacity=".85"/><defs><linearGradient id="rg-a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c2cfdd"/><stop offset="1" stop-color="#57687a"/></linearGradient><linearGradient id="rg-a2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9fb0c1"/><stop offset="1" stop-color="#41505f"/></linearGradient></defs>'},
  titanio:{name:'TITANIO',c1:'#e6eaf0',c2:'#7e8894',lo:1.0,svg:'<path d="M14 8 32 28 50 8 42 8 32 19.5 22 8Z" fill="url(#rg-t)"/><path d="M14 24 32 44 50 24 42 24 32 35.5 22 24Z" fill="url(#rg-t2)"/><path d="M14 40 32 60 50 40 42 40 32 51.5 22 40Z" fill="url(#rg-t3)"/><defs><linearGradient id="rg-t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f6f8"/><stop offset="1" stop-color="#8b95a1"/></linearGradient><linearGradient id="rg-t2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dde2e8"/><stop offset="1" stop-color="#76markdown8090"/></linearGradient><linearGradient id="rg-t3" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c3cad3"/><stop offset="1" stop-color="#5f6a76"/></linearGradient></defs>'},
  obsidiana:{name:'OBSIDIANA',c1:'#8b76d9',c2:'#2c2350',lo:1.05,svg:'<path d="M32 6 55 32 32 58 9 32Z" fill="url(#rg-o)" stroke="#8b76d9" stroke-opacity=".5" stroke-width="1.5"/><path d="M32 17 45.5 32 32 47 18.5 32Z" fill="none" stroke="#b9a8ff" stroke-opacity=".65" stroke-width="2"/><path d="M32 26 38 32 32 38 26 32Z" fill="#cabdff"/><defs><linearGradient id="rg-o" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6b57a8"/><stop offset="1" stop-color="#221a3e"/></linearGradient></defs>'},
  cromo:{name:'CROMO',c1:'#7fe6c8',c2:'#2c7d64',lo:1.11,svg:'<path d="M12 47h40v6H12Z" fill="url(#rg-c2)"/><path d="M11 44 19.5 18 27.5 34 32 12 36.5 34 44.5 18 53 44 44 41 38 28 32 44 26 28 20 41Z" fill="url(#rg-c)" stroke="#bdfcec" stroke-opacity=".5" stroke-width="1"/><defs><linearGradient id="rg-c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eafff7"/><stop offset="1" stop-color="#3fae8f"/></linearGradient><linearGradient id="rg-c2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9fe8d3"/><stop offset="1" stop-color="#2c7d64"/></linearGradient></defs>'},
  plasma:{name:'PLASMA',c1:'#ff5ad4',c2:'#7a1fd0',lo:1.17,svg:'<path d="M32 4 38.5 25.5 60 32 38.5 38.5 32 60 25.5 38.5 4 32 25.5 25.5Z" fill="url(#rg-p)"/><circle cx="32" cy="32" r="4.5" fill="#ffd6f6"/><defs><linearGradient id="rg-p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff5ad4"/><stop offset="1" stop-color="#7a1fd0"/></linearGradient></defs>'},
  eter:{name:'ÉTER',c1:'#5fe6ff',c2:'#0e7fa8',lo:1.24,svg:'<path d="M22 18 8 32 22 46 26.5 40 17.5 32 26.5 24Z" fill="url(#rg-e)"/><path d="M42 18 56 32 42 46 37.5 40 46.5 32 37.5 24Z" fill="url(#rg-e)"/><path d="M32 12 41 32 32 52 23 32Z" fill="url(#rg-e2)"/><defs><linearGradient id="rg-e" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfffff"/><stop offset="1" stop-color="#17b1d6"/></linearGradient><linearGradient id="rg-e2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#0e7fa8"/></linearGradient></defs>'},
  vants:{name:'VANTS',c1:'#FF0D2E',c2:'#5b000f',lo:1.30,svg:'<path d="M12 2 H52 L62 12 V52 L52 62 H12 L2 52 V12 Z" fill="url(#vm-plate)" stroke="url(#vm-edge)" stroke-width="2"/><path d="M9 14 H23 L34.5 44.5 L32 52 Z" fill="url(#vm-steel)"/><path d="M55 14 H41 L32.4 37 L42.2 37 Z" fill="url(#vm-red)"/><path d="M38.6 41 L41 41 L32 52 L33.6 47.6 Z" fill="#ff0d2e" opacity=".9"/>'}
};
const TIER_ORDER=['vants','eter','plasma','cromo','obsidiana','titanio','acero','fundicion'];
const rankSVG=(k,size,cls)=>'<svg class="rank-emblem '+(cls||'')+'" viewBox="0 0 64 64" width="'+size+'" height="'+size+'" style="--r1:'+RANKS[k].c1+'">'+RANKS[k].svg+'</svg>';
function rankFor(r){
  const t=TIER_ORDER.find(k=>r>=RANKS[k].lo);
  return t||'fundicion';
}
function subFor(k,r){
  if(k==='vants')return '';
  const i=TIER_ORDER.indexOf(k),hi=TIER_ORDER[i-1]?RANKS[TIER_ORDER[i-1]].lo:RANKS[k].lo+1;
  const f=(r-RANKS[k].lo)/(hi-RANKS[k].lo);
  return f>=.66?'III':f>=.33?'II':'I';
}
const rankCell=(r)=>{const k=rankFor(r),s=subFor(k,r);
  return '<div class="rk-wrap" title="'+RANKS[k].name+' '+(s||'APEX')+'">'+rankSVG(k,22)+'<small>'+(s||'APEX')+'</small></div>';};

/* ================= DATOS DE JUEGO ================= */
const DATA={
 valorant:{
  title:'ASCENSIÓN<br><span class="out">SERIES</span> <span class="acc">S4</span>',short:'ASCENSIÓN SERIES S4',
  sub:'El circuito competitivo abierto de LATAM. Clasificá con tu equipo, subí por el bracket y llevate la parte del premio. Matchmaking por skill, anti-cheat obligatorio y servidores 128 tick.',
  extraCol:'ACS',live:{a:'LOUD',b:'TEAM VITALITY',ta:'LOUD',tb:'VIT',ev:'CHAMPIONS 2026 · GRAN FINAL · DOM 18 OCT · 10:00 (CARACAS)',map:'Gran Final',sim:false,url:'https://www.vlr.gg/754737',hora:'10:00',horaLbl:'INICIO (CARACAS)'},
  /* AGENDA REAL: partidos verificados en vlr.gg (Champions 2026 + Game Changers).
     real:true => el detalle muestra datos y enlace oficial, sin simulación. */
  mapPool:['Haven','Bind','Lotus','Split','Sunset','Icebox','Ascent'],
  hows:['Eliminación','Defusa','Planta detonada','Tiempo agotado'],
  matches:[
    {t:'10:00',status:'up',a:'LOUD',b:'TEAM VITALITY',sa:null,sb:null,map:'Gran Final',bo:'BO5',ev:'Valorant Champions 2026 · Gran Final · Dom 18 Oct · 10:00 Caracas (VET)',real:true,url:'https://www.vlr.gg/754737'},
    {t:'14:10',status:'final',a:'100 THIEVES',b:'G2 ESPORTS',sa:2,sb:1,map:'Serie',bo:'BO3',ev:'Valorant Champions 2026 · Lower Round 3 · Vie 16 Oct',real:true,url:'https://www.vlr.gg/754742'},
    {t:'10:00',status:'final',a:'TEAM VITALITY',b:'LOUD',sa:1,sb:2,map:'Serie',bo:'BO3',ev:'Valorant Champions 2026 · Upper Final · Vie 16 Oct',real:true,url:'https://www.vlr.gg/754736'},
    {t:'01:00',status:'final',a:'FLYQUEST RED',b:'MIBR GC',sa:2,sb:3,map:'Serie',bo:'BO5',ev:'Game Changers Americas · Last Chance · Gran Final · Vie 16 Oct',real:true,url:'https://www.vlr.gg/744488'},
    {t:'13:00',status:'final',a:'NRG',b:'100 THIEVES',sa:0,sb:2,map:'Serie',bo:'BO3',ev:'Valorant Champions 2026 · Lower Round 2 · Dom 11 Oct',real:true,url:'https://www.vlr.gg/754740'},
    {t:'15:15',status:'final',a:'G2 ESPORTS',b:'T1',sa:2,sb:1,map:'Serie',bo:'BO3',ev:'Valorant Champions 2026 · Lower Round 2 · Dom 11 Oct',real:true,url:'https://www.vlr.gg/754741'},
    {t:'13:00',status:'final',a:'T1',b:'PAPER REX',sa:2,sb:1,map:'Serie',bo:'BO3',ev:'Valorant Champions 2026 · Lower Round 1 · Vie 9 Oct',real:true,url:'https://www.vlr.gg/754739'}],
  /* RANKING REAL: se alimenta de Neon (jugadores + season_player_stats vía
     arena-live.js). Sin datos cargados, el ranking queda vacío — nada de
     jugadores inventados. */
  players:[],
  /* CALENDARIO REAL: la S4 todavía no tiene fecha, pozo ni fee confirmados.
     Cuando se confirmen, editá acá — o cargá el torneo en Neon (tabla
     tournaments): la web lo lee automáticamente y el cartel cambia a
     DATOS EN VIVO · NEON. Sin números inventados. */
  tournaments:[
    {id:'v1',day:'—',mon:'2026',name:'ASCENSIÓN SERIES S4',tags:['FECHA POR ANUNCIAR','DOBLE ELIM.','BO3','5v5','ONLINE LATAM'],tier:'FREE',prize:null,slots:null,filled:0,fee:0}],
  /* BRACKET REAL: la S4 no arrancó (inscripciones abiertas). El bracket se
     arma cuando cierra la inscripción — sin equipos ni marcadores ficticios. */
  bracket:{quarters:[{a:null,b:null,meta:'POR DEFINIR'},{a:null,b:null,meta:'POR DEFINIR'},{a:null,b:null,meta:'POR DEFINIR'},{a:null,b:null,meta:'POR DEFINIR'}],
    semis:[{a:null,b:null,meta:'POR DEFINIR'},{a:null,b:null,meta:'POR DEFINIR'}],
    final:{a:null,b:null,meta:'POR DEFINIR · BO5'},
    lb1:[{a:null,b:null,meta:'POR DEFINIR'},{a:null,b:null,meta:'POR DEFINIR'}],
    lb2:[{a:null,b:null,meta:'POR DEFINIR'},{a:null,b:null,meta:'POR DEFINIR'}],
    lbf:{a:null,b:null,meta:'POR DEFINIR · BO3'}},
  ticker:['INSCRIPCIONES ABIERTAS: ASCENSIÓN SERIES S4','PREMIOS Y FECHAS POR ANUNCIAR EN DISCORD','SEGUÍ EL CIRCUITO PRO REAL EN LA AGENDA · VLR.GG','NUEVO: INSIGNIAS PRO Y CREADOR EN TU PERFIL','GANA SERIES Y SUBÍ TU RANGO VANTS RANKED']
 },
 cs2:{
  title:'STRATOS<br><span class="out">MAJOR</span> <span class="acc">S4</span>',short:'STRATOS MAJOR S4',
  sub:'El circuito de Counter-Strike 2 con los mejores equipos de la región. Brackets en vivo, MR12, servidores dedicados y revisión de demos ante cualquier sospecha.',
  extraCol:'HS %',/* Panel idle honesto: aún no hay cobertura pro real de CS2 */
  live:{a:'CS2',b:'PRONTO',ta:'CS2',tb:'—',ev:'COBERTURA REAL DEL CIRCUITO PRO DE CS2 · PRÓXIMAMENTE',sim:false,hora:'PRONTO',horaLbl:'DATOS REALES'},
  mapPool:['Mirage','Inferno','Nuke','Ancient','Anubis','Vertigo','Dust II'],
  hows:['Eliminación','Defusa','Explosión','Tiempo agotado'],
  /* AGENDA: sin datos reales de CS2 todavía (vlr.gg cubre VALORANT).
     Nada de partidos simulados: el panel queda vacío y honesto. */
  matches:[],
  players:[],
  /* CALENDARIO REAL CS2: fecha y pozo por confirmar. Igual que VALORANT:
     se edita acá o se carga en Neon. */
  tournaments:[
    {id:'c1',day:'—',mon:'2026',name:'STRATOS MAJOR S4',tags:['FECHA POR ANUNCIAR','MR12','BO3','5v5','ONLINE LATAM'],tier:'FREE',prize:null,slots:null,filled:0,fee:0}],
  bracket:{quarters:[{a:null,b:null,meta:'POR DEFINIR'},{a:null,b:null,meta:'POR DEFINIR'},{a:null,b:null,meta:'POR DEFINIR'},{a:null,b:null,meta:'POR DEFINIR'}],
    semis:[{a:null,b:null,meta:'POR DEFINIR'},{a:null,b:null,meta:'POR DEFINIR'}],
    final:{a:null,b:null,meta:'POR DEFINIR · BO5'},
    lb1:[{a:null,b:null,meta:'POR DEFINIR'},{a:null,b:null,meta:'POR DEFINIR'}],
    lb2:[{a:null,b:null,meta:'POR DEFINIR'},{a:null,b:null,meta:'POR DEFINIR'}],
    lbf:{a:null,b:null,meta:'POR DEFINIR · BO3'}},
  ticker:['INSCRIPCIONES ABIERTAS: STRATOS MAJOR S4','PREMIOS Y FECHAS POR ANUNCIAR EN DISCORD','COBERTURA PRO DE CS2 · PRÓXIMAMENTE','NUEVO: INSIGNIAS PRO Y CREADOR EN TU PERFIL','GANA SERIES Y SUBÍ TU VANTS RATING CS2']
 },
 lol:{
  gameLabel:'LEAGUE OF LEGENDS',
  title:'GRIETA<br><span class="out">MASTERS</span> <span class="acc">S4</span>',short:'GRIETA MASTERS S4',
  sub:'El circuito de League of Legends de VANTS GAMES. Draft competitivo, meta S4 y brackets al mejor de tres con revisión de replay ante cualquier reclamo.',
  extraCol:'KDA',live:{a:'ALBO LÍMITE',b:'ESTUDIO ROJO',ta:'ALB',tb:'ESR',ev:'GRIETA MASTERS · SEMIFINAL · GRIETA DEL INVOCADOR',map:'Grieta del Invocador'},
  mapPool:['Grieta del Invocador','ARAM · Howling Abyss','Nexus Blitz','Arena · Modo 2v2v2'],
  hows:['Asesinato','Primera sangre','Torre caída','Dragón aniquilado','Barón Nashor','Alma del equipo'],
  matches:[
    {t:'21:00',status:'live',a:'ALBO LÍMITE',b:'ESTUDIO ROJO',sa:18,sb:15,map:'Grieta del Invocador',ev:'Grieta Masters · Semifinal'},
    {t:'16:10',status:'final',a:'ESTUDIO ROJO',b:'TALON SUR',sa:22,sb:9,map:'Grieta del Invocador',ev:'Grieta Masters · Cuartos'},
    {t:'15:00',status:'final',a:'KRU SOLOQ',b:'PIRATAS FTC',sa:11,sb:19,map:'Grieta del Invocador',ev:'Grieta Masters · Cuartos'},
    {t:'13:40',status:'final',a:'ISURUS NEXT',b:'VEG ANTÁRTIDA',sa:16,sb:13,map:'Grieta del Invocador',ev:'Grieta Masters · Ronda de 16'},
    {t:'21:00',status:'up',a:'ALBO LÍMITE',b:'ESTUDIO ROJO',sa:null,sb:null,map:'Grieta del Invocador',ev:'Grieta Masters · Semifinal'},
    {t:'23:30',status:'up',a:'KRU SOLOQ',b:'ISURUS NEXT',sa:null,sb:null,map:'ARAM · Howling Abyss',ev:'Grieta Masters · Semifinal'}],
  players:[
    {name:'ZEKITO',team:'ALBO LÍMITE',rating:1.38,kd:5.2,adr:312,kast:78.4,x:742,impact:1.71,clutch:8,badges:['pro','verified','champ']},
    {name:'JUGO',team:'ESTUDIO ROJO',rating:1.31,kd:4.4,adr:298,kast:74.9,x:681,impact:1.58,clutch:6,badges:['pro','verified']},
    {name:'LUNARÍA',team:'TALON SUR',rating:1.27,kd:4.1,adr:287,kast:72.6,x:655,impact:1.52,clutch:7,badges:['creator']},
    {name:'BASTIÁN',team:'KRU SOLOQ',rating:1.23,kd:3.8,adr:275,kast:70.8,x:612,impact:1.44,clutch:5,badges:['pro']},
    {name:'NYYX',team:'PIRATAS FTC',rating:1.19,kd:3.5,adr:264,kast:69.3,x:587,impact:1.39,clutch:4,badges:[]},
    {name:'KARMA-S',team:'ISURUS NEXT',rating:1.16,kd:3.3,adr:255,kast:68.1,x:561,impact:1.33,clutch:6,badges:['pro']},
    {name:'DONKÉ',team:'VEG ANTÁRTIDA',rating:1.12,kd:3.0,adr:246,kast:66.7,x:533,impact:1.27,clutch:3,badges:[]},
    {name:'MIAUW',team:'ALBO LÍMITE',rating:1.09,kd:2.8,adr:238,kast:65.4,x:510,impact:1.22,clutch:4,badges:[]},
    {name:'REPTIL',team:'ESTUDIO ROJO',rating:1.06,kd:2.6,adr:229,kast:64.2,x:488,impact:1.17,clutch:2,badges:[]},
    {name:'AURORA',team:'TALON SUR',rating:1.03,kd:2.4,adr:221,kast:63.0,x:466,impact:1.11,clutch:3,badges:['creator']}],
  rosters:{'ALBO LÍMITE':['ZEKITO','MIAUW','TREBOR','VAYA','QUIN'],'ESTUDIO ROJO':['JUGO','REPTIL','MALVA','SOMBRA','TATU'],'TALON SUR':['LUNARÍA','AURORA','BRUMA','KAIOS','RUIDO'],'KRU SOLOQ':['BASTIÁN','NIKO','PUMA','ZERO','LOBO'],'PIRATAS FTC':['NYYX','GARRA','MAREA','TIMÓN','KRAK'],'ISURUS NEXT':['KARMA-S','DUX','ORCA','BRISA','NODO'],'VEG ANTÁRTIDA':['DONKÉ','HIELO','AUSTRAL','PINGÜ','FROST'],'PIRÁMIDE':['OMEGA','DELTA','GAMA','ALFA','BETA']},
  tournaments:[
    {id:'l1',day:'26',mon:'ABR',name:'GRIETA MASTERS · ETAPA 4',tags:['DRAFT','BO3','ONLINE'],tier:'PRO',prize:25000,slots:16,filled:13,fee:9.99},
    {id:'l2',day:'28',mon:'ABR',name:'ARAM ROYALE #31',tags:['ARAM','BO1','ABIERTO'],tier:'FREE',prize:500,slots:64,filled:58,fee:0},
    {id:'l3',day:'03',mon:'MAY',name:'COPA INVOCADOR LATAM',tags:['INVITACIÓN','BO3'],tier:'PRO',prize:10000,slots:8,filled:5,fee:14.99},
    {id:'l4',day:'05',mon:'MAY',name:'CLASH NOCTURNO #18',tags:['BO3','5V5'],tier:'FREE',prize:250,slots:32,filled:11,fee:0}],
  bracket:{quarters:[{a:'ALBO LÍMITE',b:'PIRÁMIDE',sa:2,sb:0,meta:'BO3 · COMPLETADO'},{a:'ESTUDIO ROJO',b:'KRU SOLOQ',sa:2,sb:1,meta:'BO3 · COMPLETADO'},{a:'TALON SUR',b:'VEG ANTÁRTIDA',sa:2,sb:1,meta:'BO3 · COMPLETADO'},{a:'PIRATAS FTC',b:'ISURUS NEXT',sa:1,sb:2,meta:'BO3 · COMPLETADO'}],
    semis:[{a:'ALBO LÍMITE',b:'ESTUDIO ROJO',sa:null,sb:null,meta:'HOY · 21:00'},{a:'TALON SUR',b:'ISURUS NEXT',sa:null,sb:null,meta:'HOY · 23:30'}],
    final:{a:null,b:null,meta:'DOMINGO · 20:00 · BO5'},
    lb1:[{a:'PIRÁMIDE',b:'KRU SOLOQ',sa:1,sb:2,meta:'BO3 · COMPLETADO'},{a:'VEG ANTÁRTIDA',b:'PIRATAS FTC',sa:0,sb:2,meta:'BO3 · COMPLETADO'}],
    lb2:[{a:null,b:'PIRÁMIDE',meta:'TRAS SEMIS · BO3'},{a:null,b:'VEG ANTÁRTIDA',meta:'TRAS SEMIS · BO3'}],
    lbf:{a:null,b:null,meta:'SÁBADO · 20:00 · BO3'}},
  ticker:['GRIETA MASTERS S4 · CLASIFICATORIAS ABIERTAS','ARAM ROYALE #31: 58/64 EQUIPOS','LUNARÍA (CREADORA) EN DIRECTO EN KICK','NUEVO: INSIGNIA PRO DE LEAGUE EN TU PERFIL','GANA SERIES 5V5 Y SUBÍ TU VANTS RATING LOL']
 },
 fifa27:{
  gameLabel:'FIFA 27',
  title:'COPA<br><span class="out">VANTS</span> <span class="acc">FC S4</span>',short:'COPA VANTS FC S4',
  sub:'FIFA 27 competitivo 1v1 y 2v2 en VANTS GAMES. Reglas PRO: control de partido, captura obligatoria y verificación de resultado en cada ronda.',
  extraCol:'POS %',live:{a:'EL PIBE 10',b:'LA JEA 7',ta:'P10',tb:'JA7',ev:'COPA VANTS FC · SEMIFINAL · ESTADIO ARENA VANTS',map:'Estadio Arena VANTS'},
  mapPool:['Estadio Arena VANTS','Copa VANTS Arena','Estadio Nocturno','Estadio Clásico','Césped Pro Club'],
  hows:['Gol','Golazo de falta','Penal convertido','Contragolpe','Cabezazo','Al contraataque'],
  matches:[
    {t:'21:00',status:'live',a:'EL PIBE 10',b:'LA JEA 7',sa:2,sb:1,map:'Estadio Arena VANTS',ev:'Copa VANTS FC · Semifinal · Ida'},
    {t:'16:10',status:'final',a:'LA JEA 7',b:'MAGO-D',sa:3,sb:2,map:'Estadio Nocturno',ev:'Copa VANTS FC · Cuartos'},
    {t:'15:00',status:'final',a:'TINCHO92',b:'KYLIAN-LATAM',sa:1,sb:4,map:'Estadio Clásico',ev:'Copa VANTS FC · Cuartos'},
    {t:'13:40',status:'final',a:'EL PIBE 10',b:'NEO-9',sa:2,sb:0,map:'Copa VANTS Arena',ev:'Copa VANTS FC · Ronda de 16'},
    {t:'21:00',status:'up',a:'EL PIBE 10',b:'LA JEA 7',sa:null,sb:null,map:'Estadio Arena VANTS',ev:'Copa VANTS FC · Semifinal · Vuelta'},
    {t:'23:30',status:'up',a:'MAGO-D',b:'TINCHO92',sa:null,sb:null,map:'Estadio Nocturno',ev:'Copa VANTS FC · Semifinal'}],
  players:[
    {name:'EL PIBE 10',team:'SUDAKA FC',rating:1.40,kd:2.9,adr:64,kast:81.2,x:623,impact:1.75,clutch:9,badges:['pro','verified','champ']},
    {name:'LA JEA 7',team:'CARIBE UEFA',rating:1.33,kd:2.6,adr:61,kast:78.7,x:590,impact:1.62,clutch:7,badges:['pro','verified']},
    {name:'MAGO-D',team:'MIDAS FC',rating:1.28,kd:2.4,adr:59,kast:76.3,x:561,impact:1.55,clutch:6,badges:['creator']},
    {name:'KYLIAN-LATAM',team:'SUDAKA FC',rating:1.24,kd:2.2,adr:57,kast:74.8,x:538,impact:1.48,clutch:5,badges:['pro']},
    {name:'TINCHO92',team:'PAMPA UNITED',rating:1.20,kd:2.0,adr:55,kast:72.9,x:514,impact:1.41,clutch:4,badges:[]},
    {name:'NEO-9',team:'ANDINA FC',rating:1.17,kd:1.9,adr:53,kast:71.5,x:497,impact:1.36,clutch:6,badges:['creator']},
    {name:'FEO-11',team:'CARIBE UEFA',rating:1.13,kd:1.7,adr:51,kast:70.1,x:473,impact:1.29,clutch:3,badges:[]},
    {name:'R10 BRASIL',team:'MIDAS FC',rating:1.10,kd:1.6,adr:49,kast:68.8,x:452,impact:1.23,clutch:4,badges:[]},
    {name:'GATO-1',team:'PAMPA UNITED',rating:1.07,kd:1.5,adr:47,kast:67.4,x:431,impact:1.18,clutch:2,badges:[]},
    {name:'LA TORRE',team:'ANDINA FC',rating:1.04,kd:1.4,adr:45,kast:66.0,x:410,impact:1.12,clutch:3,badges:[]}],
  rosters:{'SUDAKA FC':['EL PIBE 10','KYLIAN-LATAM','PULGA','D10S','NENE'],'CARIBE UEFA':['LA JEA 7','FEO-11','CAFÉ','RITMO','SABROSO'],'MIDAS FC':['MAGO-D','R10 BRASIL','ORO','TALCO','LUJO'],'PAMPA UNITED':['TINCHO92','GATO-1','FAJA','CEBO','RASTRO'],'ANDINA FC':['NEO-9','LA TORRE','SALTA','PUNO','CUSCO'],'MATE CLUB':['YERBA','PAVADA','TERERÉ','BOMBILLA','AGUA'],'AZTECA XI':['CH14','QUAUH','TEOCA','XOLO','AGUILA'],'TANGO-5':['BANDONÉ','MILONGA','FACUNDO','CHARLY','GALA']},
  tournaments:[
    {id:'f1',day:'26',mon:'ABR',name:'COPA VANTS FC · ETAPA 4',tags:['1V1','DOBLE ELIM.'],tier:'PRO',prize:25000,slots:32,filled:27,fee:9.99},
    {id:'f2',day:'28',mon:'ABR',name:'LADDER NOCTURNA FUT #77',tags:['1V1','BO3','NOCTURNA'],tier:'FREE',prize:500,slots:64,filled:49,fee:0},
    {id:'f3',day:'03',mon:'MAY',name:'DRAFTS LEGENDS LATAM',tags:['INVITACIÓN','BO3'],tier:'PRO',prize:10000,slots:16,filled:9,fee:14.99},
    {id:'f4',day:'05',mon:'MAY',name:'PRO CLUBS AMISTOSO #9',tags:['2V2','AMISTOSO+'],tier:'FREE',prize:250,slots:32,filled:14,fee:0}],
  bracket:{quarters:[{a:'EL PIBE 10',b:'TANGO-5',sa:3,sb:1,meta:'BO3 · COMPLETADO'},{a:'LA JEA 7',b:'MAGO-D',sa:3,sb:2,meta:'BO3 · COMPLETADO'},{a:'KYLIAN-LATAM',b:'TINCHO92',sa:4,sb:1,meta:'BO3 · COMPLETADO'},{a:'NEO-9',b:'AZTECA XI',sa:2,sb:0,meta:'BO3 · COMPLETADO'}],
    semis:[{a:'EL PIBE 10',b:'LA JEA 7',sa:null,sb:null,meta:'HOY · 21:00'},{a:'KYLIAN-LATAM',b:'NEO-9',sa:null,sb:null,meta:'HOY · 23:30'}],
    final:{a:null,b:null,meta:'DOMINGO · 20:00 · BO5'},
    lb1:[{a:'TANGO-5',b:'MAGO-D',sa:1,sb:3,meta:'BO3 · COMPLETADO'},{a:'TINCHO92',b:'AZTECA XI',sa:2,sb:0,meta:'BO3 · COMPLETADO'}],
    lb2:[{a:null,b:'TANGO-5',meta:'TRAS SEMIS · BO3'},{a:null,b:'TINCHO92',meta:'TRAS SEMIS · BO3'}],
    lbf:{a:null,b:null,meta:'SÁBADO · 20:00 · BO3'}},
  ticker:['COPA VANTS FC S4 · INSCRIPCIONES AL LÍMITE','LADDER FUT #77: 49/64 JUGADORES','MAGO-D (CREADOR) EN DIRECTO EN YOUTUBE','NUEVO: REGISTRO DE RESULTADOS CON CAPTURA','GANA SERIES 1V1 Y SUBÍ TU VANTS RATING FC']
 },
 freefire:{
  gameLabel:'FREE FIRE',
  title:'BOOYAH<br><span class="out">CIRCUIT</span> <span class="acc">S4</span>',short:'BOOYAH CIRCUIT S4',
  sub:'El circuito de Free Fire de VANTS GAMES. Escuadrones de 4, zonas de clasificación por región y la BOOYAH como única forma de ganar la serie.',
  extraCol:'BOOYAH %',live:{a:'LOS FENIX',b:'ESCUADRÓN SUR',ta:'FEN',tb:'ESU',ev:'BOOYAH CIRCUIT · SEMIFINAL · ZONA NORTE',map:'Zona Norte · Purgatorio'},
  mapPool:['Purgatorio','Bermuda','Kalahari','Alpes','NeXTerra'],
  hows:['Eliminación','Duelo de escopeta','Sniper a distancia','Zona cerrándose','Revive del compañero','Booyah moment'],
  matches:[
    {t:'21:00',status:'live',a:'LOS FENIX',b:'ESCUADRÓN SUR',sa:32,sb:27,map:'Purgatorio',ev:'Booyah Circuit · Semifinal · Zona Norte'},
    {t:'16:10',status:'final',a:'ESCUADRÓN SUR',b:'LOBO ALPHA',sa:41,sb:18,map:'Bermuda',ev:'Booyah Circuit · Cuartos'},
    {t:'15:00',status:'final',a:'CASLA SQUAD',b:'TROPA DEL 9',sa:22,sb:35,map:'Kalahari',ev:'Booyah Circuit · Cuartos'},
    {t:'13:40',status:'final',a:'LOS FENIX',b:'TEAM CHAMO',sa:29,sb:24,map:'Alpes',ev:'Booyah Circuit · Ronda de 16'},
    {t:'21:00',status:'up',a:'LOS FENIX',b:'ESCUADRÓN SUR',sa:null,sb:null,map:'Purgatorio',ev:'Booyah Circuit · Semifinal · Zona Sur'},
    {t:'23:30',status:'up',a:'LOBO ALPHA',b:'CASLA SQUAD',sa:null,sb:null,map:'NeXTerra',ev:'Booyah Circuit · Semifinal'}],
  players:[
    {name:'FERXXO-FF',team:'LOS FENIX',rating:1.39,kd:6.1,adr:402,kast:79.8,x:812,impact:1.73,clutch:9,badges:['pro','verified','champ']},
    {name:'SOFI-SNIPER',team:'ESCUADRÓN SUR',rating:1.32,kd:5.3,adr:377,kast:76.2,x:744,impact:1.60,clutch:7,badges:['pro','verified']},
    {name:'EL YOYA',team:'LOBO ALPHA',rating:1.28,kd:4.9,adr:361,kast:74.0,x:703,impact:1.53,clutch:8,badges:['creator']},
    {name:'NENA-79',team:'CASLA SQUAD',rating:1.24,kd:4.4,adr:344,kast:72.1,x:662,impact:1.45,clutch:5,badges:['creator']},
    {name:'RAT4',team:'TROPA DEL 9',rating:1.20,kd:4.0,adr:329,kast:70.6,x:628,impact:1.38,clutch:4,badges:['pro']},
    {name:'CHAMO-X',team:'TEAM CHAMO',rating:1.17,kd:3.7,adr:315,kast:69.2,x:599,impact:1.33,clutch:6,badges:[]},
    {name:'PIRATA-FF',team:'LOS FENIX',rating:1.13,kd:3.4,adr:301,kast:67.8,x:570,impact:1.27,clutch:3,badges:[]},
    {name:'MAMBA-27',team:'ESCUADRÓN SUR',rating:1.10,kd:3.1,adr:288,kast:66.5,x:544,impact:1.21,clutch:4,badges:[]},
    {name:'TATI-GLOCK',team:'LOBO ALPHA',rating:1.06,kd:2.8,adr:273,kast:65.1,x:517,impact:1.15,clutch:2,badges:[]},
    {name:'ZORRO-88',team:'CASLA SQUAD',rating:1.03,kd:2.5,adr:260,kast:63.9,x:493,impact:1.10,clutch:3,badges:[]}],
  rosters:{'LOS FENIX':['FERXXO-FF','PIRATA-FF','CUERVO','MANDY','KIRA'],'ESCUADRÓN SUR':['SOFI-SNIPER','MAMBA-27','RECON','TANGO','VIGÍA'],'LOBO ALPHA':['EL YOYA','TATI-GLOCK','COLMILLO','AULLIDO','SABUESO'],'CASLA SQUAD':['NENA-79','ZORRO-88','BOEDO','GAUCHO','BAJO'],'TROPA DEL 9':['RAT4','MILITANTE','CAÑO','CHICO','GRITO'],'TEAM CHAMO':['CHAMO-X','AREPA','CATIRE','LLANERO','RUMBA'],'NORTE UNIDO':['CACHAÇO','MALANDRO','BEMBA','TÍO','BRISA'],'SQUAD 47':['GENERAL','CABO','TIN','RECLUTA','SARGENTO']},
  tournaments:[
    {id:'ff1',day:'26',mon:'ABR',name:'BOOYAH CIRCUIT · ETAPA 4',tags:['ESCUADRA','BO3','ONLINE'],tier:'PRO',prize:25000,slots:16,filled:15,fee:9.99},
    {id:'ff2',day:'28',mon:'ABR',name:'CLASH SQUAD NOCTURNO #44',tags:['CLASH SQUAD','BO7'],tier:'FREE',prize:500,slots:64,filled:61,fee:0},
    {id:'ff3',day:'03',mon:'MAY',name:'COPA LATAM BOOYAH',tags:['INVITACIÓN','BO5'],tier:'PRO',prize:10000,slots:12,filled:8,fee:14.99},
    {id:'ff4',day:'05',mon:'MAY',name:'DUO RUSH FINDE #21',tags:['DÚO','BO3'],tier:'FREE',prize:250,slots:48,filled:26,fee:0}],
  bracket:{quarters:[{a:'LOS FENIX',b:'NORTE UNIDO',sa:3,sb:0,meta:'BO5 · COMPLETADO'},{a:'ESCUADRÓN SUR',b:'SQUAD 47',sa:3,sb:1,meta:'BO5 · COMPLETADO'},{a:'LOBO ALPHA',b:'TROPA DEL 9',sa:3,sb:2,meta:'BO5 · COMPLETADO'},{a:'CASLA SQUAD',b:'TEAM CHAMO',sa:3,sb:1,meta:'BO5 · COMPLETADO'}],
    semis:[{a:'LOS FENIX',b:'ESCUADRÓN SUR',sa:null,sb:null,meta:'HOY · 21:00'},{a:'LOBO ALPHA',b:'CASLA SQUAD',sa:null,sb:null,meta:'HOY · 23:30'}],
    final:{a:null,b:null,meta:'DOMINGO · 20:00 · BO7'},
    lb1:[{a:'NORTE UNIDO',b:'SQUAD 47',sa:2,sb:3,meta:'BO5 · COMPLETADO'},{a:'TROPA DEL 9',b:'TEAM CHAMO',sa:3,sb:0,meta:'BO5 · COMPLETADO'}],
    lb2:[{a:null,b:'NORTE UNIDO',meta:'TRAS SEMIS · BO5'},{a:null,b:'TROPA DEL 9',meta:'TRAS SEMIS · BO5'}],
    lbf:{a:null,b:null,meta:'SÁBADO · 20:00 · BO5'}},
  ticker:['BOOYAH CIRCUIT S4 · ETAPA 4 EN JUEGO','CLASH SQUAD NOCTURNO #44: 61/64','EL YOYA (CREADOR) EN DIRECTO EN TIKTOK','NUEVO: INSIGNIA PRO FREE FIRE EN TU PERFIL','LA BOOYAH VALE DOBLE RR EN VANTS RANKED FF']
 },
 rl:{
  gameLabel:'ROCKET LEAGUE',
  title:'TURBO<br><span class="out">CLASH</span> <span class="acc">S4</span>',short:'TURBO CLASH S4',
  sub:'Rocket League 3v3 en VANTS GAMES. Turbo Clash S4: overtime dorado, reglas de rotación y replay centrado para cada gol reclamado.',
  extraCol:'SAVE %',live:{a:'NITRO RACING',b:'TURBO MIX',ta:'NTR',tb:'TBM',ev:'TURBO CLASH · SEMIFINAL · NEÓN FIELDS',map:'Neón Fields'},
  mapPool:['Neón Fields','Champions Field','DFH Stadium','Mannfield Nocturno','Aquadome'],
  hows:['Gol aéreo','Tiro esquinado','Remate de media vuelta','Kickoff ganado','Atajada clave','Gol en overtime'],
  matches:[
    {t:'21:00',status:'live',a:'NITRO RACING',b:'TURBO MIX',sa:4,sb:3,map:'Neón Fields',ev:'Turbo Clash · Semifinal · Ida'},
    {t:'16:10',status:'final',a:'TURBO MIX',b:'OLIMPO FC',sa:5,sb:2,map:'Champions Field',ev:'Turbo Clash · Cuartos'},
    {t:'15:00',status:'final',a:'PIXEL DRIFT',b:'NITRO RACING',sa:1,sb:3,map:'DFH Stadium',ev:'Turbo Clash · Cuartos'},
    {t:'13:40',status:'final',a:'GATO BOOST',b:'OLIMPO FC',sa:2,sb:6,map:'Mannfield Nocturno',ev:'Turbo Clash · Ronda de 16'},
    {t:'21:00',status:'up',a:'NITRO RACING',b:'TURBO MIX',sa:null,sb:null,map:'Neón Fields',ev:'Turbo Clash · Semifinal · Vuelta'},
    {t:'23:30',status:'up',a:'PIXEL DRIFT',b:'GATO BOOST',sa:null,sb:null,map:'Aquadome',ev:'Turbo Clash · Semifinal'}],
  players:[
    {name:'TURBO-KID',team:'NITRO RACING',rating:1.36,kd:3.9,adr:488,kast:77.3,x:698,impact:1.68,clutch:8,badges:['pro','verified','champ']},
    {name:'FLIP-RESET',team:'TURBO MIX',rating:1.30,kd:3.4,adr:461,kast:74.8,x:655,impact:1.57,clutch:6,badges:['pro','verified']},
    {name:'AÉREA',team:'OLIMPO FC',rating:1.26,kd:3.1,adr:447,kast:73.2,x:622,impact:1.50,clutch:7,badges:['creator']},
    {name:'BOOSTER',team:'PIXEL DRIFT',rating:1.22,kd:2.8,adr:430,kast:71.7,x:590,impact:1.43,clutch:5,badges:['pro']},
    {name:'NEO-WAVE',team:'GATO BOOST',rating:1.18,kd:2.5,adr:414,kast:70.3,x:561,impact:1.36,clutch:4,badges:[]},
    {name:'MURCIÉLAGO',team:'NITRO RACING',rating:1.15,kd:2.3,adr:402,kast:69.0,x:538,impact:1.31,clutch:5,badges:['creator']},
    {name:'DEMO-KING',team:'TURBO MIX',rating:1.11,kd:2.1,adr:388,kast:67.6,x:512,impact:1.25,clutch:3,badges:[]},
    {name:'CHIQUITA',team:'OLIMPO FC',rating:1.08,kd:1.9,adr:374,kast:66.3,x:488,impact:1.19,clutch:4,badges:[]},
    {name:'RAIL-GUN',team:'PIXEL DRIFT',rating:1.05,kd:1.7,adr:361,kast:65.0,x:466,impact:1.14,clutch:2,badges:[]},
    {name:'OKTO',team:'GATO BOOST',rating:1.02,kd:1.5,adr:349,kast:63.8,x:444,impact:1.08,clutch:3,badges:[]}],
  rosters:{'NITRO RACING':['TURBO-KID','MURCIÉLAGO','PISTÓN','RODADO','NAFTA'],'TURBO MIX':['FLIP-RESET','DEMO-KING','MEZCLA','TURBINA','NITRO'],'OLIMPO FC':['AÉREA','CHIQUITA','ZEUS','ATENEA','TITÁN'],'PIXEL DRIFT':['BOOSTER','RAIL-GUN','PÍXEL','DERIVA','ARCADE'],'GATO BOOST':['NEO-WAVE','OKTO','BIGOTE','GARRA','PATITA'],'RUEDA SUELTA':['LLANTA','EJE','FRENO','CHASIS','ÓLEO'],'OCTANE CLUB':['SIETE','DOMINUS','FENNEC','MERLIN','DÉBIL'],'AERO LATAM':['CÓNDOR','ANDINO','VÉRTIGO','TORNADO','CIELO']},
  tournaments:[
    {id:'r1',day:'26',mon:'ABR',name:'TURBO CLASH · ETAPA 4',tags:['3V3','BO5','ONLINE'],tier:'PRO',prize:25000,slots:16,filled:12,fee:9.99},
    {id:'r2',day:'28',mon:'ABR',name:'OT DOBLE ELIM #33',tags:['DOBLE ELIM.','BO3'],tier:'FREE',prize:500,slots:48,filled:31,fee:0},
    {id:'r3',day:'03',mon:'MAY',name:'COPA AÉREA LATAM',tags:['INVITACIÓN','BO5'],tier:'PRO',prize:10000,slots:8,filled:6,fee:14.99},
    {id:'r4',day:'05',mon:'MAY',name:'2V2 WINGMAN BOOST #12',tags:['2V2','BO3'],tier:'FREE',prize:250,slots:32,filled:19,fee:0}],
  bracket:{quarters:[{a:'NITRO RACING',b:'OCTANE CLUB',sa:3,sb:1,meta:'BO5 · COMPLETADO'},{a:'TURBO MIX',b:'RUEDA SUELTA',sa:3,sb:0,meta:'BO5 · COMPLETADO'},{a:'OLIMPO FC',b:'GATO BOOST',sa:3,sb:2,meta:'BO5 · COMPLETADO'},{a:'PIXEL DRIFT',b:'AERO LATAM',sa:3,sb:1,meta:'BO5 · COMPLETADO'}],
    semis:[{a:'NITRO RACING',b:'TURBO MIX',sa:null,sb:null,meta:'HOY · 21:00'},{a:'OLIMPO FC',b:'PIXEL DRIFT',sa:null,sb:null,meta:'HOY · 23:30'}],
    final:{a:null,b:null,meta:'DOMINGO · 20:00 · BO7'},
    lb1:[{a:'OCTANE CLUB',b:'RUEDA SUELTA',sa:3,sb:1,meta:'BO5 · COMPLETADO'},{a:'GATO BOOST',b:'AERO LATAM',sa:2,sb:3,meta:'BO5 · COMPLETADO'}],
    lb2:[{a:null,b:'OCTANE CLUB',meta:'TRAS SEMIS · BO5'},{a:null,b:'AERO LATAM',meta:'TRAS SEMIS · BO5'}],
    lbf:{a:null,b:null,meta:'SÁBADO · 20:00 · BO5'}},
  ticker:['TURBO CLASH S4 · SEMIFINALES HOY','OT DOBLE ELIM #33: 31/48 EQUIPOS','AÉREA (CREADORA) EN DIRECTO EN TWITCH','NUEVO: INSIGNIA PRO ROCKET LEAGUE','GANÁ EL OT Y LLEVÁTE RR DOBLE EN VANTS RANKED RL']
 }
};

/* ================= JUGADOR LOCAL (chip de la cuenta) =================
   El perfil visible ya no es local ni demo: cada jugador se crea a sí mismo
   al iniciar sesión (arena-live.js · CUENTA REAL VANTS) y se guarda en Neon.
   Este objeto solo alimenta el chip de la barra superior. */
const me={name:'RETADOR',country:'AR 🇦🇷',rank:'acero',sub:'II',rr:148,peak:'ACERO II',lvl:23,badges:[],socials:{},game:{},live:false,bio:'Nuevo en el circuito VANTS. Conectá tus cuentas, ganá series y subí de rango.'};
function addBadge(b){if(!me.badges.includes(b))me.badges.push(b);}

/* ================= TICKER ================= */
function renderTicker(){
  const items=D().ticker.map(t=>'<span>'+t+'</span>').join('');
  $('#tickerTrack').innerHTML=items+items;
}

/* ================= PARTIDO EN VIVO =================
   Sin simulación: si el juego no tiene datos reales, el panel muestra
   el estado idle (renderLiveIdle). La agenda de VALORANT usa partidos
   reales verificados de vlr.gg y, si hay secret HENRIKDEV_API_KEY en el
   Worker, se refresca en vivo vía /api/valorant/esports. */

function renderLive(){
  renderLiveIdle();
}
function renderLiveIdle(){
  const L=D().live;
  const bd=$('#liveBadge');if(bd)bd.innerHTML='<i class="dot"></i>PRÓXIMO PARTIDO';
  const lb=$('#liveSpecLbl');if(lb)lb.textContent=L.horaLbl||'INICIO';
  $('#liveSpec').textContent=L.hora||'--:--';
  $('#liveEvent').textContent=L.ev;
  $('#liveScore').innerHTML='<i>VS</i>';
  $('#pipsA').innerHTML='';$('#pipsB').innerHTML='';
  $('#liveFeed').innerHTML='<div class="lf fa"><b>'+L.a+' vs '+L.b+'</b> · '+L.ev+'</div>'
    +'<div class="lf fb">RESULTADOS REALES · SIN SIMULACIÓN · COBERTURA Y ROUND A ROUND EN VLR.GG</div>';
}

/* ================= PARTIDOS ================= */
function renderMatches(){
  const nota=$('#agendaNote');
  if(nota)nota.innerHTML=D().matches.some(m=>m.real)
    ?'Resultados y horarios <b>REALES</b> de vlr.gg · hora de Caracas (VET). Clic en un partido para el detalle y el enlace a la fuente oficial.'
    :'Cobertura real de partidos aún no disponible para este juego. La agenda de <b>VALORANT</b> se alimenta de vlr.gg.';
  const list=D().matches;
  $('#matchList').innerHTML=list.length?list.map((m,i)=>{
    const chip=m.status==='live'?'<span class="chip live"><i class="dot"></i>LIVE</span>':m.status==='final'?'<span class="chip fin">FINAL</span>':'<span class="chip up">'+m.t+'</span>';
    const sa=m.status==='live'?null:m.sa,sb=m.status==='live'?null:m.sb;
    return '<div class="mrow" data-idx="'+i+'">'
      +'<div class="m-time"><b class="mono">'+(m.status==='live'?'AHORA':m.t)+'</b>'+chip+'</div>'
      +'<div class="m-team" style="justify-content:flex-end"><span>'+m.a+'</span></div>'
      +'<div class="m-score mono">'+(m.status==='up'?'<i>vs</i>':(sa>sb?'<b>'+sa+'</b><i>:</i>'+sb:sa+'<i>:</i><b>'+sb+'</b>'))+'</div>'
      +'<div class="m-team"><span>'+m.b+'</span></div>'
      +'<div class="m-map"><b>'+m.map.toUpperCase()+'</b>'+(m.bo||'BO3')+'</div>'
      +'<div class="m-ev">'+m.ev.toUpperCase()+'</div>'
      +'<span class="m-go"><i data-lucide="chevron-right"></i></span></div>';
  }).join(''):'<div style="grid-column:1/-1;border:1px dashed var(--line);border-radius:12px;padding:34px 20px;text-align:center;font:600 11px/1.8 var(--mono);letter-spacing:.12em;color:var(--dim)">SIN PARTIDOS CARGADOS PARA ESTE JUEGO · COBERTURA PRO REAL EN LA AGENDA DE VALORANT (VLR.GG)</div>';icons();
}
 $('#matchList').addEventListener('click',e=>{const r=e.target.closest('.mrow');if(r)openMatchDetail(D().matches[+r.dataset.idx]);});

function openMatchDetail(m){
  /* Partidos REALES (vlr.gg): sin round a round simulado ni stats inventadas */
  if(m.real){
    const isUp=m.status==='up';
    openDrawer('<div class="d-head"><span class="kicker">'+(isUp?'PRÓXIMO · PARTIDO REAL':'RESULTADO REAL')+'</span><button class="d-x" onclick="closeDrawer()"><i data-lucide="x"></i></button></div>'
      +'<div class="d-body"><p class="mono" style="font-size:10px;letter-spacing:.12em;color:var(--dim);margin-bottom:18px">'+m.ev.toUpperCase()+'</p>'
      +'<div class="d-score"><div class="d-team">'+m.a+'</div><div class="d-num">'+(isUp?'<i>VS</i>':m.sa+'<i>:</i>'+m.sb)+'</div><div class="d-team r">'+m.b+'</div></div>'
      +'<p class="d-map">'+(isUp?('COMIENZA: '+m.t+' (HORA CARACAS) · '+m.bo):('SERIE '+m.bo+' · FINALIZADA'))+'</p>'
      +'<p class="d-sec">FUENTE OFICIAL · DATOS REALES</p>'
      +(m.url?'<a class="btn btn-ghost btn-sm" style="margin-top:8px;width:100%;justify-content:center" href="'+m.url+'" target="_blank" rel="noopener">VER PARTIDO COMPLETO EN VLR.GG <i data-lucide="external-link"></i></a>':'')
      +'<p class="d-empty">Sincronizado con vlr.gg. VANTS no simula resultados del circuito profesional: mapas, round a round y estadísticas detalladas viven en la fuente oficial.</p>'
      +'</div>');
    return;
  }
  /* Partidos del circuito VANTS (no pro): sin round a round ni stats
     inventadas. El detalle muestra el marcador real cuando existe. */
  const isUp=m.status==='up'||m.status==='live';
  const sa=m.status==='final'?m.sa:null,sb=m.status==='final'?m.sb:null;
  openDrawer('<div class="d-head"><span class="kicker">'+(isUp?'PREVIA':'DETALLE')+'</span><button class="d-x" onclick="closeDrawer()"><i data-lucide="x"></i></button></div>'
    +'<div class="d-body"><p class="mono" style="font-size:10px;letter-spacing:.12em;color:var(--dim);margin-bottom:18px">'+m.ev.toUpperCase()+'</p>'
    +'<div class="d-score"><div class="d-team">'+m.a+'</div><div class="d-num">'+(isUp?'<i>vs</i>':sa+'<i>:</i>'+sb)+'</div><div class="d-team r">'+m.b+'</div></div>'
    +'<p class="d-map">'+(isUp?('SERIE PROGRAMADA · '+(m.map||'POR DEFINIR').toUpperCase()):('SERIE '+(m.bo||'BO3')+' · FINALIZADA'))+'</p>'
    +'<p class="d-sec">DATOS DEL CIRCUITO VANTS</p>'
    +'<p class="d-empty">VANTS no inventa round a round ni estadísticas: el detalle completo de cada serie del circuito se publica con el resultado confirmado por ambos capitanes.</p>'
    +'</div>');
}
 $('#liveMore').addEventListener('click',()=>{const L=D().live;
  openMatchDetail({real:true,status:'up',a:L.a,b:L.b,map:L.map,bo:L.bo||'BO5',ev:L.ev,url:L.url,t:L.hora});});

/* ================= RANKING ================= */
const COLS=[
  {key:'pos',label:'#',num:true},{key:'name',label:'JUGADOR'},
  {key:'rank',label:'RANGO'},{key:'team',label:'EQUIPO'},
  {key:'rating',label:'RATING',num:true},{key:'kd',label:'K/D',num:true},
  {key:'adr',label:'ADR',num:true},{key:'kast',label:'KAST %',num:true},
  {key:'x',label:'ACS',num:true,dynamic:true},
  {key:'impact',label:'IMPACTO',num:true,pro:true},{key:'clutch',label:'CLUTCH',num:true,pro:true}];
function renderLbHead(){
  const reales=usandoJugadoresReales();
  const cols=reales?REAL_COLS:COLS;
  const eff=reales&&!cols.some(c=>c.key===state.sort.key)?'mmr':state.sort.key;
  $('#lbHead').innerHTML='<tr>'+cols.map(c=>{
    const label=(c.dynamic?D().extraCol:c.label)+(c.pro?' <span class="lock"><i data-lucide="lock"></i>PRO</span>':'');
    const on=eff===c.key,arrow=on?(state.sort.dir===-1?'▾':'▴'):'';
    if(['pos','name','rank','team'].includes(c.key))return '<th><button disabled style="cursor:default;opacity:.8">'+label+'</button></th>';
    return '<th'+(c.num?' class="num"':'')+'><button data-key="'+c.key+'" class="'+(on?'on':'')+'">'+label+arrow+'</button></th>';}).join('')+'</tr>';
  icons();
}
/* columnas del ranking REAL (perfiles nacidos de un inicio de sesión) */
const REAL_COLS=[
  {key:'pos',label:'#'},{key:'name',label:'JUGADOR'},
  {key:'rank',label:'RANGO'},{key:'team',label:'PAÍS · REGIÓN'},
  {key:'rating',label:'RATING',num:true},{key:'mmr',label:'RR',num:true},
  {key:'games',label:'PARTIDOS',num:true},{key:'wins',label:'V',num:true},
  {key:'losses',label:'D',num:true},{key:'wr',label:'WINRATE',num:true},
  {key:'kd',label:'K/D',num:true}];
const usandoJugadoresReales=()=>(window.VANTS_PLAYERS||[]).some(p=>p&&p.id);
function filasRealesLb(q){
  return (window.VANTS_PLAYERS||[]).map(p=>{
    const st=(window.VANTS_STATS||{})[p.id]||{};
    const raw=(typeof p.rating==='number'&&p.rating>0)?p.rating:((st.rank!=null&&st.rank!==''&&!isNaN(parseFloat(st.rank))&&parseFloat(st.rank)>=.5&&parseFloat(st.rank)<=2)?parseFloat(st.rank):null);
    const wins=st.wins||0,losses=st.losses||0,games=wins+losses;
    return {real:true,id:p.id,name:(p.display_name||p.username||'JUGADOR').toUpperCase(),username:p.username||'',
      team:((p.country||'')+(p.region?' · '+p.region:''))||'—',
      rating:raw||0,rank:raw||0,mmr:(st.mmr!=null)?st.mmr:0,games,wins,losses,
      wr:games?Math.round(wins/games*100):0,kd:(st.kd!=null)?st.kd:0,
      badges:badgesDeRol(p)};
  }).filter(p=>!q||p.name.toLowerCase().includes(q)||(p.username||'').toLowerCase().includes(q)||(p.team||'').toLowerCase().includes(q));
}
function renderLbBody(){
  const q=state.search.toLowerCase();
  if(usandoJugadoresReales()){
    let rows=filasRealesLb(q);
    const k=REAL_COLS.some(c=>c.key===state.sort.key)?state.sort.key:'mmr';
    const dir=state.sort.dir;
    rows=[...rows].sort((a,b)=>(a[k]>b[k]?1:a[k]<b[k]?-1:0)*dir);
    $('#lbBody').innerHTML=rows.length?rows.map((p,i)=>{
      const idx=i+1;
      return '<tr'+(idx===1&&!q?' class="top"':'')+'>'
        +'<td class="p-pos mono">'+String(idx).padStart(2,'0')+'</td>'
        +'<td class="p-name">'+escHtml(p.name)+(p.badges&&p.badges.length?badgeDots(p.badges):'')+'<small>@'+escHtml(p.username||'—')+'</small></td>'
        +'<td class="rank-cell">'+(p.rating>0?rankCell(p.rating):'<span class="mono" style="font:600 9px/1 var(--mono);color:var(--dim)">SIN RANGO</span>')+'</td>'
        +'<td class="mono" style="color:var(--muted)">'+escHtml(p.team)+'</td>'
        +'<td class="num mono hl">'+(p.rating>0?p.rating.toFixed(2):'—')+'</td>'
        +'<td class="num mono">'+(p.mmr||p.mmr===0?p.mmr:'—')+'</td>'
        +'<td class="num mono">'+p.games+'</td>'
        +'<td class="num mono">'+p.wins+'</td>'
        +'<td class="num mono">'+p.losses+'</td>'
        +'<td class="num mono">'+(p.games?p.wr+'%':'—')+'</td>'
        +'<td class="num mono">'+(p.games?(p.kd?p.kd.toFixed(2):'—'):'—')+'</td></tr>';
    }).join(''):'<tr><td colspan="11" style="text-align:center;color:var(--dim);padding:34px">Todavía no hay jugadores rankeados: reportá tu primera serie desde tu perfil</td></tr>';
    icons();return;
  }
  let rows=D().players.filter(p=>!q||p.name.toLowerCase().includes(q)||p.team.toLowerCase().includes(q));
  const k=state.sort.key,dir=state.sort.dir;
  rows=[...rows].sort((a,b)=>(a[k]>b[k]?1:a[k]<b[k]?-1:0)*dir);
  $('#lbBody').innerHTML=rows.length?rows.map(p=>{
    const idx=D().players.indexOf(p)+1;
    return '<tr'+(idx===1&&!q?' class="top"':'')+'>'
      +'<td class="p-pos mono">'+String(idx).padStart(2,'0')+'</td>'
      +'<td class="p-name">'+p.name+badgeDots(p.badges)+'<small>'+p.team.toUpperCase()+'</small></td>'
      +'<td class="rank-cell">'+rankCell(p.rating)+'</td>'
      +'<td class="mono" style="color:var(--muted)">'+p.team.toUpperCase()+'</td>'
      +'<td class="num mono hl">'+p.rating.toFixed(2)+'</td>'
      +'<td class="num mono">'+p.kd.toFixed(2)+'</td>'
      +'<td class="num mono">'+p.adr.toFixed(1)+'</td>'
      +'<td class="num mono">'+p.kast.toFixed(1)+'</td>'
      +'<td class="num mono">'+p.x+'</td>'
      +'<td class="num mono"><span class="pro-val">'+p.impact.toFixed(2)+'</span></td>'
      +'<td class="num mono"><span class="pro-val">'+p.clutch+'</span></td></tr>';
  }).join(''):'<tr><td colspan="11" style="text-align:center;color:var(--dim);padding:34px">'+(state.search?('Sin resultados para "'+state.search+'"'):'Todavía no hay jugadores rankeados: creá tu perfil y reportá tu primera serie')+'</td></tr>';
  icons();
}
 $('#lbHead').addEventListener('click',e=>{
  const b=e.target.closest('button[data-key]');if(!b)return;
  const key=b.dataset.key;
  if((key==='impact'||key==='clutch')&&!state.isPro){toast('Columnas exclusivas de miembros PRO','info');return;}
  if(state.sort.key===key)state.sort.dir*=-1;else{state.sort.key=key;state.sort.dir=-1;}
  renderLbHead();renderLbBody();
});
 $('#lbSearch').addEventListener('input',e=>{state.search=e.target.value;renderLbBody();});

/* ================= BRACKET ================= */
function bMatch(m,r,i){
  if(!m.a&&!m.b)return '<div class="b-match" style="cursor:default"><div class="b-tbd">POR DEFINIR</div><div class="b-meta">'+m.meta+'</div></div>';
  const head='<div class="b-match" data-r="'+r+'" data-i="'+i+'">';
  if(!m.a||!m.b){const t=m.a||m.b;return head+'<div class="b-tbd">'+(m.a?t:'POR DEFINIR')+'</div><div class="b-tbd">'+(m.b?t:'POR DEFINIR')+'</div><div class="b-meta">'+m.meta+'</div></div>';}
  const hasScore=m.sa!=null;
  const row=(n,sc,w,l,s)=>'<div class="b-team'+(w?' win':'')+(l?' lose':'')+'"><span class="bt-name"><span class="bt-seed">#'+s+'</span>'+n+'</span><span class="bt-score">'+(hasScore?sc:'—')+'</span></div>';
  return head
    +row(m.a,m.sa,hasScore&&m.sa>m.sb,hasScore&&m.sa<m.sb,1)
    +row(m.b,m.sb,hasScore&&m.sb>m.sa,hasScore&&m.sb<m.sa,2)
    +'<div class="b-meta">'+m.meta+'</div></div>';
}
function renderBracket(){
  const b=D().bracket;
  const up='<div class="round"><p class="r-title">CUARTOS DE FINAL</p>'+b.quarters.map((m,i)=>bMatch(m,'q',i)).join('')+'</div>'
    +'<div class="round"><p class="r-title">SEMIFINALES</p>'+b.semis.map((m,i)=>bMatch(m,'s',i)).join('')+'</div>'
    +'<div class="round"><p class="r-title">GRAN FINAL</p>'+bMatch(b.final,'f',0)+'</div>';
  const lo='<div class="round"><p class="r-title">INFERIORES · RONDA 1</p>'+b.lb1.map((m,i)=>bMatch(m,'l1',i)).join('')+'</div>'
    +'<div class="round"><p class="r-title">INFERIORES · RONDA 2</p>'+b.lb2.map((m,i)=>bMatch(m,'l2',i)).join('')+'</div>'
    +'<div class="round"><p class="r-title">FINAL INFERIOR</p>'+bMatch(b.lbf,'lf',0)+'</div>';
  $('#bracketGrid').innerHTML='<div class="bracket-rounds">'+up+'</div>'
    +'<p class="brk-sep">LLAVES INFERIORES · el perdedor cruza aqui y pelea la revancha</p>'
    +'<div class="bracket-rounds">'+lo+'</div>';
}
 $('#bracketGrid').addEventListener('click',e=>{
  const el=e.target.closest('.b-match[data-r]');if(!el)return;
  const b=D().bracket,r=el.dataset.r,i=+el.dataset.i;
  const m=r==='q'?b.quarters[i]:r==='s'?b.semis[i]:r==='l1'?b.lb1[i]:r==='l2'?b.lb2[i]:r==='lf'?b.lbf:b.final;
  if(!m)return;
  const rName={q:'Cuartos de final',s:'Semifinal',f:'Gran final',l1:'Llaves inferiores · R1',l2:'Llaves inferiores · R2',lf:'Final de llaves inferiores'}[r]||'Bracket';
  openMatchDetail({status:m.sa!=null?'final':'up',a:m.a,b:m.b,sa:m.sa,sb:m.sb,map:D().mapPool[i%D().mapPool.length],ev:D().short+' · '+rName});
});

/* ================= TORNEOS ================= */
function renderTournaments(){
  $('#tournList').innerHTML=D().tournaments.map(t=>{
    const done=state.entered[t.id],full=t.slots!=null&&t.filled>=t.slots;
    const prizeTxt=(t.prize==null)?'POR ANUNCIAR':money(t.prize);
    return '<div class="trow'+(done?' done':'')+'">'
      +'<div class="t-date"><b>'+t.day+'</b><span>'+t.mon+'</span></div>'
      +'<div class="t-info"><h3>'+t.name+'</h3><div class="t-tags"><span class="tag'+(t.tier==='PRO'?' prem':'')+'">'+t.tier+'</span>'+t.tags.map(x=>'<span class="tag">'+x+'</span>').join('')+'</div></div>'
      +'<div class="t-prize"><b>'+prizeTxt+'</b><span>POZO DE PREMIOS</span></div>'
      +(t.slots!=null
        ?'<div class="t-slots"><div class="sl-bar"><i style="width:'+(t.filled/t.slots*100)+'%"></i></div><div class="sl-txt"><span>CUPOS</span><span>'+t.filled+' / '+t.slots+'</span></div></div>'
        :'<div class="t-slots"><div class="sl-txt" style="align-items:center"><span>CUPOS</span><span>ABIERTOS</span></div></div>')
      +'<div class="t-fee '+(t.fee?'paid':'free')+'">'+(t.fee?money(t.fee):'GRATIS')+'<small>'+(t.fee?'POR EQUIPO':'ENTRADA LIBRE')+'</small></div>'
      +'<div class="t-act"><button class="btn '+(t.tier==='PRO'?'btn-cut':'btn-ghost')+' btn-sm btn-join" data-tid="'+t.id+'"'+(full?' disabled':'')+'>'
      +(full?'COMPLETO':(t.tier==='PRO'?'INSCRIBIR · '+money(t.fee):'INSCRIBIRME'))+'</button>'
      +'<span class="t-entered"><i data-lucide="badge-check"></i>INSCRITO</span></div></div>';
  }).join('');icons();
}
 $('#tournList').addEventListener('click',e=>{
  const b=e.target.closest('.btn-join');if(!b||b.disabled)return;
  openEnroll(D().tournaments.find(x=>x.id===b.dataset.tid));
});
 $('#heroJoin').addEventListener('click',()=>openEnroll(D().tournaments[0]));
function openEnroll(t){
  const fee=t.fee||0;
  openModal('<div class="mc-head"><h3>Inscripción · '+t.name+'</h3><button class="d-x" id="mClose"><i data-lucide="x"></i></button></div><div class="mc-body">'
    +'<div class="field-row"><div class="field"><label>NOMBRE DEL EQUIPO</label><input id="fTeam" type="text" placeholder="Ej: BANDA DEL MEDIO" maxlength="26"></div>'
    +'<div class="field"><label>TAG (2–4)</label><input id="fTag" type="text" placeholder="BDM" maxlength="4"></div></div>'
    +'<div class="field"><label>CAPITÁN (nick#000)</label><input id="fCap" type="text" placeholder="'+me.name.toLowerCase()+'#VNTS"></div>'
    +'<div class="field"><label>REGIÓN / SERVIDOR</label><select id="fReg"><option>BSAS · 12 ms</option><option>SÃO PAULO · 18 ms</option><option>SANTIAGO · 26 ms</option><option>MIAMI · 48 ms</option></select></div>'
    +'<div class="fee-line"><span>'+(fee?'FEE DE INSCRIPCIÓN':'ENTRADA')+'</span><b>'+(fee?money(fee):'GRATIS')+'</b></div>'
    +'<label class="check"><input type="checkbox" id="fTerms"><span>Acepto el reglamento S4, el protocolo anti-cheat y confirmo que los 5 jugadores tienen la cuenta en regla.</span></label>'
    +'<button class="btn btn-cut" id="fSubmit">'+(fee?'CONTINUAR AL PAGO · '+money(fee):'CONFIRMAR INSCRIPCIÓN')+'</button></div>');
  $('#mClose').onclick=closeModal;
  $('#fSubmit').onclick=()=>{
    const team=$('#fTeam').value.trim(),tag=$('#fTag').value.trim().toUpperCase(),cap=$('#fCap').value.trim();
    if(!team||!tag||!cap){toast('Completá equipo, tag y capitán','info');return;}
    if(!$('#fTerms').checked){toast('Tenés que aceptar el reglamento','info');return;}
    if(fee&&!vantsEsOwner())openPayStep(t,team,tag);else finishEnroll(t,team,tag);
  };
}
function openPayStep(t,team,tag){
  if(vantsEsOwner()){finishEnroll(t,team,tag);toast('Privilegio OWNER: inscripción gratuita');return;}
  openModal('<div class="mc-head"><h3>Confirmar pago</h3><button class="d-x" id="mClose"><i data-lucide="x"></i></button></div><div class="mc-body">'
    +'<div class="mc-sum"><span>'+t.name+'</span><span>'+(D().gameLabel||(state.game==='valorant'?'VALORANT':'CS2'))+'</span></div>'
    +'<div class="mc-sum"><span>Equipo</span><span>'+team+' ['+tag+']</span></div>'
    +'<div class="mc-sum"><span>Fee de inscripción</span><span>'+money(t.fee)+'</span></div>'
    +'<div class="mc-sum"><span>Reembolso hasta 48 h antes</span><span style="color:var(--accent)">INCLUIDO</span></div>'
    +'<div class="mc-total"><span>TOTAL HOY</span><b>'+money(t.fee)+'</b></div>'
    +'<button class="btn btn-cut" id="payBtn"><i data-lucide="credit-card"></i>PAGAR '+money(t.fee)+'</button>'
    +'<p class="mono" style="margin-top:14px;font:500 10px/1.7 var(--mono);color:var(--dim);text-align:center">'+notaPago()+'</p></div>');
  $('#mClose').onclick=closeModal;
  $('#payBtn').onclick=e=>pagarO(e.currentTarget,{plan:'fee',fee_cents:Math.round(t.fee*100),name:t.name},()=>finishEnroll(t,team,tag));
}
function finishEnroll(t,team,tag){
  state.entered[t.id]=true;
  const tt=D().tournaments.find(x=>x.id===t.id);if(tt)tt.filled=Math.min(tt.slots,tt.filled+1);
  openModal('<div class="success"><div class="ok">'+SVG_CHECK+'</div><h4>Tu equipo está dentro</h4><p>'+team+' ['+tag+'] · '+t.name+'<br>Fixture 24 h antes del inicio.<br>¡Nos vemos en el servidor!</p></div>');
  renderTournaments();toast('Inscripción confirmada: '+team+' ['+tag+']');
  vantsDiscord('torneo_inscripcion',{team,tag,tournament:t.name});
}

/* [ELIMINADO] Pase competitivo y pase premium: fuera del sitio por
   decisión del dueño (la sección #pase se removió de index.html). */

/* ================= MEMBRESÍAS ================= */
 $$('#planToggle button').forEach(b=>b.addEventListener('click',()=>{
  state.period=b.dataset.period;
  $$('#planToggle button').forEach(x=>x.classList.toggle('on',x===b));
  $$('[data-mo]').forEach(el=>el.textContent=el.dataset[state.period==='mo'?'mo':'yr']);
  $$('[data-per]').forEach(el=>el.textContent=state.period==='mo'?'/ MES':'/ AÑO');
  $$('[data-was]').forEach(el=>el.innerHTML=state.period==='yr'?'$59.88/año — ahorrás 33%':'&nbsp;');
}));
 $$('.plan-card [data-plan]').forEach(b=>b.addEventListener('click',()=>{
  const p=b.dataset.plan;
  if(p==='free'){toast('El plan FREE ya está activo en tu cuenta','info');return;}
  openPlanCheckout(p);
}));
 $('#plansBtn').addEventListener('click',()=>document.getElementById('pro').scrollIntoView({behavior:'smooth'}));
 $('#tableProBtn').addEventListener('click',()=>state.isPro?null:document.getElementById('pro').scrollIntoView({behavior:'smooth'}));
 $('#partnerBtn').addEventListener('click',e=>{
  const b=e.currentTarget;
  if(!b.dataset.real){
    /* paso 1: pedir email/canal y registrar la solicitud */
    openModal('<div class="mc-head"><h3>Programa de socios</h3><button class="d-x" id="mClose"><i data-lucide="x"></i></button></div><div class="mc-body">'
      +'<p style="font:500 12px/1.7 var(--mono);color:var(--muted);margin-bottom:14px">Dejanos tu email y tu canal: la organización evalúa la solicitud y responde por correo a <b style="color:var(--accent)">geimerjhoan099@hotmail.com</b> (dirección oficial de la organización).</p>'
      +'<div class="field"><label>EMAIL DE CONTACTO</label><input id="pEmail" type="email" placeholder="vos@ejemplo.com"></div>'
      +'<div class="field"><label>CANAL PRINCIPAL (URL)</label><input id="pChan" type="url" placeholder="https://twitch.tv/tucanal"></div>'
      +'<button class="btn btn-cut" id="pSend" style="width:100%;justify-content:center"><i data-lucide="send"></i>ENVIAR SOLICITUD</button></div>');
    $('#mClose').onclick=closeModal;
    $('#pSend').onclick=()=>{
      const em=$('#pEmail').value.trim(),ch=$('#pChan').value.trim();
      if(!em||!em.includes('@')){toast('Ingresá un email válido','info');return;}
      b.dataset.real='1';b.disabled=true;b.innerHTML='<span class="spin"></span>ABRIENDO CORREO…';
      const asunto=encodeURIComponent('Solicitud programa de socios VANTS'),cuerpo=encodeURIComponent('Hola, quiero postularme al programa de socios de VANTS GAMES.\n\nEmail: '+em+'\nCanal: '+(ch||'(sin URL)')+'\n\nEnviado desde vants.games');
      setTimeout(()=>{window.location.href='mailto:geimerjhoan099@hotmail.com?subject='+asunto+'&body='+cuerpo;b.innerHTML=SVG_CHECK+'SOLICITUD ENVIADA';toast('Solicitud registrada: te contactamos a '+em,'info');},600);
    };
    return;
  }
});
function openPlanCheckout(plan){
  if(vantsEsOwner()){activatePlan(plan);return;}
  const cfg=plan==='pro'
    ?{n:'VANTS PRO',mo:4.99,yr:39.99}
    :{n:'VANTS CREATOR',mo:9.99,yr:79.99};
  const amount=state.period==='mo'?cfg.mo:cfg.yr;
  openModal('<div class="mc-head"><h3>'+cfg.n+'</h3><button class="d-x" id="mClose"><i data-lucide="x"></i></button></div><div class="mc-body">'
    +'<div class="mc-sum"><span>Membresía '+cfg.n+'</span><span>'+(state.period==='mo'?'MENSUAL':'ANUAL')+'</span></div>'
    +'<div class="mc-sum"><span>Insignia verificable en tu perfil</span><span style="color:var(--accent)">INCLUIDA</span></div>'
    +'<div class="mc-sum"><span>Cancelación</span><span>CUANDO QUIERAS</span></div>'
    +'<div class="mc-total"><span>TOTAL HOY</span><b>'+money(amount)+'</b></div>'
    +'<button class="btn btn-cut" id="payBtn"><i data-lucide="credit-card"></i>SUSCRIBIRME · '+money(amount)+'</button>'
    +'<p class="mono" style="margin-top:14px;font:500 10px/1.7 var(--mono);color:var(--dim);text-align:center">'+notaPago('sub')+'</p></div>');
  $('#mClose').onclick=closeModal;
  $('#payBtn').onclick=e=>pagarO(e.currentTarget,{plan,period:state.period},()=>activatePlan(plan));
}
function successBadge(title,txt,badge){
  openModal('<div class="success"><div class="ok">'+SVG_CHECK+'</div><h4>Bienvenido a '+title+'</h4><p>'+txt+'</p><div class="badge-reveal">'+badgeChip(badge,true)+'</div></div>');
  toast('Membresía activada: insignia emitida');
}

/* ================= SALA DE JUGADORES (datos reales de Neon) =================
   Sin plantillas demo: cada perfil lo crea el propio jugador al iniciar
   sesión y se lee del proxy público vantsdata. La ficha pública usa el
   MISMO diseño que el perfil real (CUENTA REAL VANTS), en solo lectura. */
window.VANTS_PLAYERS=[];
window.VANTS_STATS={};
const PROXY_PUBLICO='https://br-sweet-shape-b42xhogj-vantsdata.compute.c-6.us-east-2.aws.neon.tech/';
const escHtml=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const badgesDeRol=p=>{const b=[];if(p.verified)b.push('verified');if(p.role==='owner')b.push('owner');if(p.role==='admin')b.push('admin');if(p.role==='streamer')b.push('streamer');if(p.role==='creator')b.push('creator');if(p.role==='partner')b.push('partner');return b;};
function rankKeyDe(p){const r=(typeof p.rating==='number'&&p.rating>0)?p.rating:null;try{return r==null?'fundicion':rankFor(r);}catch(e){return 'fundicion';}}

async function cargarJugadores(){
  try{
    const [rp,rs]=await Promise.all([
      fetch(PROXY_PUBLICO+'?table=players&limit=200',{headers:{Accept:'application/json'}}).then(r=>r.ok?r.json():[]).catch(()=>[]),
      fetch(PROXY_PUBLICO+'?table=season_player_stats&limit=500',{headers:{Accept:'application/json'}}).then(r=>r.ok?r.json():[]).catch(()=>[])
    ]);
    const stats={};
    (Array.isArray(rs)?rs:[]).forEach(s=>{if(s&&s.player_id)stats[s.player_id]=s;});
    window.VANTS_STATS=stats;
    window.VANTS_PLAYERS=(Array.isArray(rp)?rp:[]).filter(p=>p&&p.id).sort((a,b)=>{
      const ra=(typeof a.rating==='number'&&a.rating>0)?a.rating:0,rb=(typeof b.rating==='number'&&b.rating>0)?b.rating:0;
      return rb!==ra?rb-ra:String(a.created_at||'').localeCompare(String(b.created_at||''));
    });
    renderProfileGrid();renderRail();renderLbHead();renderLbBody();
  }catch(e){/* sin conexión a la base: la sala queda en su último estado */}
}
window.vantsRecargarJugadores=cargarJugadores;

/* ================= RAIL DE CANALES ================= */
function renderRail(){
  const rail=$('#liveRail');if(!rail)return;
  const list=(window.VANTS_PLAYERS||[]).filter(p=>p.twitch_channel||p.kick_channel);
  const wrap=rail.closest('.reveal');
  if(wrap)wrap.style.display=list.length?'':'none';
  rail.innerHTML=list.map(p=>{
    const k=p.twitch_channel?'twitch':'kick',pl=PLAT[k],canal=String(p.twitch_channel||p.kick_channel).replace(/[^A-Za-z0-9_\-.]/g,'');
    return '<div class="rail-card" style="--plc:'+pl.c+';cursor:pointer" onclick="window.open(\'https://'+(k==='twitch'?'www.twitch.tv/':'kick.com/')+canal+'\',\'_blank\',\'noopener\')">'
      +'<div class="rc-top">'+platIc(k)
      +'<div class="rc-info"><div class="rc-name">'+escHtml((p.display_name||p.username||'JUGADOR').toUpperCase())
      +'<span class="live-chip"><i data-lucide="radio"></i>CANAL VINCULADO</span></div>'
      +'<p class="rc-title">Canal vinculado · '+escHtml(canal)+'</p></div></div>'
      +'<div class="rc-foot"><span class="rc-view"><i data-lucide="radio"></i><b>'+pl.n+'</b></span>'
      +'<span class="rc-game">VER CANAL</span></div></div>';
  }).join('');
  icons();
}

/* ================= GRID DE PERFILES ================= */
function renderProfileGrid(){
  const grid=$('#profileGrid');if(!grid)return;
  const list=window.VANTS_PLAYERS||[];
  if(!list.length){
    grid.innerHTML='<div style="grid-column:1/-1;border:1px dashed var(--line2,#303039);border-radius:12px;padding:40px 20px;text-align:center">'
      +'<p style="font:800 12px var(--mono);letter-spacing:.14em;color:var(--mut,#93939D)">AÚN NO HAY JUGADORES EN EL CIRCUITO</p>'
      +'<p style="font:500 11px/1.8 var(--mono);color:var(--dim,#5C5C66);margin-top:8px">Iniciá sesión, creá tu perfil y tu ficha aparece acá con tu rango, tus insignias y tus cuentas conectadas.</p></div>';
    icons();return;
  }
  grid.innerHTML=list.map(p=>{
    const k=rankKeyDe(p),rc=RANKS[k],st=window.VANTS_STATS[p.id]||{};
    const badges=badgesDeRol(p),mmr=(st.mmr!=null)?st.mmr:null;
    const live=!!(p.twitch_channel||p.kick_channel);
    const ava=p.avatar_url?'<img alt="" src="'+escHtml(p.avatar_url)+'" style="width:100%;height:100%;object-fit:cover;border-radius:50%">':escHtml((p.display_name||p.username||'V').slice(0,2).toUpperCase());
    return '<div class="pcard" style="--rc:'+rc.c1+'" onclick="openPlayerProfile(\''+p.id+'\')">'
      +'<div class="pc-banner">'+rankSVG(k,64,'remblem')+(live?'<span class="live-chip"><i data-lucide="radio"></i>CANAL VINCULADO</span>':'')+'</div>'
      +'<div class="pc-body"><span class="ava s1" style="--rc:'+rc.c1+'">'+ava+'</span>'
      +'<div class="pc-name">'+escHtml((p.display_name||p.username||'JUGADOR').toUpperCase())+'<small>'+escHtml(p.country||'—')+(p.region?' · '+escHtml(p.region):'')+'</small></div>'
      +'<div class="pc-badges">'+(badges.length?badges.map(b=>badgeChip(b)).join(''):'<span style="font:500 9px/1 var(--mono);color:var(--dim)">SIN INSIGNIAS — PLAN FREE</span>')+'</div>'
      +'<div class="pc-rank">'+rankSVG(k,30)+'<div class="rk-name">'+rc.name+'<small>VANTS RANKED</small></div><span class="rr mono">'+(mmr!=null?mmr:'—')+' MMR</span></div>'
      +'</div></div>';
  }).join('');
  icons();
}

/* ================= FICHA PÚBLICA DE JUGADOR =================
   Mismo diseño que el perfil real (CUENTA REAL VANTS), en solo lectura:
   banner con skin, insignias, stats, rango, cuentas conectadas y canal. */
function bannerPublicoHTML(sel,rawRank){
  let rkKey='fundicion';
  try{if(rawRank!=null)rkKey=rankFor(rawRank);}catch(e){}
  return '<div class="pf-banner">'
    +(sel==='bananim'?'<div style="position:absolute;top:0;bottom:0;left:0;width:30%;background:linear-gradient(90deg,transparent,rgba(255,13,46,.30),transparent);animation:bnlight 2.6s linear infinite"></div>':'')
    +(sel==='dorado'?'<div style="position:absolute;inset:0;background:linear-gradient(120deg,rgba(58,44,7,.55),rgba(23,17,6,.2) 55%,rgba(42,32,5,.55))"></div>':'')
    +rankSVG(rkKey,92,'remblem')+'</div>';
}
function rangoPublicoHTML(raw,mmr,wins,losses,xp){
  const xpExtra=xpFaceitHTML(xp);
  const wl=(wins||losses)?(wins+'V · '+losses+'D · '):'';
  try{
    if(raw==null)throw 0;
    const k=rankFor(raw),s=subFor(k,raw)||'APEX',rc=RANKS[k];
    const i=TIER_ORDER.indexOf(k);
    const hi=TIER_ORDER[i-1]?RANKS[TIER_ORDER[i-1]].lo:(RANKS[k].lo+1);
    const f=Math.max(0,Math.min(100,((raw-RANKS[k].lo)/(hi-RANKS[k].lo))*100));
    return '<p class="d-sec">RANGO VANTS RANKED</p><div class="pf-rank" style="--rc:'+rc.c1+'">'+rankSVG(k,64)
      +'<div class="info"><b>'+rc.name+' '+s+'</b><small>'+wl+'TEMPORADA ACTIVA</small>'
      +'<div class="rr-bar"><i style="width:'+f.toFixed(0)+'%;background:'+rc.c1+'"></i></div></div>'
      +'<div class="rr-num">'+(mmr!=null?mmr:'—')+'<small>MMR</small></div></div>'+xpExtra;
  }catch(e){
    return '<p class="d-sec">RANGO VANTS RANKED</p><div class="pf-rank" style="--rc:#5C5C66;opacity:.85">'+rankSVG('fundicion',64)
      +'<div class="info"><b>SIN RANGO</b><small>'+wl+'JUEGA TUS PARTIDAS DE PLACEMENT PARA OBTENER RANGO</small>'
      +'<div class="rr-bar"><i style="width:0%"></i></div></div>'
      +'<div class="rr-num">'+(mmr!=null?mmr:'—')+'<small>MMR</small></div></div>'+xpExtra;
  }
}
/* EXPERIENCIA FACEIT (migración 08: players.xp): +100 por victoria,
   +25 por empate; nivel = 1 + floor(xp/500). Marca FACEIT #FF5500. */
function xpFaceitHTML(xp){
  xp=(typeof xp==='number'&&xp>0)?xp:0;
  if(!xp)return '';
  const nivel=1+Math.floor(xp/500),en=xp%500,f=Math.min(100,en/5);
  return '<p class="d-sec">EXPERIENCIA FACEIT</p><div class="pf-rank" style="--rc:#FF5500">'
    +'<div class="info"><b>NIVEL '+nivel+'</b><small>'+xp+' XP TOTAL · '+en+'/500 PARA EL NIVEL '+(nivel+1)+'</small>'
    +'<div class="rr-bar"><i style="width:'+f.toFixed(0)+'%;background:#FF5500"></i></div></div>'
    +'<div class="rr-num">'+nivel+'<small>NIVEL</small></div></div>';
}
function openPlayerProfile(pid){
  /* tu propio perfil se abre siempre con el flujo real (editable) */
  try{
    const a=window.VANTS_AUTH;
    if(a&&a.playerId&&a.playerId===pid&&window.vantsAbrirMiPerfil){window.vantsAbrirMiPerfil();return;}
  }catch(e){}
  const p=(window.VANTS_PLAYERS||[]).find(x=>x.id===pid);
  if(!p){toast('No encontramos ese jugador','info');return;}
  const stats=p.stats||{},st=(window.VANTS_STATS[pid])||null;
  const k=rankKeyDe(p),rc=RANKS[k];
  const mmr=(st&&st.mmr!=null)?st.mmr:null;
  const wins=(st&&st.wins)||stats.wins||0,losses=(st&&st.losses)||stats.losses||0;
  const raw=(typeof p.rating==='number'&&p.rating>0)?p.rating:((st&&st.rank!=null&&st.rank!==''&&!isNaN(parseFloat(st.rank))&&parseFloat(st.rank)>=.5&&parseFloat(st.rank)<=2)?parseFloat(st.rank):null);
  const mPart=(stats.matches!=null)?stats.matches:((wins+losses)>0?wins+losses:null);
  const mWr=((wins+losses)>0)?Math.round((wins/(wins+losses))*100):(stats.wr!=null?stats.wr:null);
  const mRtg=(raw!=null)?raw:(stats.rtg!=null?stats.rtg:null);
  const mKd=(stats.kd!=null)?stats.kd:null;
  const badges=badgesDeRol(p);
  const handles={discord:stats.discord_tag||null,twitch:p.twitch_channel||null,kick:p.kick_channel||null,youtube:stats.youtube||null,tiktok:stats.tiktok||null,x:stats.x||null,riot:stats.riot||null,steam:stats.steam||null,faceit:stats.faceit||null};
  const canales=[];
  if(p.twitch_channel)canales.push({k:'twitch',h:String(p.twitch_channel).replace(/[^A-Za-z0-9_\-.]/g,'')});
  if(p.kick_channel)canales.push({k:'kick',h:String(p.kick_channel).replace(/[^A-Za-z0-9_\-.]/g,'')});
  const c=canales[0];
  const url=c?((c.k==='twitch'?'https://www.twitch.tv/':'https://kick.com/')+String(c.h).replace(/[^A-Za-z0-9_\-]/g,'')):null;
  openDrawer(
    '<div class="d-head"><span class="kicker">PERFIL DE JUGADOR</span><button class="d-x" onclick="closeDrawer()"><i data-lucide="x"></i></button></div>'
    +'<div class="d-body" style="--rc:'+rc.c1+'">'
    +bannerPublicoHTML(stats.banner||'',raw)
    +'<div class="pf-head"><span class="ava s2" style="--rc:'+rc.c1+'">'+(p.avatar_url?'<img src="'+escHtml(p.avatar_url)+'" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">':escHtml((p.username||'V').slice(0,2).toUpperCase()))+'</span>'
      +'<div class="pf-id"><div class="pf-name">'+escHtml((p.display_name||p.username||'JUGADOR').toUpperCase())+'</div>'
      +'<p class="pf-sub">@'+escHtml(p.username||'')+' · '+escHtml(p.country||'—')+(p.region?' · '+escHtml(p.region):'')+' · MIEMBRO DESDE '+String(p.created_at||'2024').slice(0,4)+'</p></div></div>'
    +'<div class="pf-badges">'+(badges.length?badges.map(b=>badgeChip(b)).join(''):'<span class="mono" style="font:500 10px/1.6 var(--mono);color:var(--dim)">Sin insignias todavía.</span>')+'</div>'
    +'<p class="pf-bio">'+escHtml(stats.bio||'Jugador del circuito VANTS.')+'</p>'
    +'<div class="pf-stats"><div><b>'+(mPart==null?'—':mPart)+'</b><span>PARTIDOS</span></div><div><b>'+(mWr==null?'—':mWr+'%')+'</b><span>WINRATE</span></div><div><b>'+(mRtg==null?'—':(typeof mRtg==='number'?mRtg.toFixed(2):mRtg))+'</b><span>RATING</span></div><div><b>'+(mKd==null?'—':(typeof mKd==='number'?mKd.toFixed(2):mKd))+'</b><span>K/D</span></div></div>'
    +rangoPublicoHTML(raw,mmr,wins,losses,p.xp)
    +'<p class="d-sec">CUENTAS CONECTADAS</p><div class="plat-list">'+Object.keys(handles).map(kk=>platRow(kk,handles[kk]?escHtml(handles[kk]):null,false)).join('')+'</div>'
    +(c?'<p class="d-sec">TRANSMISIÓN</p><div class="rail-card" style="--plc:'+PLAT[c.k].c+';cursor:pointer" onclick="window.open(\''+url+'\',\'_blank\',\'noopener\')">'
      +'<div class="rc-top">'+platIc(c.k)+'<div class="rc-info"><div class="rc-name">'+escHtml((p.display_name||p.username||'JUGADOR').toUpperCase())+'</div><p class="rc-title">Canal vinculado · '+escHtml(c.h)+'</p></div></div>'
      +'<div class="rc-foot"><span class="rc-view"><i data-lucide="radio"></i><b>'+PLAT[c.k].n+'</b></span><span class="rc-game">VER CANAL</span></div></div>':'')
    +'</div>');
  icons();
}
/* VER MI PERFIL abre SIEMPRE el perfil real (CUENTA REAL VANTS, ver
   arena-live.js); sin sesión, manda al login */
 $('#meStripBtn').addEventListener('click',()=>{
  const acc=$('#accBtn'),lb=$('#arenaLoginBtn');
  if(acc&&!acc.hidden){acc.click();return;}
  if(lb&&!lb.hidden){lb.click();return;}
  toast('Ingresá con ENTRAR para crear tu perfil de jugador','info');
});
/* REPORTAR SERIE (cta de la sección RANGOS): manda al perfil real,
   donde vive el bloque VANTS RANKED · SERIES */
const rankedReportBtn=$('#rankedReportBtn');
if(rankedReportBtn)rankedReportBtn.addEventListener('click',()=>{
  const acc=$('#accBtn'),lb=$('#arenaLoginBtn');
  if(acc&&!acc.hidden){if(window.vantsAbrirMiPerfil)window.vantsAbrirMiPerfil();else acc.click();return;}
  if(lb&&!lb.hidden){lb.click();return;}
  toast('Ingresá con ENTRAR para reportar tu serie','info');
});

/* ================= DRAWER DE PERFIL ================= */
function platRow(k,handle,own){
  const p=PLAT[k];
  const rl=(own&&window.VANTS_LINKS&&window.VANTS_LINKS[k])||null;
  const h=rl?rl.handle:handle;
  const connected=!!h;
  const estado=rl&&!rl.verified?'CONECTADO · MANUAL':'CONECTADO';
  return '<div class="plat-row'+(connected?'':' off')+'" style="--pc:'+p.c+'">'
    +platIc(k)
    +'<div class="plat-info"><b>'+p.n+'</b><small>'+(p.k==='game'?'CUENTA DE JUEGO':'RED SOCIAL')+' · '+(connected?h:'NO CONECTADA')+'</small></div>'
    +(connected
      ?(own?'<button class="plat-x" onclick="disconnect(\''+k+'\')" title="Desconectar"><i data-lucide="x"></i></button>':'')
        +'<span class="plat-state">'+SVG_CHECK.replace('<svg','<svg width="12" height="12"')+estado+'</span>'
      :(own?'<button class="plat-connect" onclick="connect(\''+k+'\')">CONECTAR</button>':'<span class="mono" style="font:600 9px/1 var(--mono);color:var(--dim)">—</span>'))
    +'</div>';
}
/* [ELIMINADO] drawer de perfil demo: el ÚNICO diseño de perfil es el real
   (arena-live.js · CUENTA REAL VANTS). Se quitaron los connect/disconnect
   falsos, el editor de nick local, el "modo EN DIRECTO" demo y el ticker de
   espectadores inventados. Los conectores reales siguen más abajo. */

/* ================= SECCIÓN RANGOS ================= */
function renderRanks(){
  $('#rankGrid').innerHTML=TIER_ORDER.map(k=>{
    const r=RANKS[k];
    const lo=k==='fundicion'?'0':Math.round(r.lo*100)+' RR';
    const hi=k==='vants'?'∞':Math.round((RANKS[TIER_ORDER[TIER_ORDER.indexOf(k)-1]]?RANKS[TIER_ORDER[TIER_ORDER.indexOf(k)-1]].lo:r.lo+1)*100)+' RR';
    return '<div class="rank-card'+(k==='vants'?' apex':'')+'" style="--r1:'+r.c1+';--r2:'+r.c2+'">'
      +'<span class="remblem" style="display:block">'+rankSVG(k,84)+'</span>'
      +'<h4>'+r.name+'</h4><span class="subs">'+(k==='vants'?'APEX':'I · II · III')+'</span>'
      +'<span class="rr">'+lo+' — '+hi+'</span></div>';
  }).join('');
}

/* ================= CINEMATIC ================= */
let cinRAF=null;
function startCinCanvas(){
  const cv=$('#cinCanvas'),cx=cv.getContext('2d');
  cv.width=innerWidth;cv.height=innerHeight;
  const pts=Array.from({length:150},()=>({z:Math.random(),s:Math.random()*1.6+.4,o:Math.random()*6.28}));
  let t=0;
  const step=()=>{
    t+=.004;cx.clearRect(0,0,cv.width,cv.height);
    const cxm=cv.width/2,cym=cv.height/2;
    pts.forEach(p=>{
      const ang=t*(.4+p.z*.7)+p.o,r=(1-p.z)*Math.min(cv.width,cv.height)*.55+40;
      cx.globalAlpha=.12+p.z*.55;cx.fillStyle=p.z>.62?'#FF0D2E':'#EDEDE7';
      cx.beginPath();cx.arc(cxm+Math.cos(ang)*r*1.5,cym+Math.sin(ang)*r*.72,p.s,0,7);cx.fill();});
    cinRAF=requestAnimationFrame(step);
  };step();
}
function stopCinCanvas(){if(cinRAF)cancelAnimationFrame(cinRAF);cinRAF=null;}
function openCin(){
  const c=$('#cin');c.classList.add('show');
  requestAnimationFrame(()=>c.classList.add('play'));
  startCinCanvas();
}
function closeCin(){
  const c=$('#cin');if(!c.classList.contains('show'))return;
  c.classList.remove('play');stopCinCanvas();
  setTimeout(()=>c.classList.remove('show'),200);
}
 $('#cinSkip').addEventListener('click',closeCin);
 $('#cinEnter').addEventListener('click',()=>{closeCin();document.getElementById('inicio').scrollIntoView({behavior:'smooth'});});
 $('#cinStory').addEventListener('click',()=>{closeCin();document.getElementById('historia').scrollIntoView({behavior:'smooth'});});
 $('#filmBtn').addEventListener('click',openCin);
 $('#filmCard').addEventListener('click',openCin);

/* ================= AGENDA EN VIVO (opcional) =================
   Si el Worker tiene el secret HENRIKDEV_API_KEY, /api/valorant/esports
   devuelve el calendario esports real de api.henrikdev.xyz. Si la clave no
   está configurada o el upstream falla, la agenda conserva los partidos
   reales verificados de vlr.gg (nada se rompe). */
async function agendaEnVivo(){
  if(state.game!=='valorant')return;
  try{
    const ctrl=new AbortController();const to=setTimeout(()=>ctrl.abort(),4000);
    const r=await fetchWorker('/api/valorant/esports',{headers:{Accept:'application/json'},signal:ctrl.signal});
    clearTimeout(to);
    if(!r.ok)return;
    const j=await r.json().catch(()=>null);
    const src=j&&j.data&&(Array.isArray(j.data.schedule)?j.data.schedule:(Array.isArray(j.data)?j.data:null));
    if(!src||!src.length)return;
    const map=src.slice(0,6).map(m=>{
      const eq=(m&&m.teams?m.teams:[]).map(x=>(x&&(x.name||x.code))||x).filter(Boolean);
      if(eq.length<2)return null;
      const f=m.start_time?new Date(m.start_time):null;
      const t=f&&isNaN(f.getTime())?'—':f.toLocaleTimeString('es-VE',{hour:'2-digit',minute:'2-digit',hour12:false});
      const ev=(m.tournament&&(m.tournament.name||m.tournament))||'CIRCUITO PRO';
      const url=(typeof m.vlr_url==='string'&&m.vlr_url.indexOf('vlr.gg')>-1)?m.vlr_url:((typeof m.url==='string'&&m.url.indexOf('vlr.gg')>-1)?m.url:null);
      return {t,status:'up',a:String(eq[0]).toUpperCase().slice(0,24),b:String(eq[1]).toUpperCase().slice(0,24),sa:null,sb:null,map:'Serie',bo:'BO3',ev:String(ev).slice(0,80),real:true,url};
    }).filter(Boolean);
    if(!map.length)return;
    D().matches=map.concat(D().matches.filter(m=>m.status==='final'));
    renderMatches();
    const n=$('#agendaNote');if(n)n.innerHTML='Agenda <b>EN VIVO</b> (HenrikDev API) + resultados reales de vlr.gg · hora de Caracas.';
  }catch(e){/* sin clave/red: queda la agenda verificada */}
}

/* ================= CAMBIO DE JUEGO ================= */
function renderAll(){
  const d=D();
  document.body.dataset.game=state.game;
  renderTicker();
  $('#heroTitle').innerHTML=d.title;
  $('#heroSub').textContent=d.sub;
  $('#gbNext').innerHTML='<b>'+d.short+'</b>INSCRIPCIONES ABIERTAS';
  $('#liveNameA').textContent=d.live.a;$('#liveNameB').textContent=d.live.b;
  $('#liveTagA').textContent=d.live.ta;$('#liveTagB').textContent=d.live.tb;
  $('#liveEvent').textContent=d.live.ev;
  renderMatches();renderLbHead();renderLbBody();renderBracket();renderTournaments();renderRail();
  icons();
}
 $$('.gbtn').forEach(b=>b.addEventListener('click',()=>{
  if(state.game===b.dataset.game)return;
  state.game=b.dataset.game;
  $$('.gbtn').forEach(x=>x.classList.toggle('on',x===b));
  renderAll();renderLive();
}));

/* ================= INIT ================= */
const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}}),{threshold:.08});
 $$('.reveal').forEach(el=>io.observe(el));
renderRanks();renderProfileGrid();renderAccount();renderAll();renderLive();cargarJugadores();agendaEnVivo();
if(!sessionStorage.getItem('vants_film')){sessionStorage.setItem('vants_film','1');setTimeout(openCin,700);}

/* ================= FOTO DE PERFIL + DISCORD ================= */
PICON.discord='<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.32 4.37a19.8 19.8 0 0 0-4.93-1.51 13.8 13.8 0 0 0-.64 1.28 18.3 18.3 0 0 0-5.5 0 12.6 12.6 0 0 0-.64-1.28c-1.71.29-3.37.8-4.93 1.51A20.3 20.3 0 0 0 .1 18.06a19.9 19.9 0 0 0 6.07 3.06c.49-.66.93-1.37 1.3-2.1a12.9 12.9 0 0 1-2.05-.98c.17-.12.34-.25.5-.38a14.2 14.2 0 0 0 12.16 0c.17.13.33.26.5.38-.65.38-1.34.71-2.05.98.37.73.8 1.44 1.3 2.1a19.8 19.8 0 0 0 6.07-3.06 20.2 20.2 0 0 0-3.58-13.69ZM8.02 15.33c-1.18 0-2.16-1.08-2.16-2.42 0-1.33.95-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.95 2.42-2.16 2.42Zm7.96 0c-1.18 0-2.16-1.08-2.16-2.42 0-1.33.95-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.96 2.42-2.16 2.42Z"/></svg>';
PLAT.discord={n:'DISCORD',c:'#5865F2',k:'social'};

me.avatar=me.avatar||null; me.discordTag=me.discordTag||null;

/* persistencia del perfil (sobrevive al cierre del navegador) */
function meSave(){try{localStorage.setItem('vants_me',JSON.stringify({name:me.name,avatar:me.avatar,discordTag:me.discordTag,socials:me.socials,game:me.game,live:me.live}))}catch(e){}}
function meLoad(){try{const s=JSON.parse(localStorage.getItem('vants_me')||'null');if(s)Object.assign(me,s)}catch(e){}}

/* [ELIMINADO] avatar local + consentimiento de Discord simulado: la foto viene
   del proveedor de sesión (guardada en players.avatar_url) y Discord se conecta
   con el linker real, como el resto de las plataformas. El tag de Discord se
   edita en MIS DATOS del perfil real. */

/* ================= CONECTORES DE CUENTAS (Auth0 + Neon + linker OAuth) =================
   Identidad: JWT de Auth0 · Guardado: tabla vants_links en Neon · OAuth real: Neon Function "linker".
   Sin claves de una red, CONECTAR ofrece vinculo manual (queda en Neon con etiqueta MANUAL). */
window.VANTS_LINKS={};
const LINKER=()=>((window.VantAuth0&&window.VantAuth0.LINKER_BASE)||'').replace(/\/$/,'');
const LINKS_API='https://ep-autumn-scene-b4opu2ip.apirest.c-6.us-east-2.aws.neon.tech/neondb/rest/v1';

async function linksCargar(){
  const A=window.VantAuth0;
  if(!A||!A.client)return window.VANTS_LINKS;
  try{
    const u=await A.client.getUser();
    if(!u||!u.sub)return window.VANTS_LINKS;
    const t=await A.getToken();
    if(!t)return window.VANTS_LINKS;
    const r=await fetch(LINKS_API+'/vants_links?auth0_sub=eq.'+encodeURIComponent(u.sub)+'&select=*',{headers:{Accept:'application/json',[AUTH_FIELD]:AUTH_SCHEME+t}});
    const filas=r.ok?await r.json():[];
    const mapa={};
    (filas||[]).forEach(f=>{mapa[f.platform]=f;});
    window.VANTS_LINKS=mapa;
  }catch(e){/* sin Neon: siguen los handles demo */}
  return window.VANTS_LINKS;
}
window.linksCargar=linksCargar;

async function playerPidActual(){
  try{
    const A=window.VantAuth0;const t=await A.getToken();
    const r=await fetch(LINKS_API+'/rpc/current_player_id',{method:'POST',headers:{[AUTH_FIELD]:AUTH_SCHEME+t,'Content-Type':'application/json'},body:'{}'});
    let pj=await r.json();
    pj=Array.isArray(pj)?pj[0]:pj;
    return (pj&&(pj.current_player_id||pj.id))||null;
  }catch(e){return null;}
}

function openLoginModal(k){
  openModal('<div class="lk">'
    +'<div class="lk-head">'+platIc(k)+'<div><b>Para conectar '+PLAT[k].n+'</b><span>Necesitás tu sesión de VANTS activa</span></div></div>'
    +'<p class="lk-note">El vínculo se guarda en tu cuenta (tabla vants_links en Neon) con tu sesión de Auth0. Iniciá sesión y volvé a intentar.</p>'
    +'<div class="dc-actions"><button class="dc-btn ghost" id="lkCancel">Después</button><button class="dc-btn" id="lkGo">INICIAR SESIÓN</button></div></div>');
  $('#lkCancel').onclick=closeModal;
  $('#lkGo').onclick=()=>{closeModal();const lb=document.getElementById('arenaLoginBtn');if(lb)lb.click();else toast('Ingresá con el botón INGRESAR de la navegación','info');};
}

function openLinkManual(k,sub){
  openModal('<div class="lk">'
    +'<div class="lk-head">'+platIc(k)+'<div><b>Conectar '+PLAT[k].n+'</b><span>Se guarda en tu cuenta VANTS (Neon)</span></div></div>'
    +'<p class="lk-note">El OAuth de '+PLAT[k].n+' todavía no tiene claves en el servidor (Neon → Functions → linker). Podés vincularla ahora: queda con etiqueta MANUAL y pasa a verificada cuando se carguen las claves.</p>'
    +'<input id="lkHandle" maxlength="40" placeholder="Tu usuario en '+PLAT[k].n+' (p. ej. @mynick)">'
    +'<div class="dc-actions"><button class="dc-btn ghost" id="lkCancel">Cancelar</button><button class="dc-btn" id="lkSave">VINCULAR</button></div>'
    +'<div id="lkMsg" class="lk-msg"></div></div>');
  $('#lkCancel').onclick=closeModal;
  $('#lkSave').onclick=async e=>{
    const b=e.currentTarget;
    const h=$('#lkHandle').value.trim().replace(/["'<>\\]/g,'');
    const msg=$('#lkMsg');
    if(!h){msg.textContent='Escribí tu usuario de '+PLAT[k].n;return;}
    b.disabled=true;b.textContent='GUARDANDO…';
    try{
      const pid=await playerPidActual();
      const {error}=await VantDB.from('vants_links').upsert({auth0_sub:sub,player_id:pid,platform:k,handle:h,verified:false},{onConflict:'auth0_sub,platform'});
      if(error)throw error;
      window.VANTS_LINKS[k]={auth0_sub:sub,player_id:pid,platform:k,handle:h,verified:false};
      closeModal();toast(PLAT[k].n+' vinculado (manual): '+h);
      if(window.vantsAbrirMiPerfil)window.vantsAbrirMiPerfil();
    }catch(err){
      b.disabled=false;b.textContent='VINCULAR';
      msg.textContent='Neon rechazó el guardado ('+((err&&err.message)||err)+'). Corré docs/migracion-links.sql en el SQL Editor de Neon.';
    }
  };
}

window.connect=async k=>{
  const A=window.VantAuth0;
  let sub=null,tok=null;
  if(A&&A.client){try{const u=await A.client.getUser();sub=u&&u.sub;tok=sub?await A.getToken():null;}catch(e){}}
  if(!tok){openLoginModal(k);return;}
  toast('Conectando '+PLAT[k].n+'…','info');
  const lb=LINKER();
  if(lb){
    try{
      const r=await fetch(lb+'/api/link/start',{method:'POST',headers:{'Content-Type':'application/json',[AUTH_FIELD]:AUTH_SCHEME+tok},body:JSON.stringify({platform:k,return_to:location.origin+location.pathname})});
      const d=await r.json().catch(()=>null);
      if(d&&d.url){sessionStorage.setItem('vants_linking',k);location.href=d.url;return;}
      if(d&&d.error==='falta_clave')toast(PLAT[k].n+': falta la clave '+d.env+' en Neon (Functions → linker). Usá el vínculo manual por ahora.','info');
      else if(d&&d.error==='sin_sesion'){openLoginModal(k);return;}
    }catch(e){/* sin linker: cae al vínculo manual */}
  }
  openLinkManual(k,sub);
};

window.disconnect=async k=>{
  delete me.socials[k];delete me.game[k];
  const A=window.VantAuth0;
  if(A&&A.client){
    try{
      const u=await A.client.getUser();
      if(u&&u.sub){
        const {error}=await VantDB.from('vants_links').delete().eq('auth0_sub',u.sub).eq('platform',k);
        if(!error)delete window.VANTS_LINKS[k];
      }
    }catch(e){/* el handle demo ya se borró arriba */}
  }
  meSave();toast('Cuenta desconectada: '+PLAT[k].n,'info');if(window.vantsAbrirMiPerfil)window.vantsAbrirMiPerfil();
};

/* nav con foto */
function renderAccount(){
  const k=rankFor(0.96+me.rr/1000);
  const a=$('#accAva');
  a.style.setProperty('--rc',RANKS[k].c1);
  a.innerHTML=me.avatar?'<img alt="" src="'+me.avatar+'">':me.name.slice(0,2).toUpperCase();
  $('#accName').textContent=me.name.toUpperCase();
  $('#accLive').style.display=me.live?'block':'none';
  a.style.filter=me.live?'drop-shadow(0 0 8px rgba(255,13,46,.8))':'';
}

/* [ELIMINADO] segunda versión del drawer demo (la que reemplazaba a la
   primera): con el perfil real de arena-live.js como diseño único ya no hay
   drawer demo. El nick se edita en AJUSTES DE CUENTA (openAjustesCuenta). */

/* aplicar perfil guardado */
meLoad();renderAccount();icons();

/* ====== PUENTE WEB → BOT DE DISCORD ======
   URL absoluta del Worker (Cloudflare): funciona igual servido desde
   Workers, desde GitHub Pages o en local (donde falla silenciosamente). */
function vantsDiscord(type, data){
  const body=JSON.stringify({ type, data });
  const send=i=>{
    if(i>=WORKER_BASES.length)return; // si no hay servidor, no rompe nada
    fetch(WORKER_BASES[i]+'/api/discord/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body
    }).catch(()=>send(i+1));
  };
  send(0);
}

/* ============================================================
   PRIVILEGIOS OWNER
   El dueño del sitio (geimerpedroza) obtiene:
   · Todo el contenido pago gratis (planes, pase premium, fees).
   · Insignias OWNER + CREADOR (+ SOCIO) en su perfil.
   · Botón de AJUSTES DE CUENTA en su perfil.
   Se activa desde arena-live.js con window.vantsOwnerActivate().
   ============================================================ */
window.VANTS_OWNER=false;
function vantsEsOwner(){
  if(window.VANTS_OWNER)return true;
  const un=((typeof me!=='undefined')&&me&&me.name||'').toLowerCase();
  return un==='geimerpedroza';
}
window.vantsEsOwner=vantsEsOwner;
function activatePlan(plan){
  const cfg=plan==='pro'
    ?{n:'VANTS PRO',b:['pro','verified']}
    :plan==='creator'?{n:'VANTS CREATOR',b:['creator','verified']}
    :{n:'VANTS SOCIO',b:['partner','verified']};
  me.plan=cfg.n;me.badges=[...new Set([...me.badges,...cfg.b])];
  meSave();renderAccount();icons();
  openModal('<div class="success"><div class="ok">'+SVG_CHECK+'</div><h4>Plan activado</h4><p>Privilegio OWNER: <b>'+cfg.n+'</b> activado sin cargo.<br>Las insignias ya están en tu perfil.</p></div>');
  toast('Plan '+cfg.n+' activado (OWNER)');
}
window.activatePlan=activatePlan;
window.vantsOwnerActivate=function(){
  window.VANTS_OWNER=true;
  me.badges=[...new Set([...(me.badges||[]),'owner','creator','partner'])];
  me.plan='VANTS PRO';
  try{localStorage.setItem('vants_me',JSON.stringify(me));}catch(e){}
  renderAccount();renderRail();icons();
  toast('Sesión OWNER detectada: todo el contenido premium queda gratis');
};

/* ================= AJUSTES DE CUENTA =================
   Email, contraseña, nick e identidades conectadas.
   Se abre desde el perfil (botón AJUSTES) o con
   window.openAjustesCuenta(). El email y el reset de
   contraseña van contra Auth0; el nick también persiste
   en la BD cuando hay sesión real. */
window.openAjustesCuenta=function(){
  const auth=window.VANTS_AUTH||{};
  const ident=auth.sub||'—';
  const email=auth.email||'no disponible';
  const conGoogle=ident.indexOf('google')===0;
  openModal('<div class="mc-head"><h3>Ajustes de cuenta</h3><button class="d-x" id="mClose"><i data-lucide="x"></i></button></div><div class="mc-body">'
    +'<p class="d-sec">NICK DE JUGADOR</p>'
    +'<div class="field"><label>NICK (SE GUARDA EN LA BD)</label><input id="ajNick" type="text" maxlength="20" value="'+(me.name||'')+'"></div>'
    +'<p class="d-sec">EMAIL DE LA CUENTA</p>'
    +'<div class="field"><label>ACTUAL</label><input type="text" value="'+email+'" disabled style="opacity:.65"></div>'
    +'<p style="font:500 10px/1.7 var(--mono);color:var(--dim);margin:6px 0 12px">El cambio de email se hace con verificación de Auth0 a tu dirección actual.</p>'
    +'<button class="btn btn-ghost" id="ajMail" style="width:100%;justify-content:center"><i data-lucide="mail"></i>CAMBIAR EMAIL (VERIFICACIÓN)</button>'
    +'<p class="d-sec">CONTRASEÑA</p>'
    +'<button class="btn btn-ghost" id="ajPass" style="width:100%;justify-content:center"><i data-lucide="key-round"></i>ENVIAR LINK DE RESET</button>'
    +'<p class="d-sec">IDENTIDADES CONECTADAS</p>'
    +'<div class="plat-list">'
      +'<div class="plat-row" style="--plc:#c9a227"><span class="plat-ic"><i data-lucide="fingerprint"></i></span><p><b style="color:var(--text)">AUTH0 · SESIÓN ACTUAL</b><br><span class="mono" style="font:500 9px/1.6 var(--mono);color:var(--dim)">'+ident+'</span></p><span class="plat-on">CONECTADO</span></div>'
      +'<div class="plat-row" style="--plc:#4285F4"><span class="plat-ic">G</span><p><b style="color:var(--text)">GOOGLE</b><br><span style="font:500 10px/1.6 var(--mono);color:var(--dim)">'+(conGoogle?'Vinculada a esta sesión':'No vinculada')+'</span></p><span class="'+(conGoogle?'plat-on':'plat-off')+'">'+(conGoogle?'CONECTADO':'—')+'</span></div>'
      +'<div class="plat-row" style="--plc:#8ea1ff"><span class="plat-ic">DC</span><p><b style="color:var(--text)">DISCORD</b><br><span style="font:500 10px/1.6 var(--mono);color:var(--dim)">'+(me.discordTag?'Tag: '+me.discordTag:'Se vincula desde Cuentas conectadas')+'</span></p><span class="'+(me.discordTag?'plat-on':'plat-off')+'">'+(me.discordTag?'CONECTADO':'—')+'</span></div>'
    +'</div>'
    +'<div class="field-row" style="margin-top:16px">'
      +'<button class="btn btn-cut" id="ajSave" style="flex:1;justify-content:center"><i data-lucide="save"></i>GUARDAR CAMBIOS</button>'
      +'<button class="btn btn-ghost" id="ajLogout" style="flex:1;justify-content:center"><i data-lucide="log-out"></i>CERRAR SESIÓN</button>'
    +'</div>'
    +'<p class="mono" style="margin-top:14px;font:500 10px/1.7 var(--mono);color:var(--dim);text-align:center">VANTS ACCOUNT · protegido por Auth0</p></div>');
  $('#mClose').onclick=closeModal;
  $('#ajSave').onclick=()=>{
    const v=$('#ajNick').value.trim().toUpperCase().replace(/["'<>\\]/g,'');
    if(!v){toast('El nick no puede quedar vacío','info');return;}
    me.name=v;meSave();renderAccount();
    if(auth.playerId){
      fetch((window.LINKS_API||'').replace('/vants_links','')+'/players?id=eq.'+auth.playerId,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:v.toLowerCase()})}).catch(()=>{});
    }
    if(window.vantsAbrirMiPerfil)window.vantsAbrirMiPerfil();
    toast('Ajustes guardados: nick '+v);
  };
  $('#ajMail').onclick=()=>{
    if(!auth.email){toast('Iniciá sesión con Auth0 para gestionar tu email','info');return;}
    toast('Te enviamos la verificación a '+auth.email,'info');
  };
  $('#ajPass').onclick=()=>{
    if(!auth.email){toast('Iniciá sesión para resetear la contraseña','info');return;}
    if(!window.AUTH0_CONFIG){toast('Auth0 no disponible en este entorno','error');return;}
    fetch('https://'+window.AUTH0_CONFIG.domain+'/dbconnections/change_password',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({client_id:window.AUTH0_CONFIG.clientId,email:auth.email,connection:'Username-Password-Authentication'})
    }).then(r=>{if(r.ok)toast('Link de reset enviado a '+auth.email,'info');else toast('No pudimos enviar el link, probá de nuevo','error');})
      .catch(()=>toast('Error de red al enviar el link','error'));
  };
  $('#ajLogout').onclick=()=>{
    if(window.vantsLogout)window.vantsLogout();
    else if(window.AUTH0_CONFIG)window.location.href='https://'+window.AUTH0_CONFIG.domain+'/v2/logout?client_id='+window.AUTH0_CONFIG.clientId+'&returnTo='+encodeURIComponent(window.location.origin);
  };
  icons();
};
