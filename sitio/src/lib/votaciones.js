// Votaciones nominales del período con la posición de cada partido (alcance acordado en #44). Sin HTML.
//
// Criterios (ver docs/metodologia.md):
// - Votaciones: las nominales del período sobre un proyecto de ley (esDeProyectoDeLey), las mismas del
//   historial de votos de la ficha de legislador (#28) y de la coincidencia de votos (#43).
// - Una página por año, con el año de la fecha del trámite. Dentro, de la más reciente a la más
//   antigua. Filtros por cámara, estado oficial del proyecto y resultado oficial, con su valor de
//   filtro (slug); los textos que se muestran son los oficiales.
// - Totales: los oficiales (ficha.js, totalesDe), con el denominador de legisladores registrados.
// - Posición de cada partido: la categoría con más votos entre los votos emitidos de sus miembros
//   (ficha.js, posicionesDePartidos), con la sigla propia. Partido = texto oficial dentro de la cámara
//   de la votación, que equivale al partido unificado (#42).
// - Portada: las votaciones más recientes de las dos cámaras.
// - Más ajustadas: por cámara, de menor a mayor diferencia entre los totales oficiales de SI y NO; a
//   igual diferencia, la más reciente primero. Fuera las votaciones sin votos SI ni NO.

import { barra, indice, masRecientePrimero, posicionCamara, posicionesDePartidos, totalesDe, valor } from "./ficha.js";
import { esDeProyectoDeLey, estadosDelPeriodo, leyesDeVotacion, proyectoDeVotacion, valoresUnicos } from "./legisladores.js";
import * as rutas from "./rutas.js";
import { slug } from "./texto.js";

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
    proyecto: proyectoDeVotacion(v, valores.estados),
    leyes,
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
