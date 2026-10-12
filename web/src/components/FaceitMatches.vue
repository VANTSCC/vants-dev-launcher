<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { getFaceitAccount, getFaceitMatches, faceitSummary } from '../lib/faceit.js'

const props = defineProps({ username: { type: String, required: true } })

const loading = ref(true)
const account = ref(null)
const matches = ref([])
const summary = computed(() => faceitSummary(matches.value))

const LEVEL_COLORS = { 1: '#eee', 2: '#1ce400', 3: '#1ce400', 4: '#ffc800', 5: '#ffc800', 6: '#ffc800', 7: '#ffc800', 8: '#ff6309', 9: '#ff6309', 10: '#fe1f00' }
const levelColor = (l) => LEVEL_COLORS[l] || '#ff5500'
const mapName = (m) => String(m || '').replace(/^de_/, '')
const date = (d) => (d ? new Date(Number.isNaN(Number(d)) ? d : Number(d)).toLocaleDateString('es') : '')

async function load() {
  loading.value = true
  const [acc, list] = await Promise.all([getFaceitAccount(props.username), getFaceitMatches(props.username)])
  account.value = acc
  matches.value = list
  loading.value = false
}

onMounted(load)
watch(() => props.username, load)
</script>

<template>
  <div v-if="loading" class="card skeleton" style="height:120px" data-test="faceit-loading"></div>
  <div v-else-if="account || matches.length" class="card faceit" data-test="faceit-box">
    <div class="head">
      <h2 class="title">Historial FACEIT · CS2</h2>
      <a v-if="account && account.url" :href="account.url" target="_blank" rel="noopener noreferrer" class="muted">Ver en FACEIT</a>
    </div>

    <div v-if="account" class="acc" data-test="faceit-account">
      <img v-if="account.avatar" :src="account.avatar" alt="" />
      <span class="lvl" :style="{ color: levelColor(account.level) }" :title="`Nivel ${account.level}`">{{ account.level ?? '—' }}</span>
      <div>
        <strong>{{ account.nickname }}</strong>
        <div class="muted">ELO {{ account.elo ?? '—' }}</div>
      </div>
    </div>

    <div v-if="matches.length" class="sum">
      <span class="w">{{ summary.wins }} victorias</span>
      <span class="l">{{ summary.losses }} derrotas</span>
      <span>Winrate {{ summary.wr }}%</span>
    </div>

    <ul v-if="matches.length" class="rows" data-test="faceit-matches">
      <li v-for="m in matches" :key="m.id">
        <a :href="`https://www.faceit.com/es/cs2/room/${m.id}`" target="_blank" rel="noopener noreferrer" class="row">
          <span :class="m.win ? 'w' : 'l'">{{ m.win ? 'VICTORIA' : 'DERROTA' }}</span>
          <span>{{ mapName(m.map) }} <span class="muted">{{ m.score }}</span></span>
          <span>{{ m.kills }} / {{ m.deaths }}</span>
          <span>K/D {{ m.kd }}</span>
          <span class="muted">{{ date(m.date) }}</span>
        </a>
      </li>
    </ul>
    <p v-else class="muted">Sin partidas recientes en FACEIT.</p>
  </div>
</template>

<style scoped>
.faceit { border-color: rgba(255, 85, 0, .35); }
.head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.head h2 { margin: 0; }
.acc { display: flex; align-items: center; gap: 12px; margin: 12px 0; }
.acc img { width: 44px; height: 44px; border-radius: 8px; object-fit: cover; }
.lvl { display: inline-flex; align-items: center; justify-content: center; min-width: 34px; height: 34px; border-radius: 50%; border: 3px solid currentColor; font-weight: 800; }
.sum { display: flex; gap: 16px; flex-wrap: wrap; margin: 8px 0; }
.w { color: #5fd38d; font-weight: 800; }
.l { color: #ff6b6b; font-weight: 800; }
.rows { list-style: none; padding: 0; margin: 0; }
.row { display: grid; grid-template-columns: 90px 1fr 80px 80px 90px; gap: 8px; align-items: center; padding: 10px 0; border-top: 1px solid var(--line); color: inherit; text-decoration: none; }
@media (max-width: 599px) { .row { grid-template-columns: 80px 1fr 70px; } .row > :nth-child(4), .row > :nth-child(5) { display: none; } }
</style>
