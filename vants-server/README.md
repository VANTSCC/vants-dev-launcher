# vants-server — web + bot de Discord

Servidor Node que une la web con Discord: sirve la web y expone
`POST /api/discord/notify` para que la web anuncie eventos en un canal
(inscripciones, membresías, streams y campeones).

**Regla de oro:** el token del bot NUNCA vive en el HTML del navegador —
solo aquí, en `.env` (fuera de git).

## Arranque

```bash
cd vants-server
npm install
copy .env.example .env   # y rellena DISCORD_TOKEN y CHANNEL_ID
npm start                # http://localhost:3000
```

## Uso desde la web

```js
fetch('http://localhost:3000/api/discord/notify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    type: 'torneo_inscripcion',        // membresia | live | campeon
    data: { team: 'KRU ASCEND', tag: 'KRÜ', tournament: 'Ascensión Series S4' },
  }),
});
```

## Notas

- En producción, pon esto detrás de tu dominio (o despliegalo en Neon/Render/Fly)
  y llámalo desde la web con su URL pública.
- El `public/` que sirve es opcional: la web oficial vive en el repo
  (GitHub Pages); este servidor puede quedarse solo como API.
