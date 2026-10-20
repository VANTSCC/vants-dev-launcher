/* ============================================================
   VANTS · playwright.config.js — E2E de la plataforma (F13)
   ------------------------------------------------------------
   Corre contra PRODUCCIÓN por defecto (VANTS_E2E_URL o E2E_BASE, ambas
   válidas) porque el
   site es el despliegue continuo del Worker. Navegador real =
   pasa el bot-protection (UA de navegador, verificado T52).
   Local:  npx playwright test
   CI:     job e2e en tests.yml (retries 2 por red pública)
   ============================================================ */
module.exports = {
  testDir: 'tests/e2e',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : 4,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    baseURL: process.env.VANTS_E2E_URL || process.env.E2E_BASE || 'https://vants.vants.workers.dev',
    browserName: 'chromium',
    viewport: { width: 1280, height: 800 },
    locale: 'es-ES',
    ignoreHTTPSErrors: true,
  },
  projects: [
    { name: 'chromium-desktop', use: { viewport: { width: 1280, height: 800 } } },
    { name: 'chromium-movil', use: { viewport: { width: 390, height: 844 } } },
  ],
};
