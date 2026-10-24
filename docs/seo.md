# Buscadores y vista previa al compartir

Este documento explica qué hace el sitio para aparecer en los buscadores y verse bien al compartir un enlace, y qué pasos manuales quedan pendientes. El código está en `sitio/src/lib/seo.js` (textos y datos estructurados), `sitio/src/layouts/Base.astro` (etiquetas de cada página) y `sitio/src/pages/sitemap.xml.js` y `robots.txt.js`.

## Qué genera cada compilación

- **Título y descripción únicos por página.** Una prueba de compilación recorre todas las páginas y falla si dos se repiten.
- **URL canónica** en cada página, con la dirección completa. Evita que los buscadores traten como páginas distintas una misma ficha con parámetros en la dirección (por ejemplo, filtros del catálogo).
- **Etiquetas Open Graph y de X** (`og:title`, `og:description`, `og:image`, `twitter:card`) para la vista previa en WhatsApp, Telegram, X o Facebook.
- **Datos estructurados de schema.org** en formato JSON-LD, invisibles para los visitantes.
  - `Legislation` en cada ley, con su número oficial, la fecha de sanción, el Congreso Nacional como órgano que la sancionó y los enlaces a la fuente oficial.
  - `Person` en cada legislador, con su nombre, su foto, su cámara, su partido y su bancada tal como los publica la API, y el enlace a su ficha oficial.
  - `Dataset` en la página de datos abiertos, con la licencia CC BY 4.0 y cada archivo descargable. Sirve para que el conjunto de datos aparezca en Google Dataset Search.
  - `WebSite` en el inicio, con el buscador del sitio.
- **`sitemap.xml`** con todas las páginas que tienen contenido propio. Queda fuera la búsqueda, porque su resultado depende de lo que se escriba. La fecha de cada dirección es la de la última modificación de los datos.
- **`robots.txt`**, que permite leer el sitio a todos los rastreadores, también a los de inteligencia artificial, porque los datos son abiertos. Solo excluye `/pagefind/`, los archivos internos del buscador.
- **Página 404** propia y marcada `noindex`. Sin ella, Cloudflare Pages respondería cualquier dirección inexistente con la portada, y los buscadores verían muchas copias del inicio.

No se usa ninguna herramienta de seguimiento. Las estadísticas de visitas son las de Cloudflare Web Analytics, sin cookies (ver la página de privacidad).

## Criterios de los textos

Los valores oficiales se muestran tal cual. Para los títulos solo se elige qué parte mostrar y se recorta.

- **Ley.** `Ley N — TEMA · Observatorio Legislativo`. Muchos títulos oficiales empiezan con un preámbulo, como «Proyecto de Ley "…"» o «Mensaje del Poder Ejecutivo N° …», y el tema va entre comillas. En ese caso el tema es el texto entre comillas. Si el título oficial empieza directamente con el tema («QUE …»), se usa desde el inicio, aunque más adelante cite otra ley entre comillas. El tema se recorta a unos 60 caracteres en una palabra completa, con «…». No se cambian mayúsculas ni palabras. La descripción lleva el número, la fecha de sanción y el título oficial completo, recortado a 300 caracteres.
- **Legislador.** El título es su nombre oficial. La descripción indica la cámara, el período, el partido y cuántos votos y leyes de su autoría muestra la ficha.
- **Votación.** `Ley N, votación ID del FECHA` o `Expediente X, votación ID del FECHA` (#45). La descripción lleva la cámara, la fecha, la etapa, el tema, el resultado oficial y los totales. Datos estructurados `WebPage` sobre el proyecto (`Legislation`).
- **Imagen.** En cada votación, su propia imagen de 1200 × 630 con el resultado, los totales y la posición de cada partido, generada al compilar (`scripts/imagenes-votaciones.js`, con la tipografía Inter del paquete `@expo-google-fonts/inter` para que salga igual en cualquier servidor). En las fichas de legisladores, su foto oficial reducida (320 × 320). En el resto, una imagen general de 1200 × 630 (`sitio/public/compartir.png`), provisional hasta el diseño definitivo de la Fase 4. Se genera con `node scripts/imagen-compartir.js` desde `sitio/` y toma los colores de `tokens.css`. No corre en cada compilación porque el servidor de Cloudflare puede no tener las mismas tipografías, así que el resultado se sube al repositorio.

## Comprobaciones después de publicar el sitio (#11)

Revisan el código, no el dominio, así que se hacen apenas el sitio esté publicado.

- Datos estructurados: [validador de schema.org](https://validator.schema.org/) y [prueba de resultados enriquecidos de Google](https://search.google.com/test/rich-results), con una ficha de ley, una de legislador y la página de datos abiertos.
- Vista previa al compartir: [depurador de Facebook](https://developers.facebook.com/tools/debug/) y un envío de prueba por WhatsApp. WhatsApp guarda la vista previa en caché durante un tiempo.
- Una dirección inexistente debe responder con la página 404.

## Dominio propio y alta en los buscadores (Fase 4, #14)

El sitio queda publicado e indexable en `congreso.alexisdick.com`, pero no se da de alta en los buscadores hasta tener el dominio definitivo. Así Google empieza a registrar el sitio directamente con la dirección final y no hace falta avisarle de una mudanza. La difusión pública también empieza recién entonces.

### Mudanza al dominio propio

1. Cambiar `sitio` en `sitio/src/lib/rutas.js`. Es el único lugar con el dominio. De ahí salen la configuración de Astro, las URLs canónicas, el sitemap, `robots.txt` y los datos estructurados.
2. Agregar el dominio nuevo al proyecto de Cloudflare Pages.
3. Redirigir el subdominio viejo con una **regla de redirección** de Cloudflare en la zona `alexisdick.com` (incluida en el plan gratuito). Debe ser permanente (301), conservar la ruta y los parámetros, y aplicarse a `congreso.alexisdick.com/*` → `https://DOMINIO-NUEVO/${1}`. Así cada enlace viejo lleva a la misma página en el dominio nuevo.
4. Mantener la redirección al menos un año.

### Google Search Console

1. Entrar en [Google Search Console](https://search.google.com/search-console) con la cuenta de Google que se quiera usar para el proyecto.
2. Elegir **Agregar propiedad** y el tipo **Dominio**, y escribir el dominio nuevo. Así queda verificado entero, con cualquier subdominio.
3. Google muestra un registro TXT. Si el DNS del dominio nuevo está en Cloudflare, Google suele ofrecer verificarlo de forma automática con un botón que abre Cloudflare y pide permiso. Si no aparece, copiar el registro TXT, agregarlo en Cloudflare (**DNS** → **Registros** → **Agregar registro**, tipo TXT, nombre `@`) y volver a Search Console para pulsar **Verificar**.
4. En la propiedad verificada, ir a **Sitemaps** y enviar `https://DOMINIO-NUEVO/sitemap.xml`.
5. Unos días después, revisar **Páginas** e **Indexación** para confirmar que no hay errores críticos.

Opcionalmente se puede hacer lo mismo en [Bing Webmaster Tools](https://www.bing.com/webmasters), que permite importar la propiedad desde Search Console.

Si alguna vez cambia una ruta dentro del sitio, la redirección va en `sitio/public/_redirects` (ver `docs/decisiones/0001-arquitectura.md`).
