import { defineConfig } from "@neon/config/v1";

// Config local para `neon deploy` (el despliegue en CI usa
// `neon functions deploy <nombre>` por función, ver
// .github/workflows/neon-deploy-functions.yml).
// NOTA: la entrada "steam-login" se retiró (su carpeta no existe en el repo).
export default defineConfig({
  functions: {
    stripewebhook: {
      name: "Stripe Webhook (pagos y planes)",
      source: "./stripe-webhook/index.ts",
    },
    discordnotify: {
      name: "Discord Notify (notificaciones a Discord)",
      source: "./discord-notify/index.ts",
    },
    linker: {
      name: "Linker (conectores OAuth de cuentas: Twitch, Kick, YouTube, TikTok, X, Riot, Steam, FACEIT)",
      source: "./linker/index.ts",
    },
    stripecheckout: {
      name: "Stripe Checkout (pagos reales: planes PRO/CREATOR, pase y fees)",
      source: "./stripe-checkout/index.ts",
    },
    supervisor: {
      name: "Supervisor (automatización Neon)",
      source: "./supervisor/index.ts",
    },
    vantsdata: {
      name: "VANTS Data (proxy público de lectura)",
      source: "./vantsdata/index.ts",
    },
    vantsbot: {
      name: "VANTS Bot (mando del Agente por Discord, sin hosting de pago)",
      source: "./vantsbot/index.ts",
    },
    mm: {
      name: "MM (matchmaking serverless: cola, partidas, RR, historiales, invites)",
      source: "./mm/index.ts",
    },
  },
});
