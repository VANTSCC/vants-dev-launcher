<script setup>
import { computed, onMounted, ref } from 'vue'
import { getActiveSeason, getLeaderboard } from '../lib/db.js'
import { playerName, winRate } from '../lib/format.js'

const loading = ref(true)
const error = ref(null)
const season = ref(null)
const rows = ref([])
const query = ref('')

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  const list = rows.value.map((p, i) => ({ ...p, pos: i + 1 }))
  return q ? list.filter((p) => playerName(p).toLowerCase().includes(q)) : list
})

onMounted(async () => {
  try {
    season.value = await getActiveSeason()
    rows.value = season.value ? await getLeaderboard(season.value.id, 100) : []
  } catch (e) {
    error.value = 'No se pudo cargar la clasificación ahora mismo.'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <section class="page-head">
    <div class="container">
      <span class="badge badge-live">Temporada {{ season ? season.season_number || season.name : 'próximamente' }}</span>
      <h1 class="title page-title">Ranked</h1>
      <p class="muted">Clasificación por MMR de la temporada activa.</p>
    </div>
  </section>

  <section class="container">
    <div class="card">
      <input v-model="query" class="search" type="search" placeholder="Buscar jugador" aria-label="Buscar jugador" data-test="ranked-search" />

      <div v-if="loading" class="skeleton" style="height:240px"></div>
      <p v-else-if="error" class="error" role="alert">{{ error }}</p>
      <p v-else-if="!rows.length" class="muted" data-test="ranked-empty">Aún no hay jugadores clasificados en esta temporada.</p>
      <p v-else-if="!filtered.length" class="muted" data-test="ranked-nomatch">Ningún jugador coincide con la búsqueda.</p>
      <ol v-else class="rows" data-test="ranked-list">
        <li v-for="p in filtered" :key="p.player_id" class="row" :class="{ podium: p.pos <= 3 }">
          <span class="pos title">{{ p.pos }}</span>
          <img v-if="p.avatar_url" :src="p.avatar_url" alt="" class="avatar" />
          <span class="name">{{ playerName(p) }}</span>
          <span class="muted rank">{{ p.rank || 'Unranked' }}</span>
          <span class="muted rec">{{ p.wins || 0 }}V - {{ p.losses || 0 }}D</span>
          <span class="muted rec">{{ winRate(p.wins, p.losses) }}% WR</span>
          <strong class="mmr">{{ p.mmr }} MMR</strong>
        </li>
      </ol>
    </div>
  </section>
</template>

<style scoped>
.page-head { background: radial-gradient(900px 300px at 80% -20%, rgba(255,85,0,.18), transparent), linear-gradient(180deg, #151515, var(--bg)); border-bottom: 1px solid var(--line); padding: 48px 0 32px; margin-bottom: 24px; }
.page-title { font-size: clamp(40px, 7vw, 72px); margin: 10px 0 6px; }
.search { width: 100%; padding: 12px 14px; margin-bottom: 14px; background: var(--card-2); border: 1px solid var(--line); border-radius: 6px; color: var(--text); font: inherit; }
.rows { list-style: none; padding: 0; display: flex; flex-direction: column; }
.row { display: flex; align-items: center; gap: 12px; padding: 12px 8px; border-top: 1px solid var(--line); flex-wrap: wrap; }
.row:first-child { border-top: 0; }
.row.podium { background: linear-gradient(90deg, rgba(255,85,0,.08), transparent); }
.pos { font-size: 24px; width: 36px; color: var(--accent); }
.name { font-weight: 600; flex: 1; min-width: 120px; }
.avatar { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; }
.rank { min-width: 90px; }
.rec { min-width: 80px; }
.mmr { min-width: 90px; text-align: right; }
.error { color: var(--accent-2); }
</style>
