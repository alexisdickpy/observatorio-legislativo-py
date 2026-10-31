// Coincidencia de votos entre partidos y entre bancadas. Sin HTML.
//
// Criterios (alcance acordado en #43, ver docs/metodologia.md):
// - Votaciones: las nominales del período sobre un proyecto de ley, las mismas del historial de votos
//   de la ficha de legislador (#28).
// - Posición de un grupo en una votación: su mayoría, igual que en los votos distintos a la mayoría
//   (#39, mayoriaDe de lib/mayoria.js). Es la categoría con más votos entre los votos emitidos de
//   sus miembros (SI, NO, ABSTENCIÓN/BLANCO o una moción). Si dos o más empatan en el primer lugar, el
//   grupo no tiene posición en esa votación. Un grupo en que solo votó una persona tiene como posición
//   su voto. Si ninguno de sus miembros emitió voto, no tiene posición.
// - Coincidencia entre dos grupos: votaciones en que los dos tuvieron posición y fue la misma, sobre
//   las votaciones en que los dos tuvieron posición. Con menos de UMBRAL votaciones en común se
//   muestran las cantidades sin porcentaje.
// - Cada votación es de una sola cámara, así que todo se calcula dentro de cada cámara y nunca se
//   suman senadores y diputados. Partido = partido unificado (#42), que solo sirve para poner lado a
//   lado lo que hizo el mismo partido en cada cámara. Bancada = texto oficial, dentro de su cámara.
// - Partido y bancada: los que la API registra para el período, no por fecha.

import { indice, posicionCamara, proporcion, valor } from "./ficha.js";
import { esDeProyectoDeLey, mayoriasDelPeriodo } from "./legisladores.js";
import { nombreConocido, partidoUnificado } from "./partidos.js";
import { slug } from "./texto.js";
import { textos, fill } from "./contenido.js";
const tx = textos.coincidencia.textos;

/** Votaciones en común por debajo de las cuales no se calcula el porcentaje. */
export const UMBRAL = 20;

const porTexto = (a, b) => a.localeCompare(b, "es");

/**
 * Posición de un grupo a partir de su mayoría (mayoriaDe): la categoría, null si hubo empate, o
 * undefined si ningún miembro emitió voto.
 */
export const posicionDe = (m) => (m && m.votantes > 0 ? m.mayoria : undefined);

/**
 * Coincidencia entre los grupos a y b. `posiciones` tiene un Map grupo → posición por votación.
 * total = votaciones en que los dos tuvieron posición; cantidad = en cuántas fue la misma.
 * `suficiente` dice si alcanza el umbral para mostrar el porcentaje.
 */
export function coincidenciaEntre(posiciones, a, b) {
  let total = 0;
  let cantidad = 0;
  for (const p of posiciones) {
    const x = p.get(a);
    const y = p.get(b);
    if (!x || !y) continue;
    total++;
    if (x === y) cantidad++;
  }
  return { ...proporcion(cantidad, total), suficiente: total >= UMBRAL };
}

/** Votaciones en que el grupo tuvo posición y empates (votó al menos uno, sin posición). */
function resumenDeGrupo(posiciones, g) {
  let conPosicion = 0;
  let empates = 0;
  for (const p of posiciones) {
    if (!p.has(g)) continue;
    if (p.get(g)) conPosicion++;
    else empates++;
  }
  return { conPosicion, empates };
}

/**
 * Orden de las filas de un grupo: primero las que alcanzan el umbral, de mayor a menor porcentaje;
 * después las demás, de más a menos votaciones en común; a igualdad, por nombre.
 */
const porCoincidencia = (cifra) => (a, b) => {
  const x = cifra(a);
  const y = cifra(b);
  return (
    Number(y.suficiente) - Number(x.suficiente) ||
    (x.suficiente ? y.porcentaje - x.porcentaje : y.total - x.total) ||
    porTexto(a.nombre ?? "", b.nombre ?? "")
  );
};

/** Valor de la dirección y ancla de cada grupo (?grupo=…). */
export const valorDePartido = (id) => `partido-${id}`;
export const valorDeBancada = (camara, texto) => `bancada-${slug(camara ?? "")}-${slug(texto)}`;

/**
 * Posiciones de cada cámara en las votaciones sobre proyectos de ley de un período: por cámara, la
 * cantidad de votaciones y, para partidos y bancadas, un Map grupo → posición por votación. Los
 * partidos se identifican por su partido unificado; las bancadas, por su texto oficial. También, para
 * ordenar, cuántos legisladores en ejercicio tiene cada partido y cada bancada en esa cámara.
 */
const posicionesPorPeriodo = new Map();
export function posicionesDelPeriodo(periodo) {
  if (posicionesPorPeriodo.has(periodo)) return posicionesPorPeriodo.get(periodo);
  const i = indice(periodo);
  const mayorias = mayoriasDelPeriodo(periodo);
  const camaras = new Map();
  for (const [idVotacion, votos] of i.votos) {
    const v = i.votaciones.get(idVotacion);
    if (!v || !esDeProyectoDeLey(v)) continue;
    const camara = votos.map((x) => valor(i.legisladores.get(Number(x.idLegislador))?.camaraParlamentario)).find(Boolean);
    if (!camara) continue;
    if (!camaras.has(camara)) camaras.set(camara, { camara, votaciones: 0, ids: [], partido: [], bancada: [], textosPartido: new Map() });
    const c = camaras.get(camara);
    c.votaciones++;
    c.ids.push(idVotacion);
    const m = mayorias.get(idVotacion);
    const partido = new Map();
    for (const [texto, mayoria] of m.partido) {
      const id = partidoUnificado(texto).id;
      c.textosPartido.set(id, texto);
      const posicion = posicionDe(mayoria);
      if (posicion !== undefined) partido.set(id, posicion);
    }
    const bancada = new Map();
    for (const [texto, mayoria] of m.bancada) {
      const posicion = posicionDe(mayoria);
      if (posicion !== undefined) bancada.set(texto, posicion);
    }
    c.partido.push(partido);
    c.bancada.push(bancada);
  }
  for (const c of camaras.values()) {
    c.legisladoresPartido = new Map();
    c.legisladoresBancada = new Map();
  }
  for (const l of i.legisladores.values()) {
    const c = camaras.get(valor(l.camaraParlamentario));
    if (!c || !l._propio?.vigente) continue;
    const partido = partidoUnificado(l.partidoPolitico)?.id;
    const bancada = valor(l.bancada);
    if (partido) c.legisladoresPartido.set(partido, (c.legisladoresPartido.get(partido) ?? 0) + 1);
    if (bancada) c.legisladoresBancada.set(bancada, (c.legisladoresBancada.get(bancada) ?? 0) + 1);
  }
  const resultado = [...camaras.values()].sort((a, b) => posicionCamara(a.camara) - posicionCamara(b.camara));
  posicionesPorPeriodo.set(periodo, resultado);
  return resultado;
}

/** Grupos que figuran en las posiciones de una cámara. */
const gruposDe = (posiciones) => [...new Set(posiciones.flatMap((p) => [...p.keys()]))];

const resultados = new Map();

/**
 * Coincidencia de votos de un período.
 * - camaras: [{ camara, votaciones }] en el orden de las columnas.
 * - partidos: un bloque por partido unificado, con su texto oficial en cada cámara, sus votaciones
 *   con posición y empates por cámara y una fila por cada otro partido, con una celda por cámara
 *   (null si alguno de los dos no tiene legisladores en esa cámara). Nunca se suman las cámaras.
 * - bancadas: por cámara, un bloque por bancada con una fila por cada otra bancada de esa cámara.
 * - cuadros: por cámara, el cuadro de todos los pares de partidos de esa cámara (filas y columnas en
 *   el mismo orden, celda null en la diagonal).
 * Orden de los grupos: de más a menos legisladores en ejercicio (en el cuadro y las bancadas, en su
 * cámara; en el menú de partidos, en el Congreso), y a igualdad por nombre. Es solo un orden: ninguna
 * cifra suma cámaras.
 */
export function coincidencia(periodo) {
  if (resultados.has(periodo)) return resultados.get(periodo);
  const porCamara = posicionesDelPeriodo(periodo);
  const nombreDePartido = new Map();
  // Nombre unificado y, si alguno de sus textos oficiales lo tiene, el nombre por el que se lo
  // conoce entre paréntesis (dato propio, datos/propios/partidos.json).
  const textosDe = new Map();
  for (const c of porCamara) {
    for (const [id, texto] of c.textosPartido) textosDe.set(id, [...(textosDe.get(id) ?? []), texto]);
  }
  for (const [id, textos] of textosDe) {
    const nombre = partidoUnificado(textos[0]).nombre;
    const conocido = textos.map(nombreConocido).find(Boolean);
    nombreDePartido.set(id, conocido ? `${nombre} (${conocido})` : nombre);
  }
  /** Legisladores en ejercicio de un partido en cada cámara y en el Congreso (solo para ordenar). */
  const bancasDe = (id) => porCamara.map((c) => c.legisladoresPartido.get(id) ?? 0);
  const total = (id) => bancasDe(id).reduce((n, x) => n + x, 0);
  const idsPartido = [...nombreDePartido.keys()].sort(
    (a, b) => total(b) - total(a) || porTexto(nombreDePartido.get(a), nombreDePartido.get(b)),
  );

  const celda = (c, a, b) => (c.textosPartido.has(a) && c.textosPartido.has(b) ? coincidenciaEntre(c.partido, a, b) : null);
  /** Cifra para ordenar las filas de un partido: la celda con mayor porcentaje (o más votaciones) de las que hay. */
  const mejorCelda = (f) => f.celdas.filter(Boolean).sort(porCoincidencia((x) => x))[0];
  const partidos = idsPartido.map((id) => {
    const filas = idsPartido
      .filter((otro) => otro !== id)
      .map((otro) => ({ id: otro, nombre: nombreDePartido.get(otro), celdas: porCamara.map((c) => celda(c, id, otro)) }))
      .filter((f) => f.celdas.some(Boolean));
    return {
      valor: valorDePartido(id),
      id,
      nombre: nombreDePartido.get(id),
      porCamara: porCamara.map((c) =>
        c.textosPartido.has(id)
          ? { camara: c.camara, texto: c.textosPartido.get(id), legisladores: c.legisladoresPartido.get(id) ?? 0, ...resumenDeGrupo(c.partido, id) }
          : null,
      ),
      filas: filas.sort(porCoincidencia(mejorCelda)),
    };
  });

  const bancadas = porCamara.map((c) => {
    const miembros = (t) => c.legisladoresBancada.get(t) ?? 0;
    const textos = gruposDe(c.bancada).sort((a, b) => miembros(b) - miembros(a) || porTexto(a, b));
    return {
      camara: c.camara,
      grupos: textos.map((texto) => ({
        valor: valorDeBancada(c.camara, texto),
        nombre: texto,
        legisladores: miembros(texto),
        ...resumenDeGrupo(c.bancada, texto),
        filas: textos
          .filter((otro) => otro !== texto)
          .map((otro) => ({ nombre: otro, ...coincidenciaEntre(c.bancada, texto, otro) }))
          .sort(porCoincidencia((f) => f)),
      })),
    };
  });

  const cuadros = porCamara.map((c) => {
    const bancas = (id) => c.legisladoresPartido.get(id) ?? 0;
    const ids = idsPartido
      .filter((id) => c.textosPartido.has(id))
      .sort((a, b) => bancas(b) - bancas(a) || porTexto(nombreDePartido.get(a), nombreDePartido.get(b)));
    return {
      camara: c.camara,
      filas: ids.map((id) => ({
        id,
        nombre: nombreDePartido.get(id),
        texto: c.textosPartido.get(id),
        legisladores: bancas(id),
        celdas: ids.map((otro) => (otro === id ? null : coincidenciaEntre(c.partido, id, otro))),
      })),
    };
  });

  const resultado = {
    periodo,
    umbral: UMBRAL,
    camaras: porCamara.map((c) => ({ camara: c.camara, votaciones: c.votaciones })),
    partidos,
    bancadas,
    cuadros,
  };
  resultados.set(periodo, resultado);
  return resultado;
}

/** Columnas de la tabla descargable, en orden. */
export const COLUMNAS_COINCIDENCIA = [
  "periodo",
  "camara",
  "tipoGrupo",
  "grupoA",
  "textoOficialA",
  "grupoB",
  "textoOficialB",
  "votacionesEnComun",
  "coincidencias",
  "porcentajeCoincidencia",
];

/** Porcentaje con un decimal (0,1234 → 12.3). */
const redondear = (p) => Math.round(p * 1000) / 10;

/**
 * Tabla descargable: una fila por par de grupos y cámara (cada par una sola vez), con las votaciones
 * en común, las coincidencias y el porcentaje (vacío por debajo del umbral). grupoA y grupoB son el
 * partido unificado o el slug de la bancada. Cálculo propio, no oficial.
 */
export function tablaCoincidencia(periodo) {
  const filas = [];
  for (const c of posicionesDelPeriodo(periodo)) {
    const pares = (tipo, ids, texto, id) => {
      for (const [n, a] of ids.entries()) {
        for (const b of ids.slice(n + 1)) {
          const r = coincidenciaEntre(c[tipo], a, b);
          filas.push({
            periodo,
            camara: c.camara,
            tipoGrupo: tipo,
            grupoA: id(a),
            textoOficialA: texto(a),
            grupoB: id(b),
            textoOficialB: texto(b),
            votacionesEnComun: r.total,
            coincidencias: r.cantidad,
            porcentajeCoincidencia: r.suficiente ? redondear(r.porcentaje) : null,
          });
        }
      }
    };
    pares("partido", [...c.textosPartido.keys()].sort(), (id) => c.textosPartido.get(id), (id) => id);
    pares("bancada", gruposDe(c.bancada).sort(porTexto), (t) => t, slug);
  }
  return filas;
}

/**
 * Texto de una celda: la proporción; con pocas votaciones en común, las cantidades sin porcentaje;
 * null si alguno de los dos grupos no tiene legisladores en esa cámara.
 */
export function textoDeCoincidencia(c) {
  if (!c) return tx.sinLegisladoresEnEstaCamara;
  if (!c.total) return tx.sinVotacionesEnComun;
  return c.suficiente ? c.texto : fill(tx.menosDeVotacionesEnComun, { fraccion: c.fraccion, umbral: UMBRAL });
}

/**
 * Intensidad del sombreado de una celda del cuadro, entre 0 y 1: el porcentaje de coincidencia. Sin
 * porcentaje (diagonal o pocas votaciones en común), 0. Un solo tono, sin colores que califiquen.
 */
export const intensidadDe = (c) => (c?.suficiente ? Math.round(c.porcentaje * 100) / 100 : 0);
