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
    expect(respuestas.length, 'la página debe pedir al menos un bundle _astro').toBeGreaterThan(0);
    for (const s of respuestas) expect(s, 'bundle _astro debe responder 2xx/3xx').toBeLessThan(400);
  });
});
