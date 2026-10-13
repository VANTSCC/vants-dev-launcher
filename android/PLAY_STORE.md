# Lista para publicar en Google Play

## Ficha (es-ES) - borrador
**Nombre:** VANTS - Torneos de esports
**Descripcion corta (80):** Ranked con MMR, torneos y ligas de VALORANT, CS2 y LoL. Compite y sube.
**Descripcion completa:**
VANTS es la plataforma competitiva de esports para jugadores de VALORANT, Counter-Strike 2 y League of Legends.
- Ranked con MMR real y tabla de clasificacion.
- Torneos, calendario e inscripcion desde el movil.
- Vincula tu cuenta de Discord, Steam y Riot.
- Zona exclusiva para miembros.
Categoria sugerida: Deportes o Entretenimiento. Politica de privacidad: https://feispla.github.io/Vants/privacidad.html

Graficos listos en `android/store/`: icono 512 y grafico de funciones 1024x500.
Faltan **capturas de pantalla** (minimo 2, del movil) - haz capturas de la app instalada.

## Requisitos de politica que debes revisar ANTES de enviar a revision
1. **Eliminacion de cuenta (obligatorio si la app permite crear cuenta).** Play pide (a) una opcion
   dentro de la app/web para eliminar la cuenta y los datos y (b) una URL publica con las instrucciones,
   que se declara en *Seguridad de los datos*. Hoy `privacidad.html` solo indica escribir a
   feispla@hotmail.com. Recomendado: crear `eliminar-cuenta.html` y un boton en "Mi cuenta".
2. **Pagos (Stripe).** Los planes BASIC/PRO/ELITE dan acceso a una "Zona VIP" digital. Play exige
   **Google Play Billing** para bienes digitales vendidos dentro de la app (con excepciones por pais/programa).
   Cobrarlos con Stripe dentro de la app puede causar el rechazo. Opciones: Play Billing (Digital Goods API en TWA),
   ocultar la compra dentro de la app, o consultar los programas de pago alternativo disponibles en tu pais.
3. **Torneos con premios.** La web anuncia "torneos con premios reales". Si hay cuota de inscripcion que da
   opcion a premios en dinero, aplica la politica de *Juegos de apuestas, juegos y concursos con dinero real*
   (puede requerir licencia/permiso y solicitud en Play Console, segun pais). Los torneos gratuitos ("VANT Open") no.
4. **Clasificacion de contenido y publico objetivo:** completa el cuestionario; recomendado publico 13+/18+ si hay premios.
5. **Seguridad de los datos:** declara correo, nombre, foto de perfil (Google/Discord/Steam), IDs de usuario,
   datos de pago (procesados por Stripe), analitica (Google Analytics GA4, Tag Manager, Vercel Speed Insights).
6. **Cuenta de desarrollador nueva:** las cuentas personales creadas desde nov-2023 deben pasar 12+ testers
   durante 14 dias de prueba cerrada antes de la produccion.
7. **API objetivo:** la app usa `targetSdk 36`. Verifica en Play Console el nivel minimo vigente.

## Que se quito del proyecto anterior y por que
| Quitado | Motivo |
|---|---|
| Play Games Services (`PlayGamesSdk`, `game_services_project_id=0000000000`) | El ID era un marcador; con un ID invalido el SDK falla/avisa. La web no usa logros ni tablas de Play Games. |
| Inicio de sesion Google forzado al abrir (`startActivityForResult`) | Molesto en cada arranque y duplicaba el login de la web. |
| `EsportsBridge` (`@JavascriptInterface`) + permiso `GET_ACCOUNTS` | Exponia el correo Google del usuario a cualquier JavaScript cargado; la web no lo usa. Permiso sensible para Play. |
| `MIXED_CONTENT_ALWAYS_ALLOW` | Inseguro. |
| Aviso "Conectado a la ultima version" | No comprobaba nada real. |
| WebView | Google bloquea OAuth en WebViews, el login de Google/Discord fallaba. |
| Contrasenas `password123` dentro de `build.gradle` | Ahora la firma sale de variables de entorno / `keystore.properties` (ignorado por git). |
