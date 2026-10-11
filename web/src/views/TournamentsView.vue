<script setup>
import { computed, onMounted, ref } from 'vue'
import { getTournaments } from '../lib/db.js'
import { formatDate, statusLabel } from '../lib/format.js'

const loading = ref(true)
const error = ref(null)
const all = ref([])
const filter = ref('abiertos')

const OPEN = ['registration', 'open', 'upcoming', 'in_progress', 'live']
const DONE = ['completed', 'closed', 'cancelled']

const filters = [
  { key: 'abiertos', label: 'Abiertos' },
  { key: 'finalizados', label: 'Finalizados' },
  { key: 'todos', label: 'Todos' },
]

const list = computed(() => {
  if (filter.value === 'abiertos') return all.value.filter((t) => OPEN.includes(t.status))
  if (filter.value === 'finalizados') return all.value.filter((t) => DONE.includes(t.status))
  return all.value
})

function isLive(t) {
  return t.status === 'live' || t.status === 'in_progress'
}

onMounted(async () => {
  try {
    all.value = await getTournaments()
  } catch (e) {
    error.value = 'No se pudieron cargar los torneos ahora mismo.'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <section class="page-head">
    <div class="container">
      <h1 class="title page-title">Torneos</h1>
      <p class="muted">Torneos y ligas de VALORANT, CS2 y League of Legends.</p>
      <div class="tabs" role="tablist">
        <button v-for="f in filters" :key="f.key" class="tab" :class="{ on: filter === f.key }" role="tab" :aria-selected="filter === f.key" :data-test="`tab-${f.key}`" @click="filter = f.key">{{ f.label }}</button>
      </div>
    </div>
  </section>

  <section class="container">
    <div v-if="loading" class="grid cards">
      <div v-for="n in 3" :key="n" class="skeleton" style="height:150px"></div>
    </div>
    <p v-else-if="error" class="card error" role="alert">{{ error }}</p>
    <p v-else-if="!list.length" class="card muted" data-test="tournaments-empty">No hay torneos en esta categoría.</p>
    <div v-else class="grid cards" data-test="tournaments-grid">
      <article v-for="t in list" :key="t.id" class="card t">
        <div class="t-top">
          <span class="badge" :class="{ 'badge-live': isLive(t) }">{{ statusLabel(t.status) }}</span>
          <span class="muted game">{{ t.game || '—' }}</span>
        </div>
        <h2 class="title t-name">{{ t.name }}</h2>
        <dl class="meta">
          <div><dt class="muted">Inicio</dt><dd>{{ formatDate(t.starts_at) }}</dd></div>
          <div><dt class="muted">Inscritos</dt><dd>{{ t.current_participants || 0 }}/{{ t.max_participants || '∞' }}</dd></div>
          <div v-if="t.prize_pool"><dt class="muted">Premio</dt><dd>{{ t.prize_pool }}</dd></div>
        </dl>
      </article>
    </div>
  </section>
</template>

<style scoped>
.page-head { background: radial-gradient(900px 300px at 80% -20%, rgba(255,85,0,.18), transparent), linear-gradient(180deg, #151515, var(--bg)); border-bottom: 1px solid var(--line); padding: 48px 0 24px; margin-bottom: 24px; }
.page-title { font-size: clamp(40px, 7vw, 72px); margin: 0 0 6px; }
.tabs { display: flex; gap: 8px; margin-top: 18px; flex-wrap: wrap; }
.tab { padding: 8px 16px; border-radius: 6px; border: 1px solid var(--line); background: var(--card-2); color: var(--muted); font: inherit; font-weight: 600; cursor: pointer; }
.tab.on { color: var(--text); border-color: var(--accent); box-shadow: inset 0 -2px 0 var(--accent); }
.cards { grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
.t { display: flex; flex-direction: column; gap: 12px; }
.t-top { display: flex; justify-content: space-between; align-items: center; }
.game { text-transform: uppercase; font-size: 12px; letter-spacing: .08em; }
.t-name { font-size: 26px; }
.meta { display: flex; gap: 20px; flex-wrap: wrap; margin: 0; }
.meta dt { font-size: 12px; }
.meta dd { margin: 2px 0 0; font-weight: 600; }
.error { border-color: var(--accent-2); color: var(--accent-2); }
</style>
