# CI: arreglo para el workflow `faceit-xp.yml` (fallo "workflow file issue")

## Síntoma

El workflow **FACEIT · procesador de partidas (XP + rango)** falla en TODAS
sus ejecuciones desde el commit `0e96900` (16/10/2026), tanto las
programadas (cada 10 min) como las de `workflow_dispatch`. La ejecución
muere al instante con **cero jobs** y GitHub muestra:

> This run likely failed because of a workflow file issue.

Última ejecución exitosa: 2026-10-16 16:56 UTC (antes de `0e96900`).
Referencia de ejecución fallida: https://github.com/feispla/Vants/actions/runs/38988964211

## Causa raíz

El paso "Sondear historial FACEIT (respaldo del webhook)" usa el contexto
`secrets` dentro de una condición `if` de paso:

```yaml
- name: Sondear historial FACEIT (respaldo del webhook)
  if: ${{ secrets.FACEIT_API_KEY != '' }}   # ← NO permitido
```

Según la tabla de disponibilidad de contextos de GitHub Actions
(https://docs.github.com/en/actions/learn-github-actions/contexts#context-availability),
el contexto `secrets` **no está disponible** en `jobs.<job_id>.steps.if`
(solo están permitidos `github`, `needs`, `strategy`, `matrix`, `job`,
`runner`, `env`, `vars`, `steps`, `inputs`). Al no poder validar la
expresión ("Unrecognized named-value: 'secrets'"), GitHub rechaza el
workflow completo en cada evento y la ejecución falla sin crear jobs.

`actionlint` 1.7.7 confirma el error en el archivo original:

```
.github/workflows/faceit-xp.yml:61:17: context "secrets" is not allowed here.
available contexts are "env", "github", "inputs", "job", "matrix", "needs",
"runner", "steps", "strategy", "vars". [expression]
```

## Arreglo (fix canónico)

Mapear los secrets a variables de entorno **del job** y usar el contexto
`env` (sí permitido) en la condición del paso:

```yaml
jobs:
  procesar:
    runs-on: ubuntu-latest
    env:
      NK: ${{ secrets.NEON_API_KEY }}
      FACEIT_API_KEY: ${{ secrets.FACEIT_API_KEY }}
      FACEIT_DISCORD_WEBHOOK: ${{ secrets.FACEIT_DISCORD_WEBHOOK }}
    steps:
      ...
      - name: Sondear historial FACEIT (respaldo del webhook)
        if: ${{ env.FACEIT_API_KEY != '' }}
        run: node scripts/faceit-xp.mjs
```

Con el arreglo, `actionlint` pasa sin errores (exit 0) y la semántica se
conserva: el paso solo corre si `FACEIT_API_KEY` está configurada.

## Parche listo para aplicar

```patch
--- a/.github/workflows/faceit-xp.yml
+++ b/.github/workflows/faceit-xp.yml
@@ -18,6 +18,11 @@
     runs-on: ubuntu-latest
     env:
       NK: ${{ secrets.NEON_API_KEY }}
+      # El contexto `secrets` NO está disponible en los `if` de los pasos:
+      # GitHub rechaza el workflow completo ("Unrecognized named-value").
+      # Se mapean a env del job para poder usarlos en la condición del paso.
+      FACEIT_API_KEY: ${{ secrets.FACEIT_API_KEY }}
+      FACEIT_DISCORD_WEBHOOK: ${{ secrets.FACEIT_DISCORD_WEBHOOK }}
     steps:
       - name: Checkout
         uses: actions/checkout@v4
@@ -58,8 +63,5 @@
       # Respaldo del webhook: sondea la Data API v4 y registra partidas que
       # el webhook no alcanzó a entregar (idempotente por faceit_match_id).
       - name: Sondear historial FACEIT (respaldo del webhook)
-        if: ${{ secrets.FACEIT_API_KEY != '' }}
-        env:
-          FACEIT_API_KEY: ${{ secrets.FACEIT_API_KEY }}
-          FACEIT_DISCORD_WEBHOOK: ${{ secrets.FACEIT_DISCORD_WEBHOOK }}
+        if: ${{ env.FACEIT_API_KEY != '' }}
         run: node scripts/faceit-xp.mjs
```

Aplicar con: `git apply docs/ci-fix-faceit-xp.patch` (desde la raíz del repo).

## Nota

El token de integración usado para automatizar este repo no tiene el
permiso `workflows`, por lo que no puede crear/actualizar archivos bajo
`.github/workflows/` ni por push ni por la API (GitHub lo rechaza
explícitamente). Por eso el arreglo vive aquí como parche; hace falta
aplicarlo con una cuenta con permiso de `workflows`.