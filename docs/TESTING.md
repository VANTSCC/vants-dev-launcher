# TESTING — Cómo probar la plataforma VANTS

## Suites automatizadas (Node, sin dependencias externas)

| Suite | Comando | Cobertura | Estado esperado |
|---|---|---|---|
| Plataforma de torneos | `node scripts/test_plataforma.js` | Lógica pura compartida con el Worker: validación de query, clasificación de estados, orden, paginación, fechas es/en, render XSS-safe + **integración real** con el proxy (si hay red; si no, `~skip` honesto) | 47 ✓ · 0 ✗ |
| Agente VANTS | `node scripts/test_agente.js` | Núcleo, reglas, memoria, chequeos | 61 ✓ |
| Cerebro agéntico GLM | `node scripts/test_llm_agente.js` | Function calling, bucle tools, anti-bucle | 30 ✓ |
| Sandbox del agente | `node scripts/test_sandbox_agente.js` | Memoria autoalojada + exec aislado | 60 ✓ |
| Matchmaking (fase 4) | `node scripts/test_mm_fase4.js` | Cola, emparejamiento, RR | 54 ✓ |
| Matchmaking Neon | `node scripts/test_mm_neon.js` | Funciones serverless | 16 ✓ |
| Vantsbot Discord | `node scripts/test_vantsbot.js` | Interactions, puente | 36 ✓ |
| Auditoría de enlaces | `node scripts/audit_enlaces.js` | 28 páginas, crawler interno | 603 ✓ · 0 rotos |

## CI (GitHub Actions — `tests.yml`)

Cada push a `main` que toque `services/**`, `scripts/**`, `vants-server/**`,
`neon-functions/**` o `db/**` ejecuta 4 jobs: matchmaking, neon_functions, agente y
**plataforma**. Rojo = no confiar en el despliegue.

## Pruebas E2E manuales (navegador)

### Local
```bash
cd vants-server && npx wrangler dev --port 8787
# en otra terminal: navegar con el navegador o agent-browser:
#   http://127.0.0.1:8787/
#   http://127.0.0.1:8787/es/tournaments/valorant/upcoming/
#   http://127.0.0.1:8787/en/tournaments/cs2/archive/
#   http://127.0.0.1:8787/equipos · /noticias · /busqueda?q=demo
```

### Producción (tras cada push)
1. `curl -A "Mozilla/5.0 …" -o /dev/null -w "%{http_code}" https://vants.vants.workers.dev/<ruta>` — las rutas críticas deben dar 200 (sin UA de navegador el bot-protection da 403 "Bloqueado": es lo esperado).
2. Navegador real: tabs de estado (URL cambia sin recargar; back/forward restaura), ficha de torneo, búsqueda, cambio de idioma ES/EN, móvil 390px sin overflow horizontal.
3. Consola sin errores rojos; los avisos "Neon no disponible" con red bloqueada son del entorno local.

## Qué cubre cada criterio

Ver `product/ACCEPTANCE_CRITERIA.md` (AC1–AC41) con la evidencia asociada.
La suite de la plataforma cubre AC9–AC15 (validación/errores/paginación) a nivel unitario;
AC1–AC7 y AC19–AC22 se verifican con wrangler dev + navegador; AC23–AC27 con el HTML
servido (curl + navegador); AC36–AC39 en CI y espejo ×3 (hashes).
