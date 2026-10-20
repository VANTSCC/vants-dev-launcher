/* ============================================================
   VANTS · tests/e2e/home-fullstack.spec.js — E2E de la home FULL STACK
   ------------------------------------------------------------
   La home se compila con Astro + React (isla EXPLORAR) + Tailwind
   sobre el runtime arena. Este spec verifica:
     1) estructura mínima (hero, EN VIVO, EXPLORAR, footer, arena.css)
     2) la isla React: hover en una categoría cambia la preview
     3) que el JS de islands (_astro) está cargado en la página
   ============================================================ */
const { test, expect } = require('@playwright/test');

const BASE = process.env.E2E_BASE || 'https://vants.vants.workers.dev';

test.describe('Home full stack (Astro + React)', () => {
  test('estructura: hero, panel EN VIVO, EXPLORAR y footer', async ({ page }) => {
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('#heroTitle')).toContainText('ASCENSIÓN');
    await expect(page.locator('#liveEvent')).toBeVisible();
    await expect(page.locator('#explorar')).toBeVisible();
    await expect(page.locator('footer')).toBeVisible();
    // runtime arena intacto (arena.css v10 y arena.js v30 siguen siendo la capa viva)
    await expect(page.locator('link[href*="arena.css?v=10"]')).toHaveCount(1);
    await expect(page.locator('script[src*="arena.js?v=30"]')).toHaveCount(1);
  });

  test('isla React EXPLORAR: la preview cambia al pasar el mouse', async ({ page }) => {
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });

    const preview = page.locator('#hcPreview');
    await expect(preview).toBeVisible();
    // estado inicial: PERFIL DE JUGADOR
    await expect(preview).toContainText('PERFIL DE JUGADOR');

    // hover en la fila de RANKING -> la preview debe pintar RANKING
    const row = page.locator('#explorar a.hc-row', { hasText: 'RANKING' }).first();
    await row.hover();
    await expect(preview).toContainText('RANKING', { timeout: 5000 });
    await expect(preview).toContainText('La tabla de líderes');
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
