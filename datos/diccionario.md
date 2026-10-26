# Diccionario de datos

<!-- Generado por el importador a partir de diccionario.json. No editar a mano. -->

**Origen de los datos: Datos Abiertos Poder Legislativo.** Licencia [CC BY 4.0](../LICENSE-DATOS.md). Se muestran tal como los publica el Congreso, con sus posibles errores; ante una duda, compárelos con la fuente oficial.

| Período | Datos actualizados por última vez |
|---|---|
| 2023-2028 | 2026-10-26T14:25:08Z |

La última comprobación de la fuente (aunque no haya cambios) figura en [`estado.json`](estado.json).

Describe cada campo de los archivos de `datos/`. El mismo nombre sirve para el JSON y para la columna del CSV. Los objetos anidados se nombran con puntos (`proyecto.acapite`) y `[]` indica un elemento de una lista de objetos, que solo está en el JSON. En el CSV, las listas de valores se separan con ` | `, los valores verdadero/falso son `true`/`false` y un valor nulo queda vacío. `*` reemplaza una parte variable del nombre.

**Origen.** `oficial` es un valor tal como lo publica la API del Congreso, sin cambios. `propio` es lo que calcula o agrega este proyecto, y siempre está dentro de `_propio` (o en `propios/`). Los criterios están en la [metodología](../docs/metodologia.md).

**Formatos.** Cada tabla de `fuente/{período}/` está en JSON y en CSV (UTF-8 con BOM, separado por comas). En Excel, si las columnas no se separan solas, se puede usar *Datos → Desde texto/CSV*.

## leyes

Un registro por ley sancionada en el período, con su proyecto, ministerios y archivos adjuntos.

Se publica en `fuente/{período}/leyes.json` y `fuente/{período}/leyes.csv`, con 556 registros en total.

| Campo | Origen | Tipo | Descripción |
|---|---|---|---|
| `idLey` | oficial | entero | Identificador oficial del registro de ley. Una misma ley puede tener más de un registro. |
| `appURL` | oficial | URL | Ficha de la ley en SILpy. |
| `fechaPromulgacion` | oficial | fecha (texto dd/mm/aaaa) | Fecha de promulgación. |
| `fechaPublicacion` | oficial | fecha (texto dd/mm/aaaa) | Fecha de publicación. |
| `fechaSancion` | oficial | fecha (texto dd/mm/aaaa) | Fecha de sanción. |
| `numeroLey` | oficial | texto | Número de ley tal como lo publica la API (puede tener espacios). |
| `observacionDecreto` | oficial | texto | Observación sobre el decreto de promulgación. |
| `tipoPromulgacion` | oficial | texto | NORMAL o AUTOMÁTICA. |
| `proyecto.acapite` | oficial | texto | Acápite (título y descripción) del proyecto, tal como figura en el expediente. |
| `proyecto.appURL` | oficial | URL | Ficha del expediente en SILpy. |
| `proyecto.descripcionEtapa` | oficial | texto | Etapa de tramitación en la que está el proyecto. |
| `proyecto.descripcionSubEtapa` | oficial | texto | Subetapa de tramitación. |
| `proyecto.estadoProyecto` | oficial | texto | Estado del proyecto (por ejemplo, PUBLICADO). |
| `proyecto.expedienteCamara` | oficial | texto | Número de expediente en la cámara. |
| `proyecto.fechaIngresoExpediente` | oficial | fecha (texto dd/mm/aaaa) | Fecha de ingreso del expediente. |
| `proyecto._propio.fechaIngresoExpediente` | propio | fecha (aaaa-mm-dd) | Fecha anterior en formato ISO. Vacía si el texto oficial no es una fecha válida (el caso queda en `propios/notas.json`). |
| `proyecto.idProyecto` | oficial | entero | Identificador oficial del proyecto. |
| `proyecto.iniciativa` | oficial | texto | Quién presentó el proyecto (PARLAMENTARIA, PODER EJECUTIVO o CORTE SUPREMA DE JUSTICIA). |
| `proyecto.origenProyecto` | oficial | texto | Cámara de origen del proyecto. |
| `proyecto.tipoProyecto` | oficial | texto | Tipo de proyecto (proyecto de ley, resolución, declaración…). |
| `proyecto.urgencia` | oficial | texto | Tipo de tratamiento, por ejemplo ORDINARIO o DE URGENCIA. |
| `proyecto.ministerios` | oficial | lista de textos | Ministerios que remiten el proyecto (iniciativas del Poder Ejecutivo). En el CSV, separados por ` \| `. |
| `proyecto.archivosAdjuntos[].appURL` | oficial | URL | Descarga del archivo adjunto. *Solo en el JSON.* |
| `proyecto.archivosAdjuntos[].idAdjunto` | oficial | entero | Identificador oficial del adjunto. *Solo en el JSON.* |
| `proyecto.archivosAdjuntos[].idProyecto` | oficial | entero | Proyecto al que pertenece el adjunto. *Solo en el JSON.* |
| `proyecto.archivosAdjuntos[].infoAdjunto` | oficial | texto | Descripción del adjunto. *Solo en el JSON.* |
| `proyecto.archivosAdjuntos[].tipoAdjunto` | oficial | texto | Tipo de documento, que puede ser LEY (texto de la ley), PROYECTO o ANTECEDENTE. *Solo en el JSON.* |
| `proyecto.archivosAdjuntos[].tipoArchivo` | oficial | texto | Formato del archivo (por ejemplo, application/pdf). *Solo en el JSON.* |
| `_propio.fechaPromulgacion` | propio | fecha (aaaa-mm-dd) | Fecha anterior en formato ISO. Vacía si el texto oficial no es una fecha válida (el caso queda en `propios/notas.json`). |
| `_propio.fechaPublicacion` | propio | fecha (aaaa-mm-dd) | Fecha anterior en formato ISO. Vacía si el texto oficial no es una fecha válida (el caso queda en `propios/notas.json`). |
| `_propio.fechaSancion` | propio | fecha (aaaa-mm-dd) | Fecha anterior en formato ISO. Vacía si el texto oficial no es una fecha válida (el caso queda en `propios/notas.json`). |
| `_propio.idPeriodoParlamentario` | propio | entero | Período parlamentario anual en cuyo listado (`ley/periodo/{id}`) figura la ley. |
| `_propio.idVotaciones` | propio | lista de enteros | Votaciones nominales del período enlazadas con la ley porque su proyecto coincide y su trámite figura entre las tramitaciones del proyecto. En el CSV, separadas por ` \| `. |
| `_propio.idVotacionesNoResueltas` | propio | lista de enteros | Votaciones del mismo proyecto cuyo trámite no figura en las tramitaciones publicadas. No se asume el enlace. |
| `_propio.idVotacionesOtrosPeriodos` | propio | lista de enteros | Votaciones del mismo proyecto que pertenecen a otra legislatura. |
| `_propio.numeroLey` | propio | texto | Número de ley sin espacios alrededor. Agrupa los registros de una misma ley y forma su URL. |
| `_propio.periodoLegislativo` | propio | texto | Período legislativo en el que se importó la ley. |

## tramitaciones

Un registro por trámite del proyecto de cada ley.

Se publica en `fuente/{período}/tramitaciones.json` y `fuente/{período}/tramitaciones.csv`, con 13601 registros en total.

| Campo | Origen | Tipo | Descripción |
|---|---|---|---|
| `idProyecto` | oficial | entero | Proyecto al que pertenece el trámite. |
| `tramitacion.camaraTramite` | oficial | texto | Cámara en la que ocurrió el trámite. |
| `tramitacion.descripcionEtapa` | oficial | texto | Etapa del trámite (por ejemplo, Primer trámite constitucional). |
| `tramitacion.descripcionSubEtapa` | oficial | texto | Subetapa del trámite (por ejemplo, Discusión Plenario). |
| `tramitacion.fechaTramite` | oficial | fecha (texto dd/mm/aaaa) | Fecha del trámite. |
| `tramitacion._propio.fechaTramite` | propio | fecha (aaaa-mm-dd) | Fecha anterior en formato ISO. Vacía si el texto oficial no es una fecha válida (el caso queda en `propios/notas.json`). |
| `tramitacion.idTramitacion` | oficial | entero | Identificador oficial del trámite. |
| `tramitacion.numeroSesion` | oficial | texto | Número de la sesión en que ocurrió el trámite, si corresponde. |
| `tramitacion.resultadoTramite` | oficial | texto | Resultado del trámite (por ejemplo, PASA A COMISIÓN: …). |
| `tramitacion.idSesion.appURL` | oficial | URL | Ficha de la sesión en SILpy. |
| `tramitacion.idSesion.camaraSesion` | oficial | texto | Cámara que celebró la sesión. |
| `tramitacion.idSesion.fechaSesion` | oficial | fecha (texto dd/mm/aaaa) | Fecha de la sesión. |
| `tramitacion.idSesion._propio.fechaSesion` | propio | fecha (aaaa-mm-dd) | Fecha anterior en formato ISO. Vacía si el texto oficial no es una fecha válida (el caso queda en `propios/notas.json`). |
| `tramitacion.idSesion.horaFin` | oficial | texto (hh:mm) | Hora de cierre de la sesión. |
| `tramitacion.idSesion.horaInicio` | oficial | texto (hh:mm) | Hora de inicio de la sesión. |
| `tramitacion.idSesion.idSesion` | oficial | entero | Identificador oficial de la sesión. |
| `tramitacion.idSesion.numeroSesion` | oficial | texto | Número de la sesión. |
| `tramitacion.idSesion.tipoSesion` | oficial | texto | Tipo de sesión (ORDINARIA, EXTRAORDINARIA, PREPARATORIA…). |
| `tramitacion.idSesion.periodoParlamentarioDTO.fechaInicio` | oficial | fecha (texto dd/mm/aaaa) | Inicio del período parlamentario anual. |
| `tramitacion.idSesion.periodoParlamentarioDTO._propio.fechaInicio` | propio | fecha (aaaa-mm-dd) | Fecha anterior en formato ISO. Vacía si el texto oficial no es una fecha válida (el caso queda en `propios/notas.json`). |
| `tramitacion.idSesion.periodoParlamentarioDTO.fechaTermino` | oficial | fecha (texto dd/mm/aaaa) | Fin del período parlamentario anual. |
| `tramitacion.idSesion.periodoParlamentarioDTO._propio.fechaTermino` | propio | fecha (aaaa-mm-dd) | Fecha anterior en formato ISO. Vacía si el texto oficial no es una fecha válida (el caso queda en `propios/notas.json`). |
| `tramitacion.idSesion.periodoParlamentarioDTO.idPeriodoLegislativo` | oficial | entero | Identificador oficial del período legislativo (cinco años). |
| `tramitacion.idSesion.periodoParlamentarioDTO.idPeriodoParlamentario` | oficial | entero | Identificador oficial del período parlamentario anual. |
| `tramitacion.idSesion.periodoParlamentarioDTO.periodoLegislativo` | oficial | texto | Período legislativo, por ejemplo 2023-2028. |
| `tramitacion.idSesion.periodoParlamentarioDTO.periodoParlamentario` | oficial | texto | Período parlamentario anual, por ejemplo 2023-2024. |

## votaciones

Un registro por votación nominal del período, sin los votos individuales (están en `votos`).

Se publica en `fuente/{período}/votaciones.json` y `fuente/{período}/votaciones.csv`, con 1165 registros en total.

| Campo | Origen | Tipo | Descripción |
|---|---|---|---|
| `idVotacion` | oficial | entero | Identificador oficial de la votación nominal. Único en todo el histórico. |
| `appURL` | oficial | URL | Ficha de la votación en SILpy. |
| `descripcion` | oficial | texto | Qué se sometió a votación. |
| `observacion` | oficial | texto | Observación de la votación. |
| `totalAbstencion` | oficial | entero | Total de abstenciones publicado por la API. |
| `totalAusente` | oficial | entero | Total de AUSENTE publicado. AUSENTE en una votación no equivale a ausencia en la sesión. |
| `totalNO` | oficial | entero | Total de votos NO publicado. |
| `totalNoVota` | oficial | entero | Total de NO VOTA publicado (solo en el Senado). |
| `totalSI` | oficial | entero | Total de votos SI publicado. |
| `proyecto.acapite` | oficial | texto | Acápite (título y descripción) del proyecto, tal como figura en el expediente. |
| `proyecto.appURL` | oficial | URL | Ficha del expediente en SILpy. |
| `proyecto.descripcionEtapa` | oficial | texto | Etapa de tramitación en la que está el proyecto. |
| `proyecto.descripcionSubEtapa` | oficial | texto | Subetapa de tramitación. |
| `proyecto.estadoProyecto` | oficial | texto | Estado del proyecto (por ejemplo, PUBLICADO). |
| `proyecto.expedienteCamara` | oficial | texto | Número de expediente en la cámara. |
| `proyecto.fechaIngresoExpediente` | oficial | fecha (texto dd/mm/aaaa) | Fecha de ingreso del expediente. |
| `proyecto._propio.fechaIngresoExpediente` | propio | fecha (aaaa-mm-dd) | Fecha anterior en formato ISO. Vacía si el texto oficial no es una fecha válida (el caso queda en `propios/notas.json`). |
| `proyecto.idProyecto` | oficial | entero | Identificador oficial del proyecto. |
| `proyecto.iniciativa` | oficial | texto | Quién presentó el proyecto (PARLAMENTARIA, PODER EJECUTIVO o CORTE SUPREMA DE JUSTICIA). |
| `proyecto.origenProyecto` | oficial | texto | Cámara de origen del proyecto. |
| `proyecto.tipoProyecto` | oficial | texto | Tipo de proyecto (proyecto de ley, resolución, declaración…). |
| `proyecto.urgencia` | oficial | texto | Tipo de tratamiento, por ejemplo ORDINARIO o DE URGENCIA. |
| `tramitacion.camaraTramite` | oficial | texto | Cámara en la que ocurrió el trámite. |
| `tramitacion.descripcionEtapa` | oficial | texto | Etapa del trámite (por ejemplo, Primer trámite constitucional). |
| `tramitacion.descripcionSubEtapa` | oficial | texto | Subetapa del trámite (por ejemplo, Discusión Plenario). |
| `tramitacion.fechaTramite` | oficial | fecha (texto dd/mm/aaaa) | Fecha del trámite. |
| `tramitacion._propio.fechaTramite` | propio | fecha (aaaa-mm-dd) | Fecha anterior en formato ISO. Vacía si el texto oficial no es una fecha válida (el caso queda en `propios/notas.json`). |
| `tramitacion.idTramitacion` | oficial | entero | Identificador oficial del trámite. |
| `tramitacion.numeroSesion` | oficial | texto | Número de la sesión en que ocurrió el trámite, si corresponde. |
| `tramitacion.resultadoTramite` | oficial | texto | Resultado del trámite (por ejemplo, PASA A COMISIÓN: …). |
| `tramitacion.idSesion.appURL` | oficial | URL | Ficha de la sesión en SILpy. |
| `tramitacion.idSesion.camaraSesion` | oficial | texto | Cámara que celebró la sesión. |
| `tramitacion.idSesion.fechaSesion` | oficial | fecha (texto dd/mm/aaaa) | Fecha de la sesión. |
| `tramitacion.idSesion._propio.fechaSesion` | propio | fecha (aaaa-mm-dd) | Fecha anterior en formato ISO. Vacía si el texto oficial no es una fecha válida (el caso queda en `propios/notas.json`). |
| `tramitacion.idSesion.horaFin` | oficial | texto (hh:mm) | Hora de cierre de la sesión. |
| `tramitacion.idSesion.horaInicio` | oficial | texto (hh:mm) | Hora de inicio de la sesión. |
| `tramitacion.idSesion.idSesion` | oficial | entero | Identificador oficial de la sesión. |
| `tramitacion.idSesion.numeroSesion` | oficial | texto | Número de la sesión. |
| `tramitacion.idSesion.tipoSesion` | oficial | texto | Tipo de sesión (ORDINARIA, EXTRAORDINARIA, PREPARATORIA…). |
| `tramitacion.idSesion.periodoParlamentarioDTO.fechaInicio` | oficial | fecha (texto dd/mm/aaaa) | Inicio del período parlamentario anual. |
| `tramitacion.idSesion.periodoParlamentarioDTO._propio.fechaInicio` | propio | fecha (aaaa-mm-dd) | Fecha anterior en formato ISO. Vacía si el texto oficial no es una fecha válida (el caso queda en `propios/notas.json`). |
| `tramitacion.idSesion.periodoParlamentarioDTO.fechaTermino` | oficial | fecha (texto dd/mm/aaaa) | Fin del período parlamentario anual. |
| `tramitacion.idSesion.periodoParlamentarioDTO._propio.fechaTermino` | propio | fecha (aaaa-mm-dd) | Fecha anterior en formato ISO. Vacía si el texto oficial no es una fecha válida (el caso queda en `propios/notas.json`). |
| `tramitacion.idSesion.periodoParlamentarioDTO.idPeriodoLegislativo` | oficial | entero | Identificador oficial del período legislativo (cinco años). |
| `tramitacion.idSesion.periodoParlamentarioDTO.idPeriodoParlamentario` | oficial | entero | Identificador oficial del período parlamentario anual. |
| `tramitacion.idSesion.periodoParlamentarioDTO.periodoLegislativo` | oficial | texto | Período legislativo, por ejemplo 2023-2028. |
| `tramitacion.idSesion.periodoParlamentarioDTO.periodoParlamentario` | oficial | texto | Período parlamentario anual, por ejemplo 2023-2024. |
| `_propio.cantidadVotos` | propio | entero | Cantidad de votos individuales de la votación en `votos.csv`. |
| `_propio.enlaceLey` | propio | texto | Estado del enlace con una ley, que puede ser `resuelto`, `no_resuelto` o `sin_ley` (el proyecto no tiene ley sancionada en el período). |
| `_propio.idLeyes` | propio | lista de enteros | Leyes (`idLey`) enlazadas con la votación. En el CSV, separadas por ` \| `. |
| `_propio.periodoLegislativo` | propio | texto | Período legislativo de la votación. |
| `_propio.totalesCoinciden` | propio | booleano | Si cada total publicado coincide con el recuento de los votos individuales. |
| `_propio.totalesRecalculados.*` | propio | entero | Votos individuales contados por sentido (`SI`, `NO`, `ABSTENCIÓN/BLANCO`, `AUSENTE`, `NO VOTA`, `MOCIÓN 1`…). Una columna por sentido; vacía si no hubo votos de ese sentido. |

## votos

Un voto individual por fila.

Se publica en `fuente/{período}/votos.csv`, con 82680 registros en total.

| Campo | Origen | Tipo | Descripción |
|---|---|---|---|
| `idVotacion` | oficial | entero | Votación a la que pertenece el voto. |
| `idDetalleVotacion` | oficial | entero | Identificador oficial del voto individual. |
| `idLegislador` | oficial | entero | Legislador que votó (ver `legisladores`). |
| `idSentidoVotacion` | oficial | entero | Código del sentido del voto (272 SI, 273 NO, 274 ABSTENCIÓN/BLANCO, 275 AUSENTE, 276 NO VOTA, 281-283 MOCIÓN 1-3). |
| `sentidoVotacion` | oficial | texto | Sentido del voto en texto. AUSENTE significa que no votó en ese momento, no que faltó a la sesión. |
| `observacion` | oficial | texto | Observación del voto (por ejemplo, «Votó a viva voz»). |

## legisladores

Un registro por legislador del período, vigente o no. Es la única tabla con el correo y el teléfono que la API publica para cada legislador.

Se publica en `fuente/{período}/legisladores.json` y `fuente/{período}/legisladores.csv`, con 143 registros en total.

| Campo | Origen | Tipo | Descripción |
|---|---|---|---|
| `activo` | oficial | booleano | Si la API lo marca como activo. |
| `apellidos` | oficial | texto | Apellidos. |
| `appURL` | oficial | URL | Ficha del legislador en SILpy. |
| `bancada` | oficial | texto | Bancada. La API da el valor actual por legislador y período, no la bancada en cada fecha. |
| `camaraParlamentario` | oficial | texto | Cámara (CAMARA DE SENADORES o CAMARA DE DIPUTADOS). |
| `cargoBancada` | oficial | texto | Cargo en la bancada (MIEMBRO, LIDER, VICELIDER…). Puede estar vacío. |
| `departamento` | oficial | texto | Departamento por el que fue electo; NACIONAL para el Senado. |
| `emailParlamentario` | oficial | texto | Correo que la API publica para el legislador. Puede estar vacío. |
| `fotoURL` | oficial | URL | Foto oficial. |
| `idLegislador` | oficial | entero | Identificador oficial. Cambia en cada legislatura, así que no identifica a una persona entre períodos. |
| `nombres` | oficial | texto | Nombres. |
| `partidoPolitico` | oficial | texto | Partido político. La API da el valor actual por legislador y período, no el partido en cada fecha. |
| `periodoLegislativo` | oficial | texto | Período legislativo del registro. |
| `telefonoParlamentario` | oficial | texto | Teléfono que la API publica para el legislador. Puede estar vacío. |
| `tipoParlamentario` | oficial | texto | TITULAR, SUPLENTE o VITALICIO (los senadores vitalicios tienen voz pero no voto). |
| `_propio.fuenteRegistro` | propio | texto | De dónde se tomó el registro. Puede ser el listado histórico (`legislador?idCamara=A`), el de vigentes (`legislador/camara/{S\|D}`) o, si no figura en ninguno, el voto que lo incluye (`votacion`). |
| `_propio.slug` | propio | texto | Identificador estable de la persona (ver `personas`). Forma la URL de su ficha. |
| `_propio.vigente` | propio | booleano | Si figura en el listado de legisladores en ejercicio. |

## autores

Un registro por autor de cada proyecto con ley, en el orden que publica la API. El autor puede ser legislador de otra legislatura.

Se publica en `fuente/{período}/autores.json` y `fuente/{período}/autores.csv`, con 1386 registros en total.

| Campo | Origen | Tipo | Descripción |
|---|---|---|---|
| `idProyecto` | oficial | entero | Proyecto del que es autor. |
| `legislador.activo` | oficial | booleano | Si la API lo marca como activo. |
| `legislador.apellidos` | oficial | texto | Apellidos. |
| `legislador.appURL` | oficial | URL | Ficha del legislador en SILpy. |
| `legislador.bancada` | oficial | texto | Bancada. La API da el valor actual por legislador y período, no la bancada en cada fecha. |
| `legislador.camaraParlamentario` | oficial | texto | Cámara (CAMARA DE SENADORES o CAMARA DE DIPUTADOS). |
| `legislador.cargoBancada` | oficial | texto | Cargo en la bancada (MIEMBRO, LIDER, VICELIDER…). Puede estar vacío. |
| `legislador.departamento` | oficial | texto | Departamento por el que fue electo; NACIONAL para el Senado. |
| `legislador.fotoURL` | oficial | URL | Foto oficial. |
| `legislador.idLegislador` | oficial | entero | Identificador oficial. Cambia en cada legislatura, así que no identifica a una persona entre períodos. |
| `legislador.nombres` | oficial | texto | Nombres. |
| `legislador.partidoPolitico` | oficial | texto | Partido político. La API da el valor actual por legislador y período, no el partido en cada fecha. |
| `legislador.periodoLegislativo` | oficial | texto | Período legislativo del registro. |
| `legislador.tipoParlamentario` | oficial | texto | TITULAR, SUPLENTE o VITALICIO (los senadores vitalicios tienen voz pero no voto). |
| `_propio.delPeriodo` | propio | booleano | Si el autor es legislador de este período legislativo. |
| `_propio.orden` | propio | entero | Posición en la lista de autores, en el orden que publica la API. |
| `_propio.slug` | propio | texto | Slug de la persona, si es legisladora de un período incluido. Vacío si no. |

## personas

Capa propia con el identificador estable de cada persona y sus `idLegislador` por período.

Se publica en `propios/personas.json`.

| Campo | Origen | Tipo | Descripción |
|---|---|---|---|
| `slug` | propio | texto | Identificador estable de la persona. No cambia aunque la fuente corrija la escritura del nombre. |
| `nombre` | propio | texto | Nombre con el que se creó el slug. |
| `legisladores[].idLegislador` | oficial | entero | `idLegislador` de la persona en cada período. *Solo en el JSON.* |
| `legisladores[].periodoLegislativo` | oficial | texto | Período de ese `idLegislador`. *Solo en el JSON.* |

## notas

Capa propia con los problemas detectados en la fuente (fechas mal formadas, totales que no coinciden, votos faltantes, etc.).

Se publica en `propios/notas.json`.

| Campo | Origen | Tipo | Descripción |
|---|---|---|---|
| `tipo` | propio | texto | Tipo de problema (por ejemplo, `menos_votos_que_miembros`, `enlace_no_resuelto`). |
| `entidad` | propio | texto | Qué tipo de registro afecta (ley, votacion, legislador…). |
| `id` | propio | entero o texto | Identificador oficial del registro afectado. |
| `detalle` | propio | texto | Explicación del problema. |
| `ruta` | propio | texto | Campo afectado dentro del registro, si corresponde. |
| `valorOriginal` | propio | texto | Valor oficial que motivó la nota, sin cambios, si corresponde. |
| `origen` | propio | texto | `importador` (detectada automáticamente) o `manual`. |
| `periodoLegislativo` | propio | texto | Período en el que se detectó. |

## partidos

Capa propia con una entrada por cada texto oficial de partido. Dice qué textos corresponden al mismo partido (partido unificado) y, en algunos casos, el nombre por el que se conoce al partido. No cambia el texto oficial ni suma cámaras.

Se publica en `propios/partidos.json`.

| Campo | Origen | Tipo | Descripción |
|---|---|---|---|
| `partidoPolitico` | oficial | texto | Texto oficial del partido, exactamente como figura en `legisladores.json`. |
| `partidoUnificado` | propio | texto | Identificador propio del partido unificado (minúsculas y guiones). Los textos oficiales que corresponden al mismo partido comparten identificador; los que no se pueden agrupar con seguridad tienen el suyo. |
| `nombreUnificado` | propio | texto | Nombre con el que el sitio muestra el partido unificado (uno de sus textos oficiales). |
| `sigla` | propio | texto | Sigla corta con la que el sitio muestra el partido donde hay poco espacio, como la posición de cada partido en las votaciones. Sale del texto oficial cuando lo incluye y, si no, del nombre de su bancada oficial, del nombre por el que se lo conoce o de sus iniciales. Los textos del mismo partido unificado comparten sigla. |
| `fundamentoUnificado` | propio | texto | Por qué el texto se agrupa con otro o por qué queda solo, preferentemente con un dato oficial. |
| `nombreConocido` | propio | texto | Nombre por el que se conoce al partido, cuando difiere del oficial. Solo en algunas entradas. |
| `fundamentoNombreConocido` | propio | texto | De dónde sale el nombre conocido. Solo en las entradas con `nombreConocido`. |

## temas

Capa propia con la lista de temas con que este proyecto clasifica los proyectos de ley, la definición de cada uno y las palabras clave de sus reglas. Se edita a mano.

Se publica en `propios/temas.json`.

| Campo | Origen | Tipo | Descripción |
|---|---|---|---|
| `id` | propio | texto | Identificador del tema (minúsculas y guiones). Es el valor del filtro por tema en las direcciones del sitio. |
| `nombre` | propio | texto | Nombre con que el sitio muestra el tema. |
| `nombreCorto` | propio | texto | Nombre corto con que el sitio muestra el tema en sus etiquetas. |
| `definicion` | propio | texto | Qué leyes incluye el tema. |
| `palabrasClave` | propio | lista de textos | Palabras clave de la regla del tema, sin mayúsculas ni tildes. Cada una es el comienzo de una palabra del acápite oficial. |
| `excepto` | propio | lista de textos | Frases que no cuentan para el tema. Solo en algunos temas. |
| `exclusivo` | propio | booleano | Si el tema deja fuera a los demás temas que asignan las reglas. Solo en algunos temas. |

## clasificacion-temas

Capa propia con los temas de cada proyecto de ley con ley sancionada o con votación nominal en el período, según la clasificación de este proyecto (ver la metodología). No es un dato oficial.

Se publica en `propios/clasificacion-temas.json` y `propios/clasificacion-temas.csv`.

| Campo | Origen | Tipo | Descripción |
|---|---|---|---|
| `idProyecto` | oficial | entero | Identificador oficial del proyecto (`proyecto.idProyecto` de leyes y votaciones). |
| `periodoLegislativo` | propio | texto | Período legislativo de la clasificación. |
| `temas` | propio | lista de objetos (JSON) o de textos (CSV) | En el JSON, un objeto por tema con `tema` (identificador de `temas.json`), `origen` (`regla` o `revision`) y, si lo asignó una regla, `palabraClave`. En el CSV, los identificadores de los temas. |
| `temas[].tema` | propio | texto | Identificador del tema en `temas.json`. *Solo en el JSON.* |
| `temas[].origen` | propio | texto | `regla` (lo asignó una regla por palabras clave) o `revision` (lo agregó la revisión manual). *Solo en el JSON.* |
| `temas[].palabraClave` | propio | texto | Palabra clave que asignó el tema. Solo en los temas con origen `regla`. *Solo en el JSON.* |
| `pendiente` | propio | booleano | Si el proyecto está pendiente de clasificación, sin ningún tema. |
| `revisado` | propio | booleano | Si la clasificación se revisó a mano. Las revisadas no se recalculan; las demás salen de las reglas en cada actualización. |
