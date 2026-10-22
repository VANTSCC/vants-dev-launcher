/* ============================================================
   VANTS · tests/e2e/home-fullstack.spec.js — E2E de la home FULL STACK
   ------------------------------------------------------------
   La home se compila con Astro + Vue (emblema 3D) + Tailwind sobre
   el runtime arena. Este spec verifica:
     1) estructura mínima (hero, EN VIVO, footer, arena.css)
     2) que el JS de islands (_astro) está cargado en la página
   La sección EXPLORAR fue retirada de la portada (decisión D20):
   sus asertos de isla React se quitaron con ella.
   ============================================================ */
const { test, expect } = require('@playwright/test');

const BASE = process.env.E2E_BASE || process.env.VANTS_E2E_URL || 'https://vants.vants.workers.dev';

test.describe('Home full stack (Astro + Vue)', () => {
  test('estructura: hero, panel EN VIVO, footer y runtime arena', async ({ page }) => {
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('#heroTitle')).toContainText('ASCENSIÓN');
    await expect(page.locator('#liveEvent')).toBeVisible();
    await expect(page.locator('footer')).toBeVisible();
    // la sección EXPLORAR ya no existe (D20): ni sección ni panel de preview
    await expect(page.locator('#explorar')).toHaveCount(0);
    await expect(page.locator('#hcPreview')).toHaveCount(0);
    // runtime arena intacto: arena.css y arena.js siguen siendo la capa viva.
    /* Sin version hardcodeada: cada bump de cache (?v=N) rompia este aserto
       (PRs #93 y #101 lo dejaron en rojo). Lo que importa es que se cargue
       UNA sola vez cada uno, no el numero. */
    await expect(page.locator('link[href*="assets/css/arena.css?v="]')).toHaveCount(1);
    await expect(page.locator('script[src*="assets/js/arena.js?v="]')).toHaveCount(1);
    /* D25 dejo la portada duplicada en produccion (dos h1#heroTitle, dos islas
       Emblema3D, una con hash 404): el hero y la isla 3D deben ser unicos. */
    await expect(page.locator('#heroTitle')).toHaveCount(1);
    await expect(page.locator('astro-island')).toHaveCount(1);
  });

  test('las islands de Astro (_astro) están referenciadas y cargan', async ({ page }) => {
    const respuestas = [];
    page.on('response', (r) => {
      if (r.url().includes('/_astro/')) respuestas.push(r.status());
    });
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    /* El CSS de Astro va inline y la isla 3D es client:visible: en movil queda
       bajo el hero, asi que hay que traerla a pantalla para que pida su bundle. */
    if (!respuestas.length) {
      await Promise.all([
        page.waitForResponse((r) => r.url().includes('/_astro/')),
        page.locator('.emblema-3d').scrollIntoViewIfNeeded(),
      ]);
      await page.waitForLoadState('networkidle');
    }
    expect(respuestas.length, 'la página debe pedir al menos un bundle _astro').toBeGreaterThan(0);
    for (const s of respuestas) expect(s, 'bundle _astro debe responder 2xx/3xx').toBeLessThan(400);
  });

  test('primer pintado estable sin la hoja completa (CSS critico)', async ({ page, browser }) => {
    /* arena.css y vants-shop.css ya no bloquean el render: la home pinta con el
       CSS critico inline (webapp/integrations/critical-css.mjs) y las hojas
       llegan despues. Si al critico le falta una regla que el runtime usa al
       arrancar, la portada salta cuando llega la hoja (CLS). Se compara el
       layout de los bloques visibles con y sin las hojas completas. */
    const medir = async (pg) => {
      // sin animaciones de entrada (viven bajo prefers-reduced-motion): medidas estables
      await pg.emulateMedia({ reducedMotion: 'reduce' });
      await pg.goto(BASE + '/', { waitUntil: 'load' });
      await pg.waitForTimeout(800);
      return pg.evaluate(() =>
        [...document.querySelectorAll('.ticker, header.nav, .nav-right, .gamebar, .hero, .hero-left > *, .live-panel, .emblema-3d, footer')].map((e) => {
          const b = e.getBoundingClientRect();
          return [e.tagName + '.' + e.className.split(' ')[0], Math.round(b.top), Math.round(b.height)].join(':');
        })
      );
    };
    const html = await (await page.request.get(BASE + '/')).text();
    expect(html, 'index.html debe traer el CSS critico inline').toContain('<style data-critico>');
    expect(html).toMatch(/<link rel="preload" as="style" href="\.\/assets\/css\/arena\.css\?v=\d+"/);
    const completo = await medir(page);
    const ctx = await browser.newContext({ viewport: page.viewportSize() });
    const sinHojas = await ctx.newPage();
    await sinHojas.route(/assets\/css\/(arena|vants-shop)\.css/, (r) => r.abort());
    expect(await medir(sinHojas)).toEqual(completo);
    await ctx.close();
  });

  test('sin restos de merge ni errores de script en la portada', async ({ page, request }) => {
    /* #104 llego a main con restos de una resolucion de conflictos a mano:
       lineas sueltas (` main`, `devin/...`) dentro de un <script> inline y la
       portada duplicada otra vez. El HTML servido no puede traer marcadores
       ni nombres de rama, y la carga no puede lanzar ReferenceError/SyntaxError. */
    const html = await (await request.get(BASE + '/')).text();
    expect(html).not.toMatch(/^(<<<<<<<|=======|>>>>>>>)/m);
    expect(html).not.toMatch(/^\s*(main|devin\/\S+)\s*$/m);

    const errores = [];
    page.on('pageerror', (e) => {
      if (/ReferenceError|SyntaxError/.test(String(e))) errores.push(String(e));
    });
    await page.goto(BASE + '/', { waitUntil: 'load' });
    expect(errores, 'scripts inline rotos en la home').toEqual([]);
  });
});
