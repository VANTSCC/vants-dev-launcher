<script setup>
import { onMounted, ref } from 'vue'
import { getMyFaceit, linkFaceit, unlinkFaceit } from '../lib/faceit.js'

const LEVEL_COLORS = { 1: '#eee', 2: '#1ce400', 3: '#1ce400', 4: '#ffc800', 5: '#ffc800', 6: '#ffc800', 7: '#ffc800', 8: '#ff6309', 9: '#ff6309', 10: '#fe1f00' }

const loading = ref(true)
const busy = ref(false)
const acc = ref(null)
const nickname = ref('')
const msg = ref('')
const msgType = ref('')

function say(text, type) { msg.value = text; msgType.value = type }

onMounted(async () => {
  try { acc.value = await getMyFaceit() } catch (e) { acc.value = null }
  finally { loading.value = false }
})

async function link(nick) {
  const n = (nick || '').trim()
  if (!n) return
  busy.value = true
  try {
    acc.value = await linkFaceit(n)
    say(nick === nickname.value ? 'Cuenta de FACEIT vinculada.' : 'Datos actualizados.', 'ok')
    nickname.value = ''
  } catch (e) { say(e.message, 'err') }
  finally { busy.value = false }
}

async function unlink() {
  busy.value = true
  try { await unlinkFaceit(); acc.value = null; say('FACEIT desvinculado.', 'ok') }
  catch (e) { say(e.message, 'err') }
  finally { busy.value = false }
}
</script>

<template>
  <section id="faceit" class="card faceit" data-test="faceit-link">
    <h2 class="title h2"><span class="dot"></span>FACEIT</h2>
    <div v-if="loading" class="skeleton" style="height:44px"></div>
    <div v-else-if="acc" class="acc" data-test="faceit-linked">
      <img v-if="acc.avatar" :src="acc.avatar" alt="" />
      <span v-if="acc.level != null" class="lvl" :style="{ color: LEVEL_COLORS[acc.level] || '#ff5500' }">{{ acc.level }}</span>
      <div class="who">
        <a :href="acc.url" target="_blank" rel="noopener noreferrer"><strong>{{ acc.nickname }}</strong></a>
        <div class="muted"><span v-if="acc.elo != null"><b>{{ acc.elo }} ELO</b> · </span>{{ acc.game ? acc.game.toUpperCase() : 'Sin CS2' }}</div>
      </div>
      <div class="btns">
        <button class="btn" :disabled="busy" @click="link(acc.nickname)">Actualizar</button>
        <button class="btn btn-ghost" :disabled="busy" data-test="faceit-unlink" @click="unlink">Desvincular</button>
      </div>
    </div>
    <form v-else class="form" data-test="faceit-form" @submit.prevent="link(nickname)">
      <p class="muted">Muestra tu nivel, ELO y partidas de CS2 en tu perfil. Escribe tu apodo exacto de FACEIT.</p>
      <div class="row">
        <input v-model="nickname" placeholder="Tu apodo en FACEIT" maxlength="32" autocomplete="off" required />
        <button type="submit" class="btn btn-primary" :disabled="busy">Vincular FACEIT</button>
      </div>
    </form>
    <p v-if="msg" class="msg" :class="msgType" role="status">{{ msg }}</p>
  </section>
</template>

<style scoped>
.faceit { border-left: 4px solid #ff5500; }
.h2 { font-size: 26px; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
.dot { width: 10px; height: 10px; border-radius: 50%; background: #ff5500; display: inline-block; }
.acc { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.acc img { width: 44px; height: 44px; border-radius: 8px; object-fit: cover; }
.lvl { display: inline-flex; align-items: center; justify-content: center; min-width: 34px; height: 34px; border-radius: 50%; border: 3px solid currentColor; font-weight: 800; }
.who { flex: 1; min-width: 160px; }
.btns { display: flex; gap: 8px; }
.row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
.row input { flex: 1; min-width: 180px; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--line); background: transparent; color: inherit; }
.msg { margin-top: 10px; }
.msg.err { color: #ff6b6b; }
.msg.ok { color: #5fd38d; }
</style>
