<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { getPlayerById, getPlayerSeasons } from '../lib/players.js'
import { formatDate, playerName, winRate } from '../lib/format.js'

const route = useRoute()
const loading = ref(true)
const error = ref(null)
const player = ref(null)
const seasons = ref([])

const totals = computed(() => {
  const wins = seasons.value.reduce((a, s) => a + (Number(s.wins) || 0), 0)
  const losses = seasons.value.reduce((a, s) => a + (Number(s.losses) || 0), 0)
  const best = seasons.value.reduce((a, s) => Math.max(a, Number(s.mmr) || 0), 0)
  return { wins, losses, best, wr: winRate(wins, losses) }
})

onMounted(async () => {
  try {
    player.value = await getPlayerById(route.params.id)
    if (player.value) seasons.value = await getPlayerSeasons(player.value.id)
  } catch (e) {
    error.value = 'No se pudo cargar el perfil ahora mismo.'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <section class="container profile">
    <router-link to="/jugadores" class="muted back">← Jugadores</router-link>

    <div v-if="loading" class="skeleton" style="height:260px"></div>
    <p v-else-if="error" class="error" role="alert">{{ error }}</p>
    <p v-else-if="!player" class="muted" data-test="profile-notfound">Jugador no encontrado.</p>
    <div v-else class="layout">
      <aside class="card side" data-test="profile-card">
        <img v-if="player.avatar_url" :src="player.avatar_url" alt="" class="big" />
        <h1 class="title name">{{ playerName(player) }}</h1>
        <span v-if="player.verified" class="badge">Verificado</span>
        <dl>
          <div><dt class="muted">Juego principal</dt><dd>{{ player.main_game || '—' }}</dd></div>
          <div><dt class="muted">Región</dt><dd>{{ player.region || player.country || '—' }}</dd></div>
          <div><dt class="muted">Miembro desde</dt><dd>{{ formatDate(player.created_at) }}</dd></div>
        </dl>
      </aside>

      <div class="main">
        <div class="stats" data-test="profile-stats">
          <div class="card stat"><strong class="title">{{ totals.best || '—' }}</strong><span class="muted">Mejor MMR</span></div>
          <div class="card stat"><strong class="title">{{ totals.wins }}</strong><span class="muted">Victorias</span></div>
          <div class="card stat"><strong class="title">{{ totals.losses }}</strong><span class="muted">Derrotas</span></div>
          <div class="card stat"><strong class="title">{{ totals.wr }}%</strong><span class="muted">Win rate</span></div>
        </div>

        <div class="card">
          <h2 class="title">Colocaciones de temporada</h2>
          <p v-if="!seasons.length" class="muted" data-test="profile-noseasons">Sin partidas clasificatorias todavía.</p>
          <ul v-else class="seasons" data-test="profile-seasons">
            <li v-for="s in seasons" :key="s.season_id" class="srow">
              <span class="muted">Temporada {{ s.season ? s.season.season_number || s.season.name : '—' }}</span>
              <span>{{ s.rank || 'Unranked' }}</span>
              <span class="muted">{{ s.wins || 0 }}V - {{ s.losses || 0 }}D</span>
              <strong>{{ s.mmr }} MMR</strong>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.profile { padding-top: 24px; }
.back { display: inline-block; margin-bottom: 16px; }
.layout { display: grid; grid-template-columns: 280px 1fr; gap: 16px; align-items: start; }
.side { display: flex; flex-direction: column; gap: 10px; align-items: flex-start; }
.big { width: 96px; height: 96px; border-radius: 12px; object-fit: cover; }
.name { font-size: 32px; margin: 0; }
dl { width: 100%; margin: 8px 0 0; display: flex; flex-direction: column; gap: 10px; }
dd { margin: 2px 0 0; font-weight: 600; }
.main { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.stat { display: flex; flex-direction: column; gap: 4px; padding: 16px; }
.stat strong { font-size: 30px; color: var(--accent); }
.seasons { list-style: none; padding: 0; margin: 0; }
.srow { display: flex; gap: 12px; justify-content: space-between; flex-wrap: wrap; padding: 12px 0; border-top: 1px solid var(--line); }
.srow:first-child { border-top: 0; }
.error { color: var(--accent-2); }
@media (max-width: 899px) {
  .layout { grid-template-columns: 1fr; }
  .stats { grid-template-columns: repeat(2, 1fr); }
}
</style>
