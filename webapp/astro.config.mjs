import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import vue from '@astrojs/vue';
import tailwindcss from '@tailwindcss/vite';
import criticalCss from './integrations/critical-css.mjs';

export default defineConfig({
  site: 'https://vants.vants.workers.dev',
  integrations: [react(), vue(), criticalCss()],
  vite: {
    plugins: [tailwindcss()],
  },
  output: 'static',
  build: {
    // El CSS propio de la home (~7 KB: tokens Tailwind + home-motion) va inline:
    // una petición bloqueante menos antes del primer pintado.
    inlineStylesheets: 'always',
  },
});
