// Menú principal y vistas de análisis. Único lugar donde se arman (alcance acordado en #51): el
// encabezado y la portada leen estas listas, de modo que el rediseño de la Fase 4 (#14) cambie el menú
// sin tocar las páginas. Las direcciones salen de lib/rutas.js. Cada vista de análisis nueva (#37, #44,
// #45, #54, #57) se agrega a VISTAS_DE_ANALISIS y queda en el menú y en la portada.

import * as rutas from "./rutas.js";

/**
 * Vistas de análisis, en el orden del menú. `menu` es el nombre corto de su entrada; `titulo` y
 * `descripcion`, los de la portada. Con `portada: false` la vista está en el menú y no en la portada; con
 * `portadaAlFinal`, su tarjeta va a lo ancho debajo de las demás. `incluye` son otras direcciones que
 * marcan su entrada del menú.
 */
export const vistasDeAnalisis = () => [
  {
    clave: "votaciones",
    url: rutas.votaciones(),
    incluye: [rutas.carpetaVotaciones()],
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
    clave: "temas",
    url: rutas.votosPorTema(),
    menu: "Temas",
    titulo: "Votos de partidos por tema",
    descripcion: "Cómo votaron los legisladores de cada partido y de cada bancada en las votaciones nominales de cada tema, por cámara.",
    portadaAlFinal: true,
  },
  {
    // En la portada, solo la lista de más «rebeldes» (#57); la de más «ausentes» está en la página.
    clave: "rankings",
    url: rutas.rankings(),
    incluye: [rutas.votacionesNominales()],
    menu: "Rankings",
    titulo: "Más «rebeldes»",
    descripcion: "Legisladores que más veces votaron distinto a la mayoría de su partido en las votaciones nominales de su cámara.",
  },
];

/** Entradas del menú principal, en orden. */
export const menuPrincipal = () => [
  { url: rutas.leyes(), texto: "Leyes" },
  { url: rutas.legisladores(), texto: "Legisladores" },
  ...vistasDeAnalisis().map((v) => ({ url: v.url, texto: v.menu, incluye: v.incluye ?? [] })),
  { url: rutas.testAfinidad(), texto: "Test de afinidad" },
  { url: rutas.buscar(), texto: "Buscar" },
  { url: rutas.datosAbiertos(), texto: "Datos abiertos" },
];

/**
 * Entrada del menú que corresponde a una dirección: la de ruta más larga que la contiene, contando su
 * `incluye`, para que /legisladores/votaciones-nominales/ marque «Rankings» y no también «Legisladores».
 */
export function entradaActual(entradas, pathname) {
  const largo = (e) => Math.max(...[e.url, ...(e.incluye ?? [])].filter((u) => pathname.startsWith(u)).map((u) => u.length), -1);
  return entradas.filter((e) => largo(e) >= 0).sort((a, b) => largo(b) - largo(a))[0];
}
