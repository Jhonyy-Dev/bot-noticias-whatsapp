# Bot de YouTube Shorts para WhatsApp

Bot de WhatsApp que busca, descarga y envía YouTube Shorts a un grupo de WhatsApp, con rotación secuencial de temas y filtro estricto para NO repetir el mismo canal consecutivamente. Incluye una interfaz web moderna para escanear el QR y gestionar el estado de conexión.

![Status](https://img.shields.io/badge/status-active-brightgreen)
![Node](https://img.shields.io/badge/node-%3E=18.x-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4.x-black?logo=express)
![Baileys](https://img.shields.io/badge/Baileys-WhatsApp-green)
![YouTube%20API](https://img.shields.io/badge/YouTube%20Data%20API-v3-FF0000?logo=youtube&logoColor=white)
![Gemini](https://img.shields.io/badge/Gemini-AI-4285F4?logo=google)

## Tabla de Contenidos

- [Características](#características)
- [Requisitos](#requisitos)
- [Instalación](#instalación)
- [Configuración](#configuración)
- [Uso](#uso)
- [Demo](#demo)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Endpoints principales](#endpoints-principales)
- [Cómo funciona](#cómo-funciona)
- [Anti-repetición y rotación de temas](#anti-repetición-y-rotación-de-temas)
- [Configuración adicional](#configuración-adicional)
- [Personalización](#personalización)
- [Notas importantes](#notas-importantes)
- [Solución de problemas](#solución-de-problemas)
- [Seguridad](#seguridad)
 - [Archivo .gitignore](#archivo-gitignore)

## Demo

Interfaz web moderna para QR, estado y envío manual:

![UI QR](public/placeholder-qr.png)

## Características

- Búsqueda de YouTube Shorts por temas usando YouTube Data API v3 (`youtube-api.js`)
- Filtro anti-repetición de canales: nunca envía dos videos seguidos del mismo `channelId`
- Rotación secuencial de temas (no aleatoria) definida en `.env` (`YOUTUBE_TOPIC`)
- Descarga del Short con `@distube/ytdl-core` y envío directo al grupo
- Generación de descripción breve con Gemini AI (`gemini-ai.js`), con fallback inteligente
- Conexión con WhatsApp (Baileys) y escaneo de QR desde interfaz web moderna
- Envío manual desde la UI y envíos automáticos por `cron` (variable `SCHEDULE`)
- Servidor Express con endpoints para estado, QR, envío y logout (`modern-qr-server.js`)

## Requisitos

- Node.js 18+
- Un teléfono con WhatsApp para escanear el QR
- API Key de YouTube Data API v3 y API Key de Gemini (opcional pero recomendado)

## Instalación

1. Clona este repositorio o descarga los archivos
2. Instala las dependencias:

```bash
npm install
```

3. Configura las variables de entorno en el archivo `.env`:

```env
YOUTUBE_TOPIC=tips de programación,desarrollo de software,desarrollo web,noticia ciberseguridad,noticia inteligencia artificial,tecnología china 2025, noticia IA, hacking con IA
YOUTUBE_API_KEY=tu_api_key_aqui
GEMINI_API_KEY=tu_gemini_key_aqui
TARGET_GROUP_NAME=Block
SCHEDULE=0 */3 * * *
MAX_VIDEOS_TO_FETCH=100
```

Notas:
- Los temas se recorren en orden secuencial circular. No se repite el mismo tema consecutivamente.
- El filtro anti-repetición prioriza ABSOLUTAMENTE no repetir canal; si no hay canales nuevos disponibles, aplica estrategias de respaldo.
- Las credenciales de WhatsApp se guardan en `auth/` automáticamente.

## Configuración

Variables del archivo `.env`:

| Variable               | Tipo     | Ejemplo/Default                                                                 | Descripción                                                                                          |
|------------------------|----------|----------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------|
| `YOUTUBE_TOPIC`        | string   | `tips de programación,desarrollo de software,...`                                | Lista separada por comas. Define el orden de rotación SECuencial de temas.                           |
| `YOUTUBE_API_KEY`      | string   | `AIza...`                                                                         | API Key de YouTube Data API v3 para búsquedas de Shorts.                                             |
| `GEMINI_API_KEY`       | string   | `AIza...`                                                                         | API Key de Gemini para generar descripciones breves. Opcional: si falta, se aplica fallback.         |
| `TARGET_GROUP_NAME`    | string   | `Block`                                                                            | Nombre (o parte del nombre) del grupo de WhatsApp receptor.                                           |
| `SCHEDULE`             | cron     | `0 */3 * * *`                                                                      | Expresión cron para envíos automáticos. Dejar vacío para desactivar.                                 |
| `MAX_VIDEOS_TO_FETCH`  | number   | `100`                                                                              | Límite de resultados por búsqueda en YouTube.                                                        |

Notas técnicas:
- Lógica anti-repetición usa memoria en proceso: `sentVideos` (últimos 50) y `sentChannels` (últimos 10). Puedes ajustar estos límites en `modern-qr-server.js` (`MAX_SENT_VIDEOS_MEMORY`, `MAX_SENT_CHANNELS_MEMORY`).
- Búsqueda en `youtube-api.js` está optimizada a español y últimos 30 días.

## Stack tecnológico

- Node.js 18+
- Express 4
- Baileys (`@whiskeysockets/baileys`)
- YouTube Data API v3 (`axios`)
- Descarga: `@distube/ytdl-core`
- Gemini AI (`@google/genai`)
- Frontend UI: HTML + Bootstrap 5 + SSE

## Uso

### Inicio rápido

```bash
# 1) Instala dependencias
npm install

# 2) Crea y completa tu archivo .env
#    (ver sección Configuración)

# 3) Inicia el servidor con UI web
npm start

# 4) Abre http://localhost:3000 y escanea el QR
```

### Iniciar el servidor web (QR moderno + UI)

Para iniciar el bot con la interfaz web que muestra el QR y permite gestionar la conexión:

```bash
node modern-qr-server.js
```

Luego abre en tu navegador: http://localhost:3000

En la interfaz web podrás:

1. Ver y escanear el código QR para conectar con WhatsApp
2. Actualizar el código QR si expira (`/refresh-qr`)
3. Cerrar sesión cuando lo necesites (`/logout`)
4. Ver los logs de conexión en tiempo real y el último Short enviado (SSE)
5. Enviar manualmente un Short con el botón "Enviar YouTube Short Ahora"

### Enviar YouTube Short manualmente (API)

También puedes disparar el envío vía API REST:

```bash
curl -X POST http://localhost:3000/send-youtube-short
```

### Envíos automáticos (cron)

Si configuras `SCHEDULE` en `.env`, el servidor programará envíos automáticos según la expresión cron. Ejemplo: `0 */6 * * *` (cada 6 horas).

**Importante**: El bot está configurado para enviar mensajes exclusivamente al grupo "Block". Asegúrate de:

1. Estar conectado a WhatsApp (haber escaneado el código QR)
2. Ser miembro del grupo "Block" en WhatsApp
3. Que el grupo esté correctamente nombrado como "Block"

Si el grupo no se encuentra, el bot mostrará un mensaje de error con instrucciones.

## Estructura del proyecto

- `modern-qr-server.js` — Servidor Express + cliente Baileys + UI QR + endpoints
- `youtube-api.js` — Búsqueda (YouTube Data API v3) y descarga del Short (`@distube/ytdl-core`)
- `gemini-ai.js` — Generación de descripciones breves con Gemini, con fallback inteligente
- `public/modern-qr.html` — Interfaz web moderna (Bootstrap + SSE)
- `whatsapp.js` — Utilidad CLI para conexión QR en terminal (opcional)
- `.env` — Variables de entorno
- `auth/` — Credenciales de WhatsApp (se generan automáticamente)
- `downloads/` — Carpeta temporal para los videos descargados

## Endpoints principales

- `GET /` — UI web del QR
- `GET /qr` — Obtiene el QR actual (Data URL)
- `GET /status` — Estado de conexión del bot
- `POST /send-youtube-short` — Busca, descarga y envía un Short al grupo objetivo
- `POST /logout` — Cierra sesión de WhatsApp y limpia credenciales
- `GET /refresh-qr` — Fuerza regeneración del QR
- `GET /events` — Server-Sent Events para actualizaciones en tiempo real

Tabla rápida de endpoints:

| Método | Ruta                  | Descripción                                                   |
|-------:|-----------------------|---------------------------------------------------------------|
|   GET  | `/`                   | UI QR (frontend)                                             |
|   GET  | `/qr`                 | Devuelve el QR en Data URL                                   |
|   GET  | `/status`             | Estado (isReady, status, hasQR, user)                        |
|  POST  | `/send-youtube-short` | Dispara búsqueda/descarga/envío del Short al grupo           |
|  POST  | `/logout`             | Cierra sesión de WhatsApp y limpia credenciales              |
|   GET  | `/refresh-qr`         | Fuerza regeneración del QR                                   |
|   GET  | `/events`             | SSE para QR/estado/último video enviado                      |

## Cómo funciona

- El servidor `modern-qr-server.js` levanta Express, maneja QR y estado de WhatsApp (Baileys) y expone endpoints + SSE.
- `sendYouTubeShort()` se encarga de:
  1. Resolver el grupo objetivo `TARGET_GROUP_NAME`.
  2. Seleccionar el tema actual según la rotación secuencial desde `YOUTUBE_TOPIC`.
  3. Buscar videos con `searchYouTubeShorts(topic)` en `youtube-api.js` (YouTube Data API v3, español, últimos 30 días).
  4. Aplicar filtro estricto de NO repetición de `channelId` usando memoria en `sentChannels`.
  5. Descargar el Short con `@distube/ytdl-core` y enviarlo al grupo.
  6. Generar resumen breve con `enhanceDescription()` de `gemini-ai.js` (fallback inteligente si falla la IA).
  7. Registrar `sentVideos` y `sentChannels` para evitar repeticiones.

## Anti-repetición y rotación de temas

- Rotación secuencial (no aleatoria) de temas desde `.env` → `YOUTUBE_TOPIC`:
  1. tips de programación
  2. desarrollo de software
  3. desarrollo web
  4. noticia ciberseguridad
  5. noticia inteligencia artificial
  6. tecnología china 2025
  7. noticia IA
  8. hacking con IA

- El índice global `currentTopicIndex` avanza en cada envío y vuelve al inicio al llegar al final (rotación circular).
- Política de canales: prioridad ABSOLUTA a no repetir `channelId` consecutivamente. Solo se relaja si no existen canales nuevos tras varios intentos y temas de respaldo.

## Configuración adicional

 El bot ya incluye programación de tareas con `node-cron`. Modifica la frecuencia de envío en `.env` con `SCHEDULE` (formato cron).

Consideraciones:
- La rotación secuencial de temas se maneja con una variable global (`currentTopicIndex`) para asegurar orden fijo y circular.
- Se mantiene memoria de últimos videos y canales enviados para evitar repeticiones (`sentVideos`, `sentChannels`).
- En última instancia, si no hay canales nuevos disponibles, se aplican estrategias de respaldo documentadas en `modern-qr-server.js`.

## Solución de problemas

- QR no aparece o caduca:
  - Usa el botón "Actualizar QR" en la UI o llama `GET /refresh-qr`.
  - Borra la carpeta `auth/` si cambiaste de número o cerraste sesión desde el celular.
- No encuentra el grupo:
  - Verifica `TARGET_GROUP_NAME` en `.env` y que seas miembro del grupo.
- Errores de cuota de YouTube:
  - Revisa límites de YouTube Data API v3 y confirma `YOUTUBE_API_KEY` válido.
- Descarga falla:
  - Verifica conectividad y permisos de escritura en `downloads/`. El archivo temporal se elimina tras el envío.

## Seguridad

- No compartas tu `.env` ni el contenido de `auth/`.
- Regenera tus claves si sospechas exposición. Usa variables de entorno para producción.

## Archivo .gitignore

Usa este `.gitignore` para proteger credenciales, evitar subir descargas temporales y artefactos locales. Ya está aplicado en este repo.

```gitignore
# Node.js
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*

# Entornos / credenciales
.env
.env.local
.env.production
.env.development
!.env.example

# WhatsApp Baileys (credenciales y estado de sesión)
auth/

# Descargas temporales de videos
downloads/

# Logs y datos temporales
*.log
logs/
*.tmp
tmp/
.cache/

# IDE/Editor
.vscode/
.idea/
*.swp
*.swo

# SO
.DS_Store
Thumbs.db
desktop.ini

# Archivos de respaldo
*.backup
*.bak
*~
```

## Personalización

- Edita los temas en `.env` con `YOUTUBE_TOPIC` (separados por coma). El orden define la rotación.
- Ajusta la región/idioma de búsqueda en `youtube-api.js` (por defecto `regionCode: 'ES'`, `relevanceLanguage: 'es'`).
- Cambia el nombre del grupo objetivo con `TARGET_GROUP_NAME` en `.env`.

## Notas importantes

- La primera vez que se ejecuta el bot, es necesario escanear el código QR.
- Las sesiones de WhatsApp se guardan en `auth/` para evitar re-escaneos frecuentes.
- La descarga usa `@distube/ytdl-core`; si falla, revisa conectividad y permisos de archivos.
- Respeta las cuotas de YouTube Data API v3 y configura correctamente `YOUTUBE_API_KEY`.
- No publiques tus API keys ni los contenidos de `auth/`.

## Scripts disponibles

Revisa `package.json`:

- `npm start` / `npm run server` — Inicia `modern-qr-server.js` (UI web + endpoints)
- `npm run whatsapp` — Inicia cliente WhatsApp en terminal (QR en consola)
- `npm run youtube` — Pruebas del módulo de YouTube

---

Hecho con Node.js, Express, Baileys, YouTube Data API v3, Gemini y Bootstrap.

## Roadmap

- [ ] Botón en UI para seleccionar tema manualmente antes del envío
- [ ] Historial de envíos y métricas básicas (últimos N videos, canales, fechas)
- [ ] Persistencia de `sentVideos`/`sentChannels` en disco o base de datos
- [ ] Selector de grupo objetivo desde la UI
- [ ] Despliegue en servidor/VM con HTTPS

## Contribuciones

Las contribuciones son bienvenidas. Para cambios mayores, abre primero un issue y describe lo que te gustaría modificar. Recuerda:
- Sigue el estilo de código existente
- Actualiza la documentación cuando aplique
- No incluyas datos sensibles en commits (por ejemplo `.env` o `auth/`)
