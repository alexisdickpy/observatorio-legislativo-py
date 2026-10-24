# Datos

Copia propia de los datos del Congreso Nacional, generada por el [importador](../importador/) a partir de la [API de Datos Abiertos Legislativos](https://datosv2.congreso.gov.py/web/api-doc/index.html).

**Origen de los datos: Datos Abiertos Poder Legislativo.** Licencia [CC BY 4.0](../LICENSE-DATOS.md). La fecha de la última actualización está en [`estado.json`](estado.json). Se muestran tal como los publica el Congreso, con sus posibles errores; ante una duda, compárelos con la fuente oficial.

Todos estos archivos son **datos abiertos**, que se pueden descargar y reutilizar citando la fuente. El [diccionario de datos](diccionario.md) describe cada campo, su tipo y si es oficial o propio.

No editar estos archivos a mano, salvo las notas manuales de `propios/notas.json`, la unión de personas de `propios/personas.json` (ver abajo), los partidos unificados y nombres conocidos de `propios/partidos.json`, los temas de `propios/temas.json`, las clasificaciones revisadas de `propios/clasificacion-temas.json` y las descripciones de `diccionario.json`. El resto lo reescribe el importador.

## Archivos

| Archivo | Contenido |
|---|---|
| `periodos.json` | Períodos legislativos incluidos, con sus fechas y sus períodos parlamentarios anuales en la API. |
| `estado.json` | Última comprobación correcta de la fuente, última vez que cambiaron los datos y cantidades por período. Una sincronización fallida no lo modifica. |
| `diccionario.json`, `diccionario.md` | Diccionario de datos, con cada campo de cada tabla, su tipo, su origen (oficial o propio) y su descripción. El `.json` se edita a mano; el `.md` lo genera el importador, con la cita, la licencia y la fecha de actualización. |
| `sincronizaciones.json` | Registro de las últimas 90 sincronizaciones, de la más nueva a la más vieja, con fecha, modo (`incremental` o `completo`), resultado (`correcta` o `error`), consultas, cantidades, leyes, votaciones y legisladores agregados, modificados y eliminados, leyes nuevas y archivos modificados. Las anteriores quedan en el historial de Git. |
| `fuente/{período}/leyes.json` y `.csv` | Un registro por ley sancionada en el período, con su proyecto, ministerios y archivos adjuntos. |
| `fuente/{período}/tramitaciones.json` y `.csv` | Las tramitaciones del proyecto de cada ley (`idProyecto` + `tramitacion`). |
| `fuente/{período}/votaciones.json` y `.csv` | Votaciones nominales del período, sin los votos individuales. |
| `fuente/{período}/votos.csv` | Un voto individual por fila, con las columnas `idVotacion`, `idDetalleVotacion`, `idLegislador`, `idSentidoVotacion`, `sentidoVotacion`, `observacion`. |
| `fuente/{período}/legisladores.json` y `.csv` | Legisladores del período, vigentes o no. |
| `fuente/{período}/autores.json` y `.csv` | Autores de cada proyecto con ley (`idProyecto` + `legislador`), en el orden que publica la API. |
| `fotos/{período}/{idLegislador}.jpg` | Copia de la foto que publica el Congreso en el `fotoURL` de cada legislador, sin cambios. No figura en el diccionario porque no es una tabla. |
| `propios/personas.json` | Identificador estable (slug) de cada persona y sus `idLegislador` por período. |
| `propios/notas.json` | Problemas detectados en la fuente, como fechas mal formadas, totales que no coinciden o votos faltantes. |
| `propios/partidos.json` | Una entrada por cada texto oficial de partido (`partidoPolitico`), con su partido unificado (los textos que corresponden al mismo partido comparten identificador) y el fundamento de la agrupación. Cada entrada lleva también una sigla corta y algunas, el nombre por el que se conoce al partido. Son agregados propios; el texto oficial no cambia. |
| `propios/temas.json` | Temas de la clasificación temática propia, con la definición de cada uno y las palabras clave de sus reglas. |
| `propios/clasificacion-temas.json` y `.csv` | Temas de cada proyecto de ley con ley o con votación nominal en el período, con la regla o la revisión que asignó cada uno, o «pendiente de clasificación». Es una clasificación propia, no oficial. |

## Convenciones

- **Lo oficial y lo propio no se mezclan.** Todo valor fuera de una clave `_propio` es exactamente el que publica la API. Lo que agrega este proyecto va dentro de `_propio`, en el mismo objeto al que se refiere.
- **Fechas.** La API publica fechas como texto `dd/mm/aaaa`. Junto a cada campo de fecha, `_propio` tiene un campo del mismo nombre con la fecha en formato ISO (`aaaa-mm-dd`). Si el texto no es una fecha válida, la versión ISO es `null` y el problema queda en `propios/notas.json`; el texto original no se toca.
- **Identificadores.** Cada registro conserva su identificador oficial (`idLey`, `idProyecto`, `idVotacion`, `idLegislador`, `idTramitacion`) y su enlace a SILpy (`appURL`).
- **Orden fijo.** Los registros se ordenan por su identificador y las claves de cada objeto, alfabéticamente. Una descarga sin cambios en la fuente produce exactamente los mismos archivos.
- **CSV.** Cada tabla JSON de `fuente/{período}/` tiene una versión CSV con el mismo contenido, para abrir en una planilla. La genera el importador en cada actualización a partir del JSON (también a mano, con `python -m importador.abiertos`).
  - UTF-8 con BOM (así Excel reconoce los acentos), separado por comas, una fila por registro y la columna identificadora primero. En Excel, si las columnas no se separan solas, se puede usar *Datos → Desde texto/CSV*.
  - Los objetos anidados se aplanan con puntos en el nombre de la columna (`proyecto.acapite`). Las listas de valores se unen con ` | `. Las listas de objetos (los archivos adjuntos de cada ley) quedan solo en el JSON.
  - Las columnas propias conservan `_propio` en el nombre (`_propio.fechaSancion`) y van después de las oficiales.
  - Verdadero y falso se escriben `true` y `false`; un valor nulo queda vacío.
- **Datos de contacto.** El correo y el teléfono que publica la API para cada legislador se guardan solo en `legisladores.json` y `.csv`; se omiten en las copias del legislador dentro de autores, leyes y votaciones.

## Campos propios

Todos los campos, oficiales y propios, están descritos en el [diccionario de datos](diccionario.md). Los criterios de los cálculos propios se documentan en la [metodología](../docs/metodologia.md).

## Edición manual

- **`diccionario.json`**. Si la API agrega un campo, el importador lo avisa en su resumen (`AVISO: Campo sin describir…`). Se agrega su descripción y se regenera `diccionario.md` con `python -m importador.abiertos`.
- **`propios/notas.json`**. Se pueden agregar notas con `"origen": "manual"`. El importador reemplaza solo las notas con `"origen": "importador"` del período que importa.
- **`propios/personas.json`**. El importador asigna un slug a cada legislador nuevo y nunca cambia uno existente. Para unir a una misma persona entre legislaturas (Fase 5), se agrega su nuevo `idLegislador` a la entrada existente.
- **`propios/partidos.json`**. Se edita a mano. Cada entrada tiene el `partidoPolitico` exacto de la API, el `partidoUnificado` (identificador, en minúsculas y con guiones), el `nombreUnificado`, la `sigla` (corta; la misma para los textos del mismo partido unificado) y el `fundamentoUnificado` (por qué se agrupa con otro texto o por qué queda solo). Si el partido es más conocido por otro nombre, se agregan `nombreConocido` y `fundamentoNombreConocido` (de dónde sale ese nombre, preferentemente de un dato oficial). Cuando la API publica un texto de partido nuevo, una prueba del sitio falla hasta que se agrega aquí.
- **`propios/temas.json`** y **`propios/clasificacion-temas.json`**. Los temas y sus palabras clave se editan a mano en `temas.json`. El importador clasifica los proyectos nuevos con esas reglas; las entradas con `"revisado": true` no se recalculan, así que una corrección manual se guarda cambiando sus `temas` (con `"origen": "revision"`) y marcándola como revisada. Después se regenera con `python -m importador.temas`. El criterio está en la [metodología](../docs/metodologia.md).
