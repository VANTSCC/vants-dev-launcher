<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { session, login } from '../lib/auth.js'
import {
  checkAdmin, botStatus, getHeartbeat, getSettings, getAlerts, getChannels, getCommandRuns, getAudit,
  getAlertCounts, retryAlert, setSetting, setAdminTokenGetter,
} from '../lib/admin.js'

const LABELS = {
  alerts_tournament: 'Torneos nuevos',
  alerts_event: 'Eventos nuevos',
  alerts_event_reminder: 'Recordatorio de eventos (1 h antes)',
  alerts_ranked_result: 'Resultados ranked',
}
const KINDS = { tournament: 'Torneo', event: 'Evento', event_reminder: 'Recordatorio', ranked_result: 'Resultado ranked' }
const TABS = [['resumen', 'Resumen'], ['alertas', 'Alertas'], ['canales', 'Canales'], ['comandos', 'Comandos'], ['auditoria', 'Auditoria']]

const state = ref('loading') // loading | login | denied | ok
const tab = ref('resumen')
const error = ref(null)
const busy = ref(false)
const hb = ref(null)
const counts = ref({ pending: 0, sent: 0, failed: 0 })
const settings = ref([])
const alerts = ref([])
const filter = ref('')
const channels = ref([])
const runs = ref([])
const audit = ref([])
const now = ref(Date.now())
let timer = null

const status = computed(() => botStatus(hb.value && hb.value.last_seen))
const ago = computed(() => {
  if (!hb.value) return '-'
  const s = Math.max(0, Math.round((now.value - new Date(hb.value.last_seen).getTime()) / 1000))
  return s < 60 ? `hace ${s} s` : `hace ${Math.round(s / 60)} min`
})
const failedRuns = computed(() => runs.value.filter((r) => !r.ok).length)
const fmt = (d) => (d ? new Date(d).toLocaleString('es') : '-')
const title = (a) => (a.payload && (a.payload.name || a.payload.title)) || (a.payload && a.payload.p1 ? `${a.payload.p1} vs ${a.payload.p2}` : a.ref_id)

async function loadCore() {
  const [h, c, s] = await Promise.all([getHeartbeat(), getAlertCounts(), getSettings()])
  hb.value = h
  counts.value = c
  settings.value = s
}
async function loadTab() {
  try {
    error.value = null
    if (tab.value === 'resumen') { await loadCore(); runs.value = await getCommandRuns() }
    if (tab.value === 'alertas') { await loadCore(); alerts.value = await getAlerts(filter.value) }
    if (tab.value === 'canales') channels.value = await getChannels()
    if (tab.value === 'comandos') runs.value = await getCommandRuns()
    if (tab.value === 'auditoria') audit.value = await getAudit()
  } catch (e) {
    error.value = e.message || 'No se pudo cargar'
  }
}
function go(t) { tab.value = t; loadTab() }
async function toggle(s) {
  busy.value = true
  try { await setSetting(s.key, !s.enabled); s.enabled = !s.enabled } catch (e) { error.value = e.message } finally { busy.value = false }
}
async function retry(a) {
  busy.value = true
  try { await retryAlert(a.id); a.status = 'pending'; a.error = null } catch (e) { error.value = e.message } finally { busy.value = false }
}

onMounted(async () => {
  if (!session.ready) await new Promise((r) => { const t = setInterval(() => session.ready && (clearInterval(t), r()), 50) })
  if (!session.loggedIn) { state.value = 'login'; return }
  try {
    const admin = await checkAdmin(session.user.sub)
    if (!admin) { state.value = 'denied'; return }
    state.value = 'ok'
    await loadTab()
    timer = setInterval(() => { now.value = Date.now(); if (tab.value === 'resumen' || tab.value === 'alertas') loadTab() }, 15000)
  } catch (e) {
    error.value = e.message || 'No se pudo comprobar el acceso'
    state.value = 'denied'
  }
})
onUnmounted(() => clearInterval(timer))
</script>

<template>
  <section class="page-head">
    <div class="container">
      <span class="badge badge-live">Administracion</span>
      <h1 class="title page-title">Panel admin</h1>
      <p class="muted">Estado del bot, alertas automaticas por canal y control de lo que publica.</p>
    </div>
  </section>

  <section class="container">
    <div v-if="state === 'loading'" class="skeleton" style="height:200px"></div>
    <div v-else-if="state === 'login'" class="card">
      <p>Inicia sesion para entrar al panel.</p>
      <button class="btn btn-primary" data-test="admin-login" @click="login()">Entrar</button>
    </div>
    <div v-else-if="state === 'denied'" class="card" data-test="admin-denied">
      <p>Tu cuenta no tiene acceso al panel.</p>
      <p class="muted">Necesitas tener tu cuenta de Discord vinculada y estar en la lista de admins del bot.</p>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
    </div>

    <template v-else>
      <nav class="tabs" aria-label="Secciones">
        <button v-for="[k, l] in TABS" :key="k" class="tab" :class="{ on: tab === k }" :data-test="`tab-${k}`" @click="go(k)">{{ l }}</button>
      </nav>
      <p v-if="error" class="error" role="alert">{{ error }}</p>

      <!-- RESUMEN -->
      <div v-if="tab === 'resumen'" class="grid">
        <div class="card stat">
          <span class="muted">Bot</span>
          <strong class="big" :class="status.key" data-test="bot-status">{{ status.label }}</strong>
          <span class="muted">Ultimo latido {{ ago }}</span>
          <span v-if="hb" class="muted">{{ hb.latency_ms ?? '-' }} ms · {{ hb.guilds ?? '-' }} servidor(es) · {{ hb.version }}</span>
        </div>
        <div class="card stat"><span class="muted">Alertas enviadas</span><strong class="big ok">{{ counts.sent }}</strong></div>
        <div class="card stat"><span class="muted">En cola</span><strong class="big">{{ counts.pending }}</strong></div>
        <div class="card stat"><span class="muted">Fallidas</span><strong class="big" :class="{ down: counts.failed }">{{ counts.failed }}</strong></div>
        <div class="card stat"><span class="muted">Comandos con error (ultimos 40)</span><strong class="big" :class="{ warn: failedRuns }">{{ failedRuns }}</strong></div>
        <div class="card wide">
          <h3>Que publica el bot solo</h3>
          <label v-for="s in settings" :key="s.key" class="switch">
            <input type="checkbox" :checked="s.enabled" :disabled="busy" :data-test="`sw-${s.key}`" @change="toggle(s)" />
            <span>{{ LABELS[s.key] || s.key }}</span>
          </label>
        </div>
      </div>

      <!-- ALERTAS -->
      <div v-else-if="tab === 'alertas'" class="card">
        <div class="bar">
          <select v-model="filter" aria-label="Estado" @change="loadTab()">
            <option value="">Todas</option><option value="pending">En cola</option><option value="sent">Enviadas</option><option value="failed">Fallidas</option><option value="skipped">Omitidas</option>
          </select>
          <button class="btn" @click="loadTab()">Actualizar</button>
        </div>
        <p v-if="!alerts.length" class="muted">Sin alertas todavia.</p>
        <ul v-else class="list" data-test="alert-list">
          <li v-for="a in alerts" :key="a.id" class="li">
            <span class="pill" :class="a.status">{{ a.status }}</span>
            <span class="grow"><strong>{{ KINDS[a.kind] || a.kind }}</strong> · {{ title(a) }}<br /><small class="muted">{{ a.category }} · {{ fmt(a.sent_at || a.created_at) }}<template v-if="a.error"> · {{ a.error }}</template></small></span>
            <button v-if="a.status === 'failed'" class="btn" :disabled="busy" @click="retry(a)">Reintentar</button>
          </li>
        </ul>
      </div>

      <!-- CANALES -->
      <div v-else-if="tab === 'canales'" class="card">
        <p class="muted">Canal de Discord que usa el bot para cada categoria. Se cambian con el comando del bot de canales; aqui se comprueba que existan.</p>
        <p v-if="!channels.length" class="muted">No hay canales configurados. Ejecuta /setup en Discord.</p>
        <ul v-else class="list"><li v-for="c in channels" :key="c.id" class="li"><strong class="grow">{{ c.category }}</strong><code>{{ c.channel_id }}</code><small class="muted">{{ fmt(c.updated_at) }}</small></li></ul>
      </div>

      <!-- COMANDOS -->
      <div v-else-if="tab === 'comandos'" class="card">
        <p v-if="!runs.length" class="muted">Sin ejecuciones registradas.</p>
        <ul v-else class="list"><li v-for="r in runs" :key="r.id" class="li"><span class="pill" :class="r.ok ? 'sent' : 'failed'">{{ r.ok ? 'ok' : 'error' }}</span><strong class="grow">/{{ r.command }}</strong><small class="muted">{{ fmt(r.created_at) }}</small></li></ul>
      </div>

      <!-- AUDITORIA -->
      <div v-else class="card">
        <p v-if="!audit.length" class="muted">Sin registros.</p>
        <ul v-else class="list"><li v-for="a in audit" :key="a.id" class="li"><strong>{{ a.action }}</strong><span class="grow muted">{{ a.actor_type }} {{ a.actor_id }} → {{ a.target_type }} {{ a.target_id }}</span><small class="muted">{{ fmt(a.created_at) }}</small></li></ul>
      </div>
    </template>
  </section>
</template>

<style scoped>
.page-head { background: radial-gradient(900px 300px at 80% -20%, rgba(255,85,0,.18), transparent), linear-gradient(180deg, #151515, var(--bg)); border-bottom: 1px solid var(--line); padding: 48px 0 32px; margin-bottom: 24px; }
.page-title { font-size: clamp(40px, 7vw, 72px); margin: 10px 0 6px; }
.tabs { display: flex; gap: 6px; overflow-x: auto; margin-bottom: 16px; }
.tab { background: var(--card-2); color: var(--muted); border: 1px solid var(--line); border-radius: 8px; padding: 10px 16px; font: inherit; font-weight: 600; cursor: pointer; }
.tab.on { color: var(--text); box-shadow: inset 0 -3px 0 var(--accent); }
.grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
.wide { grid-column: 1 / -1; }
.stat { display: flex; flex-direction: column; gap: 6px; }
.big { font-size: 34px; }
.ok { color: #3ddc84; } .warn { color: #ffb800; } .down { color: #ff4655; }
.switch { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-top: 1px solid var(--line); cursor: pointer; }
.bar { display: flex; gap: 8px; margin-bottom: 12px; }
select { background: var(--card-2); color: var(--text); border: 1px solid var(--line); border-radius: 6px; padding: 8px 10px; font: inherit; }
.list { list-style: none; padding: 0; margin: 0; }
.li { display: flex; align-items: center; gap: 12px; padding: 12px 4px; border-top: 1px solid var(--line); flex-wrap: wrap; }
.li:first-child { border-top: 0; }
.grow { flex: 1; min-width: 160px; }
.pill { font-size: 12px; font-weight: 700; text-transform: uppercase; padding: 3px 9px; border-radius: 999px; background: var(--card-2); border: 1px solid var(--line); }
.pill.sent { color: #3ddc84; } .pill.failed { color: #ff4655; } .pill.pending { color: #ffb800; }
.error { color: var(--accent-2); }
code { background: var(--card-2); padding: 2px 6px; border-radius: 4px; }
</style>
