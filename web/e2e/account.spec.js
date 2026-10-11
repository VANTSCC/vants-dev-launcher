import { expect, test } from '@playwright/test'

const USER = { sub: 'auth0|e2e', name: 'Tester', email: 't@example.com', picture: '' }

// Datos simulados: el e2e no depende de Neon ni de Auth0.
async function mockApi(page) {
  await page.route('**/*', (route) => {
    const url = route.request().url()
    if (url.includes('vantsdata') || url.includes('apirest')) {
      const table = new URL(url).searchParams.get('table') || url.split('/v1/')[1]?.split('?')[0] || ''
      let body = []
      if (table === 'players') body = [{ id: 'p1', username: 'tester', display_name: 'Tester', created_at: '2026-10-01T00:00:00Z', country: 'VE' }]
      if (table === 'user_game_accounts') body = [{ game: 'riot', handle: 'Tester#1234', verified: false }]
      if (table === 'leaderboard') body = [{ player_id: 'p1', rank: 'Gold', mmr: 1200, wins: 7, losses: 3 }]
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'content-range': '0-0/3' },
        body: JSON.stringify(body),
      })
    }
    return route.continue()
  })
}

test('con sesion, ir a Inicio y volver a la cuenta mantiene los botones de perfil', async ({ page }) => {
  await mockApi(page)
  await page.addInitScript((u) => { window.__E2E_USER__ = u }, USER)

  await page.goto('/#/cuenta')
  await expect(page.getByTestId('profile-card')).toBeVisible()
  for (const k of ['friends', 'faceit', 'streamer']) {
    await expect(page.getByTestId(`action-${k}`)).toBeVisible()
  }

  // El bug original: tras Inicio -> Cuenta, el boton Streamer desaparecia.
  await page.getByRole('link', { name: 'Inicio' }).first().click()
  await expect(page).toHaveURL(/#\/$/)
  await page.locator('[data-test^="nav-account"]:visible').click()
  await expect(page).toHaveURL(/#\/cuenta/)

  for (const k of ['friends', 'faceit', 'streamer']) {
    await expect(page.getByTestId(`action-${k}`)).toBeVisible()
  }
  await expect(page.getByTestId('profile-name')).toHaveText('Tester')
})

test('sin sesion, la cuenta pide iniciar sesion', async ({ page }) => {
  await mockApi(page)
  await page.goto('/#/cuenta')
  await expect(page.getByTestId('account-gate')).toBeVisible()
  await expect(page.getByTestId('profile-actions')).toHaveCount(0)
})

test('Inicio muestra estadisticas y listas', async ({ page }) => {
  await mockApi(page)
  await page.goto('/#/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Compite')
  await expect(page.getByTestId('stat-value').first()).toBeVisible()
})
