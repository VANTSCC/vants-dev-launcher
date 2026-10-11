# VANTS — app de escritorio (Tauri)

App de escritorio de VANTS hecha con **Tauri v2**: abre la web real
(`https://feispla.github.io/Vants/`) en una ventana nativa ligera (~5 MB instalador,
usa el WebView del sistema). Como la app de Android, **se actualiza sola con la web**:
cada push a `main` publica la web y la app de escritorio la muestra al instante.

## Compilar los instaladores (recomendado: GitHub Actions)

El workflow **"Desktop - compilar instaladores (Tauri)"** corre solo cuando hay cambios
en `desktop/` o manualmente desde *Actions → Run workflow*:

1. Genera los iconos automáticamente desde `assets/brand/vants-mark-1024.png`.
2. Compila los instaladores en la nube para:
   - **Windows**: `.msi` / `.exe` (NSIS)
   - **macOS**: `.dmg` (Apple Silicon)
   - **Linux**: `.AppImage` / `.deb`
3. Crea un **Release borrador** en GitHub (`desktop-vX.Y.Z`) con los instaladores adjuntos.

Para publicarlo: ve a *Releases*, revisa el borrador y pulsa **Publish release**.

## Compilar en local (opcional)

Requisitos: Node 20, Rust (https://rustup.rs) y las dependencias de sistema de Tauri
(https://v2.tauri.app/start/prerequisites/).

```bash
cd desktop
npm install
npx tauri icon ../assets/brand/vants-mark-1024.png   # genera src-tauri/icons (una vez)
npm run dev      # ventana de desarrollo
npm run build    # genera los instaladores en src-tauri/target/release/bundle
```

## Login (Discord / Steam / Google)

El OAuth abre en el navegador del sistema y regresa a la app con el deep link
`vants://auth/callback` (ya configurado en Steam/Auth0). Los enlaces externos se abren
con el plugin `opener` en el navegador real, nunca en un WebView embebido.

## Notas

- El `identifier` es `gg.vants.app`; si consigues un dominio propio, actualízalo aquí
  y en `tauri.conf.json`.
- Auto-actualización: se puede añadir `tauri-plugin-updater` apuntando a los Releases
  de GitHub cuando se publique la primera versión.
