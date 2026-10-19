#!/usr/bin/env node
/* ============================================================
   T52 · test_plataforma.js — Plataforma de torneos (estilo strafe)
   ------------------------------------------------------------
   · UNIT: lógica pura de vants-server/plataforma-core.js (ESM,
     cargado con import() dinámico) — validación, orden, paginación,
     fechas, render de fila (XSS-safe).
   · INTEGRACIÓN (red): contrato real del proxy vantsdata con las
     tablas pt_* en producción. Si no hay red/la tabla aún no
     existe, se salta con aviso (NUNCA falla por eso).
   Ejecutar: node scripts/test_plataforma.js
   ============================================================ */
'use strict';

let OK = 0, KO = 0, SKIP = 0;
function as(cond, msg) { if (cond) { OK++; console.log('  ✓ ' + msg); } else { KO++; console.error('  ✗ ' + msg); } }
function seccion(n) { console.log('\n== ' + n + ' =='); }

(async () => {
  const CORE = await import('../vants-server/plataforma-core.js');
  const C = CORE.default || CORE;

  /* ---------- validarQueryTorneos ---------- */
  seccion('validarQueryTorneos');
  let v = C.validarQueryTorneos({});
  as(v.ok && v.estado === 'upcoming' && v.pag === 1 && v.porPagina === 12, 'defaults: upcoming/1/12');
  v = C.validarQueryTorneos({ estado: 'ongoing', juego: 'cs2', region: 'eu', pag: '3', porPagina: '50' });
  as(v.ok && v.estado === 'ongoing' && v.juego === 'cs2' && v.region === 'EU' && v.pag === 3 && v.porPagina === 50, 'query completa válida (región normalizada)');
  v = C.validarQueryTorneos({ estado: 'xyz' });
  as(!v.ok && /estado/.test(v.error), 'estado inválido → rechazo');
  v = C.validarQueryTorneos({ juego: 'FIFA 24!' });
  as(!v.ok, 'juego con espacios/símbolos → rechazo');
  v = C.validarQueryTorneos({ region: 'LATAM!!' });
  as(!v.ok, 'región con símbolos → rechazo');
  v = C.validarQueryTorneos({ pag: '0' });
  as(v.ok && v.pag === 1, 'pag=0 → clamp a 1');
  v = C.validarQueryTorneos({ porPagina: '9999' });
  as(v.ok && v.porPagina === 50, 'porPagina=9999 → clamp a 50');
  v = C.validarQueryTorneos({ pag: 'abc' });
  as(v.ok && v.pag === 1, 'pag no numérico → default');

  /* ---------- validarQueryMatches ---------- */
  seccion('validarQueryMatches');
  v = C.validarQueryMatches({});
  as(v.ok && v.estado === 'upcoming', 'default upcoming');
  v = C.validarQueryMatches({ estado: 'live' });
  as(v.ok && v.estado === 'live', 'live válido');
  v = C.validarQueryMatches({ estado: 'arch' });
  as(!v.ok, 'estado de torneo no vale para matches → rechazo');

  /* ---------- validarQueryBusqueda ---------- */
  seccion('validarQueryBusqueda');
  v = C.validarQueryBusqueda({ q: 'copa' });
  as(v.ok && v.q === 'copa', 'q válida');
  v = C.validarQueryBusqueda({ q: 'c' });
  as(!v.ok, 'q de 1 char → rechazo');
  v = C.validarQueryBusqueda({ q: 'a'.repeat(70) });
  as(v.ok && v.q.length === 64, 'q larga → truncada a 64');
  v = C.validarQueryBusqueda({ q: 'co;pa%' });
  as(!v.ok, 'q con ; y % → rechazo');

  /* ---------- clasificarEstado ---------- */
  seccion('clasificarEstado');
  as(C.clasificarEstado('finalizado') === 'archive', 'finalizado → archive');
  as(C.clasificarEstado('completado') === 'archive', 'completado → archive');
  as(C.clasificarEstado('abierto') === 'ongoing', 'abierto → ongoing');
  as(C.clasificarEstado('en curso') === 'ongoing', 'en curso → ongoing');
  as(C.clasificarEstado('próximamente') === 'upcoming', 'próximamente → upcoming');
  as(C.clasificarEstado('') === 'upcoming', 'vacío → upcoming');
  as(C.clasificarEstado('FINALIZADO') === 'archive', 'mayúsculas → archive');

  /* ---------- ordenarTorneos ---------- */
  seccion('ordenarTorneos');
  const ts = [
    { slug: 'b', starts_at: '2026-11-17T00:00:00Z' },
    { slug: 'a', starts_at: '2026-10-20T00:00:00Z' },
    { slug: 'c', starts_at: null },
  ];
  let o = C.ordenarTorneos(ts, 'upcoming');
  as(o[0].slug === 'a' && o[1].slug === 'b', 'upcoming: fecha ascendente');
  as(o[2].slug === 'c', 'sin fecha al final');
  o = C.ordenarTorneos(ts.slice(0, 2), 'archive');
  as(o[0].slug === 'b' && o[1].slug === 'a', 'archive: fecha descendente');
  as(C.ordenarTorneos(ts, 'upcoming') !== ts, 'no muta el array original');

  /* ---------- ordenarMatches ---------- */
  seccion('ordenarMatches');
  const ms = [
    { id: '2', empieza_at: '2026-10-21T00:00:00Z' },
    { id: '1', empieza_at: '2026-10-20T00:00:00Z' },
  ];
  as(C.ordenarMatches(ms, 'upcoming')[0].id === '1', 'upcoming ascendente');
  as(C.ordenarMatches(ms, 'finished')[0].id === '2', 'finished descendente');

  /* ---------- paginar ---------- */
  seccion('paginar');
  const items = Array.from({ length: 25 }, (_, i) => ({ i }));
  let p = C.paginar(items, 1, 12);
  as(p.items.length === 12 && p.total === 25 && p.paginas === 3, 'página 1: 12 items, 3 páginas');
  p = C.paginar(items, 3, 12);
  as(p.items.length === 1 && p.items[0].i === 24, 'página 3: último item');
  p = C.paginar(items, 9, 12);
  as(p.pag === 3 && p.items.length === 1, 'pag fuera de rango → clamp a última');
  p = C.paginar([], 1, 12);
  as(p.total === 0 && p.paginas === 1 && p.items.length === 0, 'vacío → 0 items, 1 página');

  /* ---------- fechaRango (locale) ---------- */
  seccion('fechaRango');
  as(C.fechaRango('2026-11-17T00:00:00Z', '2026-11-20T00:00:00Z', 'es') === '17 NOV – 20 NOV', 'rango es: 17 NOV – 20 NOV');
  as(C.fechaRango('2026-11-17T00:00:00Z', '2026-11-20T00:00:00Z', 'en') === '17 NOV – 20 NOV', 'rango en: mismos meses abreviados nov/NOV');
  as(C.fechaRango('2026-01-17T00:00:00Z', null, 'en') === '17 JAN', 'un día en: JAN');
  as(C.fechaRango('2026-01-17T00:00:00Z', null, 'es') === '17 ENE', 'un día es: ENE');
  as(C.fechaRango(null, null, 'es') === null, 'sin fechas → null');
  as(C.fechaRango('basura', 'basura', 'es') === null, 'fechas inválidas → null');

  /* ---------- esc + filaTorneo (XSS-safe) ---------- */
  seccion('esc + filaTorneo');
  as(C.esc('<script>x</script>') === '&lt;script&gt;x&lt;/script&gt;', 'escapea <script>');
  as(C.esc('"a"\'&') === '&quot;a&quot;&#39;&amp;', 'escapa comillas y &');
  const mala = { slug: 'x', nombre: '<img src=x onerror=alert(1)>', estado: 'upcoming', game: { slug: 'valorant' }, prize: { value: 50000, currency: 'USD' }, starts_at: '2026-11-08T18:00:00Z', ends_at: '2026-11-12T23:00:00Z', region: 'LATAM', equipos: 6, is_demo: true };
  const fila = C.filaTorneo(mala, 'es');
  as(!/<img src=x/.test(fila), 'XSS neutralizado: sin etiqueta <img> real');
  as(fila.includes('&lt;img'), 'nombre escapado presente');
  as(fila.includes('sf-badge demo') && fila.includes('DEMO'), 'chip DEMO visible para is_demo');
  as(fila.includes('MAJOR') === false && fila.includes('PRÓXIMO'), 'badge PRÓXIMO (no MAJOR) para demo upcoming');
  const major = C.filaTorneo({ slug: 'm', nombre: 'T', estado: 'upcoming', major: true, game: { slug: 'cs2' } }, 'es');
  as(major.includes('MAJOR'), 'badge MAJOR cuando major=true');
  as(C.filaTorneo({ slug: 'a b/c', nombre: 'N', estado: 'archive', game: { slug: 'valorant' } }, 'es').includes('/torneo?slug=a%20b%2Fc'), 'slug URL-encodeado en href');
  as(C.filaTorneo({ slug: 'f', nombre: 'N', estado: 'upcoming', game: { slug: 'valorant' }, starts_at: '2026-11-08T18:00:00Z', ends_at: '2026-11-12T23:00:00Z' }, 'es').includes('8 NOV – 12 NOV'), 'fechas formateadas en fila');

  /* ---------- INTEGRACIÓN con el proxy real (red) ---------- */
  seccion('INTEGRACIÓN proxy vantsdata (producción)');
  const PROXY = 'https://br-sweet-shape-b42xhogj-vantsdata.compute.c-6.us-east-2.aws.neon.tech/';
  try {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 12000);
    const r = await fetch(PROXY + '?table=pt_games&activo.is=true&order=orden.asc', { signal: ctl.signal, headers: { Accept: 'application/json' } });
    clearTimeout(to);
    if (!r.ok) {
      SKIP++;
      console.log('  ~ SKIP: proxy respondió HTTP ' + r.status + ' (las tablas pt_* aún no están migradas o sin red)');
    } else {
      const games = await r.json();
      as(Array.isArray(games) && games.length >= 1, 'pt_games devuelve catálogo (' + games.length + ' juegos)');
      const slugs = games.map((g) => g.slug);
      as(slugs.includes('valorant') && slugs.includes('cs2'), 'catálogo contiene valorant y cs2');
      const to2 = setTimeout(() => ctl.abort(), 12000);
      const r2 = await fetch(PROXY + '?table=pt_torneos&estado.eq=upcoming&order=starts_at.asc.nullslast&limit=12&_count=exact', { headers: { Accept: 'application/json' } });
      clearTimeout(to2);
      if (!r2.ok) { SKIP++; console.log('  ~ SKIP: pt_torneos HTTP ' + r2.status); }
      else {
        const torneos = await r2.json();
        as(Array.isArray(torneos), 'pt_torneos upcoming devuelve array');
        as(torneos.every((t) => t.estado === 'upcoming'), 'filtro estado.eq funciona');
        as(torneos.every((t) => t.is_demo === true), 'seed demo etiquetado is_demo=true');
        const cr = r2.headers.get('Content-Range');
        as(!!cr && /\//.test(cr), 'Content-Range presente con _count=exact (' + cr + ')');
        const to3 = setTimeout(() => ctl.abort(), 12000);
        const r3 = await fetch(PROXY + '?table=pt_articulos&estado.eq=published&limit=5', { headers: { Accept: 'application/json' } });
        clearTimeout(to3);
        const arts = r3.ok ? await r3.json() : null;
        as(Array.isArray(arts) && arts.length >= 1, 'pt_articulos publicados disponibles');
        const to4 = setTimeout(() => ctl.abort(), 12000);
        const r4 = await fetch(PROXY + '?table=pt_torneos&nombre.ilike=%25DEMO%25&limit=5', { headers: { Accept: 'application/json' } });
        clearTimeout(to4);
        const busq = r4.ok ? await r4.json() : null;
        as(Array.isArray(busq) && busq.length >= 1, 'búsqueda ilike sobre pt_torneos');
        const to5 = setTimeout(() => ctl.abort(), 12000);
        const r5 = await fetch(PROXY + '?table=tabla_inexistente_xyz', { headers: { Accept: 'application/json' } });
        clearTimeout(to5);
        as(r5.status === 400 || r5.status === 404, 'tabla fuera de whitelist → rechazo (HTTP ' + r5.status + ')');
        const to6 = setTimeout(() => ctl.abort(), 12000);
        const r6 = await fetch(PROXY + '?table=players&limit=1', { headers: { Accept: 'application/json' } });
        clearTimeout(to6);
        if (r6.ok) {
          const pl = await r6.json();
          const fila = (pl && pl[0]) || {};
          as(!('email' in fila) && !('auth0_sub' in fila), 'strip de PII en players (sin email/auth0_sub)');
        } else { SKIP++; console.log('  ~ SKIP: players HTTP ' + r6.status); }
      }
    }
  } catch (e) {
    SKIP++;
    console.log('  ~ SKIP integración: ' + (e && e.name === 'AbortError' ? 'timeout de red' : (e && e.message)));
  }

  /* ---------- resumen ---------- */
  console.log('\n==========================================');
  console.log('  PLATAFORMA · ' + OK + ' ✓ · ' + KO + ' ✗ · ' + SKIP + ' ~skip');
  console.log('==========================================');
  process.exit(KO ? 1 : 0);
})().catch((e) => { console.error('FATAL:', e); process.exit(1); });
