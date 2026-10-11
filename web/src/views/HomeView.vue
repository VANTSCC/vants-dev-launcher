<script setup>
import { onMounted, ref } from 'vue'
import StatTile from '../components/StatTile.vue'
import { session, login } from '../lib/auth.js'
import { getActiveSeason, getLeaderboard, getStats, getUpcomingTournaments } from '../lib/db.js'
import { formatDate, playerName, statusLabel, winRate } from '../lib/format.js'

const loading = ref(true)
const error = ref(null)
const stats = ref({ players: 0, tournaments: 0, events: 0, matches: 0 })
const season = ref(null)
const top = ref([])
const tournaments = ref([])

const modes = [
  { label: 'Emparejamiento', to: '/ranked', hint: 'Sube de rango con MMR real' },
  { label: 'Liga', to: '/ranked', hint: 'Clasificación de la temporada' },
  { label: 'Torneos', to: '/torneos', hint: 'Inscríbete y compite' },
]

onMounted(async () => {
  try {
    const [s, t, se] = await Promise.all([getStats(), getUpcomingTournaments(4), getActiveSeason()])
    stats.value = s
    tournaments.value = t
    season.value = se
    top.value = se ? await getLeaderboard(se.id, 5) : []
  } catch (e) {
    error.value = 'No se pudieron cargar los datos ahora mismo.'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <section class="hero">
    <div class="container hero-inner">
      <span class="badge badge-live">Temporada {{ season ? season.season_number || season.name : 'próximamente' }}</span>
      <h1 class="title hero-title">Compite. Sube de rango.<br /><span class="accent">Gana en VANTS.</span></h1>
      <p class="muted hero-sub">Ranked con MMR real, torneos y ligas de VALORANT, CS2 y League of Legends.</p>
      <div class="hero-cta">
        <button v-if="session.ready && !session.loggedIn" class="btn btn-primary" data-test="hero-login" @click="login()">Entrar gratis</button>
        <router-link v-else-if="session.loggedIn" to="/cuenta" class="btn btn-primary">Ir a mi cuenta</router-link>
        <router-link class="btn" to="/torneos">Ver torneos</router-link>
      </div>
    </div>
  </section>

  <section class="container">
    <div class="grid modes" data-test="modes">
      <router-link v-for="m in modes" :key="m.label" :to="m.to" class="mode">
        <span class="mode-art" aria-hidden="true"></span>
        <span class="mode-label">{{ m.label }}</span>
        <span class="muted mode-hint">{{ m.hint }}</span>
      </router-link>
    </div>
  </section>

  <section class="container">
    <div class="grid stats">
      <StatTile label="Jugadores" :value="stats.players" :loading="loading" />
      <StatTile label="Torneos" :value="stats.tournaments" :loading="loading" />
      <StatTile label="Próximos eventos" :value="stats.events" :loading="loading" />
      <StatTile label="Partidas ranked" :value="stats.matches" :loading="loading" />
    </div>
    <p v-if="error" class="card error" role="alert">{{ error }}</p>
  </section>

  <section class="container two">
    <div class="card">
      <h2 class="title h2">Top ranked</h2>
      <div v-if="loading" class="skeleton" style="height:120px"></div>
      <p v-else-if="!top.length" class="muted" data-test="top-empty">Aún no hay jugadores clasificados en esta temporada.</p>
      <ol v-else class="rows" data-test="top-list">
        <li v-for="(p, i) in top" :key="p.player_id" class="row">
          <span class="pos title">{{ i + 1 }}</span>
          <img v-if="p.avatar_url" :src="p.avatar_url" alt="" class="avatar" />
          <span class="name">{{ playerName(p) }}</span>
          <span class="muted">{{ p.rank || 'Unranked' }}</span>
          <strong>{{ p.mmr }} MMR</strong>
          <span class="muted">{{ winRate(p.wins, p.losses) }}% WR</span>
        </li>
      </ol>
    </div>

    <div class="card">
      <h2 class="title h2">Torneos</h2>
      <div v-if="loading" class="skeleton" style="height:120px"></div>
      <p v-else-if="!tournaments.length" class="muted" data-test="tournaments-empty">No hay torneos abiertos por ahora.</p>
      <ul v-else class="rows" data-test="tournaments-list">
        <li v-for="t in tournaments" :key="t.id" class="row">
          <span class="name">{{ t.name }}</span>
          <span class="badge">{{ statusLabel(t.status) }}</span>
          <span class="muted">{{ formatDate(t.starts_at) }}</span>
          <span class="muted">{{ t.current_participants }}/{{ t.max_participants || '∞' }}</span>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.hero { background: radial-gradient(1200px 400px at 80% -10%, rgba(255,85,0,.28), transparent), repeating-linear-gradient(135deg, rgba(255,255,255,.02) 0 14px, transparent 14px 28px), linear-gradient(180deg, #151515, var(--bg)); border-bottom: 1px solid var(--line); padding: 64px 0 56px; }
.hero-inner { display: flex; flex-direction: column; gap: 18px; align-items: flex-start; }
.hero-title { font-size: clamp(40px, 7vw, 84px); }
.accent { color: var(--accent); }
.hero-sub { font-size: 18px; max-width: 560px; }
.hero-cta { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 8px; }

.modes { grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); margin-top: -28px; position: relative; }
.mode { display: flex; flex-direction: column; gap: 4px; background: var(--card); border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; transition: transform .15s, border-color .15s; }
.mode:hover { transform: translateY(-3px); border-color: var(--accent); }
.mode-art { height: 110px; background: radial-gradient(circle at 50% 120%, rgba(255,255,255,.18), transparent 60%), linear-gradient(180deg, #ff5500 0%, #8a2a00 100%); }
.mode-label { padding: 12px 16px 0; font-weight: 700; font-size: 18px; }
.mode-hint { padding: 0 16px 14px; font-size: 13px; }

.stats { grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); margin-top: 24px; position: relative; }
.two { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; margin-top: 32px; }
.h2 { font-size: 26px; margin-bottom: 14px; }
.rows { list-style: none; padding: 0; display: flex; flex-direction: column; }
.row { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-top: 1px solid var(--line); flex-wrap: wrap; }
.row:first-child { border-top: 0; }
.pos { font-size: 24px; width: 28px; color: var(--accent); }
.name { font-weight: 600; flex: 1; min-width: 120px; }
.avatar { width: 28px; height: 28px; border-radius: 50%; object-fit: cover; }
.error { margin-top: 16px; border-color: var(--accent-2); color: var(--accent-2); }
</style>
