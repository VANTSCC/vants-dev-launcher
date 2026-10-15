import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  functions: {
    steamlogin: {
      name: "Steam Login (OpenID 2.0)",
      source: "./steam-login/index.ts",
    },
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
  },
});
