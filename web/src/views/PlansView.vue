<script setup>
import { onMounted, ref } from 'vue'
import { getPlanContent, groupByTier, safeUrl } from '../lib/plans.js'

const loading = ref(true)
const error = ref(null)
const tiers = ref([])

onMounted(async () => {
  try {
    tiers.value = groupByTier(await getPlanContent())
  } catch (e) {
    error.value = 'No se pudieron cargar los planes ahora mismo.'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <section class="page-head">
    <div class="container">
      <h1 class="title page-title">Planes</h1>
      <p class="muted">Elige cómo quieres competir en VANTS.</p>
    </div>
  </section>

  <section class="container">
    <div v-if="loading" class="skeleton" style="height:240px"></div>
    <p v-else-if="error" class="error" role="alert">{{ error }}</p>
    <p v-else-if="!tiers.length" class="muted" data-test="plans-empty">Los planes se publicarán pronto.</p>
    <div v-else class="grid" data-test="plans-list">
      <article v-for="t in tiers" :key="t.tier" class="card tier">
        <h2 class="title">{{ t.tier }}</h2>
        <div v-for="it in t.items" :key="it.id" class="item">
          <strong>{{ it.title }}</strong>
          <p v-if="it.body" class="muted">{{ it.body }}</p>
          <a v-if="safeUrl(it.cta_url) && it.cta_label" :href="safeUrl(it.cta_url)" class="btn btn-primary" target="_blank" rel="noopener noreferrer">{{ it.cta_label }}</a>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.page-head { background: radial-gradient(900px 300px at 80% -20%, rgba(255,85,0,.18), transparent), linear-gradient(180deg, #151515, var(--bg)); border-bottom: 1px solid var(--line); padding: 48px 0 32px; margin-bottom: 24px; }
.page-title { font-size: clamp(40px, 7vw, 72px); margin: 10px 0 6px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }
.tier h2 { text-transform: capitalize; color: var(--accent); margin-top: 0; }
.item { padding: 12px 0; border-top: 1px solid var(--line); display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
.item:first-of-type { border-top: 0; }
.item p { margin: 0; white-space: pre-line; }
.error { color: var(--accent-2); }
</style>
