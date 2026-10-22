/* ============================================================
   VANTS · juegos.js — catálogo de juegos y detección por proceso
   ------------------------------------------------------------
   Lógica PURA (sin Electron ni DOM). Una sola fuente de verdad:
     · main.js     → require('./renderer/juegos.js')   (detección + presencia)
     · renderer    → <script src="juegos.js">          (VANTS_JUEGOS.nombreDe)
     · scripts/test_hub_juegos.js                      (pruebas con Node)
   Vive en renderer/ porque electron-builder ya empaqueta toda esa carpeta
   (build.files de package.json), así que no hay que tocar la config.

   Slugs: los de la plataforma (pt_games: valorant, cs2, dota2, lol, r6s,
   cod). Los juegos que aún NO están en pt_games (apex, fortnite, rocket,
   gtav, ow2, fc26) usan el id de su portada en renderer/covers/.

   Nombres de proceso en minúsculas (tasklist). Los marcados SIN VERIFICAR
   no se han comprobado en una máquina con el juego: un nombre erróneo solo
   significa "no detectado", nunca un falso positivo.
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VANTS_JUEGOS = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Solo procesos DEL JUEGO. Lanzadores/clientes (riotclientservices.exe,
  // leagueclient.exe, steam.exe…) NO cuentan: estar en el cliente no es jugar.
  const JUEGOS = [
    { slug: 'valorant', nombre: 'VALORANT',          procesos: ['valorant-win64-shipping.exe', 'valorant.exe'] },
    { slug: 'cs2',      nombre: 'Counter-Strike 2',  procesos: ['cs2.exe', 'csgo.exe'] },
    { slug: 'dota2',    nombre: 'Dota 2',            procesos: ['dota2.exe'] },
    { slug: 'lol',      nombre: 'League of Legends', procesos: ['league of legends.exe'] },
    { slug: 'r6s',      nombre: 'Rainbow Six Siege', procesos: ['rainbowsix.exe', 'rainbowsix_vulkan.exe'] },   // SIN VERIFICAR
    { slug: 'apex',     nombre: 'Apex Legends',      procesos: ['r5apex.exe', 'r5apex_dx12.exe'] },             // _dx12 SIN VERIFICAR
    { slug: 'fortnite', nombre: 'Fortnite',          procesos: ['fortniteclient-win64-shipping.exe'] },
    { slug: 'rocket',   nombre: 'Rocket League',     procesos: ['rocketleague.exe'] },
    { slug: 'gtav',     nombre: 'GTA V',             procesos: ['gta5.exe', 'gta5_enhanced.exe'] },             // _enhanced SIN VERIFICAR
    { slug: 'ow2',      nombre: 'Overwatch 2',       procesos: ['overwatch.exe'] },
    { slug: 'fc26',     nombre: 'EA SPORTS FC 26',   procesos: ['fc26.exe'] }                                   // SIN VERIFICAR
  ];

  // lista de nombres de proceso (cualquier mayúscula) → { slug, nombre } | null
  function detectarJuego(procesos) {
    if (!Array.isArray(procesos) || !procesos.length) return null;
    const vivos = new Set();
    for (const p of procesos) if (typeof p === 'string') vivos.add(p.toLowerCase());
    for (const j of JUEGOS) {
      if (j.procesos.some((p) => vivos.has(p))) return { slug: j.slug, nombre: j.nombre };
    }
    return null;
  }

  // slug (o nombre heredado, p. ej. 'Counter-Strike 2' que escribían versiones
  // antiguas del HUB) → nombre para pantalla. Lo desconocido se devuelve tal cual.
  function nombreDe(valor) {
    if (valor == null) return '';
    const v = String(valor).trim();
    const k = v.toLowerCase();
    for (const j of JUEGOS) if (j.slug === k || j.nombre.toLowerCase() === k) return j.nombre;
    return v;
  }

  return { JUEGOS: JUEGOS, detectarJuego: detectarJuego, nombreDe: nombreDe };
});
