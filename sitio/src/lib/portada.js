// Vista previa de las vistas de análisis en la portada (alcance acordado en #51). Sin HTML. Datos por
// cámara; los únicos nombres de personas son los primeros del cuadro de votos distintos a la mayoría
// de su partido (#54). Las cifras salen de los mismos cálculos que las páginas de cada vista
// (lib/votaciones.js, lib/coincidencia.js, lib/votosDistintos.js y lib/votosPorTema.js), nunca se
// suman las cámaras.

import { coincidencia } from "./coincidencia.js";
import { ultimasVotaciones } from "./votaciones.js";
import { CANTIDAD_PORTADA, votosDistintosAlPartido } from "./votosDistintos.js";
import { votosPorTema } from "./votosPorTema.js";

const porMayorCoincidencia = (a, b) => b.porcentaje - a.porcentaje || b.total - a.total || a.nombres.localeCompare(b.nombres, "es");

/**
 * Pares de partidos de una cámara con porcentaje (al menos UMBRAL votaciones en común), de mayor a
 * menor coincidencia. A igual porcentaje, primero el de más votaciones en común.
 */
export function paresConPorcentaje(cuadro) {
  const pares = [];
  cuadro.filas.forEach((a, i) => {
    cuadro.filas.forEach((b, j) => {
      const c = a.celdas[j];
      if (j > i && c?.suficiente) pares.push({ ...c, a: a.nombre, b: b.nombre, nombres: `${a.nombre} ${b.nombre}` });
    });
  });
  return pares.sort(porMayorCoincidencia);
}

/**
 * Barras del gráfico de una cámara: la coincidencia de cada partido con el partido de referencia
 * (por su id; sin id, el de más legisladores en ejercicio en esa cámara, la primera fila del cuadro).
 * Primero los que tienen porcentaje, de mayor a menor; después, los que no alcanzan el umbral (sin
 * barra, solo las cantidades). Sin el partido en la cámara, referencia null y sin barras.
 */
export function barrasDeReferencia(cuadro, id = cuadro.filas[0]?.id) {
  const referencia = cuadro.filas.find((f) => f.id === id);
  if (!referencia) return { referencia: null, barras: [] };
  const barras = cuadro.filas
    .filter((f) => f !== referencia)
    .map((f) => ({ ...referencia.celdas[cuadro.filas.indexOf(f)], nombre: f.nombre, nombres: f.nombre }))
    .filter((b) => b.total > 0)
    .sort((a, b) => Number(b.suficiente) - Number(a.suficiente) || porMayorCoincidencia(a, b));
  return { referencia: referencia.nombre, barras };
}

/**
 * Vista previa de un período.
 * - partidos: los partidos que se pueden elegir en el gráfico, de más a menos legisladores en ejercicio
 *   en el Congreso. El primero es el que se muestra al abrir la portada.
 * - coincidencia: por cámara, sus votaciones sobre proyectos de ley, el par de partidos con más y con
 *   menos coincidencia (null si la cámara no tiene al menos dos pares con porcentaje) y un gráfico
 *   por partido (barrasDeReferencia), en el orden de `partidos`.
 * - votaciones: las CANTIDAD_ULTIMAS_PORTADA votaciones más recientes, de las dos cámaras.
 * - votosDistintos: por cámara, los CANTIDAD_PORTADA primeros del cuadro de votos distintos a la mayoría
 *   de su partido, en el mismo orden.
 * - temas: los temas con votaciones, cada uno con la dirección de su página de votos por tema (#37).
 */
export function vistaPrevia(periodo) {
  const c = coincidencia(periodo);
  return {
    partidos: c.partidos.map((p) => ({ id: p.id, nombre: p.nombre })),
    coincidencia: c.cuadros.map((cuadro) => {
      const pares = paresConPorcentaje(cuadro);
      return {
        camara: cuadro.camara,
        votaciones: c.camaras.find((x) => x.camara === cuadro.camara).votaciones,
        mayor: pares.length > 1 ? pares[0] : null,
        menor: pares.length > 1 ? pares.at(-1) : null,
        graficos: c.partidos.map((p) => ({ id: p.id, ...barrasDeReferencia(cuadro, p.id) })),
      };
    }),
    votaciones: ultimasVotaciones(periodo),
    votosDistintos: votosDistintosAlPartido(periodo).camaras.map((x) => ({
      camara: x.camara,
      filas: x.filas.slice(0, CANTIDAD_PORTADA),
    })),
    temas: votosPorTema(periodo).map((t) => ({ id: t.id, nombre: t.nombre, nombreCorto: t.nombreCorto, url: t.url })),
  };
}
