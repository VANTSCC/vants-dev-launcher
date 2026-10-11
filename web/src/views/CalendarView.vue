<script setup>
import { onMounted, ref } from 'vue'
import { getEvents, groupEventsByMonth } from '../lib/players.js'

const loading = ref(true)
const error = ref(null)
const groups = ref([])

function eventTitle(e) {
  return e.title || e.name || 'Evento'
}

function monthLabel(d) {
  return d.toLocaleDateString('es', { month: 'long', year: 'numeric' })
}

function dayTime(iso) {
  return new Date(iso).toLocaleString('es', { weekday: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

onMounted(async () => {
  try {
    groups.value = groupEventsByMonth(await getEvents())
  } catch (e) {
    error.value = 'No se pudo cargar el calendario ahora mismo.'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <section class="page-head">
    <div class="container">
      <h1 class="title page-title">Calendario</h1>
      <p class="muted">Próximos eventos de la comunidad.</p>
    </div>
  </section>

  <section class="container">
    <div v-if="loading" class="skeleton" style="height:240px"></div>
    <p v-else-if="error" class="error" role="alert">{{ error }}</p>
    <p v-else-if="!groups.length" class="muted" data-test="calendar-empty">No hay eventos programados.</p>
    <div v-else data-test="calendar-list">
      <div v-for="g in groups" :key="g.key" class="card month">
        <h2 class="title">{{ monthLabel(g.date) }}</h2>
        <ul class="events">
          <li v-for="e in g.items" :key="e.id" class="ev">
            <span class="when muted">{{ dayTime(e.starts_at) }}</span>
            <strong>{{ eventTitle(e) }}</strong>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>

<style scoped>
.page-head { background: radial-gradient(900px 300px at 80% -20%, rgba(255,85,0,.18), transparent), linear-gradient(180deg, #151515, var(--bg)); border-bottom: 1px solid var(--line); padding: 48px 0 32px; margin-bottom: 24px; }
.page-title { font-size: clamp(40px, 7vw, 72px); margin: 10px 0 6px; }
.month { margin-bottom: 16px; }
.month h2 { text-transform: capitalize; margin-top: 0; }
.events { list-style: none; padding: 0; margin: 0; }
.ev { display: flex; gap: 16px; flex-wrap: wrap; padding: 12px 0; border-top: 1px solid var(--line); }
.ev:first-child { border-top: 0; }
.when { min-width: 150px; text-transform: capitalize; }
.error { color: var(--accent-2); }
</style>
