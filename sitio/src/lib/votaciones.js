// Votaciones nominales del período con la posición de cada partido (alcance acordado en #44). Sin HTML.
//
// Criterios (ver docs/metodologia.md):
// - Votaciones: las nominales del período sobre un proyecto de ley (esDeProyectoDeLey), las mismas del
//   historial de votos de la ficha de legislador (#28) y de la coincidencia de votos (#43).
// - Una página por año, con el año de la fecha del trámite. Dentro, de la más reciente a la más
//   antigua. Filtros por cámara, estado oficial del proyecto y resultado oficial, con su valor de
//   filtro (slug); los textos que se muestran son los oficiales. También por tema, con la
//   clasificación propia de lib/temas.js (#36); una votación puede tener más de un tema.
// - Totales: los oficiales (ficha.js, totalesDe), con el denominador de legisladores registrados.
// - Posición de cada partido: la categoría con más votos entre los votos emitidos de sus miembros
//   (ficha.js, posicionesDePartidos), con la sigla propia. Partido = texto oficial dentro de la cámara
//   de la votación, que equivale al partido unificado (#42).
// - Autores por partido: los autores legisladores del proyecto (autores.json) contados por partido
//   unificado, con la sigla propia (#58, también de los proyectos que no llegaron a ser ley). Sin
//   autores, se muestra la iniciativa oficial si no es parlamentaria. El título oficial no cambia.
// - Portada: las votaciones más recientes de las dos cámaras.
// - Más ajustadas: por cámara, de menor a mayor diferencia entre los totales oficiales de SI y NO; a
//   igual diferencia, la más reciente primero. Fuera las votaciones sin votos SI ni NO.

import { barra, indice, masRecientePrimero, posicionCamara, posicionesDePartidos, totalesDe, valor } from "./ficha.js";
import { esDeProyectoDeLey, estadosDelPeriodo, leyesDeVotacion, proyectoDeVotacion, valoresUnicos } from "./legisladores.js";
import { nombreConocido, partidoUnificado, siglaDe } from "./partidos.js";
import * as rutas from "./rutas.js";
import { PENDIENTE, TEXTO_PENDIENTE, temas, temasDeProyectos } from "./temas.js";
import { slug } from "./texto.js";
import { textos } from "./contenido.js";
const txc = textos.general.comunes;

/** Votaciones más ajustadas por cámara en la página de votaciones y en la portada. */
export const CANTIDAD_AJUSTADAS = 10;
/** Votaciones más recientes en la portada, de las dos cámaras. */
export const CANTIDAD_ULTIMAS_PORTADA = 5;

/** Valor de filtro de las votaciones sin dato en un campo. */
const SIN_DATO = "sin-dato";

const porTexto = (a, b) => a.localeCompare(b, "es");

/** Diferencia entre los totales oficiales de SI y NO, o null si la votación no tiene ninguno de los dos. */
export function diferenciaSiNo(v) {
  const si = Number(v.totalSI) || 0;
  const no = Number(v.totalNO) || 0;
  return si + no > 0 ? Math.abs(si - no) : null;
}

const PARLAMENTARIA = "PARLAMENTARIA";
/** Texto del grupo de los autores sin partido registrado. */
const SIN_PARTIDO = txc.sinPartidoRegistrado;

/**
 * Autores legisladores de un proyecto ({ partido, idLegislador }, partido = texto oficial), cada uno una
 * sola vez, contados por partido unificado: sigla, textos oficiales y cantidad. De más a menos autores
 * y, a igualdad, por sigla.
 */
export function autoresPorPartido(autores) {
  const vistos = new Set();
  const grupos = new Map();
  for (const a of autores) {
    if (vistos.has(a.idLegislador)) continue;
    vistos.add(a.idLegislador);
    const texto = valor(a.partido);
    const id = texto ? partidoUnificado(texto).id : SIN_PARTIDO;
    const g = grupos.get(id) ?? { sigla: texto ? siglaDe(texto) : SIN_PARTIDO, textos: new Set(), cantidad: 0 };
    if (texto) g.textos.add(nombreConocido(texto) ? `${texto} (${nombreConocido(texto)})` : texto);
    g.cantidad++;
    grupos.set(id, g);
  }
  return [...grupos.values()]
    .map((g) => ({ sigla: g.sigla, nombre: [...g.textos].join(" / ") || SIN_PARTIDO, cantidad: g.cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad || porTexto(a.sigla, b.sigla));
}

/** Una votación lista para la página: textos oficiales, totales, barra y posición de cada partido. */
function prepararVotacion(v, i, valores) {
  const t = v.tramitacion ?? {};
  const camara = valor(t.camaraTramite);
  const resultado = valor(t.resultadoTramite);
  const votos = (i.votos.get(v.idVotacion) ?? []).map((x) => ({
    partido: i.legisladores.get(Number(x.idLegislador))?.partidoPolitico,
    sentido: x.sentidoVotacion,
  }));
  const { categorias, totales } = totalesDe(v, votos.map((x) => x.sentido));
  const leyes = leyesDeVotacion(v, i);
  return {
    id: v.idVotacion,
    fecha: valor(t.fechaTramite),
    fechaIso: t._propio?.fechaTramite ?? null,
    anio: (t._propio?.fechaTramite ?? "").slice(0, 4) || null,
    camara,
    camaraFiltro: camara ? slug(camara) : SIN_DATO,
    etapa: valor(t.descripcionEtapa),
    resultado,
    resultadoFiltro: valores.resultados.get(resultado) ?? SIN_DATO,
    // Temas del proyecto según la clasificación propia (#36), para sus etiquetas y el filtro.
    temas: temasDeProyectos([{ periodo: valores.periodo, idProyecto: v.proyecto?.idProyecto }]),
    proyecto: proyectoDeVotacion(v, valores.estados),
    autores: autoresPorPartido(
      (i.autores.get(v.proyecto?.idProyecto) ?? []).map((a) => ({ partido: a.legislador?.partidoPolitico, idLegislador: a.legislador?.idLegislador })),
    ),
    // Iniciativa oficial, solo si no es parlamentaria (Poder Ejecutivo, Corte Suprema de Justicia…).
    iniciativa: valor(v.proyecto?.iniciativa) && v.proyecto.iniciativa !== PARLAMENTARIA ? v.proyecto.iniciativa : null,
    leyes,
    // Página propia de la votación (#45).
    pagina: rutas.votacion(v.idVotacion),
    // Con ley, la votación dentro de su ficha; sin ley, la votación oficial en SILpy.
    url: leyes[0]?.url ?? valor(v.appURL) ?? rutas.votacionSilpy(v.idVotacion),
    registrados: votos.length,
    totales: totales.filter((x) => x.cantidad > 0),
    barra: barra(categorias, totales),
    diferencia: diferenciaSiNo(v),
    partidos: posicionesDePartidos(votos),
  };
}

const porPeriodo = new Map();

/**
 * Votaciones sobre proyectos de ley de un período, de la más reciente a la más antigua, y los años
 * con votaciones (del más reciente al más antiguo), cada uno con su cantidad total y por cámara.
 */
export function votacionesDelPeriodo(periodo) {
  if (porPeriodo.has(periodo)) return porPeriodo.get(periodo);
  const i = indice(periodo);
  const lista = [...i.votaciones.values()].filter(esDeProyectoDeLey);
  const valores = {
    periodo,
    estados: estadosDelPeriodo(periodo),
    resultados: valoresUnicos(lista.map((v) => valor(v.tramitacion?.resultadoTramite))),
  };
  const votaciones = lista.map((v) => prepararVotacion(v, i, valores)).sort(masRecientePrimero);
  const anios = [...new Set(votaciones.map((v) => v.anio).filter(Boolean))]
    .sort((a, b) => b.localeCompare(a))
    .map((anio) => {
      const delAnio = votaciones.filter((v) => v.anio === anio);
      return { anio, url: rutas.votaciones(anio), total: delAnio.length, porCamara: cantidadPorCamara(delAnio) };
    });
  const resultado = { periodo, votaciones, anios, porCamara: cantidadPorCamara(votaciones) };
  porPeriodo.set(periodo, resultado);
  return resultado;
}

/** Cantidad de votaciones de cada cámara, primero la de Senadores. */
function cantidadPorCamara(votaciones) {
  const cuenta = new Map();
  for (const v of votaciones) cuenta.set(v.camara, (cuenta.get(v.camara) ?? 0) + 1);
  return [...cuenta.entries()]
    .map(([camara, total]) => ({ camara, total }))
    .sort((a, b) => posicionCamara(a.camara) - posicionCamara(b.camara) || porTexto(a.camara ?? "", b.camara ?? ""));
}

/** Opciones de un filtro: cada valor presente con su texto oficial y cuántas votaciones tiene. */
function opcionesDe(votaciones, texto, filtro, orden) {
  const opciones = new Map();
  for (const v of votaciones) {
    const o = opciones.get(filtro(v)) ?? { valor: filtro(v), texto: texto(v), total: 0 };
    o.total++;
    opciones.set(o.valor, o);
  }
  return [...opciones.values()].sort(orden ?? ((a, b) => porTexto(a.texto ?? "", b.texto ?? "")));
}

/** Opciones del filtro por tema: los temas de temas.json y "pendiente", con cuántas votaciones tiene cada uno. */
function opcionesDeTema(votaciones) {
  return [...temas().map((t) => ({ valor: t.id, texto: t.nombre })), { valor: PENDIENTE, texto: TEXTO_PENDIENTE }]
    .map((o) => ({ ...o, total: votaciones.filter((v) => v.temas.filtro.includes(o.valor)).length }))
    .filter((o) => o.total > 0);
}

/**
 * Votaciones de un año del período, con las opciones de cada filtro (solo los valores de ese año).
 * Cámaras en el orden de siempre; estados y resultados por su texto oficial.
 */
export function votacionesDelAnio(periodo, anio) {
  const votaciones = votacionesDelPeriodo(periodo).votaciones.filter((v) => v.anio === anio);
  return {
    periodo,
    anio,
    votaciones,
    porCamara: cantidadPorCamara(votaciones),
    opciones: {
      camara: opcionesDe(votaciones, (v) => v.camara, (v) => v.camaraFiltro, (a, b) => posicionCamara(a.texto) - posicionCamara(b.texto)),
      estado: opcionesDe(votaciones, (v) => v.proyecto.estado, (v) => v.proyecto.estadoFiltro),
      resultado: opcionesDe(votaciones, (v) => v.resultado, (v) => v.resultadoFiltro),
      tema: opcionesDeTema(votaciones),
    },
  };
}

/** Las `cantidad` votaciones más recientes del período, de las dos cámaras (masRecientePrimero). */
export const ultimasVotaciones = (periodo, cantidad = CANTIDAD_ULTIMAS_PORTADA) => votacionesDelPeriodo(periodo).votaciones.slice(0, cantidad);

/** De menor a mayor diferencia entre SI y NO; a igual diferencia, la más reciente primero. */
const porMasAjustada = (a, b) => a.diferencia - b.diferencia || masRecientePrimero(a, b);

/** Por cámara, las `cantidad` votaciones más ajustadas del período (porMasAjustada). */
export function masAjustadas(periodo, cantidad = CANTIDAD_AJUSTADAS) {
  const { votaciones, porCamara } = votacionesDelPeriodo(periodo);
  return porCamara.map(({ camara, total }) => ({
    camara,
    total,
    votaciones: votaciones
      .filter((v) => v.camara === camara && v.diferencia !== null)
      .sort(porMasAjustada)
      .slice(0, cantidad),
  }));
}
