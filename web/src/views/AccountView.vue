<script setup>
import { onMounted, ref, watch } from 'vue'
import { session, login, logout } from '../lib/auth.js'
import { getGameAccounts, getPlayerByAuthId, getPlayerStanding } from '../lib/db.js'
import { formatDate, gameProfileUrl, playerName, winRate } from '../lib/format.js'
import FaceitLink from '../components/FaceitLink.vue'

const loading = ref(true)
const error = ref(null)
const player = ref(null)
const accounts = ref([])
const standing = ref(null)

async function load() {
  if (!session.loggedIn || !session.user) {
    loading.value = false
    return
  }
  loading.value = true
  error.value = null
  try {
    const sub = session.user.sub
    const [p, a] = await Promise.all([getPlayerByAuthId(sub), getGameAccounts(sub)])
    player.value = p
    accounts.value = a
    standing.value = p ? await getPlayerStanding(p.id) : null
  } catch (e) {
    error.value = 'No se pudo cargar tu cuenta. Inténtalo de nuevo.'
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(() => session.loggedIn, load)

const account = (game) => accounts.value.find((a) => a.game === game) || null

function scrollToFaceit(e) {
  e.preventDefault()
  const el = document.getElementById('faceit')
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// Los botones de accion viven en el template: se renderizan siempre que haya sesion.
const actions = [
  { key: 'friends', label: 'Agregar amigos', href: '#/jugadores' },
  { key: 'faceit', label: 'FACEIT', href: '#faceit', onClick: scrollToFaceit },
  { key: 'streamer', label: 'Streamer', href: '../index.html#/cuenta' },
]
</script>

<template>
  <div class="container page">
    <div v-if="!session.loggedIn" class="card gate" data-test="account-gate">
      <h1 class="title h1">Mi cuenta</h1>
      <p class="muted">Inicia sesión para ver tu perfil, tus cuentas vinculadas y tu rango.</p>
      <button class="btn btn-primary" data-test="account-login" @click="login()">Entrar</button>
    </div>

    <template v-else>
      <div v-if="loading" class="card"><div class="skeleton" style="height:96px"></div></div>
      <p v-else-if="error" class="card error" role="alert">{{ error }}</p>

      <template v-else>
        <header class="card profile" data-test="profile-card">
          <img v-if="(player && player.avatar_url) || (session.user && session.user.picture)"
               :src="(player && player.avatar_url) || session.user.picture" alt="" class="big-avatar" />
          <div class="who">
            <h1 class="title h1" data-test="profile-name">{{ playerName(player || session.user) }}</h1>
            <p class="muted" v-if="player">@{{ player.username }} · {{ player.country || player.region || 'Sin país' }} · Desde {{ formatDate(player.created_at) }}</p>
            <p class="muted" v-else>Tu perfil de jugador aún no está creado.</p>
          </div>
          <div class="rank" v-if="standing" data-test="profile-rank">
            <div class="title rank-val">{{ standing.rank || 'Unranked' }}</div>
            <div class="muted">{{ standing.mmr }} MMR · {{ standing.wins }}V / {{ standing.losses }}D · {{ winRate(standing.wins, standing.losses) }}% WR</div>
          </div>
        </header>

        <nav class="actions" aria-label="Acciones de perfil" data-test="profile-actions">
          <a v-for="a in actions" :key="a.key" :href="a.href" class="btn" :data-test="`action-${a.key}`" @click="a.onClick && a.onClick($event)">{{ a.label }}</a>
        </nav>

        <FaceitLink />

        <section class="card">
          <h2 class="title h2">Cuentas vinculadas</h2>
          <p v-if="!accounts.length" class="muted" data-test="accounts-empty">Aún no has vinculado ninguna cuenta de juego.</p>
          <ul v-else class="rows" data-test="accounts-list">
            <li v-for="a in accounts" :key="a.game" class="row">
              <span class="badge">{{ a.game }}</span>
              <span class="name">{{ a.display_name || a.handle }}</span>
              <span class="badge" :class="a.verified ? 'badge-ok' : ''">{{ a.verified ? 'Verificada' : 'Sin verificar' }}</span>
              <a v-if="gameProfileUrl(a)" :href="gameProfileUrl(a)" target="_blank" rel="noopener noreferrer" class="muted">Ver perfil</a>
            </li>
          </ul>
        </section>

        <div><button class="btn btn-ghost" data-test="account-logout" @click="logout()">Cerrar sesión</button></div>
      </template>
    </template>
  </div>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 16px; padding-top: 32px; }
.h1 { font-size: 44px; }
.h2 { font-size: 26px; margin-bottom: 12px; }
.gate { display: flex; flex-direction: column; gap: 14px; align-items: flex-start; }
.profile { display: flex; gap: 20px; align-items: center; flex-wrap: wrap; border-left: 4px solid var(--accent); }
.big-avatar { width: 84px; height: 84px; border-radius: 12px; object-fit: cover; }
.who { flex: 1; min-width: 220px; }
.rank { text-align: right; }
.rank-val { font-size: 36px; color: var(--accent); }
.actions { display: flex; gap: 10px; flex-wrap: wrap; }
.rows { list-style: none; padding: 0; }
.row { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-top: 1px solid var(--line); flex-wrap: wrap; }
.row:first-child { border-top: 0; }
.name { font-weight: 600; flex: 1; }
.error { border-color: var(--accent-2); color: var(--accent-2); }
</style>
