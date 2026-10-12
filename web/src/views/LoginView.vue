<script setup>
import { ref } from 'vue'
import { session, login } from '../lib/auth.js'

const error = ref('')

// Conexiones de Auth0 (nombre exacto en Authentication / Social).
const providers = [
  { label: 'Continuar con Google', connection: 'google-oauth2', test: 'login-google' },
  { label: 'Continuar con Discord', connection: 'discord', test: 'login-discord' },
  { label: 'Continuar con Kick', connection: 'kick', test: 'login-kick' },
  { label: 'Continuar con correo', connection: 'Username-Password-Authentication', test: 'login-email' },
]

async function go(connection) {
  error.value = ''
  try {
    await login(connection)
  } catch (e) {
    error.value = (e && e.message) || 'No se pudo iniciar sesión. Inténtalo de nuevo.'
  }
}
</script>

<template>
  <section class="container wrap">
    <div class="card box">
      <h1 class="title">Entrar a VANTS</h1>
      <p class="muted">Elige cómo quieres acceder.</p>

      <p v-if="session.error" class="err" role="alert">{{ session.error }}</p>
      <p v-if="error" class="err" role="alert">{{ error }}</p>

      <div v-if="session.ready && session.loggedIn" class="done">
        <p>Ya tienes la sesión iniciada.</p>
        <router-link to="/cuenta" class="btn btn-primary">Ir a mi cuenta</router-link>
      </div>
      <div v-else class="list">
        <button
          v-for="p in providers"
          :key="p.connection"
          class="btn btn-primary"
          :data-test="p.test"
          :disabled="!session.ready"
          @click="go(p.connection)"
        >
          {{ p.label }}
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.wrap { display: flex; justify-content: center; padding: 56px 0; }
.box { width: 100%; max-width: 420px; display: flex; flex-direction: column; gap: 14px; }
.list { display: flex; flex-direction: column; gap: 10px; }
.list .btn { justify-content: center; padding: 12px 16px; }
.done { display: flex; flex-direction: column; gap: 10px; align-items: flex-start; }
.err { color: #ff6b6b; margin: 0; }
</style>
