<script setup>
import { session, login, logout } from '../lib/auth.js'

// Las secciones migradas son internas; el resto sigue en la web actual (fases siguientes las migran).
const links = [
  { label: 'Inicio', to: '/', internal: true },
  { label: 'Ranked', to: '/ranked', internal: true },
  { label: 'Torneos', to: '/torneos', internal: true },
  { label: 'Jugadores', href: '../index.html#/jugadores' },
  { label: 'Calendario', href: '../index.html#/calendario' },
  { label: 'Planes', href: '../index.html#/precios' },
]
</script>

<template>
  <header class="nav">
    <div class="container nav-inner">
      <router-link to="/" class="brand title" aria-label="VANTS inicio">VANTS</router-link>

      <nav class="links" aria-label="Principal">
        <template v-for="l in links" :key="l.label">
          <router-link v-if="l.internal" :to="l.to" class="link" active-class="" exact-active-class="active">{{ l.label }}</router-link>
          <a v-else :href="l.href" class="link">{{ l.label }}</a>
        </template>
      </nav>

      <div class="actions">
        <template v-if="session.ready && session.loggedIn">
          <router-link to="/cuenta" class="btn btn-ghost" data-test="nav-account">
            <img v-if="session.user && session.user.picture" :src="session.user.picture" alt="" class="avatar" />
            Mi cuenta
          </router-link>
          <button class="btn" data-test="nav-logout" @click="logout()">Salir</button>
        </template>
        <template v-else-if="session.ready">
          <button class="btn btn-primary" data-test="nav-login" @click="login()">Entrar</button>
        </template>
      </div>
    </div>
  </header>
</template>

<style scoped>
.nav { position: sticky; top: 0; z-index: 50; background: rgba(14,14,14,.92); backdrop-filter: blur(10px); border-bottom: 1px solid var(--line); }
.nav-inner { display: flex; align-items: center; gap: 28px; height: 64px; }
.brand { font-size: 30px; color: var(--accent); letter-spacing: .06em; }
.links { display: flex; gap: 4px; flex: 1; overflow-x: auto; }
.link { padding: 8px 14px; border-radius: 6px; color: var(--muted); font-weight: 600; font-size: 14px; white-space: nowrap; transition: color .15s, background .15s; }
.link:hover, .link.active { color: var(--text); background: var(--card-2); }
.link.active { box-shadow: inset 0 -2px 0 var(--accent); }
.actions { display: flex; gap: 8px; align-items: center; }
.avatar { width: 22px; height: 22px; border-radius: 50%; object-fit: cover; }
@media (max-width: 720px) { .nav-inner { gap: 12px; } .brand { font-size: 24px; } }
</style>
