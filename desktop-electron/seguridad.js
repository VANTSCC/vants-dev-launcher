'use strict';
// ============================================================
// VANTS HUB · seguridad.js — validaciones del puente IPC (proceso principal)
// ------------------------------------------------------------
// Lógica PURA (sin Electron): la usa main.js y la prueban los tests
// (scripts/test_hub_seguridad.js). Principio: el renderer es contenido web,
// aunque hoy sea local y con CSP estricta. No se le confía QUÉ ejecutar, QUÉ
// abrir ni A QUÉ endpoint llamar con el token del usuario: main solo hace
// lo que él mismo detectó o lo que figura en estas listas.
// ============================================================

// ---- hub:abrir → shell.openExternal ---------------------------------
// Peligro de openExternal con una URL arbitraria: cualquier protocolo
// registrado en el sistema (file:, ms-msdt:, search-ms:, ssh:…) se ejecuta.
// Se permite solo lo que el HUB abre de verdad:
//   · https:// (páginas de VANTS, playvalorant.com…), sin credenciales
//   · steam://rungameid/<appid>
//   · com.epicgames.launcher://apps/<AppName>?action=launch&silent=true
const RE_CTRL_ESPACIO = /[\u0000-\u0020\u007f]/;
const RE_STEAM = /^steam:\/\/rungameid\/\d{1,12}$/;
const RE_EPIC = /^com\.epicgames\.launcher:\/\/apps\/[A-Za-z0-9._%-]{1,200}\?action=launch&silent=true$/;

function urlExternaPermitida(url) {
  if (typeof url !== 'string' || url.length < 1 || url.length > 2048) return false;
  if (RE_CTRL_ESPACIO.test(url)) return false;
  if (RE_STEAM.test(url) || RE_EPIC.test(url)) return true;
  // https: exige el prefijo literal 'https://' y ninguna barra invertida: el parser WHATWG normaliza
  // 'https:evil', 'https:/evil' o 'https:\\evil' a un host válido y el sistema operativo podría leerlos distinto.
  if (!/^https:\/\//i.test(url) || url.indexOf('\\') !== -1) return false;
  let u;
  try { u = new URL(url); } catch (e) { return false; }
  return u.protocol === 'https:' && !!u.hostname && !u.username && !u.password;
}

// ---- hub:api → REST de Neon con el token del usuario -----------------
// La frontera real es el RLS de la base; esto reduce lo que un renderer
// comprometido podría pedir. Las listas salen de lo que el renderer usa hoy
// y las vigila scripts/test_hub_seguridad.js (si el renderer llama a algo
// nuevo, el test falla hasta que se añada aquí a conciencia).
const TABLAS_API = new Set([
  'players', 'faceit_matches', 'series_ranked', 'season_player_stats', 'purchases', 'pass_progreso',
  'vants_links', 'mm_matches', 'mm_match_players', 'v_en_vivo', 'v_torneo_equipos', 'v_torneo_bracket'
]);
const RPC_API = new Set([
  'mm_encolar', 'mm_salir', 'mm_ticket_estado', 'mm_listo', 'mm_estado_ready', 'mm_anular_si_timeout',
  'mm_reportar', 'mm_historial_de', 'mm_invitar', 'mm_responder_invite', 'mm_invites_pendientes'
]);
const METODOS_API = new Set(['GET', 'POST', 'PATCH', 'DELETE']);
const RE_RUTA_API = /^\/([A-Za-z0-9_]+)(?:\/([A-Za-z0-9_]+))?(?:\?([^\s\\]*))?$/;
const RE_PREFER = /^[A-Za-z0-9=,_ -]{1,100}$/;

// → { ok:true, metodo } | { ok:false, error }
function validarPeticionApi(ruta, metodo, prefer) {
  const m = String(metodo == null ? 'GET' : metodo).toUpperCase();
  if (!METODOS_API.has(m)) return { ok: false, error: 'método no permitido' };
  if (typeof ruta !== 'string' || ruta.length > 2000 || RE_CTRL_ESPACIO.test(ruta)) return { ok: false, error: 'ruta inválida' };
  const r = RE_RUTA_API.exec(ruta);
  if (!r) return { ok: false, error: 'ruta inválida' };
  const base = r[1], sub = r[2];
  if (base === 'rpc') {
    if (!sub || !RPC_API.has(sub) || r[3] !== undefined) return { ok: false, error: 'función no permitida' };
    if (m !== 'POST') return { ok: false, error: 'las funciones solo se invocan con POST' };
  } else {
    if (!TABLAS_API.has(base) || sub !== undefined) return { ok: false, error: 'recurso no permitido' };
  }
  if (prefer != null && (typeof prefer !== 'string' || !RE_PREFER.test(prefer))) return { ok: false, error: 'cabecera no permitida' };
  return { ok: true, metodo: m };
}

// ---- hub:jugar → lanzar un juego ---------------------------------------
// El renderer solo dice CUÁL (id). El ejecutable, los argumentos y la URL los
// pone main a partir de su propia detección de biblioteca.
function idDeJuego(arg) {
  const v = (arg && typeof arg === 'object') ? arg.id : arg;      // acepta el objeto heredado, usa solo su id
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s.length >= 1 && s.length <= 200 ? s : null;
}

const RE_RIOT_EXE = /(^|[\\/])riotclientservices\.exe$/i;
const RE_RIOT_ARG = /^--launch-(product|patchline)=[A-Za-z0-9_]{1,32}$/;

// → { tipo:'proceso', exe, args } | { tipo:'url', url } | { error }
function resolverLanzamiento(biblioteca, id) {
  if (!id || !Array.isArray(biblioteca)) return { error: 'juego no encontrado' };
  const e = biblioteca.find((x) => x && String(x.id) === id);
  if (!e) return { error: 'juego no encontrado' };
  if (e.exe && Array.isArray(e.args)) {                              // Riot
    if (!RE_RIOT_EXE.test(String(e.exe))) return { error: 'lanzador no permitido' };
    if (!e.args.every((a) => typeof a === 'string' && RE_RIOT_ARG.test(a))) return { error: 'argumentos no permitidos' };
    return { tipo: 'proceso', exe: String(e.exe), args: e.args.slice() };
  }
  if (e.lanzar) {                                                    // steam:// o com.epicgames.launcher://
    if (!urlExternaPermitida(e.lanzar)) return { error: 'URL de lanzamiento no permitida' };
    return { tipo: 'url', url: e.lanzar };
  }
  return { error: 'sin vía de lanzamiento' };
}

module.exports = {
  urlExternaPermitida, validarPeticionApi, idDeJuego, resolverLanzamiento,
  TABLAS_API, RPC_API, METODOS_API
};
