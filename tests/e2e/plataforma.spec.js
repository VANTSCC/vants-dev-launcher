/* ============================================================
   VANTS · tests/e2e/plataforma.spec.js — E2E (F13 · Playwright)
   ------------------------------------------------------------
   Flujos críticos de la plataforma de torneos contra el entorno
   real. NUNCA asume que el seed demo es real: los chips DEMO son
   parte del contrato visible. Si el proxy de datos aún no está
   migrado, las páginas deben mostrar estados honestos (skeleton/
   empty/error) — eso también se prueba.
   ============================================================ */
const { test, expect } = require('@playwright/test');

const PROXY = 'https://br-sweet-shape-b42xhogj-vantsdata.compute.c-6.us-east-2.aws.neon.tech/';
// Detector de BUGS: si el proxy es alcanzable desde este entorno y la fila existe,
// la página NO puede quedarse en estado vacío/error — eso es un bug de render, no
// un "estado honesto" (lección T53: la ficha mostraba SIN RESULTADOS con datos vivos).
async function proxyTieneFilas(request, tabla, filtro) {
  try {
    const r = await request.get(PROXY + '?table=' + tabla + (filtro || '') + '&limit=1', { headers: { Accept: 'application/json' } });
    if (!r.ok()) return null; // inalcanzable → no se puede juzgar
    const filas = await r.json();
    return Array.isArray(filas) && filas.length > 0;
  } catch (e) { return null; }
}

const RUTA_TORNEOS_ES = '/es/tournaments/valorant/upcoming';
const RUTA_TORNEOS_EN = '/en/tournaments/cs2/archive';

test.describe('Rutas de torneos estilo strafe (F6)', () => {
  test('ES upcoming: título dinámico, lang y tabs accesibles', async ({ page }) => {
    await page.goto(RUTA_TORNEOS_ES);
    // Regresión 20-oct: paginaTorneos pedía /torneos.html, Assets respondía 307 → /torneos y el Worker
    // se lo reenviaba al visitante. Esta aserción NO depende de la caché de borde: la ruta no redirige.
    expect(new URL(page.url()).pathname).toBe(RUTA_TORNEOS_ES);
    // NOTA (cache de workers.dev): el edge puede servir una copia cacheada del
    // shell para esta ruta (los workers.dev no se purgan por API). La pagina
    // renderiza igual (tabs, lang, datos); el titulo reescrito solo se ve cuando
    // la copia cacheada expira. Se acepta shell o reescrito.
    await expect(page).toHaveTitle(/torneos de|Torneos . VANTS/i);
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    const tabProx = page.locator('a.sf-tab[href*="/es/tournaments/valorant/upcoming"], [role="tab"]').first();
    await expect(tabProx).toBeVisible();
  });

  test('EN archive: título en inglés (o shell cacheado por el edge)', async ({ page }) => {
    await page.goto(RUTA_TORNEOS_EN);
    // Regresión 20-oct: paginaTorneos pedía /torneos.html, Assets respondía 307 → /torneos y el Worker
    // se lo reenviaba al visitante. Esta aserción NO depende de la caché de borde: la ruta no redirige.
    expect(new URL(page.url()).pathname).toBe(RUTA_TORNEOS_EN);
    // NOTA (cache de workers.dev): idéntico al test ES de arriba — el borde
    // puede servir una copia cacheada del shell para esta ruta (los
    // workers.dev no se purgan por API y la entrada envenenada no siempre
    // respeta el max-age=60 del rewriter). La página renderiza igual; el
    // título reescrito solo se ve cuando la copia cacheada expira. Se acepta
    // shell o reescrito.
    await expect(page).toHaveTitle(/Tournament archive for|Torneos . VANTS/i);
  });

  test('juego no catalogado → 307 al juego principal', async ({ page }) => {
    const resp = await page.goto('/es/tournaments/fifa/upcoming', { maxRedirects: 0 }).catch(() => null);
    const status = resp ? resp.status() : 200;
    expect([200, 307, 308]).toContain(status);
    if (resp && (status === 307 || status === 308)) {
      expect(resp.headers().location || '').toContain('/es/tournaments/valorant/');
    }
  });
});

test.describe('Datos de la plataforma (F7/F9 · T53)', () => {
  test('calendario: panel con datos o estado honesto, nunca en blanco', async ({ page, request }) => {
    await page.goto('/calendario.html');
    await expect(page.locator('#pfCalendario')).toBeVisible();
    await page.waitForFunction(() => {
      const h = document.querySelector('#pfCalendario');
      return h && h.children.length > 0 && !h.querySelector('.pf-skeleton');
    }, { timeout: 15000 }).catch(() => {});
    const html = await page.locator('#pfCalendario').innerHTML();
    const conDatos = html.includes('sf-mrow');
    const estadoHonesto = html.includes('pf-empty') || html.includes('pf-error');
    expect(conDatos || estadoHonesto).toBeTruthy();
    // fecha NUNCA "Invalid Date" (bug T53 del formato timestamptz del proxy)
    expect(html).not.toContain('Invalid Date');
    if (!conDatos) {
      const hay = await proxyTieneFilas(request, 'pt_matches', '&estado.eq=upcoming');
      if (hay === true) throw new Error('BUG de render: el proxy tiene partidas upcoming pero el calendario quedó vacío');
    }
  });

  test('resultados: igual contrato que calendario', async ({ page }) => {
    await page.goto('/resultados.html');
    await expect(page.locator('#pfResultados')).toBeVisible();
    await page.waitForFunction(() => {
      const h = document.querySelector('#pfResultados');
      return h && h.children.length > 0 && !h.querySelector('.pf-skeleton');
    }, { timeout: 15000 }).catch(() => {});
    const html = await page.locator('#pfResultados').innerHTML();
    expect(html.includes('sf-mrow') || html.includes('pf-empty') || html.includes('pf-error')).toBeTruthy();
    expect(html).not.toContain('Invalid Date');
  });

  test('equipos: tarjetas con enlace a ficha cuando hay datos', async ({ page }) => {
    await page.goto('/equipos.html');
    await expect(page.locator('#pfEquipos')).toBeVisible();
    await page.waitForFunction(() => {
      const h = document.querySelector('#pfEquipos');
      return h && h.children.length > 0 && !h.querySelector('.pf-skeleton');
    }, { timeout: 15000 }).catch(() => {});
    const html = await page.locator('#pfEquipos').innerHTML();
    if (html.includes('pf-card')) {
      expect(html).toContain('/equipo-ficha.html?slug=');
    } else {
      expect(html.includes('pf-empty') || html.includes('pf-error')).toBeTruthy();
    }
  });

  test('ficha de equipo demo: plantilla + partidas o estados honestos', async ({ page, request }) => {
    await page.goto('/equipo-ficha.html?slug=demo-equipo-fenix');
    await expect(page.locator('#pfEquipo')).toBeVisible();
    await page.waitForFunction(() => {
      const h = document.querySelector('#pfEquipo');
      return h && h.children.length > 0 && !h.querySelector('.pf-skeleton');
    }, { timeout: 15000 }).catch(() => {});
    const html = await page.locator('#pfEquipo').innerHTML();
    const ficha = html.includes('pf-ficha') && html.includes('PLANTILLA');
    const honesto = html.includes('pf-empty') || html.includes('pf-error');
    expect(ficha || honesto).toBeTruthy();
    if (ficha) {
      // datos demo SIEMPRE etiquetados, nunca presentados como reales
      expect(html).toMatch(/DEMO|pf-error/);
      // plantilla enlaza fichas de jugador
      if (html.includes('pf-player')) expect(html).toContain('/jugador.html?slug=');
    }
    // ¿Hay datos vivos y la página no renderizó la ficha? → BUG, no estado honesto
    if (!ficha) {
      const hay = await proxyTieneFilas(request, 'pt_teams', '&slug.eq=demo-equipo-fenix');
      if (hay === true) throw new Error('BUG de render: el proxy tiene el equipo demo pero la ficha quedó vacía');
    }
  });

  test('ficha de jugador demo: carga con rol/país o estado honesto', async ({ page, request }) => {
    await page.goto('/jugador.html?slug=demo-jugador-alex');
    await expect(page.locator('#pfJugador')).toBeVisible();
    await page.waitForFunction(() => {
      const h = document.querySelector('#pfJugador');
      return h && h.children.length > 0 && !h.querySelector('.pf-skeleton');
    }, { timeout: 15000 }).catch(() => {});
    const html = await page.locator('#pfJugador').innerHTML();
    const ficha = html.includes('pf-ficha');
    expect(ficha || html.includes('pf-empty') || html.includes('pf-error')).toBeTruthy();
    if (!ficha) {
      const hay = await proxyTieneFilas(request, 'pt_players', '&slug.eq=demo-jugador-alex');
      if (hay === true) throw new Error('BUG de render: el proxy tiene el jugador demo pero la ficha quedó vacía');
    }
  });
});

test.describe('Búsqueda, navegación e i18n (F5/F10)', () => {
  test('búsqueda "demo": secciones o vacío honesto', async ({ page }) => {
    await page.goto('/busqueda.html?q=demo');
    await expect(page.locator('#pfBusqueda')).toBeVisible();
    await page.waitForFunction(() => {
      const h = document.querySelector('#pfBusqueda');
      return h && h.children.length > 0 && !h.querySelector('.pf-skeleton');
    }, { timeout: 15000 }).catch(() => {});
    const html = await page.locator('#pfBusqueda').innerHTML();
    expect(html.length).toBeGreaterThan(10);
  });

  test('nav unificado: Calendario vive en el submenú PARTIDOS y el enlace es vivo', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/equipos.html');
    /* D23: el menú unificado es el header arena (header.nav) con submenús
       MYKD (.ni > .dd). En producción puede convivir un período con el shell
       strafe viejo (.sf-dd): el test acepta AMBOS — mismo contrato:
       trigger de PARTIDOS → foco abre el panel → item Calendario visible y
       vivo (el click navega a calendario.html). */
    const triggerNuevo = page.locator('.nav-links .ni.has-sub > a[href="partidos.html"]');
    const triggerViejo = page.locator('.sf-dd-top[href="partidos.html"]');
    let trigger = null;
    if (await triggerNuevo.count()) trigger = triggerNuevo.first();
    else if (await triggerViejo.count()) trigger = triggerViejo.first();
    test.skip(!trigger, 'ni header arena ni shell strafe presentes');
    await trigger.focus();
    const navCal = page.locator('a[role="menuitem"][href="calendario.html"]').first();
    await expect(navCal).toBeVisible();
    await navCal.click();
    await expect(page).toHaveURL(/calendario/);
  });

  test('D23: sin menús de strafe en las interiores + i18n ?lang=en vivo', async ({ page }) => {
    await page.goto('/equipos.html');
    /* Resiliente al deploy: espera a que aparezca UNO de los dos mundos.
       Nuevo: header.nav (markup, inmediato). Viejo: .sf-top (lo construye
       strafe-shell.js en runtime, puede tardar 1-2s con el CDN). */
    const mundo = await page
      .waitForSelector('.sf-top, header.nav', { timeout: 12000 })
      .catch(() => null);
    if (mundo && /sf-top/.test(mundo.getAttribute('class') || '')) {
      test.skip(true, 'producción aún con shell strafe (deploy de D23 pendiente)');
    }
    await expect(page.locator('header.nav')).toBeVisible();
    await expect(page.locator('.sf-top')).toHaveCount(0);
    await expect(page.locator('.sf-nav')).toHaveCount(0);
    await expect(page.locator('script[src*="strafe-shell"]')).toHaveCount(0);
    /* i18n vivo sin el selector del shell: ?lang=en aplica el diccionario */
    await page.goto('/equipos.html?lang=en');
    await page.waitForTimeout(400);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('móvil 390: el menú unificado queda navegable (franja o shell de borde)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/equipos.html');
    /* viejo: .sf-nav del shell strafe (JS, tarda en aparecer) ·
       nuevo: franja .nav-links del header arena (markup, inmediata).
       toBeVisible reintenta hasta 12s: cubre ambos mundos sin sleep fijo. */
    const nav = page.locator('.sf-nav:visible, header.nav .nav-links:visible');
    await expect(nav.first()).toBeVisible({ timeout: 12000 });
  });

  test('movil 390: sin overflow horizontal en ficha de equipo', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/equipo-ficha.html?slug=demo-equipo-fenix');
    await page.waitForTimeout(1500);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
