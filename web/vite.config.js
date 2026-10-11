import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// base './' para que funcione bajo /Vants/web/ en GitHub Pages y en Netlify.
export default defineConfig({
  base: './',
  plugins: [vue()],
  server: { port: 5173 },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.js'],
  },
})
