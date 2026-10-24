// Menú principal y vistas de análisis. Único lugar donde se arman (alcance acordado en #51): el
// encabezado y la portada leen estas listas, de modo que el rediseño de la Fase 4 (#14) cambie el menú
// sin tocar las páginas. Las direcciones salen de lib/rutas.js. Cada vista de análisis nueva (#37, #44,
// #45, #54) se agrega a VISTAS_DE_ANALISIS y queda en el menú y en la portada.

import * as rutas from "./rutas.js";

/**
 * Vistas de análisis, en el orden del menú. `menu` es el nombre corto de su entrada; `titulo` y
 * `descripcion`, los de la portada. Con `portada: false` la vista está en el menú y no en la portada; con
 * `portadaAlFinal`, su tarjeta va a lo ancho debajo de las demás.
 */
export const vistasDeAnalisis = () => [
  {
    clave: "votaciones",
    url: rutas.votaciones(),
    menu: "Votaciones",
    titulo: "Votaciones y posición de cada partido",
    descripcion: "Las votaciones nominales sobre proyectos de ley con su resultado oficial y lo que votó la mayoría de cada partido. Aquí, las más recientes.",
    portadaAlFinal: true,
  },
  {
    clave: "coincidencia",
    url: rutas.coincidencia(),
    menu: "Partidos",
    titulo: "Coincidencia de votos entre partidos y bancadas",
    descripcion: "Qué tan seguido votaron igual los partidos y las bancadas de cada cámara en las votaciones nominales sobre proyectos de ley.",
  },
  {
    clave: "votacionesNominales",
    url: rutas.votacionesNominales(),
    menu: "Rankings",
    titulo: "Votaciones nominales por legislador",
    descripcion: "Una tabla para comparar a todos los legisladores de cada cámara por sus ausencias en votaciones nominales, NO VOTA, abstenciones y votos distintos a la mayoría de su bancada y de su partido.",
    portada: false,
  },
  {
    clave: "votosDistintos",
    url: rutas.votosDistintosAlPartido(),
    menu: "Votos distintos",
    titulo: "Más «rebeldes»",
    descripcion: "Legisladores que más veces votaron distinto a la mayoría de su partido en las votaciones nominales de su cámara.",
  },
];

/** Entradas del menú principal, en orden. */
export const menuPrincipal = () => [
  { url: rutas.leyes(), texto: "Leyes" },
  { url: rutas.legisladores(), texto: "Legisladores" },
  ...vistasDeAnalisis().map((v) => ({ url: v.url, texto: v.menu })),
  { url: rutas.buscar(), texto: "Buscar" },
  { url: rutas.datosAbiertos(), texto: "Datos abiertos" },
];

/**
 * Entrada del menú que corresponde a una dirección: la de ruta más larga que la contiene, para que
 * /legisladores/votaciones-nominales/ marque «Rankings» y no también «Legisladores».
 */
export function entradaActual(entradas, pathname) {
  return entradas.filter((e) => pathname.startsWith(e.url)).sort((a, b) => b.url.length - a.url.length)[0];
}
