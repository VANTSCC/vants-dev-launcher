# VANTS - app Android (Google Play)

App Android de la plataforma de torneos VANTS. Es una **Trusted Web Activity (TWA)**: abre la web
real (`https://feispla.github.io/Vants/`) en Chrome a pantalla completa. Por eso:

- **Se actualiza sola con la web**: cada push a `main` publica la web en GitHub Pages y la app
  la muestra al instante. No hay que recompilar ni resubir la app para cambios de la web.
- **El login funciona** (Google, Discord, Spotify, Steam): corre en Chrome, no en un WebView
  (Google bloquea OAuth dentro de WebViews).
- La app solo se recompila para cambios nativos (icono, nombre, version, SDK).
- `UpdateGateActivity` consulta Google Play al abrir y lanza la actualizacion inmediata de la app
  si hay una version urgente (prioridad >= 3 en Play Console o 2+ dias disponible).
  Si Play no responde en 2.5 s, abre la web igualmente.

## Estructura

```
android/
  app/src/main/AndroidManifest.xml          TWA + filtro de enlaces
  app/src/main/java/.../UpdateGateActivity  actualizaciones de Play
  app/src/main/res/                         iconos adaptativos, colores, temas
  store/icon-512.png                        icono para la ficha de Play
  store/feature-graphic-1024x500.png        grafico de funciones
  gradle.properties                         WEB_HOST / WEB_PATH_PREFIX / WEB_START_URL
../.github/workflows/android-build.yml      compila APK/AAB en cada push
../.well-known/assetlinks.json              verificacion Digital Asset Links
```

## Compilar

**Opcion A - GitHub Actions (recomendada, sin instalar nada):** haz push a `main`; el workflow
"Android - compilar APK/AAB" sube el APK/AAB como artefacto (pestana *Actions*).
Para generar archivos **firmados**, crea estos secretos en *Settings -> Secrets and variables -> Actions*:

| Secreto | Valor |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 release.jks` (en Windows: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("release.jks"))`) |
| `ANDROID_KEYSTORE_PASSWORD` | contrasena del keystore |
| `ANDROID_KEY_ALIAS` | alias (p. ej. `vants_alias`) |
| `ANDROID_KEY_PASSWORD` | contrasena de la llave |
| `PLAY_SERVICE_ACCOUNT_JSON` | *(opcional)* JSON de cuenta de servicio de Play para subir a la pista interna |

**Opcion B - Android Studio:** abre la carpeta `android/`, copia `keystore.properties.example` a
`keystore.properties`, rellena tus datos y ejecuta *Build -> Generate Signed Bundle / APK*.
Android Studio crea el wrapper de Gradle automaticamente (Gradle 8.11.1, JDK 17).

> **Nunca subas `release.jks` ni contrasenas al repositorio** (esta en `.gitignore`).

## Verificacion de la web (pantalla completa sin barra de URL)

Una TWA solo oculta la barra del navegador si el **origen** publica
`https://DOMINIO/.well-known/assetlinks.json`. GitHub Pages sirve esta web en una *subruta*
(`feispla.github.io/Vants/`), y el archivo tendria que estar en `feispla.github.io/.well-known/`.
Opciones:

1. **Dominio propio** (recomendado, p. ej. `vants.gg`) apuntando a este repo de Pages: el archivo
   `.well-known/assetlinks.json` de este repo ya queda en la raiz. Despues cambia en
   `gradle.properties` `WEB_HOST`/`WEB_START_URL`, deja `WEB_PATH_PREFIX=/` y actualiza `site` en
   `app/src/main/res/values/strings.xml`.
2. Crear el repo `feispla/feispla.github.io` y poner ahi `.well-known/assetlinks.json`
   (con `.nojekyll`), con el contenido de `../.well-known/assetlinks.json`.

Mientras no este verificado, la app **funciona igual** pero Chrome muestra una barra de direccion
pequena arriba (modo Custom Tab).

**Importante - Play App Signing:** si subes a Play con *Play App Signing* (lo normal), Google
re-firma la app con **su** llave. Copia el SHA-256 de *Play Console -> Integridad de la app -> Firma*
y agregalo a `sha256_cert_fingerprints` en `assetlinks.json` (se pueden listar varios).
El que hay ahora es el de tu `release.jks`.

## Version

`versionCode` = numero de ejecucion del workflow (siempre sube). Local: `VERSION_CODE=5 gradle ...`.
