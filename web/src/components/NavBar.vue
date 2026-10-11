<script setup>
import { session, login, logout } from '../lib/auth.js'

// Las secciones migradas son internas; Planes sigue en la web actual (fase siguiente).
// icon: ruta SVG simple (24x24). mobile:false las oculta de la barra inferior.
const links = [
  { label: 'Inicio', to: '/', internal: true, icon: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z' },
  { label: 'Ranked', to: '/ranked', internal: true, icon: 'M4 20V10h4v10zm6 0V4h4v16zm6 0v-7h4v7z' },
  { label: 'Torneos', to: '/torneos', internal: true, icon: 'M7 4h10v4a5 5 0 0 1-10 0zM5 5H3v2a3 3 0 0 0 3 3M19 5h2v2a3 3 0 0 1-3 3M10 14h4v3h2v3H8v-3h2z' },
  { label: 'Jugadores', to: '/jugadores', internal: true, icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 9a8 8 0 0 1 16 0z' },
  { label: 'Calendario', to: '/calendario', internal: true, icon: 'M5 4h14a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm0 5h14M8 2v4m8-4v4' },
  { label: 'Planes', href: '../index.html#/precios', icon: 'M12 2l3 7 7 .6-5.3 4.7 1.6 7.2L12 17.8 5.7 21.5l1.6-7.2L2 9.6 9 9z', mobile: false },
]
</script>

<template>
  <!-- Barra superior (solo movil) -->
  <header class="topbar">
    <router-link to="/" class="brand title" aria-label="VANTS inicio">VANTS</router-link>
    <div class="actions">
      <template v-if="session.ready && session.loggedIn">
        <router-link to="/cuenta" class="btn btn-ghost" data-test="nav-account">Mi cuenta</router-link>
        <button class="btn" data-test="nav-logout" @click="logout()">Salir</button>
      </template>
      <template v-else-if="session.ready">
        <button class="btn btn-primary" data-test="nav-login" @click="login()">Entrar</button>
      </template>
    </div>
  </header>

  <!-- Barra lateral (escritorio) y barra inferior (movil) -->
  <aside class="side">
    <router-link to="/" class="brand title side-brand" aria-label="VANTS inicio">VANTS</router-link>

    <nav class="links" aria-label="Principal">
      <template v-for="l in links" :key="l.label">
        <router-link v-if="l.internal" :to="l.to" class="link" active-class="" exact-active-class="active">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="l.icon" /></svg>
          <span>{{ l.label }}</span>
        </router-link>
        <a v-else :href="l.href" class="link" :class="{ 'hide-mobile': l.mobile === false }">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="l.icon" /></svg>
          <span>{{ l.label }}</span>
        </a>
      </template>
    </nav>

    <div class="side-actions">
      <template v-if="session.ready && session.loggedIn">
        <router-link to="/cuenta" class="btn btn-ghost" data-test="nav-account-side">
          <img v-if="session.user && session.user.picture" :src="session.user.picture" alt="" class="avatar" />
          Mi cuenta
        </router-link>
        <button class="btn" data-test="nav-logout-side" @click="logout()">Salir</button>
      </template>
      <template v-else-if="session.ready">
        <button class="btn btn-primary" data-test="nav-login-side" @click="login()">Entrar</button>
      </template>
    </div>
  </aside>
</template>

<style scoped>
svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; flex: none; }
.brand { color: var(--accent); letter-spacing: .06em; }
.actions, .side-actions { display: flex; gap: 8px; align-items: center; }
.avatar { width: 22px; height: 22px; border-radius: 50%; object-fit: cover; }

/* ---------- Escritorio ---------- */
.topbar { display: none; }
.side { position: fixed; inset: 0 auto 0 0; width: 220px; z-index: 50; display: flex; flex-direction: column; gap: 20px; padding: 20px 14px; background: var(--bg-2); border-right: 1px solid var(--line); }
.side-brand { font-size: 34px; padding: 4px 10px; }
.links { display: flex; flex-direction: column; gap: 4px; flex: 1; }
.link { display: flex; align-items: center; gap: 12px; padding: 11px 12px; border-radius: 8px; color: var(--muted); font-weight: 600; font-size: 15px; transition: color .15s, background .15s; }
.link:hover { color: var(--text); background: var(--card-2); }
.link.active { color: var(--text); background: var(--card-2); box-shadow: inset 3px 0 0 var(--accent); }
.link.active svg { stroke: var(--accent); }
.side-actions { flex-direction: column; align-items: stretch; }
.side-actions .btn { justify-content: center; }

/* ---------- Movil ---------- */
@media (max-width: 899px) {
  .topbar { display: flex; position: sticky; top: 0; z-index: 50; justify-content: space-between; align-items: center; height: 56px; padding: 0 16px; background: rgba(14,14,14,.94); backdrop-filter: blur(10px); border-bottom: 1px solid var(--line); }
  .topbar .brand { font-size: 26px; }
  .topbar .btn { padding: 8px 14px; }
  .side { inset: auto 0 0 0; width: 100%; flex-direction: row; gap: 0; padding: 0; border-right: 0; border-top: 1px solid var(--line); background: rgba(21,21,21,.97); backdrop-filter: blur(10px); padding-bottom: env(safe-area-inset-bottom); }
  .side-brand, .side-actions { display: none; }
  .links { flex-direction: row; justify-content: space-around; gap: 0; }
  .link { flex: 1; flex-direction: column; gap: 3px; padding: 9px 4px 8px; border-radius: 0; font-size: 11px; justify-content: center; align-items: center; }
  .link.active { box-shadow: inset 0 2px 0 var(--accent); background: transparent; }
  .hide-mobile { display: none; }
}
</style>
