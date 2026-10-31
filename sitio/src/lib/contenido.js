// Textos propios del sitio, en los archivos de sitio/src/contenido/ que se editan desde Pages CMS o a
// mano (docs/edicion-de-textos.md). Solo para la compilación: los scripts del navegador importan
// contenido/interaccion.json y lib/rellenar.js, para no llevar todos los textos a cada página.
//
// Los textos con enlaces o negrita usan Markdown («[texto](dirección)», «**negrita**»).

import { marked } from "marked";
import buscar from "../contenido/buscar.json" with { type: "json" };
import coincidencia from "../contenido/coincidencia.json" with { type: "json" };
import datos from "../contenido/datos.json" with { type: "json" };
import error404 from "../contenido/error404.json" with { type: "json" };
import estadisticas from "../contenido/estadisticas.json" with { type: "json" };
import general from "../contenido/general.json" with { type: "json" };
import interaccion from "../contenido/interaccion.json" with { type: "json" };
import legisladores from "../contenido/legisladores.json" with { type: "json" };
import leyes from "../contenido/leyes.json" with { type: "json" };
import metodologia from "../contenido/metodologia.json" with { type: "json" };
import portada from "../contenido/portada.json" with { type: "json" };
import privacidad from "../contenido/privacidad.json" with { type: "json" };
import proyectos from "../contenido/proyectos.json" with { type: "json" };
import rankings from "../contenido/rankings.json" with { type: "json" };
import temas from "../contenido/temas.json" with { type: "json" };
import test from "../contenido/test.json" with { type: "json" };
import votaciones from "../contenido/votaciones.json" with { type: "json" };
import { fill } from "./rellenar.js";

export { fill };

export const textos = { buscar, coincidencia, datos, error404, estadisticas, general, interaccion, legisladores, leyes, metodologia, portada, privacidad, proyectos, rankings, temas, test, votaciones };

const escapar = (valor) => String(valor).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

/** Valor que ya es HTML seguro y no se debe escapar (una dirección, una fecha con su etiqueta <time>). */
export const crudo = (html) => ({ crudo: html });

const seguros = (valores) =>
  Object.fromEntries(Object.entries(valores).map(([k, v]) => [k, v?.crudo ?? escapar(v)]));

/** HTML de un texto de una línea con Markdown, sin párrafo alrededor. */
export const md = (texto, valores = {}) => marked.parseInline(fill(texto, seguros(valores)));

/** HTML de un texto largo con Markdown (párrafos y listas). */
export const mdBloque = (texto, valores = {}) => marked.parse(fill(texto, seguros(valores)));
