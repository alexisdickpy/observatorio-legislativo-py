# Bot de Telegram

Programa del bot de Telegram del Observatorio Legislativo (#66). Corre en Cloudflare Workers: atiende los mensajes del bot, muestra el menú de avisos y guarda en Cloudflare KV el número de chat y los avisos elegidos. Los avisos los envía la sincronización diaria (`importador/avisos.py`). El criterio de cada aviso está en la [metodología](../docs/metodologia.md#avisos-del-bot-de-telegram).

Comandos del bot: `/start`, `/avisos`, `/baja`.

## Puesta en marcha

1. Crear el bot con @BotFather en Telegram y guardar su token.
2. En Cloudflare, crear un espacio KV (Storage & Databases → KV) y anotar su identificador. Crear también un token de API con la plantilla «Edit Cloudflare Workers» y anotar el identificador de la cuenta.
3. Cargar en GitHub (Settings → Secrets and variables → Actions) estos secretos.

| Secreto | Contenido |
|---|---|
| `TELEGRAM_TOKEN` | Token del bot |
| `WEBHOOK_SECRETO` | Texto al azar de letras y números, que Telegram envía en cada mensaje |
| `BOT_CLAVE` | Otro texto al azar, que usa la sincronización para pedir la lista de suscriptores |
| `CLOUDFLARE_API_TOKEN` | Token de API de Cloudflare |
| `CLOUDFLARE_ACCOUNT_ID` | Identificador de la cuenta de Cloudflare |
| `KV_SUSCRIPTORES_ID` | Identificador del espacio KV |
| `BOT_URL` | Dirección del bot, que muestra el flujo «Despliegue del bot» al terminar. Se carga después del paso 4 |

4. Ejecutar a mano el flujo «Despliegue del bot» en la pestaña Actions. Publica el programa y lo conecta con Telegram.
5. Cargar `BOT_URL`. La primera sincronización siguiente marca lo existente como procesado, sin enviar nada.

## Pruebas

```bash
cd bot && npm test
```
