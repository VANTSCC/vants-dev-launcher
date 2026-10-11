<script setup>
import { computed, onMounted, ref } from 'vue'
import { getPlayers } from '../lib/players.js'
import { playerName } from '../lib/format.js'

const loading = ref(true)
const error = ref(null)
const players = ref([])
const query = ref('')

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  return q ? players.value.filter((p) => playerName(p).toLowerCase().includes(q)) : players.value
})

onMounted(async () => {
  try {
    players.value = await getPlayers()
  } catch (e) {
    error.value = 'No se pudo cargar la lista de jugadores ahora mismo.'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <section class="page-head">
    <div class="container">
      <h1 class="title page-title">Jugadores</h1>
      <p class="muted">Encuentra a otros jugadores de la comunidad.</p>
    </div>
  </section>

  <section class="container">
    <input v-model="query" class="search" type="search" placeholder="Buscar jugador" aria-label="Buscar jugador" data-test="players-search" />
    <div v-if="loading" class="skeleton" style="height:240px"></div>
    <p v-else-if="error" class="error" role="alert">{{ error }}</p>
    <p v-else-if="!players.length" class="muted" data-test="players-empty">Aún no hay jugadores registrados.</p>
    <p v-else-if="!filtered.length" class="muted" data-test="players-nomatch">Ningún jugador coincide con la búsqueda.</p>
    <ul v-else class="grid" data-test="players-list">
      <li v-for="p in filtered" :key="p.id">
        <router-link :to="`/jugadores/${p.id}`" class="card pcard">
          <img v-if="p.avatar_url" :src="p.avatar_url" alt="" class="avatar" />
          <span v-else class="avatar ph" aria-hidden="true">{{ playerName(p).slice(0, 1).toUpperCase() }}</span>
          <span class="info">
            <strong>{{ playerName(p) }}<span v-if="p.verified" class="badge"> ✔</span></strong>
            <span class="muted small">{{ [p.main_game, p.region || p.country].filter(Boolean).join(' · ') || '—' }}</span>
          </span>
        </router-link>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.page-head { background: radial-gradient(900px 300px at 80% -20%, rgba(255,85,0,.18), transparent), linear-gradient(180deg, #151515, var(--bg)); border-bottom: 1px solid var(--line); padding: 48px 0 32px; margin-bottom: 24px; }
.page-title { font-size: clamp(40px, 7vw, 72px); margin: 10px 0 6px; }
.search { width: 100%; padding: 12px 14px; margin-bottom: 14px; background: var(--card-2); border: 1px solid var(--line); border-radius: 6px; color: var(--text); font: inherit; }
.grid { list-style: none; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
.pcard { display: flex; align-items: center; gap: 12px; padding: 14px; color: var(--text); }
.pcard:hover { box-shadow: inset 0 0 0 1px var(--accent); }
.avatar { width: 44px; height: 44px; border-radius: 50%; object-fit: cover; flex: none; }
.avatar.ph { display: flex; align-items: center; justify-content: center; background: var(--card-2); color: var(--accent); font-weight: 700; }
.info { display: flex; flex-direction: column; min-width: 0; }
.small { font-size: 13px; }
.error { color: var(--accent-2); }
</style>
