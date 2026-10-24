# Metodología

Este documento reúne los criterios propios del proyecto, con el detalle técnico de cada archivo. El sitio publica una versión en lenguaje simple en `/metodologia/` (`sitio/src/pages/metodologia.astro`), con las observaciones sobre los datos generadas desde `datos/propios/notas.json` en cada compilación. Si cambia un criterio, actualizar los dos.

## Principio: fidelidad a la fuente

Los datos se guardan y se muestran tal como los publica el Congreso, aunque tengan errores. Ningún valor oficial se corrige ni se sobrescribe. Cuando un dato tiene un problema conocido, se conserva el original y se agrega una nota o un campo calculado, siempre señalado como propio del proyecto (clave `_propio` en los archivos de [`datos/`](../datos/README.md)).

## Transformaciones del importador

Cada una se aplica en una capa aparte que no borra el original.

| # | Transformación | Motivo | Dónde queda |
|---|---|---|---|
| 1 | **Fechas a ISO.** Cada fecha `dd/mm/aaaa` se convierte a `aaaa-mm-dd`. Una fecha mal formada (por ejemplo, un año imposible como `0012`) no se corrige: su versión ISO queda vacía y se registra una nota. | Ordenar y comparar fechas. | `_propio.<campo>` junto al campo original; notas de tipo `fecha_mal_formada`. |
| 2 | **Número de ley sin espacios alrededor.** | Agrupar los registros de una misma ley y formar su URL. En el histórico hay un número publicado como `" 6128"`. | `_propio.numeroLey` en leyes. |
| 3 | **Votos individuales en una tabla aparte.** La lista de votos que la API incluye en cada votación se guarda en `votos.csv`, una fila por voto. Del legislador se guarda solo su `idLegislador`; sus datos están en `legisladores.json`. | Tamaño y facilidad de uso. No se pierde ningún valor de los votos. | `votos.csv`. |
| 4 | **Tramitaciones en un archivo aparte.** | Representan casi el 80 % del tamaño del detalle de las leyes. | `tramitaciones.json`. |
| 5 | **Recuento de votos.** Se cuentan los votos individuales por sentido y se comparan con los totales publicados, categoría por categoría. | Los totales publicados no incluyen las mociones (ver abajo). | `_propio.totalesRecalculados` y `_propio.totalesCoinciden` en votaciones; notas `totales_no_coinciden`. |
| 6 | **Enlace entre ley y votación.** Una votación se enlaza con una ley si es del mismo proyecto **y** su trámite (`idTramitacion`) figura entre las tramitaciones publicadas del proyecto. Si es del mismo proyecto pero el trámite no figura, el enlace queda como no resuelto: no se adivina. | Mostrar las votaciones de cada ley. | `_propio.idVotaciones` e `idVotacionesNoResueltas` en leyes; `_propio.idLeyes` y `enlaceLey` en votaciones. |
| 7 | **Votaciones del período.** Una votación pertenece al período si su sesión pertenece a uno de sus períodos parlamentarios anuales. Las votaciones de leyes del período que se hicieron en la legislatura anterior se listan en la ley, pero no se incluyen. | Mantener cada período en su carpeta. | `_propio.idVotacionesOtrosPeriodos` en leyes. |
| 8 | **Slug de cada persona.** Se forma con nombres y apellidos, sin tildes y en minúsculas (por ejemplo, `maria-rocio-abed-de-zacarias`). Si dos personas coinciden, la segunda recibe `-2`. Una vez asignado no cambia, aunque la fuente corrija el nombre. | El `idLegislador` cambia en cada legislatura y no sirve como identificador estable de la URL. | `propios/personas.json`; `_propio.slug` en legisladores y autores. |
| 9 | **Legisladores que solo aparecen en votaciones.** Si alguien vota en el período y no figura en los listados de legisladores, se incluye con los datos que trae el voto. | No dejar votos sin legislador. | `_propio.fuenteRegistro = "votacion"`; notas `legislador_solo_en_votaciones`. |
| 10 | **Correo y teléfono solo en `legisladores.json`.** La API los repite en cada copia del legislador dentro de autores, leyes y votaciones; ahí se omiten. | Guardarlos una sola vez, en el registro del legislador, que es donde la ficha los muestra (decidido en #8). | `legisladores.json` y `.csv`. |
| 12 | **Copia propia de las fotos.** La foto que publica el Congreso en el `fotoURL` de cada legislador se guarda sin cambios. Si no tiene foto (`noimage`), no se guarda nada. Si una descarga falla, se conserva la copia anterior y se avisa, sin detener la sincronización. El sitio muestra una versión reducida (320 × 320 píxeles) generada en cada compilación. | Que las fichas no dependan del servidor del Congreso en cada visita ni conecten al visitante con él. | `fotos/{período}/{idLegislador}.jpg`. |
| 11 | **Orden fijo** de registros y claves. Los votos se ordenan por `idDetalleVotacion`, las tramitaciones por `idTramitacion` y los adjuntos por `idAdjunto`. Los autores conservan el orden de la API, que se mantuvo igual en tres descargas. | La API devuelve esas listas en distinto orden en cada consulta, sin que cambien los datos. Con orden fijo, una descarga sin cambios produce los mismos archivos y el historial del repositorio muestra solo cambios reales de la fuente. | Todos los archivos. |

La unificación de partidos se describe más abajo, en su propia sección (#42). No se unifican bancadas. No se aplica, por ahora, la clasificación de la etapa de cada votación, que se hará en su propio Issue, también en `datos/propios/`.

## Nombres conocidos de partidos

Algunos partidos son más conocidos por otro nombre que el oficial. En ese caso, el sitio muestra el nombre oficial tal como lo publica la API y, entre paréntesis, el nombre conocido, con un aviso de que es un agregado del sitio. Hoy hay uno: «Movimiento Conciencia Democrática Nacional (Yo Creo)», porque las bancadas oficiales de sus legisladores llevan ese nombre. La lista y el fundamento de cada caso están en [`datos/propios/partidos.json`](../datos/propios/partidos.json) (`nombreConocido` y `fundamentoNombreConocido`). No se cambia ningún valor oficial.

## Partidos unificados y los dos niveles de análisis

Decisión de alcance (#42). La API publica el partido (`partidoPolitico`) como texto libre por legislador y período, y a veces escribe el mismo partido de forma distinta en cada cámara. La misma tabla propia, [`datos/propios/partidos.json`](../datos/propios/partidos.json), da a **cada texto oficial** un identificador de partido unificado (`partidoUnificado`), un nombre para mostrarlo (`nombreUnificado`) y el fundamento de la agrupación (`fundamentoUnificado`).

- **Solo se agrupa lo seguro.** Se reúnen dos textos únicamente si un dato oficial muestra que son el mismo partido. Los demás quedan solos, con su propio identificador.
- **Ningún valor oficial cambia.** El texto oficial se sigue mostrando en todas las páginas. El partido unificado es un dato propio y se señala como tal.
- **No suma cámaras.** Unificar solo dice qué textos son el mismo partido. Todas las cifras (votos distintos a la mayoría, ausencias, NO VOTA, abstenciones) se calculan dentro de cada cámara, y nunca se suman senadores y diputados. El partido unificado sirve para poner lado a lado lo que hizo un mismo partido en cada cámara, cada uno con su cifra (por ejemplo, la coincidencia de votos de #43).

Agrupaciones del período 2023-2028 (12 textos oficiales, 11 partidos unificados).

| Partido unificado | Textos oficiales | Fundamento |
|---|---|---|
| `partido-cruzada-nacional` (Partido Cruzada Nacional) | «Partido Cruzada Nacional» (Cámara de Senadores) y «CRUZADA NACIONAL» (Cámara de Diputados) | La bancada oficial de la diputada con el segundo texto se llama «PARTIDO CRUZADA NACIONAL "CN"», y la de dos de los senadores con el primero, «CRUZADA NACIONAL». |
| `independiente-a` y `independiente` | «Independiente A» (Cámara de Senadores) e «INDEPENDIENTE» (Cámara de Diputados) | **No se agrupan.** Nada en los datos oficiales indica que sean el mismo partido. Sus bancadas oficiales son «LIBERAL INDEPENDIENTE» y «BANCADA INDEPENDIENTE». |
| Los otros 8 | Un texto cada uno | Único texto oficial del partido en el período. |

Los análisis por grupo usan dos niveles.

- **Partido**, con el identificador unificado, comparable entre cámaras. Hoy lo usa el filtro "Partido" del listado de legisladores (valor de URL `?partido={partidoUnificado}`; para los partidos de un solo texto coincide con el slug del texto oficial que usaba antes). El filtro muestra cada partido una sola vez, con su nombre unificado. Las fichas y las tablas muestran siempre el texto oficial.
- **Bancada**, con el nombre oficial, separada por cámara. No se unen bancadas de cámaras distintas, porque son grupos internos de cada cámara con nombres propios. Los legisladores con `bancada` vacía figuran como "Sin bancada registrada".

Los votos distintos a la mayoría de su partido (#39) usan el texto oficial dentro de cada cámara. Dentro de cada cámara cada partido tiene un solo texto en 2023-2028, así que la cifra es la misma con el texto oficial o con el partido unificado.

Partido y bancada siguen siendo un valor por período, sin fecha (ver las limitaciones).

**Textos nuevos.** Si la API publica un texto de partido que no está en la tabla, el sitio lo trata como un partido aparte, con el slug de su texto, para que la compilación no falle. La prueba `sitio/pruebas/unidad/partidos.test.js` falla hasta que se agregue a la tabla con su identificador y su fundamento.

## Notas sobre la fuente

El importador registra en `datos/propios/notas.json` los problemas que detecta. Cada nota indica su tipo, el registro afectado y, si corresponde, el valor original.

| Tipo | Significado |
|---|---|
| `fecha_mal_formada` | Una fecha que no es válida. |
| `totales_no_coinciden` | Un total publicado de la votación no coincide con el recuento de votos individuales. |
| `menos_votos_que_miembros` | La votación tiene menos votos individuales que miembros con voto de la cámara (45 en el Senado, 80 en Diputados). Puede deberse a bancas vacantes; la fuente no lo aclara. |
| `legislador_repetido_en_votacion` | Un legislador figura más de una vez en la misma votación. |
| `voto_sin_legislador` | Un voto individual no identifica al legislador. |
| `legislador_solo_en_votaciones` | Ver la transformación 9. |
| `enlace_no_resuelto` | Ver la transformación 6. |
| `proyecto_sin_tramitaciones`, `proyecto_sin_adjuntos` | La API no devuelve ese detalle del proyecto. |
| `numero_ley_repetido_en_otro_periodo` | El número de una ley del período también figura en otra legislatura. |
| `numero_ley_ausente_en_historico` | Un número de ley del período no figura en el listado histórico. |
| `ley_del_periodo_fuera_de_listado` | Una ley sancionada dentro del período, según el histórico, no figura en el listado del período. |

Las notas con `"origen": "manual"` se escriben a mano y el importador las conserva.

## Totales de votación y mociones

La [auditoría](auditoria-datos.md) encontró 13 votaciones en las que la suma de los totales publicados no coincide con la cantidad de votos individuales. Al comparar categoría por categoría, el importador comprobó que en todas los totales publicados son correctos: la diferencia son los votos "MOCIÓN 1/2/3", que no tienen un total propio en la API. Por eso la comparación se hace por categoría y no por la suma.

## Votos y leyes de cada legislador

La ficha de cada legislador resume sus votos en las votaciones nominales del período sobre proyectos de ley (`proyecto.tipoProyecto` = `PROYECTO DE LEY`, o enlazadas a una ley sancionada en `_propio.idLeyes`) en cuya lista oficial figura (`votos.csv`), hayan llegado a ser ley o no. Cada categoría oficial se cuenta por separado, sin fusionar, y siempre con su denominador, por ejemplo "54 de 130 (41,5%)". La cantidad de AUSENTE de estas votaciones se muestra como una categoría más. La cifra de ausencias se calcula aparte (ver la sección siguiente).

No se incluyen las votaciones sobre otros tipos de expediente (resoluciones, declaraciones, pedidos de informe, acuerdos, designaciones y demás). Los senadores vitalicios no figuran en las listas de votación, así que su ficha no tiene votos.

Cada votación lleva el estado oficial del proyecto (`proyecto.estadoProyecto`), el de la última actualización de los datos y no el del día de la votación. En el período 2023-2028 los estados presentes son `PUBLICADO` (llegó a ser ley), `ARCHIVADO` y `EN TRAMITE`. Un proyecto en trámite aparece solo si ya tuvo al menos una votación nominal. La ficha filtra el resumen y el historial por estado (parámetro `?estado=` en la dirección), con un resumen calculado aparte para cada estado. Las votaciones enlazadas a una ley sancionada del período llevan a la votación dentro de la ficha de la ley; las demás, al expediente oficial en SILpy (`proyecto.appURL`). Una votación sobre un proyecto `PUBLICADO` no tiene ficha de ley porque su ley no figura entre las sancionadas del período, y también enlaza a SILpy.

El sentido de un voto depende de lo que se vota en cada trámite (`tramitacion.descripcionEtapa` y `resultadoTramite`). Un `NO` puede rechazar el proyecto, pero también una modificación de la otra cámara o una objeción del Poder Ejecutivo, y en ese caso mantiene el proyecto. Por eso cada voto se muestra con su trámite y su resultado oficial, y no se calcula una cifra única de proyectos apoyados.

Las leyes de su autoría son las leyes sancionadas del período en cuyo proyecto figura entre los autores (`autores.json`, registros con `_propio.delPeriodo`).

Tienen ficha todos los legisladores del período, también los que ya no ejercen (`_propio.vigente = false`: no figuran en el listado de legisladores en ejercicio de la API). Su ficha lo indica.

## Ausencias en votaciones nominales

La API no publica listas de presencia en las sesiones ([auditoría](auditoria-datos.md), sección 7). Lo único disponible es la categoría `AUSENTE` de cada votación nominal, que indica que el legislador no registró su voto en ese momento, aunque pudiera estar en la sesión. Por eso la métrica se llama siempre **ausencias en votaciones nominales**, cuenta votaciones y no días, y nunca se presenta como asistencia, faltas o inasistencias.

Decisión de alcance (#29). La cifra de cada ficha es la cantidad de votaciones nominales del período en que el legislador figura como `AUSENTE` (`votos.csv`, `sentidoVotacion`), sobre **todas** las votaciones nominales en cuya lista oficial figura, de cualquier tipo de expediente (proyectos de ley, resoluciones, declaraciones, elección de autoridades y demás). Se eligió este total, y no solo el de proyectos de ley, porque lo que se mide es si estaba registrado para votar, sin importar qué se votaba. La lista de cada votación incluye solo a quienes ocupaban el cargo ese día (80 en Diputados y 45 en el Senado, salvo las votaciones con menos votos señaladas en las observaciones), así que el total equivale a las votaciones de su cámara mientras ejercía el cargo. Este total es mayor que el del resumen de votos, que cuenta solo proyectos de ley. Ejemplo del período 2023-2028, un diputado que ejerció todo el período figura en 865 votaciones nominales, 793 de ellas sobre proyectos de ley.

La ficha muestra la cantidad con su denominador y su porcentaje, por ejemplo "23 de 96 (24%)", y la lista de las votaciones en que figura como `AUSENTE`, de la más reciente a la más antigua, con la fecha (`tramitacion.fechaTramite`), el número y el tipo de sesión (`tramitacion.idSesion.numeroSesion` y `tipoSesion`) y el expediente (`proyecto.expedienteCamara`), con enlace a la votación oficial en SILpy (`appURL`). Los senadores vitalicios no figuran en las listas de votación, así que no tienen esta cifra.

El Senado publica muchas menos votaciones nominales que Diputados, así que las cifras de las dos cámaras no se comparan directamente. La API no informa si un legislador `AUSENTE` tenía permiso o licencia. La vista comparativa (sección siguiente) usa este mismo cálculo.

## NO VOTA y abstenciones en votaciones nominales

Decisión de alcance (#38). Además de las ausencias, la ficha muestra otras dos cifras con **el mismo denominador**, todas las votaciones nominales del período en cuya lista oficial figura, de cualquier tipo de expediente.

- **`NO VOTA`**. Votaciones en que figura con `sentidoVotacion` = `NO VOTA`, es decir, en la lista de la votación sin emitir voto. En el período 2023-2028 esta categoría aparece solo en el Senado.
- **`ABSTENCIÓN/BLANCO`**. Votaciones en que figura con `sentidoVotacion` = `ABSTENCIÓN/BLANCO`, un voto oficial de abstención o en blanco.

Las tres categorías (`AUSENTE`, `NO VOTA` y `ABSTENCIÓN/BLANCO`) significan cosas distintas, así que se muestran siempre por separado y nunca se suman en un índice de "participación". Cada cifra lleva su numerador, su denominador y su porcentaje con la fórmula

> cifra = votaciones en que figura con la categoría ÷ votaciones nominales en cuya lista figura × 100

Estas cifras usan un denominador distinto del resumen de votos de la ficha, que cuenta solo proyectos de ley, por eso pueden no coincidir con el `NO VOTA` y la `ABSTENCIÓN/BLANCO` de ese resumen.

**Vista comparativa** (`/legisladores/votaciones-nominales/`). Una tabla por cámara con los legisladores del período vigente que figuran en al menos una votación nominal, en ejercicio o no, con las tres cifras por separado. Por defecto se ordena por cámara y apellido, y se puede ordenar por cualquiera de las cifras, de mayor a menor porcentaje (parámetro `?orden=` con `ausencias`, `no-vota` o `abstencion`). Los títulos son neutrales y no hay posiciones, puestos ni calificativos. Las cámaras no se mezclan porque el Senado publica muchas menos votaciones nominales que Diputados.

**Descarga.** La misma tabla se publica en la página de datos abiertos, generada en cada compilación del sitio (`/datos/calculados/{período}/votaciones-nominales-por-legislador.csv` y `.json`), con las columnas `periodo`, `camara`, `slug`, `idLegislador`, `nombre`, `vigente`, `votacionesEnSuLista` (el denominador), `ausente`, `noVota` y `abstencionBlanco` (cantidades) y `porcentajeAusente`, `porcentajeNoVota` y `porcentajeAbstencionBlanco` (porcentaje con un decimal). Es un cálculo propio, no un dato oficial, y no se guarda en `datos/`.

## Votos distintos a la mayoría de su bancada o de su partido

Decisión de alcance (#39). La ficha muestra dos cifras separadas, en cuántas votaciones nominales el legislador votó distinto a la mayoría de su **bancada** y, aparte, de su **partido**, sobre todas las votaciones nominales del período en cuya lista oficial figura, de cualquier tipo de expediente (el mismo universo que las ausencias).

- **Voto emitido.** Toda categoría oficial salvo `AUSENTE` y `NO VOTA`, es decir `SI`, `NO`, `ABSTENCIÓN/BLANCO` y, en las 13 votaciones entre propuestas alternativas del período, `MOCIÓN 1`, `MOCIÓN 2` y `MOCIÓN 3`. Las mociones no estaban previstas en el Issue; se cuentan como votos emitidos porque son la elección del legislador en esa votación.
- **Grupo.** Bancada = `bancada` del legislador en `legisladores.json`; partido = `partidoPolitico`. Son los textos oficiales del período, sin fecha. Cada votación es de una sola cámara, así que el grupo reúne a sus miembros de esa cámara. Dentro de cada cámara cada partido tiene un único texto oficial en 2023-2028, por eso el cálculo por partido da lo mismo con o sin la tabla de partidos unificados (#42), y no depende de ella. Los legisladores con `bancada` vacía (10 en el período) no tienen cifra de bancada y no forman parte de la mayoría de ninguna.
- **Mayoría del grupo.** En cada votación, la categoría con más votos entre los votos emitidos de los miembros del grupo, incluido el del propio legislador.
- **Votación comparable.** El legislador emitió voto y el grupo tuvo mayoría. Quedan fuera, y se cuentan aparte en la ficha, los **empates** (dos o más categorías empatan en el primer lugar) y las votaciones en que fue el **único votante** del grupo, porque la mayoría sería su propio voto. Esto último lo decidió el proyecto al acordar el alcance; sin esa regla, un partido de un solo legislador en su cámara aparecería con 0% de votos distintos sin haber podido diferir. Por la misma definición, cuando en un grupo votan solo dos y difieren, es un empate, así que un voto distinto solo aparece cuando votan tres o más miembros del grupo.

> votos distintos = votaciones en que su voto difiere de la mayoría del grupo ÷ votaciones comparables × 100

La ficha muestra cada cifra con su denominador y la lista de las votaciones en que votó distinto a una u otra mayoría, de la más reciente a la más antigua, con la fecha (`tramitacion.fechaTramite`), el expediente con enlace a la votación oficial en SILpy (`appURL`), la etapa (`tramitacion.descripcionEtapa`), su voto y la mayoría de cada grupo (o "Empate" o "Único votante" cuando esa comparación no cuenta). Votar distinto no se presenta como bueno ni malo, y el sentido de cada voto depende del trámite.

La **vista comparativa** agrega dos columnas, "Votos distintos a la mayoría de su bancada" y "de su partido", y se puede ordenar por ellas (`?orden=bancada` o `?orden=partido`); quien no tiene votaciones comparables queda al final. La **tabla descargable** agrega las columnas `bancada` y `partido` (textos oficiales), `votacionesComparablesBancada` y `votacionesComparablesPartido` (denominadores), `distintasBancada` y `distintasPartido` (cantidades) y `porcentajeDistintasBancada` y `porcentajeDistintasPartido` (un decimal), vacías cuando no hay votaciones comparables.

Comprobación. Las pruebas recalculan a mano 12 votaciones de 3 bancadas a partir de `votos.csv` y `legisladores.json`, además de casos sintéticos de mayoría, empate, único votante y mociones.

### Cuadro de más «rebeldes»

Decisión de alcance (#54). La página `/legisladores/votos-distintos-al-partido/` ("Más «rebeldes»") muestra, por cámara, los **10** legisladores con mayor porcentaje de votos distintos a la mayoría de su **partido**, con la misma cifra de la vista comparativa (`mayoriaPartido`, sin recalcular), el numerador, el denominador y el enlace a su ficha. El cálculo está en `sitio/src/lib/votosDistintos.js`.

- **Mínimo.** Entran solo quienes tienen al menos **50 votaciones comparables** con la mayoría de su partido, para que un porcentaje alto sobre muy pocas votaciones no encabece la lista. En 2023-2028 los diez primeros de cada cámara son los mismos con un mínimo de 20 o de 50; el mínimo deja fuera sobre todo a suplentes y reemplazos con pocas votaciones.
- **Orden.** De mayor a menor porcentaje; a igual porcentaje, primero quien tiene más votaciones comparables y, después, por apellido. Incluye a quienes ya no ejercen, señalados como tales.
- **Solo por partido.** No hay cuadro por bancada; la vista comparativa se puede ordenar por bancada (`?orden=bancada`) y el cuadro la enlaza.
- **Sin votaciones comparables.** Debajo de cada cuadro se nombra, con enlace a su ficha, a quienes tienen partido registrado y ninguna votación comparable, porque en todas las que votaron fueron los únicos de su partido en emitir voto en su cámara. En 2023-2028 son 5 senadores y 5 diputados, y según la API todos están también solos en su bancada (o, en el caso del PEN en el Senado, compartieron bancada con alguien que los reemplazó y nunca votaron juntos), así que la comparación por bancada tampoco aplica. Aparte se informa cuántos tienen entre 1 y 49 votaciones comparables y, si los hubiera, cuántos no tienen partido registrado.
- **Presentación.** Una lista por cámara con el número de orden, la foto oficial (si la hay), el nombre con enlace a la ficha, el partido (texto oficial) y, a la derecha, el porcentaje con el numerador y el denominador (`ListaVotosDistintos.astro`).
- **Portada.** La tarjeta del cuadro muestra los **5** primeros de cada cámara con la misma lista y el enlace al cuadro completo. Es la única vista previa de la portada con nombres de personas. La tabla de votaciones nominales por legislador sigue en el menú («Rankings») pero ya no tiene tarjeta en la portada (`portada: false` en `vistasDeAnalisis`).
- **Título.** "Más «rebeldes»", con la palabra entre comillas porque es un apodo y no una calificación del sitio, y debajo una línea descriptiva («Legisladores que más veces votaron distinto a la mayoría de su partido»). Ningún otro texto califica el voto.

## Coincidencia de votos entre partidos y entre bancadas

Decisión de alcance (#43). La página `/coincidencia-de-votos/` muestra qué tan seguido tuvieron la misma posición dos partidos o dos bancadas en las votaciones nominales.

- **Votaciones.** Las nominales del período sobre un proyecto de ley, las mismas del historial de votos de la ficha (#28): 211 en la Cámara de Senadores y 793 en la de Diputados en 2023-2028. Sin filtro por estado del proyecto.
- **Posición de un grupo en una votación.** La misma mayoría que en los votos distintos a la mayoría (#39, `mayoriaDe`). Es la categoría con más votos entre los votos emitidos de sus miembros (`SI`, `NO`, `ABSTENCIÓN/BLANCO` y, si las hay, `MOCIÓN 1`, `MOCIÓN 2` o `MOCIÓN 3`). `AUSENTE` y `NO VOTA` no son votos emitidos. Si ningún miembro emitió voto, el grupo no tiene posición. A diferencia de #39, un grupo en que votó una sola persona sí tiene posición, que es su voto, porque aquí no se compara a esa persona consigo misma sino con otro grupo.
- **Empate.** Si dos o más categorías empatan en el primer lugar, el grupo no tiene posición en esa votación, y esa votación no cuenta para ninguno de sus pares. La página dice en cuántas votaciones tuvo posición cada grupo y en cuántas empató.
- **Grupos.** Partido = partido unificado (#42), con el texto oficial de cada cámara a la vista. Bancada = texto oficial de `bancada`, dentro de su cámara. Los legisladores con `bancada` vacía no forman parte de ninguna bancada. Partido y bancada son los que la API registra para el período, sin fecha.
- **Cámaras.** Cada votación es de una sola cámara, así que cada cifra se calcula dentro de una cámara y nunca se suman senadores y diputados. En la vista por partido, cada fila tiene una columna por cámara, cada una con su propia cifra (lado a lado). Si alguno de los dos partidos no tiene legisladores en una cámara, esa celda lo dice. Las bancadas solo se comparan con las de su cámara.

> coincidencia = votaciones en que los dos grupos tuvieron la misma posición ÷ votaciones en que los dos tuvieron posición × 100

- **Umbral.** Con menos de 20 votaciones en común no se muestra el porcentaje, solo las cantidades, porque una sola votación lo movería mucho. Esos pares van al final de la lista. En 2023-2028 quedan bajo el umbral algunos pares de bancadas del Senado con pocos miembros.
- **Orden.** Se elige un partido o una bancada en un menú (parámetro `?grupo=`, con `partido-{partidoUnificado}` o `bancada-{cámara}-{slug de la bancada}`) y se ven los demás grupos de mayor a menor porcentaje. En la vista por partido se ordena por la mayor de las cifras de las dos cámaras. Sin JavaScript se ven todos los grupos, cada uno con su ancla.
- **Cuadro de todos los pares.** Arriba de la página, un cuadro por cámara con todos los partidos de esa cámara en filas y columnas (la diagonal queda vacía). Cada celda lleva el porcentaje y las cantidades, con un sombreado de un solo tono (el color de acento mezclado con el fondo, hasta `--sombreado-maximo-cuadro` de `tokens.css`) proporcional al porcentaje. No se usan colores como verde y rojo, que califican. Las celdas bajo el umbral no llevan sombreado. Para las bancadas no hay cuadro, porque en el Senado son más de 20 y no se lee en el celular; se consultan con el menú.
- **Orden de los grupos.** De más a menos legisladores en ejercicio (`_propio.vigente`), y a igualdad por nombre. En cada cuadro y en las bancadas se cuentan los de esa cámara; en el menú de partidos, los del Congreso. Es solo un orden y no cambia ninguna cifra. Cada cuadro muestra la cantidad junto al nombre.
- **Vista previa en la portada.** Para cada cámara, el par de partidos con más coincidencia y el de menos, solo entre los pares que alcanzan el umbral (a igual porcentaje, el de más votaciones en común). Sin nombres de personas.
- **Títulos neutrales.** Coincidir o no coincidir no se presenta como bueno ni malo.

**Descarga.** `/datos/calculados/{período}/coincidencia-de-votos-entre-grupos.csv` y `.json`, generados en cada compilación. Una fila por par de grupos y cámara, cada par una sola vez, con las columnas `periodo`, `camara`, `tipoGrupo` (`partido` o `bancada`), `grupoA` y `grupoB` (partido unificado o slug de la bancada), `textoOficialA` y `textoOficialB`, `votacionesEnComun` (el denominador), `coincidencias` (el numerador) y `porcentajeCoincidencia` (un decimal, vacío bajo el umbral). Es un cálculo propio, no un dato oficial.

Comprobación. Las pruebas recalculan a mano 3 pares en 12 votaciones cada uno a partir de `votos.csv` y `legisladores.json` (dos bancadas de Diputados, ANR y PLRA en el Senado, y dos partidos de un solo senador), además de casos sintéticos de posición, empate y grupos sin votos emitidos.

## Votaciones y posición de cada partido

Decisión de alcance (#44). La página `/votaciones/` reúne las votaciones nominales del período con su resultado oficial y lo que votó la mayoría de cada partido. Hay una página por año (`/votaciones/{año}/`) para que ninguna pese demasiado.

- **Votaciones.** Las nominales del período sobre un proyecto de ley, las mismas del historial de votos (#28) y de la coincidencia (#43): 211 en la Cámara de Senadores y 793 en la de Diputados en 2023-2028. Quedan fuera resoluciones, declaraciones, designaciones y demás tipos de expediente.
- **Año.** El de la fecha del trámite votado (`tramitacion._propio.fechaTramite`). Dentro de cada año, de la más reciente a la más antigua (a igual fecha, la de mayor `idVotacion`).
- **Cada votación.** Fecha, cámara, etapa, proyecto (enlace a la ficha de la ley si llegó a ser ley; si no, al expediente oficial en SILpy), estado oficial del proyecto (`estadoProyecto`, el de la última actualización), resultado oficial (`resultadoTramite`), totales oficiales de las categorías con votos sobre los legisladores registrados en la lista, la barra y un enlace a la votación (en la ficha de la ley o, sin ley, en SILpy). Las categorías sin total publicado (mociones) se cuentan desde los votos individuales, como en la ficha de ley.
- **Posición de cada partido.** La categoría con más votos entre los votos emitidos de sus legisladores registrados en la votación (`mayoriaDe`, en `lib/mayoria.js`, el mismo criterio que la coincidencia). `AUSENTE` y `NO VOTA` no son votos emitidos. Si dos o más categorías empatan en el primer lugar, la etiqueta dice «empate». Si ningún legislador del partido emitió voto, dice «sin votos emitidos». Un partido con un solo votante tiene como posición su voto.
- **Partido.** El texto oficial de `partidoPolitico` dentro de la cámara de la votación, que dentro de una cámara equivale al partido unificado (#42). Los legisladores sin partido registrado no forman parte de ninguna etiqueta. Partido es el que la API registra para el período, sin fecha. No se muestran bancadas en la lista; la ficha de ley mantiene el desglose por bancada.
- **Siglas.** Dato propio en `datos/propios/partidos.json` (campo `sigla`), para que las etiquetas entren en poco espacio. Salen del texto oficial cuando lo incluye (ANR, PLRA, PPQ, PEN, PDP, PPS); si no, de la bancada oficial (CN, de «PARTIDO CRUZADA NACIONAL "CN"»), del nombre conocido (Yo Creo) o de las iniciales (PPC, IND, IND A). Los textos del mismo partido unificado comparten sigla. El nombre oficial va en el título de cada etiqueta, con los votos de la categoría sobre los votos emitidos del partido.
- **Presentación.** Cada etiqueta lleva la sigla, un cuadro del color de la categoría (los mismos colores de la barra, en `tokens.css`) y la categoría escrita, para que no dependa solo del color. Las posiciones sin categoría llevan un cuadro sin relleno. Etiquetas de más a menos legisladores del partido en la lista de la votación.
- **Filtros.** En cada año, por cámara, estado oficial del proyecto y resultado oficial (`?camara=…&estado=…&resultado=…`, con el slug del texto oficial). Sin JavaScript se ven todas las votaciones del año.
- **Ficha de ley.** Junto a los totales de cada votación, los partidos agrupados por su posición (qué partidos tuvieron `SI` como categoría más votada, cuáles `NO`, cuáles otra categoría, los empates y los que no emitieron voto), cada uno con sus votos de esa categoría sobre sus votos emitidos. El desglose por partido y por bancada sigue igual.
- **Menú y portada.** Entrada «Votaciones» en el menú. La portada muestra, a lo ancho y debajo de las demás tarjetas de análisis, las 5 votaciones más recientes de las dos cámaras (`portadaAlFinal` en `vistasDeAnalisis`).

### Votaciones más ajustadas

En `/votaciones/`, las **10** votaciones de cada cámara con menor diferencia entre los totales oficiales de `SI` y de `NO`. No están en la portada.

> diferencia = | total oficial de SI − total oficial de NO |

- **Orden.** De menor a mayor diferencia; a igual diferencia, la más reciente primero.
- **Fuera.** Las votaciones sin votos `SI` ni `NO`. Las abstenciones, `NO VOTA` y `AUSENTE` no cambian la diferencia.
- La diferencia no dice si la votación alcanzó la mayoría que exigía el reglamento; el resultado que vale es el oficial.

Comprobación. Las pruebas recalculan los totales con `votaciones.json` y las posiciones de cada partido con un recuento aparte de `votos.csv` y `legisladores.json`, y verifican que cada votación del período figure una sola vez en la página de su año.

## Números de ley

El número de ley se usa como URL (`/leyes/{número}/`). El importador verifica en cada ejecución que ningún número del período figure en otra legislatura, comparando con el listado histórico completo de la API. El resultado se informa en el resumen de cada ejecución.

## Limitaciones conocidas

- La API no informa cuándo se modificó un registro: los cambios se detectan comparando descargas.
- El partido y la bancada de un legislador son un único valor por período, sin fecha. Los votos no reflejan cambios de bancada.
- "AUSENTE" en una votación no equivale a ausencia en la sesión: la métrica se llama "ausencias en votaciones nominales".
