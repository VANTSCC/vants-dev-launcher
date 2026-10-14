
/* ================= HELPERS / ESTADO ================= */
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const money=n=>'$'+n.toLocaleString('en-US');
const state={game:'valorant',isPro:false,passOwned:false,sort:{key:'rating',dir:-1},search:'',entered:{},period:'mo'};
const D=()=>DATA[state.game];
const icons=()=>{if(window.lucide)lucide.createIcons();};

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

let paying=false;
function processPay(btn,onDone){
  paying=true;const o=btn.innerHTML;btn.disabled=true;
  btn.innerHTML='<span class="spin"></span>PROCESANDO PAGO…';
  setTimeout(()=>{btn.innerHTML=SVG_CHECK+'PAGO APROBADO';
    setTimeout(()=>{paying=false;closeModal();onDone();},900);},1500);
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
  extraCol:'ACS',live:{a:'KRÜ ASCEND',b:'FURIA RIFT',ta:'KRÜ',tb:'FUR',ev:'ASCENSIÓN SERIES · SEMIFINAL · MAPA: HAVEN',map:'Haven'},
  mapPool:['Haven','Bind','Lotus','Split','Sunset','Icebox','Ascent'],
  hows:['Eliminación','Defusa','Planta detonada','Tiempo agotado'],
  matches:[
    {t:'21:00',status:'live',a:'KRÜ ASCEND',b:'FURIA RIFT',sa:9,sb:7,map:'Haven',ev:'Ascensión Series · Semifinal'},
    {t:'16:10',status:'final',a:'LOUD NOVA',b:'9Z NUCLEUS',sa:13,sb:5,map:'Bind',ev:'Ascensión Series · Cuartos'},
    {t:'15:00',status:'final',a:'FURIA RIFT',b:'MIBR ECHO',sa:10,sb:13,map:'Lotus',ev:'Ascensión Series · Cuartos'},
    {t:'13:40',status:'final',a:'LEVIATÁN PRIME',b:'VELOCITY 9',sa:13,sb:11,map:'Sunset',ev:'Ascensión Series · Ronda de 16'},
    {t:'21:00',status:'up',a:'KRÜ ASCEND',b:'FURIA RIFT',sa:null,sb:null,map:'Split',ev:'Ascensión Series · Semifinal'},
    {t:'23:30',status:'up',a:'LOUD NOVA',b:'LEVIATÁN PRIME',sa:null,sb:null,map:'Icebox',ev:'Ascensión Series · Semifinal'}],
  players:[
    {name:'DIABLO',team:'KRÜ ASCEND',rating:1.34,kd:1.41,adr:168.2,kast:74.5,x:262,impact:1.72,clutch:9,badges:['pro','verified','champ']},
    {name:'MORBO',team:'LEVIATÁN PRIME',rating:1.29,kd:1.33,adr:161.7,kast:73.1,x:248,impact:1.61,clutch:7,badges:['pro','verified']},
    {name:'NINCHA',team:'LOUD NOVA',rating:1.24,kd:1.28,adr:159.0,kast:71.8,x:243,impact:1.58,clutch:6,badges:['creator']},
    {name:'KAISEL',team:'9Z NUCLEUS',rating:1.21,kd:1.19,adr:154.6,kast:70.2,x:231,impact:1.49,clutch:8,badges:['pro']},
    {name:'VELKZ',team:'FURIA RIFT',rating:1.18,kd:1.22,adr:151.2,kast:69.7,x:228,impact:1.44,clutch:5,badges:['creator']},
    {name:'TARUK',team:'KRÜ ASCEND',rating:1.15,kd:1.10,adr:149.8,kast:72.4,x:221,impact:1.41,clutch:4,badges:['pro']},
    {name:'SOMBRA J',team:'MIBR ECHO',rating:1.12,kd:1.08,adr:147.3,kast:68.9,x:217,impact:1.38,clutch:6,badges:[]},
    {name:'PIÑON',team:'VELOCITY 9',rating:1.09,kd:1.05,adr:143.1,kast:67.5,x:209,impact:1.30,clutch:3,badges:[]},
    {name:'FROSTIE',team:'LOUD NOVA',rating:1.07,kd:1.02,adr:141.6,kast:66.8,x:205,impact:1.27,clutch:5,badges:[]},
    {name:'ZAYER',team:'LEVIATÁN PRIME',rating:1.31,kd:1.35,adr:160.4,kast:72.7,x:251,impact:1.63,clutch:7,badges:['partner','verified']}],
  rosters:{'KRÜ ASCEND':['DIABLO','TARUK','FAUSTO','NVX','QUILA'],'LEVIATÁN PRIME':['MORBO','ZAYER','KIWI','HUNTER','PAWA'],'LOUD NOVA':['NINCHA','FROSTIE','TACO','VITINHO','RUX'],'9Z NUCLEUS':['KAISEL','MTH','DEDO','LUCHO','ANV'],'FURIA RIFT':['VELKZ','KRM','IGLU','PROKO','JAPA'],'MIBR ECHO':['SOMBRA J','GORDOX','NNK','FEL','ZOCK'],'VELOCITY 9':['PIÑON','DRAKO','MYA','TITO','BLEND'],'TARSA FIVE':['RON','KABE','YUJI','PEPO','LANA']},
  tournaments:[
    {id:'v1',day:'26',mon:'ABR',name:'ASCENSIÓN SERIES · ETAPA 4',tags:['DOBLE ELIM.','BO3','ONLINE'],tier:'PRO',prize:25000,slots:16,filled:12,fee:9.99},
    {id:'v2',day:'28',mon:'ABR',name:'OPEN LADDER NOCTURNA #88',tags:['SUIZO','BO1','NOCTURNA'],tier:'FREE',prize:500,slots:64,filled:51,fee:0},
    {id:'v3',day:'03',mon:'MAY',name:'COPA LATAM INVITACIONAL',tags:['INVITACIÓN','BO3'],tier:'PRO',prize:10000,slots:8,filled:5,fee:14.99},
    {id:'v4',day:'05',mon:'MAY',name:'SCRIM CUP · FINDE #12',tags:['BO3','AMISTOSO+'],tier:'FREE',prize:250,slots:32,filled:9,fee:0}],
  bracket:{quarters:[{a:'KRÜ ASCEND',b:'TARSA FIVE',sa:2,sb:0,meta:'BO3 · COMPLETADO'},{a:'LOUD NOVA',b:'9Z NUCLEUS',sa:2,sb:1,meta:'BO3 · COMPLETADO'},{a:'LEVIATÁN PRIME',b:'VELOCITY 9',sa:2,sb:0,meta:'BO3 · COMPLETADO'},{a:'FURIA RIFT',b:'MIBR ECHO',sa:2,sb:1,meta:'BO3 · COMPLETADO'}],
    semis:[{a:'KRÜ ASCEND',b:'FURIA RIFT',sa:null,sb:null,meta:'HOY · 21:00'},{a:'LOUD NOVA',b:'LEVIATÁN PRIME',sa:null,sb:null,meta:'HOY · 23:30'}],
    final:{a:null,b:null,meta:'DOMINGO · 20:00 · BO5'},
    lb1:[{a:'9Z NUCLEUS',b:'TARSA FIVE',sa:2,sb:0,meta:'BO3 · COMPLETADO'},{a:'MIBR ECHO',b:'VELOCITY 9',sa:2,sb:1,meta:'BO3 · COMPLETADO'}],
    lb2:[{a:null,b:'9Z NUCLEUS',meta:'TRAS SEMIS · BO3'},{a:null,b:'MIBR ECHO',meta:'TRAS SEMIS · BO3'}],
    lbf:{a:null,b:null,meta:'SÁBADO · 20:00 · BO3'}},
  ticker:['VANTS GAMES — TEMPORADA 4 · $25,000 EN PREMIOS','INSCRIPCIONES ABIERTAS: ASCENSIÓN SERIES S4','ZAYER (SOCIO VANTS) ESTÁ EN DIRECTO EN TWITCH','NUEVO: INSIGNIAS PRO Y CREADOR EN TU PERFIL','SUBÍ TU RANGO VANTS RANKED GANANDO SERIES']
 },
 cs2:{
  title:'STRATOS<br><span class="out">MAJOR</span> <span class="acc">S4</span>',short:'STRATOS MAJOR S4',
  sub:'El circuito de Counter-Strike 2 con los mejores equipos de la región. Brackets en vivo, MR12, servidores dedicados y revisión de demos ante cualquier sospecha.',
  extraCol:'HS %',live:{a:'BESTIA ALFA',b:'9Z CIRCUIT',ta:'BST',tb:'9Z',ev:'STRATOS MAJOR · SEMIFINAL · MAPA: MIRAGE',map:'Mirage'},
  mapPool:['Mirage','Inferno','Nuke','Ancient','Anubis','Vertigo','Dust II'],
  hows:['Eliminación','Defusa','Explosión','Tiempo agotado'],
  matches:[
    {t:'21:00',status:'live',a:'BESTIA ALFA',b:'9Z CIRCUIT',sa:10,sb:8,map:'Mirage',ev:'Stratos Major · Semifinal'},
    {t:'16:10',status:'final',a:'9Z CIRCUIT',b:'HORIZON FIVE',sa:13,sb:4,map:'Inferno',ev:'Stratos Major · Cuartos'},
    {t:'15:00',status:'final',a:'SHARKS APEX',b:'PAMPA SIX',sa:11,sb:13,map:'Nuke',ev:'Stratos Major · Cuartos'},
    {t:'13:40',status:'final',a:'ROWZONE',b:'DINAMO SUR',sa:13,sb:9,map:'Ancient',ev:'Stratos Major · Ronda de 16'},
    {t:'21:00',status:'up',a:'BESTIA ALFA',b:'9Z CIRCUIT',sa:null,sb:null,map:'Anubis',ev:'Stratos Major · Semifinal'},
    {t:'23:30',status:'up',a:'SHARKS APEX',b:'ROWZONE',sa:null,sb:null,map:'Vertigo',ev:'Stratos Major · Semifinal'}],
  players:[
    {name:'BRUMA',team:'BESTIA ALFA',rating:1.36,kd:1.44,adr:88.4,kast:75.1,x:55.6,impact:1.69,clutch:8,badges:['pro','verified','champ']},
    {name:'KITO',team:'9Z CIRCUIT',rating:1.31,kd:1.37,adr:86.2,kast:73.8,x:49.2,impact:1.62,clutch:6,badges:['pro','verified']},
    {name:'NYXO',team:'ROWZONE',rating:1.27,kd:1.29,adr:84.9,kast:72.0,x:51.8,impact:1.55,clutch:7,badges:['creator']},
    {name:'CAZKO',team:'SHARKS APEX',rating:1.22,kd:1.21,adr:82.7,kast:70.6,x:47.3,impact:1.47,clutch:5,badges:['pro']},
    {name:'TUNDRA',team:'LAVA JAGUARS',rating:1.19,kd:1.17,adr:81.5,kast:71.2,x:53.4,impact:1.43,clutch:4,badges:[]},
    {name:'DELTA9',team:'BESTIA ALFA',rating:1.16,kd:1.12,adr:80.1,kast:69.4,x:50.7,impact:1.39,clutch:6,badges:['pro']},
    {name:'MACHETE',team:'DINAMO SUR',rating:1.13,kd:1.09,adr:78.8,kast:68.1,x:46.9,impact:1.33,clutch:3,badges:[]},
    {name:'OVNI',team:'HORIZON FIVE',rating:1.10,kd:1.04,adr:77.2,kast:67.3,x:52.1,impact:1.28,clutch:4,badges:[]},
    {name:'PAMPERO',team:'PAMPA SIX',rating:1.08,kd:1.01,adr:76.0,kast:66.5,x:48.8,impact:1.24,clutch:2,badges:[]},
    {name:'GORILA',team:'9Z CIRCUIT',rating:1.05,kd:0.97,adr:74.6,kast:65.0,x:44.7,impact:1.18,clutch:3,badges:['creator']}],
  rosters:{'BESTIA ALFA':['BRUMA','DELTA9','TERO','NOKTU','PIWE'],'9Z CIRCUIT':['KITO','GORILA','ROJ0','MBL','CUTI'],'ROWZONE':['NYXO','ST1CK','FEROZ','HUGO','LIPA'],'SHARKS APEX':['CAZKO','TREMOR','SABLA','OSO','VUKO'],'LAVA JAGUARS':['TUNDRA','VULCA','MAGMA','ZETA','PIO'],'HORIZON FIVE':['OVNI','ORION','KIMA','DUXO','PLUM'],'PAMPA SIX':['PAMPERO','GUAZO','TALO','NENE','RULO'],'DINAMO SUR':['MACHETE','FRIO','BALT','YUPI','CRUZ']},
  tournaments:[
    {id:'c1',day:'26',mon:'ABR',name:'STRATOS MAJOR · ETAPA 4',tags:['MR12','BO3','ONLINE'],tier:'PRO',prize:25000,slots:16,filled:11,fee:9.99},
    {id:'c2',day:'28',mon:'ABR',name:'OPEN LADDER NOCTURNA #52',tags:['SUIZO','BO1','NOCTURNA'],tier:'FREE',prize:500,slots:64,filled:44,fee:0},
    {id:'c3',day:'03',mon:'MAY',name:'COPA SUR INVITACIONAL',tags:['INVITACIÓN','BO3'],tier:'PRO',prize:10000,slots:8,filled:6,fee:14.99},
    {id:'c4',day:'05',mon:'MAY',name:'WINGMAN CUP · FINDE',tags:['BO3','2V2'],tier:'FREE',prize:250,slots:32,filled:17,fee:0}],
  bracket:{quarters:[{a:'BESTIA ALFA',b:'LAVA JAGUARS',sa:2,sb:1,meta:'BO3 · COMPLETADO'},{a:'9Z CIRCUIT',b:'HORIZON FIVE',sa:2,sb:0,meta:'BO3 · COMPLETADO'},{a:'SHARKS APEX',b:'PAMPA SIX',sa:2,sb:1,meta:'BO3 · COMPLETADO'},{a:'ROWZONE',b:'DINAMO SUR',sa:2,sb:0,meta:'BO3 · COMPLETADO'}],
    semis:[{a:'BESTIA ALFA',b:'9Z CIRCUIT',sa:null,sb:null,meta:'HOY · 21:00'},{a:'SHARKS APEX',b:'ROWZONE',sa:null,sb:null,meta:'HOY · 23:30'}],
    final:{a:null,b:null,meta:'DOMINGO · 20:00 · BO5'},
    lb1:[{a:'HORIZON FIVE',b:'LAVA JAGUARS',sa:2,sb:1,meta:'BO3 · COMPLETADO'},{a:'PAMPA SIX',b:'DINAMO SUR',sa:2,sb:0,meta:'BO3 · COMPLETADO'}],
    lb2:[{a:null,b:'HORIZON FIVE',meta:'TRAS SEMIS · BO3'},{a:null,b:'PAMPA SIX',meta:'TRAS SEMIS · BO3'}],
    lbf:{a:null,b:null,meta:'SÁBADO · 20:00 · BO3'}},
  ticker:['VANTS GAMES — TEMPORADA 4 · $25,000 EN PREMIOS','INSCRIPCIONES ABIERTAS: STRATOS MAJOR S4','MORBO (CREADOR) ESTÁ EN DIRECTO EN TWITCH','NUEVO: INSIGNIAS PRO Y CREADOR EN TU PERFIL','SUBÍ TU RANGO VANTS RANKED GANANDO SERIES']
 }
};

/* ================= PERFILES ================= */
const PROFILES=[
 {id:'diablo',name:'DIABLO',country:'AR 🇦🇷',team:'KRÜ ASCEND',rank:'vants',sub:'II',rr:612,peak:'VANTS II',lvl:97,badges:['pro','verified','champ'],
  bio:'Duelista main. Campeón de la Ascensión Series S3. La ventaja se toma en el primer round.',
  stats:{m:342,wr:61,rtg:1.34,kd:1.41},socials:{twitch:'diablovnts',youtube:'@diablovnts',x:'@diablo'},game:{riot:'DIABLO#VNTS',faceit:'lvl 10'},live:null},
 {id:'zayer',name:'ZAYER',country:'CL 🇨🇱',team:'LEVIATÁN PRIME',rank:'eter',sub:'I',rr:486,peak:'ÉTER I',lvl:88,badges:['partner','verified'],
  bio:'Socio VANTS. Watch parties del Major cada semana. La comunidad primero, siempre.',
  stats:{m:411,wr:58,rtg:1.31,kd:1.35},socials:{twitch:'zayertv',youtube:'@zayer',x:'@zayertv',tiktok:'@zayer.cl'},game:{riot:'ZAYER#CL',faceit:'lvl 10'},live:{platform:'twitch',viewers:8432,title:'WATCH PARTY STRATOS MAJOR — SEMIS'}},
 {id:'morbo',name:'MORBO',country:'BR 🇧🇷',team:'LEVIATÁN PRIME',rank:'eter',sub:'III',rr:431,peak:'ÉTER III',lvl:82,badges:['pro','verified'],
  bio:'IGL y ancla del equipo. Si hay clutch 1v3, probablemente fue él.',
  stats:{m:389,wr:57,rtg:1.29,kd:1.33},socials:{twitch:'morbooo',x:'@morbo'},game:{riot:'MORBO#BR'},live:{platform:'twitch',viewers:5120,title:'RANKED GRIND HASTA VANTS — !torneo'}},
 {id:'nincha',name:'NINCHA',country:'AR 🇦🇷',team:'LOUD NOVA',rank:'cromo',sub:'I',rr:238,peak:'CROMO I',lvl:64,badges:['creator'],
  bio:'Creadora VANTS. Faceit level 10 con una mano, mate con la otra.',
  stats:{m:276,wr:55,rtg:1.24,kd:1.28},socials:{kick:'nincha',tiktok:'@nincha.gg',x:'@ninchagg'},game:{steam:'STEAM:7656…',faceit:'NINCHA'},live:{platform:'kick',viewers:2140,title:'FACEIT LVL 10 GRIND + SORTeos de skins'}},
 {id:'velkz',name:'VELKZ',country:'UY 🇺🇾',team:'FURIA RIFT',rank:'plasma',sub:'II',rr:174,peak:'PLASMA II',lvl:58,badges:['creator'],
  bio:'Creador VANTS. Guías de utilidades que nadie pidió pero todos necesitan.',
  stats:{m:198,wr:52,rtg:1.18,kd:1.22},socials:{youtube:'@velkz',twitch:'velkz'},game:{riot:'VELKZ#UY'},live:{platform:'youtube',viewers:980,title:'COPILOTO CON SUBS · RANKED DÚO'}},
 {id:'kaisel',name:'KAISEL',country:'MX 🇲🇽',team:'9Z NUCLEUS',rank:'plasma',sub:'III',rr:151,peak:'PLASMA III',lvl:55,badges:['pro'],
  bio:'Rey del clutch. 8 situaciones 1vX ganadas este mes.',
  stats:{m:221,wr:54,rtg:1.21,kd:1.19},socials:{x:'@kaisel'},game:{riot:'KAISEL#MX'},live:null},
 {id:'taruk',name:'TARUK',country:'AR 🇦🇷',team:'KRÜ ASCEND',rank:'cromo',sub:'II',rr:205,peak:'CROMO II',lvl:61,badges:['pro'],
  bio:'Soporte que mira el minimapa más que la mira.',
  stats:{m:245,wr:56,rtg:1.15,kd:1.10},socials:{},game:{riot:'TARUK#AR'},live:null},
 {id:'frostie',name:'FROSTIE',country:'PY 🇵🇾',team:'LOUD NOVA',rank:'titanio',sub:'I',rr:42,peak:'TITANIO I',lvl:31,badges:[],
  bio:'Recién empiezo en el circuito. Pronto con insignia PRO.',
  stats:{m:64,wr:49,rtg:1.07,kd:1.02},socials:{},game:{},live:null}
];
/* tu cuenta */
const me={name:'RETADOR',country:'AR 🇦🇷',rank:'acero',sub:'II',rr:148,peak:'ACERO II',lvl:23,badges:[],socials:{},game:{},live:false,bio:'Nuevo en el circuito VANTS. Conectá tus cuentas, ganá series y subí de rango.'};
function addBadge(b){if(!me.badges.includes(b))me.badges.push(b);}
/* [OBSOLETA] esta version esta sustituida mas abajo en este archivo; edita siempre la ultima */
function renderAccount(){
  const rc=RANKS[rankFor(me.rr/6+0.96)]; // ring color según rango actual
  const k=me.badges.includes('partner')?'vants':rankFor(0.96+me.rr/1000);
  $('#accAva').textContent=me.name.slice(0,2).toUpperCase();
  $('#accAva').style.setProperty('--rc',RANKS[k].c1);
  $('#accName').textContent=me.name.toUpperCase();
  $('#accLive').style.display=me.live?'block':'none';
  $('#accAva').style.filter=me.live?'drop-shadow(0 0 8px rgba(255,13,46,.8))':'';
}

/* ================= TICKER + COUNTDOWN ================= */
function renderTicker(){
  const items=D().ticker.map(t=>'<span>/// '+t+'</span>').join('');
  $('#tickerTrack').innerHTML=items+items;
}
const cdTarget=Date.now()+((3*24+14)*3600+27*60+12)*1000;
setInterval(()=>{let d=Math.max(0,cdTarget-Date.now())/1000;
  $('#cdD').textContent=String(Math.floor(d/86400)).padStart(2,'0');
  $('#cdH').textContent=String(Math.floor(d%86400/3600)).padStart(2,'0');
  $('#cdM').textContent=String(Math.floor(d%3600/60)).padStart(2,'0');
  $('#cdS').textContent=String(Math.floor(d%60)).padStart(2,'0');},1000);

/* ================= PARTIDO EN VIVO (simulado) ================= */
const live={a:8,b:6,done:false,reset:0,mapIdx:0,specBase:2418,feed:[]};
function tickLive(){
  if(live.done){if(--live.reset<=0){live.a=0;live.b=0;live.done=false;live.feed=[];live.mapIdx++;
    $('#liveEvent').textContent=D().short+' · CUARTOS · MAPA: '+D().mapPool[live.mapIdx%D().mapPool.length];}
    renderLive();return;}
  const w=Math.random()<(.5-(live.a-live.b)*.018)?'a':'b';
  if(w==='a')live.a++;else live.b++;
  live.feed.unshift({r:live.a+live.b,w,how:D().hows[Math.floor(Math.random()*D().hows.length)],a:live.a,b:live.b});
  live.feed=live.feed.slice(0,5);
  if(live.a>=13||live.b>=13){live.done=true;live.reset=8;
    live.feed.unshift({over:true,w:live.a>=13?'a':'b',a:live.a,b:live.b});}
  renderLive();
}
function renderLive(){
  $('#liveScore').innerHTML=live.a+'<i>:</i>'+live.b;
  $('#liveSpec').textContent=(live.specBase+Math.floor(Math.random()*180)-90).toLocaleString('en-US');
  const build=(el,score)=>{let h='';for(let i=0;i<13;i++){let c='pip';
    if(i<score)c+=score===live.a?' wa':' wb';else if(i===score&&!live.done&&score<=12)c+=' cur';
    h+='<span class="'+c+'"></span>';}el.innerHTML=h;};
  build($('#pipsA'),live.a);build($('#pipsB'),live.b);
  const L=D().live;
  $('#liveFeed').innerHTML=live.feed.map(f=>f.over
    ?'<div class="lf fa"><b>PARTIDO FINALIZADO</b> · '+L.a+' gana '+(f.w==='a'?f.a+':'+f.b:f.b+':'+f.a)+'</div>'
    :'<div class="lf '+(f.w==='a'?'fa':'fb')+'">R'+String(f.r).padStart(2,'0')+' · <b>'+(f.w==='a'?L.a:L.b)+'</b> gana · '+f.how+' · '+f.a+'–'+f.b+'</div>').join('');
}

/* ================= PARTIDOS ================= */
function renderMatches(){
  $('#matchList').innerHTML=D().matches.map((m,i)=>{
    const chip=m.status==='live'?'<span class="chip live"><i class="dot"></i>LIVE</span>':m.status==='final'?'<span class="chip fin">FINAL</span>':'<span class="chip up">'+m.t+'</span>';
    const sa=m.status==='live'?live.a:m.sa,sb=m.status==='live'?live.b:m.sb;
    return '<div class="mrow" data-idx="'+i+'">'
      +'<div class="m-time"><b class="mono">'+(m.status==='live'?'AHORA':m.t)+'</b>'+chip+'</div>'
      +'<div class="m-team" style="justify-content:flex-end"><span>'+m.a+'</span></div>'
      +'<div class="m-score mono">'+(m.status==='up'?'<i>vs</i>':(sa>sb?'<b>'+sa+'</b><i>:</i>'+sb:sa+'<i>:</i><b>'+sb+'</b>'))+'</div>'
      +'<div class="m-team"><span>'+m.b+'</span></div>'
      +'<div class="m-map"><b>'+m.map.toUpperCase()+'</b>BO3</div>'
      +'<div class="m-ev">'+m.ev.toUpperCase()+'</div>'
      +'<span class="m-go"><i data-lucide="chevron-right"></i></span></div>';
  }).join('');icons();
}
 $('#matchList').addEventListener('click',e=>{const r=e.target.closest('.mrow');if(r)openMatchDetail(D().matches[+r.dataset.idx]);});

function genRounds(sa,sb,seed){
  const hows=D().hows;let a=0,b=0,out=[],i=0;
  while((a<sa||b<sb)&&i<80){let w;
    if(a>=sa)w='b';else if(b>=sb)w='a';
    else w=((Math.sin(seed*91.7+i*13.3)+1)/2)>.5?'a':'b';
    if(w==='a'&&a<sa){a++;out.push({r:a+b,w:'a',how:hows[(i*3+seed)%hows.length],a,b});}
    else if(w==='b'&&b<sb){b++;out.push({r:a+b,w:'b',how:hows[(i*5+seed)%hows.length],a,b});}
    i++;}
  return out;
}
function openMatchDetail(m){
  const d=D(),sa=m.status==='live'?live.a:m.sa,sb=m.status==='live'?live.b:m.sb,isUp=m.status==='up';
  const seed=(m.a+m.b).length+sa+sb+7;
  const rounds=isUp?[]:(m.status==='final'?genRounds(sa,sb,seed):live.feed);
  const rosterA=d.rosters[m.a]||[],rosterB=d.rosters[m.b]||[];
  const winner=sa>sb?m.a:m.b,mvp=(d.rosters[winner]||[])[0];
  let roundsHtml;
  if(isUp)roundsHtml='<p class="d-empty">El partido aún no comienza. Activá una alerta para enterarte del match point.</p>';
  else roundsHtml=rounds.map(f=>'<div class="dr '+(f.w==='a'?'ga':'')+'"><b>R'+String(f.r).padStart(2,'0')+'</b><span class="dr-w">'+(f.w==='a'?m.a:m.b)+' · '+f.how+'</span><span class="dr-sc">'+f.a+'–'+f.b+'</span></div>').join('');
  let statsHtml='';
  if(m.status==='final'){
    const pool=[...(d.rosters[m.a]||[]).map(n=>({n})),...(d.rosters[m.b]||[]).map(n=>({n}))];
    const picks=[pool[seed%pool.length],pool[(seed+3)%pool.length],pool[(seed+6)%pool.length]];
    statsHtml='<p class="d-sec">DESTACADOS DEL PARTIDO</p><div class="d-stats">'+picks.map((p,i)=>{
      const k=18+((seed*(i+2))%9),dd=12+((seed*(i+5))%7),as=4+((seed*(i+3))%8);
      return '<div class="dr"><b>'+p.n+'</b><span>'+k+'/<span style="color:var(--dim)">'+dd+'</span>/'+as+'</span><span>'+(k/(dd||1)).toFixed(2)+' K/D</span><span>'+(120+((seed*(i+7))%40))+' ADR</span></div>';}).join('')+'</div>';
  }
  openDrawer('<div class="d-head"><span class="kicker">/// '+(isUp?'PREVIA':(m.status==='live'?'EN VIVO':'DETALLE'))+'</span><button class="d-x" onclick="closeDrawer()"><i data-lucide="x"></i></button></div>'
    +'<div class="d-body"><p class="mono" style="font-size:10px;letter-spacing:.12em;color:var(--dim);margin-bottom:18px">'+m.ev.toUpperCase()+'</p>'
    +'<div class="d-score"><div class="d-team">'+m.a+'</div><div class="d-num">'+(isUp?'<i>vs</i>':sa+'<i>:</i>'+sb)+'</div><div class="d-team r">'+m.b+'</div></div>'
    +'<p class="d-map">MAPA: '+m.map.toUpperCase()+' · BO3'+(m.status==='final'?' · FINALIZADO':'')+'</p>'
    +(m.status==='final'&&mvp?'<p class="mono" style="font-size:11px;color:var(--muted)">MVP DE LA SERIE: <b style="color:var(--accent)">'+mvp+'</b> ('+winner+')</p>':'')
    +'<p class="d-sec">'+(isUp?'ALINEACIONES PROBABLES':'RONDA A RONDA')+'</p>'
    +(isUp?'<div class="d-roster" style="margin-bottom:14px">'+rosterA.map(n=>'<li><b>'+m.a.slice(0,3).toUpperCase()+'</b>'+n+'</li>').join('')+'</div><div class="d-roster">'+rosterB.map(n=>'<li><b>'+m.b.slice(0,3).toUpperCase()+'</b>'+n+'</li>').join('')+'</div>':'<div class="d-rounds">'+roundsHtml+'</div>')
    +statsHtml
    +(isUp?'<button class="btn btn-ghost btn-sm" style="margin-top:20px;width:100%;justify-content:center" onclick="toast(\'Alerta activada: te avisamos al match point\',\'info\')"><i data-lucide="bell"></i>AVISARME CUANDO EMPIECE</button>':'')
    +'</div>');
}
 $('#liveMore').addEventListener('click',()=>{const L=D().live;
  openMatchDetail({status:live.done?'final':'live',a:L.a,b:L.b,map:L.map,ev:D().short+' · Cuartos'});});

/* ================= RANKING ================= */
const COLS=[
  {key:'pos',label:'#',num:true},{key:'name',label:'JUGADOR'},
  {key:'rank',label:'RANGO'},{key:'team',label:'EQUIPO'},
  {key:'rating',label:'RATING',num:true},{key:'kd',label:'K/D',num:true},
  {key:'adr',label:'ADR',num:true},{key:'kast',label:'KAST %',num:true},
  {key:'x',label:'ACS',num:true,dynamic:true},
  {key:'impact',label:'IMPACTO',num:true,pro:true},{key:'clutch',label:'CLUTCH',num:true,pro:true}];
function renderLbHead(){
  $('#lbHead').innerHTML='<tr>'+COLS.map(c=>{
    const label=(c.dynamic?D().extraCol:c.label)+(c.pro?' <span class="lock"><i data-lucide="lock"></i>PRO</span>':'');
    const on=state.sort.key===c.key,arrow=on?(state.sort.dir===-1?'▾':'▴'):'';
    if(['pos','name','rank','team'].includes(c.key))return '<th><button disabled style="cursor:default;opacity:.8">'+label+'</button></th>';
    return '<th'+(c.num?' class="num"':'')+'><button data-key="'+c.key+'" class="'+(on?'on':'')+'">'+label+arrow+'</button></th>';}).join('')+'</tr>';
  icons();
}
function renderLbBody(){
  const q=state.search.toLowerCase();
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
  }).join(''):'<tr><td colspan="11" style="text-align:center;color:var(--dim);padding:34px">Sin resultados para "'+state.search+'"</td></tr>';
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
    const done=state.entered[t.id],full=t.filled>=t.slots;
    return '<div class="trow'+(done?' done':'')+'">'
      +'<div class="t-date"><b>'+t.day+'</b><span>'+t.mon+'</span></div>'
      +'<div class="t-info"><h3>'+t.name+'</h3><div class="t-tags"><span class="tag'+(t.tier==='PRO'?' prem':'')+'">'+t.tier+'</span>'+t.tags.map(x=>'<span class="tag">'+x+'</span>').join('')+'</div></div>'
      +'<div class="t-prize"><b>'+money(t.prize)+'</b><span>POZO DE PREMIOS</span></div>'
      +'<div class="t-slots"><div class="sl-bar"><i style="width:'+(t.filled/t.slots*100)+'%"></i></div><div class="sl-txt"><span>CUPOS</span><span>'+t.filled+' / '+t.slots+'</span></div></div>'
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
    if(fee)openPayStep(t,team,tag);else finishEnroll(t,team,tag);
  };
}
function openPayStep(t,team,tag){
  openModal('<div class="mc-head"><h3>Confirmar pago</h3><button class="d-x" id="mClose"><i data-lucide="x"></i></button></div><div class="mc-body">'
    +'<div class="mc-sum"><span>'+t.name+'</span><span>'+(state.game==='valorant'?'VALORANT':'CS2')+'</span></div>'
    +'<div class="mc-sum"><span>Equipo</span><span>'+team+' ['+tag+']</span></div>'
    +'<div class="mc-sum"><span>Fee de inscripción</span><span>'+money(t.fee)+'</span></div>'
    +'<div class="mc-sum"><span>Reembolso hasta 48 h antes</span><span style="color:var(--accent)">INCLUIDO</span></div>'
    +'<div class="mc-total"><span>TOTAL HOY</span><b>'+money(t.fee)+'</b></div>'
    +'<button class="btn btn-cut" id="payBtn"><i data-lucide="credit-card"></i>PAGAR '+money(t.fee)+'</button>'
    +'<p class="mono" style="margin-top:14px;font:500 10px/1.7 var(--mono);color:var(--dim);text-align:center">Pago seguro simulado · sin cargo real</p></div>');
  $('#mClose').onclick=closeModal;
  $('#payBtn').onclick=e=>processPay(e.currentTarget,()=>finishEnroll(t,team,tag));
}
function finishEnroll(t,team,tag){
  state.entered[t.id]=true;
  const tt=D().tournaments.find(x=>x.id===t.id);if(tt)tt.filled=Math.min(tt.slots,tt.filled+1);
  openModal('<div class="success"><div class="ok">'+SVG_CHECK+'</div><h4>Tu equipo está dentro</h4><p>'+team+' ['+tag+'] · '+t.name+'<br>Fixture 24 h antes del inicio.<br>¡Nos vemos en el servidor!</p></div>');
  renderTournaments();toast('Inscripción confirmada: '+team+' ['+tag+']');
  vantsDiscord('torneo_inscripcion',{team,tag,tournament:t.name});
}

/* ================= PASE: RAREZAS + ARTES SVG ================= */
const RAR={comun:{c:'#8f9aa6',n:'COMÚN'},raro:{c:'#4CC9F0',n:'RARO'},epico:{c:'#B44CFF',n:'ÉPICO'},legendario:{c:'#F5C044',n:'LEGENDARIO'}};

const ART={
 xp:(uid,r)=>{const V={c:['#8fe9ff','#1287ad'],v:['#d9a8ff','#7a1fd0'],r:['#ff8a96','#a3000f']}[r.v||'c'];return `<svg viewBox="0 0 96 96">
  <defs><linearGradient id="xp${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${V[0]}"/><stop offset="1" stop-color="${V[1]}"/></linearGradient></defs>
  <path d="M30 8h36l20 20v40L66 88H30L10 68V28Z" fill="#0e0e12" stroke="url(#xp${uid})" stroke-width="3"/>
  <path d="M35 17h26l13 13v36L61 79H35L22 66V30Z" fill="none" stroke="${V[0]}" stroke-opacity=".35" stroke-width="1.5"/>
  <path d="M56 20 32 52h14l-6 24 26-34H51l8-22Z" fill="url(#xp${uid})"/>
  <path d="M30 8h20l-5 4H32Z" fill="#fff" opacity=".4"/></svg>`},
 charm:uid=>`<svg viewBox="0 0 96 96">
  <defs><linearGradient id="ch${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffefb0"/><stop offset=".5" stop-color="#f5c044"/><stop offset="1" stop-color="#8a6a1d"/></linearGradient></defs>
  <circle cx="48" cy="12" r="5" fill="none" stroke="#9aa3ad" stroke-width="2.5"/>
  <circle cx="48" cy="24" r="4" fill="none" stroke="url(#ch${uid})" stroke-width="2.5"/>
  <circle cx="48" cy="56" r="24" fill="none" stroke="url(#ch${uid})" stroke-width="4"/>
  <circle cx="48" cy="56" r="15" fill="none" stroke="url(#ch${uid})" stroke-width="1.5" opacity=".7"/>
  <path d="M48 30v10M48 72v10M22 56h10M64 56h10" stroke="url(#ch${uid})" stroke-width="4" stroke-linecap="round"/>
  <circle cx="48" cy="56" r="4" fill="url(#ch${uid})"/>
  <path d="M30 42a26 26 0 0 1 16-11" stroke="#fff" stroke-opacity=".8" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>`,
 card:uid=>`<svg viewBox="0 0 120 72">
  <defs><linearGradient id="cf${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#101014"/><stop offset="1" stop-color="#2a0a10"/></linearGradient>
  <linearGradient id="cfs${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#98a0aa"/></linearGradient>
  <linearGradient id="cfr${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff5a68"/><stop offset="1" stop-color="#9e0019"/></linearGradient></defs>
  <rect width="120" height="72" fill="url(#cf${uid})"/>
  <ellipse cx="60" cy="76" rx="72" ry="26" fill="#ff0d2e" opacity=".28"/>
  <circle cx="18" cy="20" r="1.6" fill="#ff7a5c" opacity=".9"/><circle cx="30" cy="34" r="1.2" fill="#ffb46b" opacity=".7"/>
  <circle cx="98" cy="16" r="1.4" fill="#ff7a5c" opacity=".8"/><circle cx="104" cy="40" r="1.1" fill="#ffb46b" opacity=".6"/><circle cx="88" cy="52" r="1.3" fill="#ff5a68" opacity=".7"/>
  <g transform="translate(37 12) scale(.72)">
   <path d="M9 14H23L34.5 44.5 32 52Z" fill="url(#cfs${uid})"/>
   <path d="M55 14H41L32.4 37 42.2 37Z" fill="url(#cfr${uid})"/>
   <path d="M38.6 41H41L32 52l1.6-4.4Z" fill="#ff0d2e" opacity=".9"/></g>
  <rect x="1" y="1" width="118" height="70" fill="none" stroke="#3a3f47" stroke-width="2"/></svg>`,
 patch:uid=>`<svg viewBox="0 0 96 96">
  <defs><linearGradient id="pt${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9dde3"/><stop offset="1" stop-color="#8d949e"/></linearGradient></defs>
  <path d="M28 6h40l18 18v40L68 90H28L10 68V24Z" fill="#16181d" stroke="#2c313a" stroke-width="2"/>
  <path d="M33 11h30l16 16v34L63 85H33L15 67V27Z" fill="none" stroke="#3f4550" stroke-width="1.6" stroke-dasharray="4 3"/>
  <g stroke="#9aa3ad" opacity=".14"><path d="M22 30 44 8M30 40 62 8M42 46 78 10M54 52 86 20M64 58 88 34"/></g>
  <g transform="translate(28 16) scale(.66)">
   <path d="M9 14H23L34.5 44.5 32 52Z" fill="url(#pt${uid})"/>
   <path d="M55 14H41L32.4 37 42.2 37Z" fill="#9e0019"/>
   <path d="M38.6 41H41L32 52l1.6-4.4Z" fill="#ff0d2e"/></g>
  <path d="M24 74h48l-5 8H29Z" fill="#1d2026" stroke="#3f4550"/>
  <text x="48" y="80.5" text-anchor="middle" font-family="'Archivo Black',sans-serif" font-size="6.5" letter-spacing="2.5" fill="url(#pt${uid})">VANTS</text></svg>`,
 spray:uid=>`<svg viewBox="0 0 96 96">
  <path d="M20 16 44 74 68 16" fill="none" stroke="#ff0d2e" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M17 14 41 72 65 14" fill="none" stroke="#ff5a68" stroke-width="3" stroke-linecap="round" opacity=".5"/>
  <path d="M42 78h4" stroke="#ff0d2e" stroke-width="5" stroke-linecap="round"/>
  <path d="M44 84h1.5" stroke="#ff0d2e" stroke-width="3" stroke-linecap="round"/>
  <path d="M28 40v7" stroke="#ff0d2e" stroke-width="2.5" stroke-linecap="round"/>
  <g fill="#ff5a68" opacity=".55"><circle cx="12" cy="12" r="1.5"/><circle cx="76" cy="10" r="1.3"/><circle cx="10" cy="26" r="1"/><circle cx="82" cy="24" r="1.2"/><circle cx="48" cy="8" r="1"/></g></svg>`,
 reroll:uid=>`<svg viewBox="0 0 120 72">
  <defs><linearGradient id="rr${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fe9ff"/><stop offset="1" stop-color="#1287ad"/></linearGradient></defs>
  <path d="M8 14h104v44H8Z" fill="#0e1216" stroke="url(#rr${uid})" stroke-width="2.5"/>
  <circle cx="8" cy="36" r="5" fill="#0A0A0C"/><circle cx="112" cy="36" r="5" fill="#0A0A0C"/>
  <path d="M86 14v44" stroke="url(#rr${uid})" stroke-width="1.6" stroke-dasharray="4 4"/>
  <g stroke="url(#rr${uid})" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
   <path d="M24 44c8 0 10-14 18-14h14"/><path d="M24 30c8 0 10 14 18 14h14"/>
   <path d="M50 24l6 6-6 6"/><path d="M50 38l6 6-6 6"/></g>
  <text x="99" y="41" text-anchor="middle" font-family="'JetBrains Mono',monospace" font-weight="700" font-size="13" fill="url(#rr${uid})">×1</text></svg>`,
 coupon:uid=>`<svg viewBox="0 0 120 72">
  <defs><linearGradient id="cp${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffefb0"/><stop offset="1" stop-color="#b98a1e"/></linearGradient></defs>
  <path d="M112 14H20l-6 5.5 6 5.5-6 5.5 6 5.5-6 5.5 6 5.5-6 5.5 6 5.6h92Z" fill="#141208" stroke="url(#cp${uid})" stroke-width="2.5"/>
  <path d="M28 21h78v30H28Z" fill="none" stroke="url(#cp${uid})" stroke-opacity=".4" stroke-dasharray="4 3"/>
  <text x="67" y="45" text-anchor="middle" font-family="'Archivo Black',sans-serif" font-size="22" fill="url(#cp${uid})">-50%</text></svg>`,
 plaque:uid=>`<svg viewBox="0 0 96 96">
  <defs><linearGradient id="pl${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffefb0"/><stop offset=".5" stop-color="#f5c044"/><stop offset="1" stop-color="#8a6a1d"/></linearGradient></defs>
  <path d="M20 6h56l14 14v56L76 90H20L6 76V20Z" fill="#121317" stroke="url(#pl${uid})" stroke-width="4"/>
  <path d="M24 12h48l10 10v52L72 84H24L12 72V22Z" fill="none" stroke="#f5c044" stroke-opacity=".4"/>
  <g transform="translate(30 16) scale(.55)">
   <path d="M9 14H23L34.5 44.5 32 52Z" fill="#1c1e24" stroke="url(#pl${uid})" stroke-width=".8"/>
   <path d="M55 14H41L32.4 37 42.2 37Z" fill="#5b000f" stroke="url(#pl${uid})" stroke-width=".8"/></g>
  <rect x="22" y="74" width="52" height="9" fill="#0d0e11" stroke="#3a3f47"/>
  <text x="48" y="80.5" text-anchor="middle" font-family="'JetBrains Mono',monospace" font-weight="700" font-size="5.5" letter-spacing="1" fill="url(#pl${uid})">TEMPORADA 4</text></svg>`,
 titleR:uid=>`<svg viewBox="0 0 96 96">
  <defs><linearGradient id="tR${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2f4f7"/><stop offset=".55" stop-color="#c9cfd7"/><stop offset="1" stop-color="#7d8590"/></linearGradient></defs>
  <path d="M8 32h80l-8 14 8 14H8Z" fill="url(#tR${uid})"/>
  <path d="M15 37h66l-6 9 6 9H15Z" fill="none" stroke="#4a4f57"/>
  <text x="48" y="50.5" text-anchor="middle" font-family="'Archivo Black',sans-serif" font-size="10" letter-spacing=".5" fill="#12141a">RETADOR</text></svg>`,
 titleA:uid=>`<svg viewBox="0 0 96 96">
  <defs><linearGradient id="tA${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffefb0"/><stop offset=".55" stop-color="#f5c044"/><stop offset="1" stop-color="#8a6a1d"/></linearGradient></defs>
  <path d="M40 24l3-9 5 6 5-6 3 9Z" fill="url(#tA${uid})"/>
  <path d="M12 36h72l-7 13 7 13H12Z" fill="url(#tA${uid})"/>
  <path d="M19 41h58l-5 8 5 8H19Z" fill="none" stroke="#6b521a"/>
  <path d="M14 44l-5 5 5 5M82 44l5 5-5 5" stroke="url(#tA${uid})" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  <text x="48" y="53" text-anchor="middle" font-family="'Archivo Black',sans-serif" font-size="9" letter-spacing=".4" fill="#1a1406">ASCENDIDO</text></svg>`,
 bananim:uid=>`<svg viewBox="0 0 120 72">
  <defs><linearGradient id="ba${uid}" gradientUnits="userSpaceOnUse" x1="-60" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#ff0d2e" stop-opacity="0"/><stop offset=".5" stop-color="#ff0d2e" stop-opacity=".55"/><stop offset="1" stop-color="#ff0d2e" stop-opacity="0"/></linearGradient></defs>
  <rect width="120" height="72" fill="#0b0b0e" stroke="#3a3f47" stroke-width="2"/>
  <rect width="60" height="72" fill="url(#ba${uid})" opacity=".5"><animate attributeName="x" values="-60;120" dur="2.6s" repeatCount="indefinite"/></rect>
  <rect width="40" height="72" fill="url(#ba${uid})" opacity=".3"><animate attributeName="x" values="120;-40" dur="3.4s" repeatCount="indefinite"/></rect>
  <g transform="translate(42 16) scale(.56)">
   <path d="M9 14H23L34.5 44.5 32 52Z" fill="#e8ecef"/>
   <path d="M55 14H41L32.4 37 42.2 37Z" fill="#ff0d2e"/>
   <path d="M38.6 41H41L32 52l1.6-4.4Z" fill="#ff0d2e" opacity=".9"/></g>
  <rect width="120" height="3" fill="#fff" opacity=".12"><animate attributeName="y" values="0;69;0" dur="4s" repeatCount="indefinite"/></rect></svg>`
};

/* ================= LISTA DEL PASE ================= */
const PASS_REWARDS=[
 {lvl:1,prem:false,art:'titleR',rar:'comun',type:'TÍTULO',name:'Título: RETADOR',desc:'Placa de acero para tu perfil. El primer sello de todo jugador del circuito.'},
 {lvl:2,prem:false,art:'xp',v:'c',rar:'comun',type:'BOOST',xp:100,name:'Boost +100 XP',desc:'Cápsula de energía del circuito. Se acredita al instante en tu pase.'},
 {lvl:3,prem:true,art:'charm',rar:'legendario',type:'CHARM',name:'Charm: Mira Dorada',desc:'Colgante forjado en oro para tu arma favorita. Exclusivo de la pista premium.'},
 {lvl:4,prem:false,art:'card',rar:'raro',type:'TARJETA',name:'Tarjeta: FUNDICIÓN',desc:'Fondo de perfil con la marca de origen: brasas, acero y la V de ventaja.'},
 {lvl:5,prem:true,art:'reroll',rar:'epico',type:'UTILIDAD',name:'Reroll de fixture',desc:'Cambia el horario de una serie sin penalización. Ideal para imprevistos.'},
 {lvl:6,prem:false,art:'xp',v:'v',rar:'comun',type:'BOOST',xp:250,name:'Boost +250 XP',desc:'Cápsula violeta de alta carga. Sumá experiencia y subí de nivel más rápido.'},
 {lvl:7,prem:false,art:'patch',rar:'raro',type:'PARCHE',name:'Parche de equipo',desc:'Escudo bordado con el sello VANTS para la ficha de tu equipo.'},
 {lvl:8,prem:true,art:'titleA',rar:'legendario',type:'TÍTULO',name:'Título: ASCENDIDO',desc:'Placa de oro con corona. Se emite una sola vez por temporada.'},
 {lvl:9,prem:false,art:'xp',v:'r',rar:'comun',type:'BOOST',xp:400,name:'Boost +400 XP',desc:'La cápsula más potente de la pista gratis. Empuje directo al nivel final.'},
 {lvl:10,prem:true,art:'coupon',rar:'epico',type:'CUPÓN',name:'-50% inscripción',desc:'Cupón para un torneo PRO de la temporada. Se aplica al pagar el fee.'},
 {lvl:11,prem:true,art:'bananim',rar:'epico',type:'BANNER',name:'Banner animado',desc:'La V en movimiento con luces de arena. Se anima en tu ficha pública.'},
 {lvl:12,prem:true,art:'plaque',rar:'legendario',type:'PLACA',name:'Placa de temporada S4',desc:'La máxima condecoración del pase: oro, acero y el sello de la casa.'}
];

/* ================= ESTADO DEL PASE (persistente en la sesión) ================= */
Object.assign(state,{lvl:7,xp:1780,xpMax:2000,claimed:[]});
function passSave(){try{sessionStorage.setItem('vants_pass',JSON.stringify({lvl:state.lvl,xp:state.xp,xpMax:state.xpMax,claimed:state.claimed,owned:state.passOwned}))}catch(e){}}
function passLoad(){try{const s=JSON.parse(sessionStorage.getItem('vants_pass'));if(s){state.lvl=s.lvl;state.xp=s.xp;state.xpMax=s.xpMax;state.claimed=s.claimed||[];state.passOwned=!!s.owned;}}catch(e){}}
passLoad();

const rwKey=r=>r.lvl+(r.prem?'p':'f');
function rwState(r){
 const reached=state.lvl>=r.lvl, owned=!r.prem||state.passOwned;
 if(state.claimed.includes(rwKey(r)))return 'claimed';
 if(reached&&owned)return 'claimable';
 if(!owned)return 'locked';
 return 'unreached';
}

/* ================= RENDER DEL TRACK ================= */
function renderPass(){
 const pct=Math.min(100,state.xp/state.xpMax*100);
 $('#passLvl').textContent=state.lvl;
 $('#passNextLvl').textContent=state.lvl+1;
 $('#passXpTxt').textContent=state.xp.toLocaleString('en-US')+' / '+state.xpMax.toLocaleString('en-US')+' XP';
 $('#passXpBar').style.width=pct+'%';
 $('#passInv').textContent='RECOMPENSAS RECLAMADAS: '+state.claimed.length+' / '+PASS_REWARDS.length;
 const pb=$('#passBtn');
 if(pb){if(state.passOwned){pb.innerHTML=SVG_CHECK+'PASE PREMIUM ACTIVO';pb.disabled=true;}
  else{pb.innerHTML='<i data-lucide="ticket"></i>DESBLOQUEAR PREMIUM · $7.99';pb.disabled=false;}}
 $('#passTrack').innerHTML=PASS_REWARDS.map((r,i)=>{
  const st=rwState(r);
  const lane=prem=>r.prem===prem
    ?'<span class="bp-art r-'+r.rar+' '+st+'"><span class="bp-art-in">'+ART[r.art](r.lvl+(r.prem?'p':'f'),r)+'</span>'
      +(st==='claimable'?'<span class="bp-tag">RECLAMAR</span>':'')
      +(st==='locked'?'<span class="bp-lock"><i data-lucide="lock"></i></span>':'')
      +(st==='claimed'?'<span class="bp-check">'+SVG_CHECK+'</span>':'')
    +'</span>'
    :'<span class="bp-empty"></span>';
  return '<div class="bp-col'+(i===0?' first':'')+(i===PASS_REWARDS.length-1?' last':'')+'" style="--rar:'+RAR[r.rar].c+'">'
   +'<div class="bp-cell" data-i="'+i+'">'+lane(true)+'</div>'
   +'<div class="bp-node'+(state.lvl>=r.lvl?' reached':'')+(r.lvl===state.lvl?' now':'')+'">'+r.lvl+'</div>'
   +'<div class="bp-cell" data-i="'+i+'">'+lane(false)+'</div></div>';
 }).join('');
 icons();
}
 $('#passTrack').addEventListener('click',e=>{
 const c=e.target.closest('.bp-cell');if(!c||c.querySelector('.bp-empty'))return;
 openReward(+c.dataset.i);
});

/* ================= EXHIBICIÓN + RECLAMO ================= */
function openReward(i){
 const r=PASS_REWARDS[i],st=rwState(r),R=RAR[r.rar];
 let cta;
 if(st==='claimable')cta='<button class="btn btn-cut" id="rwClaim"><i data-lucide="gift"></i>RECLAMAR RECOMPENSA</button>';
 else if(st==='claimed')cta='<button class="btn btn-ghost" disabled>'+SVG_CHECK+'RECLAMADO</button>';
 else if(st==='locked')cta='<button class="btn btn-cut" id="rwUnlock"><i data-lucide="lock"></i>DESBLOQUEAR PREMIUM · $7.99</button>';
 else cta='<p class="rw-wait">Alcanzá el nivel '+r.lvl+' para reclamar'+(r.prem?' con el pase premium activo':'')+'.</p>';
 openModal('<div class="rw-stage" style="--rar:'+R.c+'"><div class="rw-big">'+ART[r.art]('m'+i,r)+'</div></div>'
  +'<div class="mc-body"><h3 class="rw-name">'+r.name+'</h3>'
  +'<div class="rw-chips"><span class="tag" style="border-color:'+R.c+';color:'+R.c+'">'+R.n+'</span><span class="tag">'+r.type+'</span><span class="tag">'+(r.prem?'PREMIUM':'GRATIS')+'</span><span class="tag">NIVEL '+r.lvl+'</span></div>'
  +'<p class="rw-desc">'+r.desc+'</p><div class="rw-cta">'+cta+'</div></div>');
 const cl=$('#rwClaim');if(cl)cl.onclick=()=>claimReward(i);
 const un=$('#rwUnlock');if(un)un.onclick=()=>openPassCheckout(()=>{renderPass();openReward(i);});
}
function claimReward(i){
 const r=PASS_REWARDS[i];
 state.claimed.push(rwKey(r));
 if(r.xp){state.xp+=r.xp;
  while(state.xp>=state.xpMax){state.xp-=state.xpMax;state.lvl++;state.xpMax=Math.round(state.xpMax*1.15/50)*50;levelFx();}}
 passSave();renderPass();openReward(i);
 toast(r.xp?'+'+r.xp+' XP acreditados al pase':'Recompensa reclamada: '+r.name);
}
function levelFx(){
 const el=$('#passLvl');if(el){el.classList.add('lvlup');setTimeout(()=>el.classList.remove('lvlup'),1300);}
 toast('¡SUBISTE AL NIVEL '+state.lvl+' DEL PASE!');
}

/* ================= CHECKOUT PREMIUM (reutilizable) ================= */
function openPassCheckout(after){
 openModal('<div class="mc-head"><h3>Pase Competitivo · Premium S4</h3><button class="d-x" id="mClose"><i data-lucide="x"></i></button></div><div class="mc-body">'
  +'<div class="mc-sum"><span>Pase Premium Temporada 4</span><span>ÚNICO</span></div>'
  +'<div class="mc-sum"><span>Charm dorado, banner animado y placa S4</span><span style="color:var(--accent)">INCLUIDO</span></div>'
  +'<div class="mc-total"><span>TOTAL HOY</span><b>$7.99</b></div>'
  +'<button class="btn btn-cut" id="payBtn"><i data-lucide="credit-card"></i>DESBLOQUEAR · $7.99</button>'
  +'<p class="mono" style="margin-top:14px;font:500 10px/1.7 var(--mono);color:var(--dim);text-align:center">Pago único · simulado, sin cargo real</p></div>');
 $('#mClose').onclick=closeModal;
 $('#payBtn').onclick=e=>processPay(e.currentTarget,()=>{
  state.passOwned=true;passSave();renderPass();
  toast('Pase Premium S4 activado — pista premium desbloqueada');
  if(after)after();
 });
}
 $('#passBtn').addEventListener('click',()=>openPassCheckout());

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
  const b=e.currentTarget;b.disabled=true;b.innerHTML='<span class="spin"></span>ENVIANDO…';
  setTimeout(()=>{b.innerHTML=SVG_CHECK+'SOLICITUD ENVIADA';toast('Tu solicitud al programa de socios quedó en revisión','info');},1200);
});
function openPlanCheckout(plan){
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
    +'<p class="mono" style="margin-top:14px;font:500 10px/1.7 var(--mono);color:var(--dim);text-align:center">Renovación automática · simulado, sin cargo real</p></div>');
  $('#mClose').onclick=closeModal;
  $('#payBtn').onclick=e=>processPay(e.currentTarget,()=>activatePlan(plan));
}
function activatePlan(plan){
  if(plan==='pro'){state.isPro=true;addBadge('pro');addBadge('streamer');successBadge('VANTS PRO','Tu insignia PRO quedó emitida y es visible en tu perfil, brackets y rankings. Incluye la insignia STREAMER.','pro');}
  else{state.isPro=true;addBadge('pro');addBadge('creator');addBadge('streamer');
    successBadge('VANTS CREATOR','Insignia CREADOR activa. Cuando transmitás en Twitch, Kick o YouTube, tu cartel EN DIRECTO aparece en la sala de jugadores. Incluye la insignia STREAMER.','creator');}
  document.body.classList.add('has-plan');
  const pb=$('#proBadge');pb.innerHTML='<i data-lucide="'+(plan==='creator'?'play':'zap')+'"></i>'+(plan==='creator'?'CREATOR':'PRO');
  renderLbHead();renderLbBody();renderAccount();icons();
  vantsDiscord('membresia',{user:me.name,plan});
}
function successBadge(title,txt,badge){
  openModal('<div class="success"><div class="ok">'+SVG_CHECK+'</div><h4>Bienvenido a '+title+'</h4><p>'+txt+'</p><div class="badge-reveal">'+badgeChip(badge,true)+'</div></div>');
  toast('Membresía activada: insignia emitida');
}

/* ================= RAIL EN DIRECTO ================= */
function renderRail(){
  const list=PROFILES.filter(p=>p.live).map(p=>({name:p.name,id:p.id,rank:p.rank,me:false,...p.live}));
  if(me.live&&me.badges.includes('creator'))list.unshift({name:me.name,me:true,platform:'twitch',viewers:312,title:'MI PRIMERA TRANSMISIÓN VANTS',rank:me.rank,sub:me.sub});
  $('#liveRail').innerHTML=list.map(p=>{
    const k=p.me?me.rank:p.rank,pl=PLAT[p.platform];
    return '<div class="rail-card" style="--plc:'+pl.c+'" data-live="'+(p.me?'me':p.id)+'">'
      +'<div class="rc-top">'+platIc(p.platform)
      +'<div class="rc-info"><div class="rc-name">'+p.name+(p.me?' <span style="font:600 8px/1 var(--mono);color:var(--grn)">VOS</span>':'')
      +'<span class="live-chip"><i data-lucide="radio"></i>EN DIRECTO</span></div>'
      +'<p class="rc-title">'+p.title+'</p></div></div>'
      +'<div class="rc-foot"><span class="rc-view"><i data-lucide="eye"></i><b data-viewers>'+p.viewers.toLocaleString('en-US')+'</b></span>'
      +'<span class="rc-game">'+(state.game==='valorant'?'VALORANT':'CS2')+'</span></div></div>';
  }).join('');
  icons();
}
 $('#liveRail').addEventListener('click',e=>{
  const c=e.target.closest('.rail-card');if(!c)return;
  const name=c.dataset.live==='me'?me.name:PROFILES.find(p=>p.id===c.dataset.live).name;
  toast('Abriendo canal de '+name+'… (demo)','info');
});
setInterval(()=>{
  PROFILES.forEach(p=>{if(p.live)p.live.viewers=Math.max(50,Math.round(p.live.viewers*(1+(Math.random()-.48)*.04)));});
  $$('#liveRail [data-viewers]').forEach((el,i)=>{
    const list=PROFILES.filter(p=>p.live);
    const p=list[i-(me.live&&me.badges.includes('creator')?1:0)];
    if(p)el.textContent=p.live.viewers.toLocaleString('en-US');});
},4000);

/* ================= GRID DE PERFILES ================= */
function renderProfileGrid(){
  $('#profileGrid').innerHTML=PROFILES.map(p=>{
    const rc=RANKS[p.rank];
    return '<div class="pcard" style="--rc:'+rc.c1+'" onclick="openProfile(\''+p.id+'\')">'
      +'<div class="pc-banner" >'+rankSVG(p.rank,64,'remblem')+(p.live?'<span class="live-chip"><i data-lucide="radio"></i>EN DIRECTO</span>':'')+'</div>'
      +'<div class="pc-body"><span class="ava s1" style="--rc:'+rc.c1+'">'+p.name.slice(0,2)+'</span>'
      +'<div class="pc-name">'+p.name+'<small>'+p.country+'</small></div>'
      +'<div class="pc-badges">'+(p.badges.length?p.badges.map(b=>badgeChip(b)).join(''):'<span style="font:500 9px/1 var(--mono);color:var(--dim)">SIN INSIGNIAS — PLAN FREE</span>')+'</div>'
      +'<div class="pc-rank">'+rankSVG(p.rank,30)+'<div class="rk-name">'+rc.name+' '+p.sub+'<small>VANTS RANKED</small></div><span class="rr mono">'+p.rr+' RR</span></div>'
      +'</div></div>';
  }).join('');icons();
}
 $('#meStripBtn').addEventListener('click',()=>openProfile('me'));
 $('#accBtn').addEventListener('click',()=>openProfile('me'));

/* ================= DRAWER DE PERFIL ================= */
function platRow(k,handle,own){
  const p=PLAT[k],connected=!!handle;
  return '<div class="plat-row'+(connected?'':' off')+'" style="--pc:'+p.c+'">'
    +platIc(k)
    +'<div class="plat-info"><b>'+p.n+'</b><small>'+(p.k==='game'?'CUENTA DE JUEGO':'RED SOCIAL')+' · '+(connected?handle:'NO CONECTADA')+'</small></div>'
    +(connected
      ?(own?'<button class="plat-x" onclick="disconnect(\''+k+'\')" title="Desconectar"><i data-lucide="x"></i></button>':'')
        +'<span class="plat-state">'+SVG_CHECK.replace('<svg','<svg width="12" height="12"')+'CONECTADO</span>'
      :(own?'<button class="plat-connect" onclick="connect(\''+k+'\')">CONECTAR</button>':'<span class="mono" style="font:600 9px/1 var(--mono);color:var(--dim)">—</span>'))
    +'</div>';
}
window.disconnect=k=>{delete me.socials[k];delete me.game[k];toast('Cuenta desconectada: '+PLAT[k].n,'info');openProfile('me');};
window.connect=k=>{
  const btns=$$('.plat-connect');const btn=btns.find?btns.find(b=>b.onclick===null):null;
  toast('Conectando '+PLAT[k].n+'…','info');
  setTimeout(()=>{
    const h=k==='riot'?me.name+'#VNTS':k==='steam'?'STEAM:7656'+Math.floor(Math.random()*1e6):'@'+me.name.toLowerCase().replace(/\s/g,'');
    if(PLAT[k].k==='game')me.game[k]=h;else me.socials[k]=h;
    toast(PLAT[k].n+' conectado: '+h);
    openProfile('me');
  },900);
};
/* [OBSOLETA] esta version esta sustituida mas abajo en este archivo; edita siempre la ultima */
function openProfile(id){
  const p=id==='me'?me:PROFILES.find(x=>x.id===id);
  const own=id==='me';
  const rc=RANKS[p.rank],sub=p.sub||(own?'II':'');
  const allKeys=['twitch','kick','youtube','tiktok','x','riot','steam','faceit'];
  const getH=k=>own?(me.socials[k]||me.game[k]):(p.socials[k]||p.game[k]);
  const badges=own?me.badges:p.badges;
  const stats=own?{m:64,wr:48,rtg:1.02,kd:.99}:p.stats;
  const isCreator=badges.includes('creator')||badges.includes('partner');
  const nextRR=own?Math.max(0,200-p.rr):0;

  openDrawer(
    '<div class="d-head"><span class="kicker">/// '+(own?'MI PERFIL':'PERFIL DE JUGADOR')+'</span><button class="d-x" onclick="closeDrawer()"><i data-lucide="x"></i></button></div>'
    +'<div class="d-body" style="--rc:'+rc.c1+'">'
    +'<div class="pf-banner">'+rankSVG(p.rank,92,'remblem')+(p.live||own&&me.live?'<span class="live-chip"><i data-lucide="radio"></i>EN DIRECTO · '+(p.live?p.live.viewers.toLocaleString('en-US'):'312')+' VIENDO</span>':'')+'</div>'
    +'<div class="pf-head"><span class="ava s2" style="--rc:'+rc.c1+'">'+p.name.slice(0,2)+'<span class="lv">NIV '+p.lvl+'</span></span>'
      +'<div class="pf-id"><div class="pf-name">'+(own?'<span id="myName">'+p.name+'</span><button class="edit" onclick="editName()" title="Editar nick"><i data-lucide="pencil"></i></button>':p.name)
      +'</div><p class="pf-sub">'+p.country+(p.team?' · '+p.team:' · SIN EQUIPO')+' · MIEMBRO DESDE 2024</p></div></div>'
    +'<div class="pf-badges">'+(badges.length?badges.map(b=>badgeChip(b)).join(''):'<span class="mono" style="font:500 10px/1.6 var(--mono);color:var(--dim)">Todavía no tenés insignias. Activá un plan o verificá tu identidad para emitir la primera.</span>')+'</div>'
    +'<p class="pf-bio">'+p.bio+'</p>'
    +'<div class="pf-stats"><div><b>'+stats.m+'</b><span>PARTIDOS</span></div><div><b>'+stats.wr+'%</b><span>WINRATE</span></div><div><b>'+stats.rtg.toFixed(2)+'</b><span>RATING</span></div><div><b>'+stats.kd.toFixed(2)+'</b><span>K/D</span></div></div>'
    +'<p class="d-sec">RANGO VANTS RANKED</p>'
    +'<div class="pf-rank">'+rankSVG(p.rank,64)
      +'<div class="info"><b>'+rc.name+' '+sub+'</b><small>PICO DE TEMPORADA: '+p.peak+'</small>'
      +(own?'<div class="rr-bar"><i style="width:'+(p.rr/2)+'%;background:'+rc.c1+'"></i></div>':'<div class="rr-bar"><i style="width:'+(p.rr/7)+'%;background:'+rc.c1+'"></i></div>')+'</div>'
      +'<div class="rr-num">'+p.rr+'<small>RR'+(own?'<br>FALTAN '+nextRR+' PARA SUBIR':'')+'</small></div></div>'
    +'<p class="d-sec">CUENTAS CONECTADAS</p><div class="plat-list">'+allKeys.map(k=>platRow(k,getH(k),own)).join('')+'</div>'
    +(own&&isCreator
      ?'<div class="switch-row"><p><b style="color:var(--text)">Modo EN DIRECTO (demo)</b><br>Así se ve tu perfil cuando estás transmitiendo. Solo creadores y socios lo activan.</p><span class="sw'+(me.live?' on':'')+'" onclick="toggleLive(this)"></span></div>':'')
    +'<div class="pf-actions">'
      +(own
        ?(me.badges.includes('creator')?'':'<button class="btn btn-cut" onclick="document.getElementById(\'pro\').scrollIntoView({behavior:\'smooth\'});closeDrawer()"><i data-lucide="crown"></i>OBTENER INSIGNIA CON UN PLAN</button>')
        :'<button class="btn btn-cut" id="followBtn"><i data-lucide="user-plus"></i>SEGUIR</button><button class="btn btn-ghost" onclick="toast(\'Abriendo canal de '+p.name+'…\',\'info\')"><i data-lucide="external-link"></i>CANALES</button>')
      +'</div>'
    +(p.live?'<p class="d-sec">TRANSMISIÓN ACTIVA</p><div class="rail-card" style="--plc:'+PLAT[p.live.platform].c+';cursor:pointer;max-width:100%" onclick="toast(\'Abriendo stream de '+p.name+'…\',\'info\')"><div class="rc-top">'+platIc(p.live.platform)+'<div class="rc-info"><div class="rc-name">'+p.name+'<span class="live-chip"><i data-lucide="radio"></i>EN DIRECTO</span></div><p class="rc-title">'+p.live.title+'</p></div></div><div class="rc-foot"><span class="rc-view"><i data-lucide="eye"></i><b>'+p.live.viewers.toLocaleString('en-US')+'</b></span><span class="rc-game">VER STREAM</span></div></div>':'')
    +'</div>');
  const fb=$('#followBtn');
  if(fb)fb.onclick=()=>{fb.innerHTML=SVG_CHECK+'SIGUIENDO';fb.disabled=true;toast('Ahora seguís a '+p.name);};
  icons();
}
window.editName=()=>{
  const span=$('#myName');
  span.outerHTML='<input id="nameInput" value="'+me.name+'" maxlength="14">';
  const inp=$('#nameInput');inp.focus();inp.select();
  inp.onkeydown=e=>{if(e.key==='Enter')inp.blur();};
  inp.onblur=()=>{const v=inp.value.trim().toUpperCase().replace(/["'<>\\]/g,'');if(v)me.name=v;renderAccount();openProfile('me');toast('Nick actualizado: '+me.name);};
};
window.toggleLive=el=>{
  me.live=!me.live;el.classList.toggle('on',me.live);
  if(me.live)vantsDiscord('live',{user:me.name,title:'Ranked + torneos VANTS'});
  renderAccount();renderRail();
  toast(me.live?'Cartel EN DIRECTO activado — tu perfil aparece en la sala de jugadores':'Cartel EN DIRECTO desactivado','info');
};

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

/* ================= CAMBIO DE JUEGO ================= */
function renderAll(){
  const d=D();
  document.body.dataset.game=state.game;
  renderTicker();
  $('#heroTitle').innerHTML=d.title;
  $('#heroSub').textContent=d.sub;
  $('#gbNext').innerHTML='<b>'+d.short+'</b>CIERRE DE INSCRIPCIÓN EN 3D 14H';
  $('#liveNameA').textContent=d.live.a;$('#liveNameB').textContent=d.live.b;
  $('#liveTagA').textContent=d.live.ta;$('#liveTagB').textContent=d.live.tb;
  $('#liveEvent').textContent=d.live.ev;
  renderMatches();renderLbHead();renderLbBody();renderBracket();renderTournaments();renderPass();renderRail();
  icons();
}
 $$('.gbtn').forEach(b=>b.addEventListener('click',()=>{
  if(state.game===b.dataset.game)return;
  state.game=b.dataset.game;
  $$('.gbtn').forEach(x=>x.classList.toggle('on',x===b));
  live.a=4;live.b=3;live.done=false;live.feed=[];live.mapIdx=0;
  renderAll();renderLive();
}));

/* ================= INIT ================= */
const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}}),{threshold:.08});
 $$('.reveal').forEach(el=>io.observe(el));
renderRanks();renderProfileGrid();renderAccount();renderAll();renderLive();
setInterval(tickLive,2600);
if(!sessionStorage.getItem('vants_film')){sessionStorage.setItem('vants_film','1');setTimeout(openCin,700);}

/* ================= FOTO DE PERFIL + DISCORD ================= */
PICON.discord='<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.32 4.37a19.8 19.8 0 0 0-4.93-1.51 13.8 13.8 0 0 0-.64 1.28 18.3 18.3 0 0 0-5.5 0 12.6 12.6 0 0 0-.64-1.28c-1.71.29-3.37.8-4.93 1.51A20.3 20.3 0 0 0 .1 18.06a19.9 19.9 0 0 0 6.07 3.06c.49-.66.93-1.37 1.3-2.1a12.9 12.9 0 0 1-2.05-.98c.17-.12.34-.25.5-.38a14.2 14.2 0 0 0 12.16 0c.17.13.33.26.5.38-.65.38-1.34.71-2.05.98.37.73.8 1.44 1.3 2.1a19.8 19.8 0 0 0 6.07-3.06 20.2 20.2 0 0 0-3.58-13.69ZM8.02 15.33c-1.18 0-2.16-1.08-2.16-2.42 0-1.33.95-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.95 2.42-2.16 2.42Zm7.96 0c-1.18 0-2.16-1.08-2.16-2.42 0-1.33.95-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.96 2.42-2.16 2.42Z"/></svg>';
PLAT.discord={n:'DISCORD',c:'#5865F2',k:'social'};

me.avatar=me.avatar||null; me.discordTag=me.discordTag||null;

/* persistencia del perfil (sobrevive al cierre del navegador) */
function meSave(){try{localStorage.setItem('vants_me',JSON.stringify({name:me.name,avatar:me.avatar,discordTag:me.discordTag,socials:me.socials,game:me.game,live:me.live}))}catch(e){}}
function meLoad(){try{const s=JSON.parse(localStorage.getItem('vants_me')||'null');if(s)Object.assign(me,s)}catch(e){}}

/* subida de foto: recorta al centro y redimensiona a 256px */
function fileToAvatar(file,cb){
  const rd=new FileReader();
  rd.onload=()=>{const img=new Image();img.onload=()=>{
    const c=document.createElement('canvas');c.width=c.height=256;
    const x=c.getContext('2d');const s=Math.min(img.width,img.height);
    x.drawImage(img,(img.width-s)/2,(img.height-s)/2,s,s,0,0,256,256);
    cb(c.toDataURL('image/jpeg',.85));};img.src=rd.result;};
  rd.readAsDataURL(file);
}
function pickAvatar(){
  const inp=document.createElement('input');inp.type='file';inp.accept='image/*';
  inp.onchange=()=>{const f=inp.files[0];if(!f)return;
    fileToAvatar(f,uri=>{me.avatar=uri;meSave();renderAccount();openProfile('me');toast('Foto de perfil actualizada');});};
  inp.click();
}
function removeAvatar(){me.avatar=null;meSave();renderAccount();openProfile('me');toast('Foto de perfil eliminada','info');}
window.pickAvatar=pickAvatar;window.removeAvatar=removeAvatar;

/* avatar "de Discord" generado localmente para la demo */
function discordAvatar(seed){
  const h=Math.floor(Math.random()*360);
  const init=(seed||'V').replace(/[^A-Za-z0-9]/g,'').slice(0,2).toUpperCase()||'V';
  const svg="<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256'>"
   +"<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>"
   +"<stop offset='0' stop-color='hsl("+h+",72%,64%)'/><stop offset='1' stop-color='hsl("+((h+50)%360)+",78%,34%)'/></linearGradient></defs>"
   +"<rect width='256' height='256' fill='url(#g)'/>"
   +"<circle cx='210' cy='40' r='70' fill='#fff' opacity='.12'/><circle cx='30' cy='230' r='90' fill='#000' opacity='.18'/>"
   +"<text x='128' y='168' text-anchor='middle' font-family='Arial Black,Arial' font-weight='900' font-size='96' fill='#fff'>"+init+"</text></svg>";
  return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
}

/* pantalla de consentimiento estilo Discord (demo) */
function openDiscordOAuth(){
  const DL='<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.32 4.37a19.8 19.8 0 0 0-4.93-1.51 13.8 13.8 0 0 0-.64 1.28 18.3 18.3 0 0 0-5.5 0 12.6 12.6 0 0 0-.64-1.28c-1.71.29-3.37.8-4.93 1.51A20.3 20.3 0 0 0 .1 18.06a19.9 19.9 0 0 0 6.07 3.06c.49-.66.93-1.37 1.3-2.1a12.9 12.9 0 0 1-2.05-.98c.17-.12.34-.25.5-.38a14.2 14.2 0 0 0 12.16 0c.17.13.33.26.5.38-.65.38-1.34.71-2.05.98.37.73.8 1.44 1.3 2.1a19.8 19.8 0 0 0 6.07-3.06 20.2 20.2 0 0 0-3.58-13.69ZM8.02 15.33c-1.18 0-2.16-1.08-2.16-2.42 0-1.33.95-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.95 2.42-2.16 2.42Zm7.96 0c-1.18 0-2.16-1.08-2.16-2.42 0-1.33.95-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.96 2.42-2.16 2.42Z"/></svg>';
  openModal('<div class="dc">'
   +'<div class="dc-head"><svg class="dc-logo" viewBox="0 0 24 24" fill="currentColor"><path d="M20.32 4.37a19.8 19.8 0 0 0-4.93-1.51 13.8 13.8 0 0 0-.64 1.28 18.3 18.3 0 0 0-5.5 0 12.6 12.6 0 0 0-.64-1.28c-1.71.29-3.37.8-4.93 1.51A20.3 20.3 0 0 0 .1 18.06a19.9 19.9 0 0 0 6.07 3.06c.49-.66.93-1.37 1.3-2.1a12.9 12.9 0 0 1-2.05-.98c.17-.12.34-.25.5-.38a14.2 14.2 0 0 0 12.16 0c.17.13.33.26.5.38-.65.38-1.34.71-2.05.98.37.73.8 1.44 1.3 2.1a19.8 19.8 0 0 0 6.07-3.06 20.2 20.2 0 0 0-3.58-13.69ZM8.02 15.33c-1.18 0-2.16-1.08-2.16-2.42 0-1.33.95-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.95 2.42-2.16 2.42Zm7.96 0c-1.18 0-2.16-1.08-2.16-2.42 0-1.33.95-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.96 2.42-2.16 2.42Z"/></svg>'
   +'<div><b>Conectar con Discord</b><span>vants.games quiere acceder a tu cuenta</span></div></div>'
   +'<ul class="dc-scopes">'
   +'<li><i data-lucide="user"></i>Ver tu nombre de usuario, apodo e identificador</li>'
   +'<li><i data-lucide="image"></i>Usar tu avatar de Discord como foto de perfil en VANTS</li></ul>'
   +'<p class="dc-note">DEMO — el consentimiento se simula localmente. En producción: Discord OAuth2 con scope <code>identify</code>.</p>'
   +'<div class="dc-actions"><button class="dc-btn ghost" id="dcCancel">Cancelar</button>'
   +'<button class="dc-btn" id="dcAuth">'+DL+'Autorizar</button></div></div>');
  $('#dcCancel').onclick=closeModal;
  $('#dcAuth').onclick=e=>{
    const b=e.currentTarget;b.disabled=true;
    b.innerHTML='<span class="spin" style="border-color:rgba(255,255,255,.3);border-top-color:#fff"></span>Conectando…';
    setTimeout(()=>{
      const base=(me.name.toLowerCase().replace(/[^a-z0-9_]/g,'')||'jugador');
      me.discordTag=base+'#'+(1000+Math.floor(Math.random()*9000));
      me.socials.discord=base+'_vnts';
      me.avatar=discordAvatar(me.name);           // foto sincronizada
      me.name=base;                                // nombre sincronizado
      meSave();renderAccount();
      openModal('<div class="dc" style="text-align:center">'
        +'<div style="width:84px;height:84px;margin:6px auto 16px;clip-path:polygon(29% 0,71% 0,100% 29%,100% 71%,71% 100%,29% 100%,0 71%,0 29%);overflow:hidden"><img src="'+me.avatar+'" style="width:100%;height:100%;object-fit:cover"></div>'
        +'<h3 style="font:800 18px/1.2 var(--sans);color:#f2f3f5;margin-bottom:8px">¡Cuenta sincronizada!</h3>'
        +'<p style="font:500 12px/1.7 var(--sans);color:#b5bac1">Tu nombre, tag y foto ahora vienen de Discord.<br><span class="dc-tag" style="font-size:12px">'+me.discordTag+'</span></p>'
        +'<div class="dc-actions" style="margin-top:22px"><button class="dc-btn ghost" id="dcClose">Cerrar</button><button class="dc-btn" id="dcView">Ver mi perfil</button></div></div>');
      $('#dcClose').onclick=closeModal;
      $('#dcView').onclick=()=>{closeModal();openProfile('me');};
      toast('Perfil sincronizado con Discord');
    },1300);
  };
}
window.syncDiscord=function(){
  toast('Sincronizando con Discord…','info');
  setTimeout(()=>{me.avatar=discordAvatar(me.name);meSave();renderAccount();openProfile('me');toast('Foto y nombre sincronizados desde Discord');},1000);
};

/* conectar / desconectar (Discord tiene flujo propio) */
/* [OBSOLETA] esta version esta sustituida mas abajo en este archivo; edita siempre la ultima */
window.connect=function(k){
  if(k==='discord'){openDiscordOAuth();return;}
  toast('Conectando '+PLAT[k].n+'…','info');
  setTimeout(()=>{
    const h=k==='riot'?me.name.toUpperCase()+'#VNTS':k==='steam'?'STEAM:7656'+Math.floor(Math.random()*1e6):'@'+me.name.toLowerCase().replace(/\s/g,'');
    if(PLAT[k].k==='game')me.game[k]=h;else me.socials[k]=h;
    meSave();toast(PLAT[k].n+' conectado: '+h);openProfile('me');
  },900);
};
/* [OBSOLETA] esta version esta sustituida mas abajo en este archivo; edita siempre la ultima */
window.disconnect=function(k){delete me.socials[k];delete me.game[k];meSave();toast('Cuenta desconectada: '+PLAT[k].n,'info');openProfile('me');};

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

/* editor de nick con guardado */
/* [OBSOLETA] esta version esta sustituida mas abajo en este archivo; edita siempre la ultima */
window.editName=function(){
  const span=$('#myName');
  span.outerHTML='<input id="nameInput" value="'+me.name+'" maxlength="14">';
  const inp=$('#nameInput');inp.focus();inp.select();
  inp.onkeydown=e=>{if(e.key==='Enter')inp.blur();};
  inp.onblur=()=>{const v=inp.value.trim().toUpperCase().replace(/["'<>\\]/g,'');if(v)me.name=v;meSave();renderAccount();openProfile('me');toast('Nick actualizado: '+me.name);};
};

/* perfil completo (reemplaza al anterior) */
const avaIn=(p,own)=>(own&&me.avatar)?'<img alt="" src="'+me.avatar+'">':p.name.slice(0,2);
function openProfile(id){
  const p=id==='me'?me:PROFILES.find(x=>x.id===id);
  const own=id==='me';
  const rc=RANKS[p.rank],sub=p.sub||(own?'II':'');
  const allKeys=['discord','twitch','kick','youtube','tiktok','x','riot','steam','faceit'];
  const getH=k=>own?(me.socials[k]||me.game[k]):(p.socials[k]||p.game[k]);
  const badges=own?me.badges:p.badges;
  const stats=own?{m:64,wr:48,rtg:1.02,kd:.99}:p.stats;
  const isCreator=badges.includes('creator')||badges.includes('partner');
  const nextRR=own?Math.max(0,200-p.rr):0;
  openDrawer(
    '<div class="d-head"><span class="kicker">/// '+(own?'MI PERFIL':'PERFIL DE JUGADOR')+'</span><button class="d-x" onclick="closeDrawer()"><i data-lucide="x"></i></button></div>'
    +'<div class="d-body" style="--rc:'+rc.c1+'">'
    +'<div class="pf-banner">'+rankSVG(p.rank,92,'remblem')+(p.live||(own&&me.live)?'<span class="live-chip"><i data-lucide="radio"></i>EN DIRECTO · '+((p.live&&p.live.viewers)||312).toLocaleString('en-US')+' VIENDO</span>':'')+'</div>'
    +'<div class="pf-head">'
      +'<span class="ava s2 '+(own?'ava-pick':'')+'" style="--rc:'+rc.c1+'"'+(own?' onclick="pickAvatar()" title="Subir foto de perfil"':'')+'>'
        +avaIn(p,own)+'<span class="lv">NIV '+p.lvl+'</span>'
        +(own?'<span class="ava-cam"><i data-lucide="camera"></i></span>':'')
      +'</span>'
      +'<div class="pf-id"><div class="pf-name">'+(own?'<span id="myName">'+p.name+'</span><button class="edit" onclick="editName()" title="Editar nick"><i data-lucide="pencil"></i></button>':p.name)+'</div>'
      +'<p class="pf-sub">'+p.country+(p.team?' · '+p.team:' · SIN EQUIPO')
        +(own&&me.discordTag?' · DC: <span style="color:#8ea1ff">'+me.discordTag+'</span>':'')
        +' · MIEMBRO DESDE 2024</p></div></div>'
    +'<div class="pf-badges">'+(badges.length?badges.map(b=>badgeChip(b)).join(''):'<span class="mono" style="font:500 10px/1.6 var(--mono);color:var(--dim)">Todavía no tenés insignias. Activá un plan o verificá tu identidad para emitir la primera.</span>')+'</div>'
    +'<p class="pf-bio">'+p.bio+'</p>'
    +'<div class="pf-stats"><div><b>'+stats.m+'</b><span>PARTIDOS</span></div><div><b>'+stats.wr+'%</b><span>WINRATE</span></div><div><b>'+stats.rtg.toFixed(2)+'</b><span>RATING</span></div><div><b>'+stats.kd.toFixed(2)+'</b><span>K/D</span></div></div>'
    +'<p class="d-sec">RANGO VANTS RANKED</p>'
    +'<div class="pf-rank">'+rankSVG(p.rank,64)
      +'<div class="info"><b>'+rc.name+' '+sub+'</b><small>PICO DE TEMPORADA: '+p.peak+'</small>'
      +'<div class="rr-bar"><i style="width:'+Math.min(100,(p.rr/(own?200:700))*100)+'%;background:'+rc.c1+'"></i></div></div>'
      +'<div class="rr-num">'+p.rr+'<small>RR'+(own?'<br>FALTAN '+nextRR+' PARA SUBIR':'')+'</small></div></div>'
    +'<p class="d-sec">CUENTAS CONECTADAS</p><div class="plat-list">'+allKeys.map(k=>platRow(k,getH(k),own)).join('')+'</div>'
    +(own&&me.socials.discord
      ?'<div class="dc-sync"><span class="plat-ic" style="--plc:#5865F2">'+PICON.discord+'</span><p><b style="color:var(--text)">Sincronización activa.</b><br>Tu foto y tu tag vienen de Discord.</p><button class="plat-connect" style="--pc:#5865F2" onclick="syncDiscord()">SINCRONIZAR</button></div>':'')
    +(own&&isCreator
      ?'<div class="switch-row"><p><b style="color:var(--text)">Modo EN DIRECTO (demo)</b><br>Así se ve tu perfil cuando transmitís. Solo creadores y socios lo activan.</p><span class="sw'+(me.live?' on':'')+'" onclick="toggleLive(this)"></span></div>':'')
    +'<div class="pf-actions">'
      +(own
        ?((me.avatar?'<button class="btn btn-ghost" style="flex:1;justify-content:center" onclick="removeAvatar()"><i data-lucide="trash-2"></i>QUITAR FOTO</button>':'')
          +(me.badges.includes('creator')?'':'<button class="btn btn-cut" style="flex:1;justify-content:center" onclick="document.getElementById(\'pro\').scrollIntoView({behavior:\'smooth\'});closeDrawer()"><i data-lucide="crown"></i>OBTENER INSIGNIA</button>'))
        :'<button class="btn btn-cut" id="followBtn" style="flex:1;justify-content:center"><i data-lucide="user-plus"></i>SEGUIR</button>')
      +'</div>'
    +(p.live?'<p class="d-sec">TRANSMISIÓN ACTIVA</p><div class="rail-card" style="--plc:'+PLAT[p.live.platform].c+';cursor:pointer" onclick="toast(\'Abriendo stream de '+p.name+'…\',\'info\')"><div class="rc-top">'+platIc(p.live.platform)+'<div class="rc-info"><div class="rc-name">'+p.name+'<span class="live-chip"><i data-lucide="radio"></i>EN DIRECTO</span></div><p class="rc-title">'+p.live.title+'</p></div></div><div class="rc-foot"><span class="rc-view"><i data-lucide="eye"></i><b>'+p.live.viewers.toLocaleString('en-US')+'</b></span><span class="rc-game">VER STREAM</span></div></div>':'')
    +'</div>');
  const fb=$('#followBtn');
  if(fb)fb.onclick=()=>{fb.innerHTML=SVG_CHECK+'SIGUIENDO';fb.disabled=true;toast('Ahora seguís a '+p.name);};
  icons();
}

/* aplicar perfil guardado */
meLoad();renderAccount();icons();

/* ====== PUENTE WEB → BOT DE DISCORD ======
   En la demo (archivo local) falla silenciosamente.
   Cuando sirvas la web desde vants-server/server.js, funciona real. */
function vantsDiscord(type, data){
  fetch('/api/discord/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, data })
  }).catch(()=>{}); // si no hay servidor, no rompe nada
}
