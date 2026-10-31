# Edición de textos

Los textos propios del sitio se pueden cambiar desde [Pages CMS](https://app.pagescms.org), sin tocar el código. Lo que se guarda ahí se publica en el sitio unos minutos después.

## Qué se puede editar

- **Todas las páginas y secciones**, con sus títulos, explicaciones, etiquetas y mensajes de los filtros. Están en `sitio/src/contenido/`, un archivo por área del sitio.
- **El nombre del sitio, la cita de la fuente, el pie de página y la firma**, en «General, pie y menú».
- **La metodología y la privacidad**, sección por sección.
- **Temas de las leyes**: nombre, nombre corto y definición.
- **Partidos unificados**: nombre unificado, nombre conocido y fundamento.
- **Preguntas del test de afinidad**: pregunta, explicación y justificación.

## Qué no se puede editar

- **Los datos del Congreso** (`datos/fuente/`). Vienen de la API oficial, y cada sincronización pisaría cualquier cambio. Si un dato oficial tiene un error, se conserva y se señala en las observaciones de la metodología.
- **Las direcciones de las páginas y las anclas de las secciones**, porque otras páginas y sitios enlazan a ellas.
- **Identificadores y reglas de cálculo**, como la sigla de un partido, las palabras clave de un tema, la ley y las votaciones de una pregunta del test o el texto oficial de un partido. Cambiarlos alteraría los resultados. Se editan en el repositorio, con un cambio revisado.
- **La lista de observaciones** de `datos/propios/notas.json`, que se genera en cada sincronización.

## Cómo escribir

- **Partes automáticas.** Las palabras entre llaves, como `{periodo}` o `{cantidad}`, se reemplazan por un valor al compilar. Se pueden mover dentro de la frase, pero no borrar ni renombrar sin cuidado. Si un texto usa una parte que no existe aquí, la compilación se detiene y avisa cuál es.
- **Enlaces.** Se escriben `[texto del enlace](dirección)`. Se puede cambiar el texto; lo que va entre paréntesis conviene dejarlo igual.
- **Negrita.** Se escribe `**texto**`.
- **Palabras que el sitio cuida.** «AUSENTE» en una votación no significa faltar a la sesión. Conviene hablar de «ausencias en votaciones nominales» y no de inasistencias o faltas.

## La cita de la fuente

La licencia CC BY 4.0 de los datos obliga a citar la fuente. La redacción de la cita se puede cambiar, pero debe seguir nombrando «Datos Abiertos Poder Legislativo». Si no lo hace, la compilación se detiene.

## Qué pasa si algo sale mal

Antes de publicar, la compilación comprueba los textos (`sitio/scripts/validar-contenido.js`). Si un texto rompe algo, la compilación falla, **el sitio anterior sigue en línea** y el error dice qué corregir. El problema se ve en el panel de Cloudflare Pages y en la marca junto al cambio en GitHub.

Esa comprobación no revisa todo lo que revisan las pruebas automáticas. Un cambio guardado directamente en `main` se publica sin esperarlas: si es un texto de `sitio/`, las pruebas corren al mismo tiempo y avisan después si algo falló; si es un archivo de `datos/propios/`, no corren. En un pull request, en cambio, corren antes de integrar.

Cada cambio queda registrado en el historial de GitHub y se puede deshacer desde ahí.

## Para quien programa

- `sitio/src/lib/contenido.js` carga los textos y `sitio/src/lib/rellenar.js` completa las partes automáticas.
- Los scripts del navegador leen solo `sitio/src/contenido/interaccion.json`.
- Al agregar un texto, hay que agregarlo también en `.pages.yml`. Pages CMS borra al guardar los campos que no figuran ahí, y `sitio/pruebas/unidad/contenido.test.js` comprueba que coincidan.
- Las pruebas leen los textos con `fijo()` (`sitio/pruebas/textos.js`), para que un cambio de redacción no las rompa.
