// Menú principal y vistas de análisis. Único lugar donde se arman (alcance acordado en #51): el
// encabezado y la portada leen estas listas, de modo que el rediseño de la Fase 4 (#14) cambie el menú
// sin tocar las páginas. Las direcciones salen de lib/rutas.js. Cada vista de análisis nueva (#37, #44,
// #45, #54, #57) se agrega a VISTAS_DE_ANALISIS y queda en el menú y en la portada.

import * as rutas from "./rutas.js";
import { textos } from "./contenido.js";
const tx = textos.general.menu;
const txc = textos.general.comunes;

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
    menu: tx.votaciones,
    titulo: tx.votacionesYPosicionDeCada,
    descripcion: tx.lasVotacionesNominalesSobreProyectos,
    portadaAlFinal: true,
  },
  {
    clave: "coincidencia",
    url: rutas.coincidencia(),
    menu: tx.partidos,
    titulo: txc.coincidenciaDeVotosEntrePartidos,
    descripcion: tx.queTanSeguidoVotaronIgual,
  },
  {
    clave: "temas",
    url: rutas.votosPorTema(),
    menu: tx.temas,
    titulo: tx.votosDePartidosPorTema,
    descripcion: tx.comoVotaronLosLegisladoresDe,
    portadaAlFinal: true,
  },
  {
    // En la portada, solo la lista de más «rebeldes» (#57); la de más «ausentes» está en la página.
    clave: "rankings",
    url: rutas.rankings(),
    incluye: [rutas.votacionesNominales()],
    menu: tx.rankings,
    titulo: tx.masRebeldes,
    descripcion: tx.legisladoresQueMasVecesVotaron,
  },
];

/** Entradas del menú principal, en orden. */
export const menuPrincipal = () => [
  { url: rutas.leyes(), texto: tx.leyes },
  { url: rutas.proyectos(), texto: tx.proyectos },
  { url: rutas.legisladores(), texto: tx.legisladores },
  ...vistasDeAnalisis().map((v) => ({ url: v.url, texto: v.menu, incluye: v.incluye ?? [] })),
  { url: rutas.estadisticas(), texto: tx.estadisticas },
  { url: rutas.testAfinidad(), texto: txc.testDeAfinidad },
  { url: rutas.botTelegram(), texto: tx.botDeTelegram },
  { url: rutas.buscar(), texto: tx.buscarLeyes },
  { url: rutas.datosAbiertos(), texto: txc.datosAbiertos },
];

/**
 * Entrada del menú que corresponde a una dirección: la de ruta más larga que la contiene, contando su
 * `incluye`, para que /legisladores/votaciones-nominales/ marque «Rankings» y no también «Legisladores».
 */
export function entradaActual(entradas, pathname) {
  const largo = (e) => Math.max(...[e.url, ...(e.incluye ?? [])].filter((u) => pathname.startsWith(u)).map((u) => u.length), -1);
  return entradas.filter((e) => largo(e) >= 0).sort((a, b) => largo(b) - largo(a))[0];
}
