# Importador

Descarga los datos de un período legislativo desde la [API de Datos Abiertos Legislativos](https://datosv2.congreso.gov.py/web/api-doc/index.html) y escribe la copia propia en [`datos/`](../datos/). Python 3.10 o posterior, solo con la biblioteca estándar.

## Uso

Desde la raíz del repositorio:

```bash
python -m importador
```

- Importa el período marcado como vigente en `datos/periodos.json`. Otro período: `--periodo 2023-2028`.
- Por defecto hace una importación **completa**: unas 1.500 consultas a la API, con una pausa de 0,3 s entre ellas. Tarda unos 50 minutos.
- Guarda cada respuesta cruda en `tmp/importador/crudo/` (no se sube al repositorio). Una respuesta que no es JSON válido no se guarda.
- `--modo incremental` reutiliza las respuestas guardadas de lo que no cambia y hace unas 20 consultas (ver abajo).
- Los expedientes de cada legislador (`legislador/{id}/expedientes`, una consulta por legislador) se reutilizan de la copia guardada en cualquier modo. `--actualizar-expedientes` los vuelve a descargar; también se descargan si no hay copia.
- `--sin-red` repite la importación con esas respuestas guardadas, sin consultar la API.
- Después de escribir los JSON genera los formatos para descarga: una versión CSV de cada tabla y `datos/diccionario.md` (ver [`datos/README.md`](../datos/README.md)). Para regenerarlos sin consultar la API: `python -m importador.abiertos`. Si encuentra un campo que no está en `datos/diccionario.json`, lo avisa.
- Al final clasifica por tema los proyectos de ley del período (`datos/propios/clasificacion-temas.json` y `.csv`) con las reglas de `datos/propios/temas.json`, sin tocar las clasificaciones revisadas a mano. Avisa cada proyecto que queda pendiente de clasificación. Para regenerarla sin consultar la API: `python -m importador.temas` (ver [Temas de las leyes](../docs/metodologia.md#temas-de-las-leyes)).
- Al final imprime un resumen: cantidades, enlaces entre leyes y votaciones, notas sobre la fuente, registros agregados, modificados y eliminados, leyes nuevas, avisos y archivos modificados.
- Si la API falla, termina con error y no modifica ningún archivo de datos. Solo anota el error en `datos/sincronizaciones.json`.
- **Protección contra datos incompletos.** Si alguna cantidad (leyes, votaciones, votos…) baja más de un 5 % respecto de la importación anterior (`datos/estado.json`), se asume que la API respondió a medias: termina con error y no escribe nada. Si la baja es real, se repite con `--permitir-disminucion`.
- Cada ejecución con red queda registrada en `datos/sincronizaciones.json` (ver [`datos/README.md`](../datos/README.md)).

### Modo incremental

Es el que usa la sincronización diaria. Produce exactamente los mismos archivos que una importación completa con los mismos datos:

- descarga de nuevo los períodos, las leyes del período (`ley/periodo/{id}`), el histórico de leyes y los legisladores;
- del detalle de los proyectos (`proyecto/{id}/tramitaciones` y `adjuntos`) descarga solo el de los proyectos nuevos;
- del listado `votacion`, ordenado por `idVotacion` creciente, reutiliza las páginas completas ya guardadas y descarga desde la última de ellas. Esa página sirve de testigo: si sus identificadores cambiaron (por ejemplo, porque se borró una votación anterior), repite toda la importación en modo completo.

Lo que no detecta son las correcciones del Congreso en proyectos o votaciones ya guardados. Para eso está la importación completa semanal.

### Sincronización automática

La ejecuta GitHub Actions ([`.github/workflows/sincronizacion.yml`](../.github/workflows/sincronizacion.yml)):

- **lunes a sábado, 04:23 (hora de Paraguay)**: incremental;
- **domingos, 03:41**: completa;
- **los martes**, la incremental también vuelve a descargar los expedientes de cada legislador (`--actualizar-expedientes`, unas 140 consultas más);
- **lunes, 15:00**: una incremental más, que al terminar envía el resumen semanal del bot;
- a mano, desde la pestaña *Actions* del repositorio → *Sincronización de datos* → *Run workflow*.

Las respuestas crudas se guardan entre ejecuciones en la caché de GitHub Actions. Si la caché se pierde, la incremental descarga todo, como una completa.

Si la importación termina bien, el flujo confirma `datos/` en `main` con un commit automático. `estado.json` y `sincronizaciones.json` cambian en cada ejecución. Así el repositorio tiene actividad diaria y GitHub no desactiva el flujo a los 60 días. Si falla, confirma solo la anotación del error, marca la ejecución como fallida (GitHub avisa por correo) y el sitio sigue con la última copia válida.

Pruebas:

```bash
python -m unittest discover -s importador/pruebas -t .
```

## Avisos del bot de Telegram

`python -m importador.avisos` envía los avisos que cada persona eligió en el bot (ver [`bot/README.md`](../bot/README.md) y la [metodología](../docs/metodologia.md#avisos-del-bot-de-telegram)). La sincronización lo ejecuta después de importar, solo si la importación salió bien.

- Compara con `datos/propios/avisos-telegram.json`. La primera vez marca todo lo existente como procesado y no envía nada.
- Pide la lista de suscriptores al bot en cada ejecución y no la guarda ni la muestra.
- Si no consigue la lista, o un mensaje no llega a nadie, ese aviso se reintenta en la próxima ejecución y la sincronización sigue. Si alguien bloqueó el bot, lo da de baja.
- Necesita `TELEGRAM_TOKEN`, `BOT_URL` y `BOT_CLAVE`, secretos del repositorio en GitHub Actions. Sin ellos, o con `--prueba`, solo muestra los mensajes y no modifica el registro. `--resumen` envía también el resumen semanal; el flujo lo pasa los lunes.
- Si la sincronización falla al confirmar en `main` después de enviar, un aviso podría repetirse una vez.

## Qué descarga

| Consulta | Para qué |
|---|---|
| `periodo` | Períodos parlamentarios anuales del período legislativo |
| `ley/periodo/{id}` | Leyes sancionadas en cada período parlamentario |
| `ley` (paginado) | Histórico completo, para verificar que los números de ley no se repiten en otras legislaturas |
| `proyecto/{id}/tramitaciones` | Autores, ministerios y tramitaciones del proyecto de cada ley; solo autores de los demás proyectos de ley con votaciones en el período |
| `proyecto/{id}/adjuntos` | Archivos adjuntos (texto de la ley, iniciativa, sanción) |
| `fotoURL` de cada legislador | Copia propia de su foto en `datos/fotos/{período}/` (fuera de la API, en el servidor de SILpy). La incremental descarga solo las que faltan; la completa, todas, y reescribe las que cambiaron. Si una falla, se conserva la anterior y se avisa |
| `legislador?idCamara=A` | Legisladores del período, vigentes o no |
| `legislador/camara/{S\|D}` | Legisladores en ejercicio |
| `votacion` (paginado) | Votaciones nominales con sus votos individuales |
| `comision?idCamara={S\|D}` | Comisiones de cada cámara, de todos los tipos |
| `comision/{id}/miembros/{idPeriodoParlamentario}` | Miembros de cada comisión en cada período parlamentario. Los de períodos parlamentarios ya terminados se reutilizan de la copia guardada |
| `proyecto` (paginado) | Proyectos de ley de cualquier iniciativa ingresados en los últimos 90 días, para los avisos del bot. Solo se recorren las páginas necesarias |
| `legislador/{id}/expedientes` | Expedientes en que cada legislador del período figura entre los autores, de todos los tipos. Se guardan los que ingresaron dentro del período |

No usa `votacion/parlamentario/{id}`, que devuelve siempre la misma votación (ver la [auditoría](../docs/auditoria-datos.md)).

## Archivos

| Archivo | Contenido |
|---|---|
| `importar.py` | Orquesta la importación y escribe el resumen |
| `api.py` | Cliente de la API: paginación, reintentos, respuestas 404 y guardado de crudos |
| `transformar.py` | Conversión de los registros de la API a los archivos de `datos/` |
| `fechas.py` | Fechas `dd/mm/aaaa` a ISO, sin corregir por suposición |
| `personas.py` | Slug estable de cada persona |
| `escribir.py` | Escritura determinista de JSON y CSV |
| `avisos.py` | Avisos del bot de Telegram (ver arriba) |
| `pruebas/` | Pruebas con ejemplos reales de la API |

Las convenciones de los archivos generados están en [`datos/README.md`](../datos/README.md) y las transformaciones, en la [metodología](../docs/metodologia.md).

