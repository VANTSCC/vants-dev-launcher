/* ============================================================
   VANTS · plataforma-core.js
   ------------------------------------------------------------
   Lógica PURA de la plataforma de torneos (estilo strafe):
   validación de query, clasificación de estado, orden, paginación,
   formateo de fechas y render de la fila de torneo.
   · La importa el Worker (vants-server/worker.js) y la suite de
     pruebas (scripts/test_plataforma.js) → UNA sola fuente de verdad.
   · Sin dependencias, sin DOM real: renderiza strings con escape.
   ============================================================ */

export const ESTADOS_TORNEO = ['upcoming', 'ongoing', 'archive'];
export const ESTADOS_MATCH = ['live', 'upcoming', 'finished'];

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/* ---------------- VALIDACIÓN DE QUERY (server-side) ---------------- */

export function intDe(v, def, min, max) {
  const n = parseInt(String(v == null ? '' : v), 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

/** Valida query de /api/tournaments → { ok, estado, juego, region, pag, porPagina } | { ok:false, error } */
export function validarQueryTorneos(q) {
  const estado = String((q && q.estado) || 'upcoming').toLowerCase();
  if (!ESTADOS_TORNEO.includes(estado)) {
    return { ok: false, error: 'estado debe ser upcoming, ongoing o archive' };
  }
  const juego = String((q && q.juego) || '').toLowerCase().trim();
  if (juego && !/^[a-z0-9-]{2,24}$/.test(juego)) {
    return { ok: false, error: 'juego inválido' };
  }
  const region = String((q && q.region) || '').toUpperCase().trim();
  if (region && !/^[A-Z0-9]{2,8}$/.test(region)) {
    return { ok: false, error: 'región inválida' };
  }
  const pag = intDe(q && q.pag, 1, 1, 500);
  const porPagina = intDe(q && q.porPagina, 12, 1, 50);
  return { ok: true, estado, juego, region, pag, porPagina };
}

/** Valida query de /api/matches → { ok, estado, juego, pag, porPagina } | { ok:false, error } */
export function validarQueryMatches(q) {
  const estado = String((q && q.estado) || 'upcoming').toLowerCase();
  if (!ESTADOS_MATCH.includes(estado)) {
    return { ok: false, error: 'estado debe ser live, upcoming o finished' };
  }
  const juego = String((q && q.juego) || '').toLowerCase().trim();
  if (juego && !/^[a-z0-9-]{2,24}$/.test(juego)) {
    return { ok: false, error: 'juego inválido' };
  }
  const pag = intDe(q && q.pag, 1, 1, 500);
  const porPagina = intDe(q && q.porPagina, 12, 1, 50);
  return { ok: true, estado, juego, pag, porPagina };
}

/** Valida query de búsqueda: q requerido 2-64 chars, saneado. */
export function validarQueryBusqueda(q) {
  const texto = String((q && q.q) || '').trim().slice(0, 64);
  if (texto.length < 2) return { ok: false, error: 'q debe tener entre 2 y 64 caracteres' };
  if (/[%_;\\]/.test(texto)) return { ok: false, error: 'q contiene caracteres no permitidos' };
  return { ok: true, q: texto };
}

/* ---------------- CLASIFICACIÓN Y ORDEN ---------------- */

/** Estado canónico desde un status libre (compat con el sistema viejo). */
export function clasificarEstado(status) {
  const s = String(status || '').toLowerCase();
  if (/final|cerrad|complet|archiv|terminad|done/.test(s)) return 'archive';
  if (/abierto|open|ongoing|curso|activo|live|inscripc/.test(s)) return 'ongoing';
  return 'upcoming';
}

/** Orden de torneos: próximos/en curso por fecha asc; archivo desc. */
export function ordenarTorneos(items, estado) {
  const dir = estado === 'archive' ? -1 : 1;
  return [...items].sort((a, b) => {
    const ta = a.starts_at ? Date.parse(a.starts_at) : (a.day && a.mon ? 0 : Infinity);
    const tb = b.starts_at ? Date.parse(b.starts_at) : (b.day && b.mon ? 0 : Infinity);
    if (!Number.isFinite(ta) && !Number.isFinite(tb)) return 0;
    if (!Number.isFinite(ta)) return 1;  // sin fecha al final
    if (!Number.isFinite(tb)) return -1;
    return dir * (ta - tb);
  });
}

/** Orden de partidas: live desc (más recientes arriba), upcoming asc, finished desc. */
export function ordenarMatches(items, estado) {
  const dir = estado === 'upcoming' ? 1 : -1;
  return [...items].sort((a, b) => {
    const ta = a.empieza_at ? Date.parse(a.empieza_at) : Infinity;
    const tb = b.empieza_at ? Date.parse(b.empieza_at) : Infinity;
    if (!Number.isFinite(ta) && !Number.isFinite(tb)) return 0;
    if (!Number.isFinite(ta)) return 1;
    if (!Number.isFinite(tb)) return -1;
    return dir * (ta - tb);
  });
}

/** Paginación pura → { items, pag, porPagina, total, paginas } */
export function paginar(items, pag, porPagina) {
  const total = items.length;
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const p = Math.min(pag, paginas);
  return { items: items.slice((p - 1) * porPagina, p * porPagina), pag: p, porPagina, total, paginas };
}

/* ---------------- FECHAS ESTILO STRAFE ("17 – 20 NOV") ---------------- */

const MESES = {
  es: ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'],
  en: ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'],
};

export function dCorto(d, locale) {
  const m = MESES[locale === 'en' ? 'en' : 'es'][d.getMonth()];
  return d.getDate() + ' ' + m;
}

/** Rango "17 – 20 NOV" / "17 NOV"; null si no hay fechas válidas. */
export function fechaRango(startsAt, endsAt, locale) {
  try {
    const a = startsAt ? new Date(startsAt) : null;
    const b = endsAt ? new Date(endsAt) : null;
    const va = a && !isNaN(a.getTime());
    const vb = b && !isNaN(b.getTime());
    if (va && vb && b.getTime() !== a.getTime()) return dCorto(a, locale) + ' – ' + dCorto(b, locale);
    if (va) return dCorto(a, locale);
  } catch (e) { /* cae a null */ }
  return null;
}

/* ---------------- RENDER DE FILA (frontend, string con escape) ---------------- */

export const GAME_NAMES = { valorant: 'VALORANT', cs2: 'COUNTER-STRIKE 2' };

/** Fila de torneo estilo strafe (7 columnas). Datos = fila de /api/tournaments. */
export function filaTorneo(t, locale) {
  const estado = t.estado || clasificarEstado(t.status);
  const juego = t.game && t.game.slug ? t.game.slug : 'valorant';
  let badge = '';
  if (t.major) badge = '<span class="sf-badge">MAJOR</span>';
  else if (estado === 'ongoing') badge = '<span class="sf-badge">ABIERTO</span>';
  else if (estado === 'archive') badge = '<span class="sf-badge dim">FINALIZADO</span>';
  else badge = '<span class="sf-badge red">PRÓXIMO</span>';
  if (t.is_demo) badge += '<span class="sf-badge demo" title="Datos de demostración">DEMO</span>';

  const premio = t.prize && Number(t.prize.value) > 0
    ? '$' + Number(t.prize.value).toLocaleString('en-US')
    : '—';
  const equipos = t.equipos != null && Number(t.equipos) > 0 ? '+' + Number(t.equipos) : '—';
  const fechas = fechaRango(t.starts_at, t.ends_at, locale) || 'POR ANUNCIAR';
  const href = '/torneo?slug=' + encodeURIComponent(t.slug || '') + '#ficha';
  return '<a class="sf-row" href="' + href + '" data-est="' + esc(estado) + '">' +
    '<span class="sf-rlogo" aria-hidden="true"></span>' +
    '<span class="sf-rmain">' +
      '<span class="sf-rname"><b>' + esc(t.nombre || 'Torneo VANTS') + '</b>' + badge + '</span>' +
      '<span class="sf-stage">' + esc(GAME_NAMES[juego] || (t.game && t.game.nombre) || 'VALORANT') +
      (t.formato ? ' · ' + esc(t.formato) : '') + '</span>' +
    '</span>' +
    '<span class="sf-rcol c-region">' + esc(String(t.region || '—').toUpperCase().slice(0, 6)) + '</span>' +
    '<span class="sf-rcol c-prize">' + premio + '</span>' +
    '<span class="sf-rcol c-fechas">' + esc(fechas) + '</span>' +
    '<span class="sf-rcol c-slots sf-rparts"><span class="n">' + equipos + '</span></span>' +
    '<span class="sf-rgo"></span></a>';
}

/* Export ESM (el worker lo importa; la suite de pruebas lo carga con import()) */
export default {
  ESTADOS_TORNEO, ESTADOS_MATCH,
  esc, intDe,
  validarQueryTorneos, validarQueryMatches, validarQueryBusqueda,
  clasificarEstado, ordenarTorneos, ordenarMatches, paginar,
  fechaRango, filaTorneo, GAME_NAMES,
};
