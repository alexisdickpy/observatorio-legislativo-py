// Vista previa de las vistas de análisis en la portada (alcance acordado en #51). Sin HTML. Datos por
// cámara; los únicos nombres de personas son los primeros del cuadro de votos distintos a la mayoría
// de su partido (#54). Las cifras salen de los mismos cálculos que las páginas de cada vista
// (lib/votaciones.js, lib/coincidencia.js, lib/votosDistintos.js y lib/votosPorTema.js), nunca se
// suman las cámaras.

import { coincidencia } from "./coincidencia.js";
import { claseDeCategoria, detalleDeVotacion } from "./ficha.js";
import { listado } from "./legisladores.js";
import { clasePartido, siglaDe } from "./partidos.js";
import { legible, recortar } from "./texto.js";
import { ultimasVotaciones } from "./votaciones.js";
import { CANTIDAD_PORTADA, votosDistintosAlPartido } from "./votosDistintos.js";
import { votosPorTema } from "./votosPorTema.js";
import { textos } from "./contenido.js";
const tx = textos.portada.textos;
const txc = textos.general.comunes;

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

/** Tipo oficial de los senadores vitalicios, que no ocupan una de las 45 bancas. */
const VITALICIO = "VITALICIO";

/** Las dos cámaras en su orden, con sus bancas según la Constitución. */
const CAMARAS = [
  { camara: "CAMARA DE SENADORES", nombre: tx.senadores, bancas: 45 },
  { camara: "CAMARA DE DIPUTADOS", nombre: tx.diputados, bancas: 80 },
];

/**
 * Composición actual de cada cámara (#80): legisladores en ejercicio según el dato oficial, sin los
 * senadores vitalicios, por
 * partido, de más a menos. `asientos`, un punto por legislador, partido por partido. Se muestra lo que
 * publica el Congreso aunque no coincida con las bancas (`bancas` queda para avisarlo).
 */
export function composicion(periodo) {
  const { enEjercicio } = listado(periodo);
  return CAMARAS.map(({ camara, nombre, bancas }) => {
    const grupos = new Map();
    for (const f of enEjercicio.filter((x) => x.camara === camara && x.tipo !== VITALICIO)) {
      const clave = f.partido ?? txc.sinPartidoRegistrado;
      if (!grupos.has(clave)) grupos.set(clave, []);
      grupos.get(clave).push(f);
    }
    const partidos = [...grupos.entries()]
      .map(([texto, miembros]) => ({ sigla: siglaDe(texto) ?? texto, nombre: legible(miembros[0].partidoConocido ? `${texto} (${miembros[0].partidoConocido})` : texto), clase: clasePartido(texto), cantidad: miembros.length, miembros }))
      .sort((a, b) => b.cantidad - a.cantidad || a.sigla.localeCompare(b.sigla, "es"));
    return {
      camara,
      nombre,
      bancas,
      total: partidos.reduce((a, p) => a + p.cantidad, 0),
      partidos: partidos.map(({ miembros, ...p }) => p),
      asientos: partidos.flatMap((p) => p.miembros.map((f) => ({ titulo: `${f.nombre} · ${p.sigla}`, ficha: f.url, clase: p.clase }))),
    };
  });
}

/** Largo máximo del título oficial en el titular de la portada; el completo está en la votación. */
const LARGO_TITULO_DESTACADA = 200;

/** Un punto por legislador de una votación (ficha.js, detalleDeVotacion), por sentido y dentro por partido. */
export function puntosDeVotacion(d) {
  const posicion = new Map(d.categorias.map((c, n) => [c, n]));
  const orden = new Map(d.porPartido.map((p, n) => [p.nombre, n]));
  return [...d.votos]
    .sort((a, b) => posicion.get(a.sentido) - posicion.get(b.sentido) || orden.get(a.partido) - orden.get(b.partido))
    .map((x) => ({ titulo: `${x.nombre ?? txc.sinDato} · ${x.partido ?? txc.sinDato} · ${x.sentido}`, ficha: x.ficha, clase: claseDeCategoria(x.sentido), partido: x.partido, sentido: x.sentido }));
}

/**
 * La votación más reciente para el titular de la portada (#80), o null. Resultado y título son los
 * oficiales. `asientos` lleva un punto por legislador de la lista oficial, ordenado por sentido del voto
 * y, dentro, por partido, para que cada voto forme un bloque en el hemiciclo. `partidos`, el voto de cada
 * legislador por partido, sin mezclar ningún total con los oficiales.
 */
export function votacionDestacada(periodo) {
  const v = ultimasVotaciones(periodo, 1)[0];
  if (!v) return null;
  const d = detalleDeVotacion(periodo, v.id);
  const votos = puntosDeVotacion(d);
  const cantidadOficial = (categoria) => d.totales.find((t) => t.categoria === categoria)?.cantidad ?? 0;
  return {
    pagina: v.pagina,
    fecha: v.fecha,
    fechaIso: v.fechaIso,
    camara: v.camara,
    etapa: v.etapa,
    resultado: v.resultado,
    titulo: recortar(v.proyecto.titulo, LARGO_TITULO_DESTACADA),
    expediente: v.proyecto.expediente,
    ley: v.leyes[0] ?? null,
    si: cantidadOficial("SI"),
    no: cantidadOficial("NO"),
    registrados: d.registrados,
    leyenda: d.totales.filter((t) => t.cantidad > 0).map((t) => ({ categoria: t.categoria, cantidad: t.cantidad, clase: claseDeCategoria(t.categoria) })),
    asientos: votos,
    partidos: d.porPartido.map((p) => ({
      sigla: p.nombre ? siglaDe(p.nombre) : txc.sinPartidoRegistrado,
      clase: clasePartido(p.nombre),
      nombre: legible(p.nombre),
      total: p.total,
      puntos: votos.filter((x) => x.partido === p.nombre).map((x) => ({ clase: x.clase, titulo: x.titulo })),
      resumen: d.categorias.map((c, n) => ({ categoria: c, cantidad: p.celdas[n].cantidad })).filter((c) => c.cantidad > 0),
    })),
    totalesCoinciden: d.totalesCoinciden,
    recalculados: d.recalculados,
  };
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
