<script setup>
import NavBar from './components/NavBar.vue'
import FooterBar from './components/FooterBar.vue'
</script>

<template>
  <div class="shell">
    <NavBar />
    <div class="content">
      <main>
        <router-view />
      </main>
      <FooterBar />
    </div>
  </div>
</template>

<style>
/* Escritorio: barra lateral fija de 220px. Movil: barra superior + barra inferior. */
.shell { display: block; }
.content { min-width: 0; }
@media (min-width: 900px) {
  .content { margin-left: 220px; }
}
@media (max-width: 899px) {
  .content { padding-bottom: 72px; }
}
</style>
