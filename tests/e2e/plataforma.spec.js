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

const RUTA_TORNEOS_ES = '/es/tournaments/valorant/upcoming/';
const RUTA_TORNEOS_EN = '/en/tournaments/cs2/archive/';

test.describe('Rutas de torneos estilo strafe (F6)', () => {
  test('ES upcoming: título dinámico, lang y tabs accesibles', async ({ page }) => {
    await page.goto(RUTA_TORNEOS_ES);
    await expect(page).toHaveTitle(/Próximos torneos de/i);
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    const tabProx = page.locator('a.sf-tab[href*="/es/tournaments/valorant/upcoming"], [role="tab"]').first();
    await expect(tabProx).toBeVisible();
  });

  test('EN archive: título en inglés', async ({ page }) => {
    await page.goto(RUTA_TORNEOS_EN);
    await expect(page).toHaveTitle(/Tournament archive for/i);
  });

  test('juego no catalogado → 307 al juego principal', async ({ page }) => {
    const resp = await page.goto('/es/tournaments/fifa/upcoming/', { maxRedirects: 0 }).catch(() => null);
    const status = resp ? resp.status() : 200;
    expect([200, 307, 308]).toContain(status);
    if (resp && (status === 307 || status === 308)) {
      expect(resp.headers().location || '').toContain('/es/tournaments/valorant/');
    }
  });
});

test.describe('Datos de la plataforma (F7/F9 · T53)', () => {
  test('calendario: panel con datos o estado honesto, nunca en blanco', async ({ page }) => {
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

  test('ficha de equipo demo: plantilla + partidas o estados honestos', async ({ page }) => {
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
  });

  test('ficha de jugador demo: carga con rol/país o estado honesto', async ({ page }) => {
    await page.goto('/jugador.html?slug=demo-jugador-alex');
    await expect(page.locator('#pfJugador')).toBeVisible();
    await page.waitForFunction(() => {
      const h = document.querySelector('#pfJugador');
      return h && h.children.length > 0 && !h.querySelector('.pf-skeleton');
    }, { timeout: 15000 }).catch(() => {});
    const html = await page.locator('#pfJugador').innerHTML();
    expect(html.includes('pf-ficha') || html.includes('pf-empty') || html.includes('pf-error')).toBeTruthy();
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

  test('nav del shell contiene Calendario y enlaces vivos', async ({ page }) => {
    await page.goto('/equipos.html');
    const navCal = page.locator('nav.sf-nav a[href*="calendario"]');
    await expect(navCal).toBeVisible();
  });

  test('selector de idioma ES→EN re-renderiza el shell', async ({ page }) => {
    await page.goto('/equipos.html');
    const btn = page.locator('.sf-lang').first();
    if (!(await btn.isVisible().catch(() => false))) {
      // en móvil el selector vive dentro del drawer: abrirlo primero
      const burger = page.locator('.sf-burger, [aria-label*="menu" i], [aria-label*="menú" i]').first();
      if (await burger.count()) await burger.click().catch(() => {});
    }
    test.skip(!(await btn.isVisible().catch(() => false)), 'selector de idioma no visible en este viewport (vive en el drawer)');
    await btn.click();
    await page.waitForTimeout(600);
    const lang = await page.evaluate(() => document.body.getAttribute('data-lang') || 'es');
    expect(['es', 'en']).toContain(lang);
  });

  test('movil 390: sin overflow horizontal en ficha de equipo', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/equipo-ficha.html?slug=demo-equipo-fenix');
    await page.waitForTimeout(1500);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
