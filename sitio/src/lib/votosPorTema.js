// Votos de partidos y bancadas por tema (alcance acordado en #37). Sin HTML.
//
// Criterios (ver docs/metodologia.md):
// - Votaciones de un tema: las nominales del período sobre un proyecto de ley (las de lib/votaciones.js)
//   cuyo proyecto tiene ese tema en la clasificación propia (lib/temas.js, #36). Una votación con dos
//   temas cuenta en los dos.
// - Reparto: los votos individuales de la lista oficial de cada votación (votos.csv), sumados por grupo
//   en todas las votaciones del tema, en las categorías oficiales sin fusionar (SI, NO,
//   ABSTENCIÓN/BLANCO, mociones, NO VOTA, AUSENTE). Denominador: todos los votos registrados del grupo
//   en esas votaciones, incluidos AUSENTE y NO VOTA. Sin cifra única de apoyo.
// - Cada votación es de una sola cámara, así que todo va por cámara y nunca se suman senadores y
//   diputados. Partido = partido unificado (#42), que dentro de una cámara tiene un solo texto oficial;
//   bancada = texto oficial, dentro de su cámara. Quedan fuera los votos sin partido o sin bancada
//   registrados en el grupo que corresponda.
// - Partido y bancada: los que la API registra para el período, no por fecha.
// - Sin umbral: el reparto se muestra siempre, con la cantidad de votaciones del tema en esa cámara.
// - Cada tema lista sus votaciones por cámara, con su etapa, de la más reciente a la más antigua.

import { barra, claseDeCategoria, indice, ordenarCategorias, posicionCamara, proporcion, valor } from "./ficha.js";
import { nombreConocido, partidoUnificado, siglaDe } from "./partidos.js";
import * as rutas from "./rutas.js";
import { PENDIENTE, TEXTO_PENDIENTE, temas } from "./temas.js";
import { votacionesDelPeriodo } from "./votaciones.js";

const porTexto = (a, b) => a.localeCompare(b, "es");

/**
 * Reparto de votos por grupo. `votos` son { grupo, texto, sentido } (grupo = identificador, texto = el
 * texto oficial que se muestra); `categorias`, las columnas. Por grupo: votos registrados, una
 * proporción por categoría y la barra. De más a menos votos registrados y, a igualdad, por texto. Quedan
 * fuera los votos sin grupo.
 */
export function repartoPorGrupo(votos, categorias) {
  const grupos = new Map();
  for (const x of votos) {
    if (!x.grupo) continue;
    if (!grupos.has(x.grupo)) grupos.set(x.grupo, { id: x.grupo, texto: x.texto, sentidos: [] });
    grupos.get(x.grupo).sentidos.push(x.sentido);
  }
  return [...grupos.values()]
    .map((g) => {
      const celdas = categorias.map((c) => proporcion(g.sentidos.filter((s) => s === c).length, g.sentidos.length));
      return { id: g.id, texto: g.texto, votos: g.sentidos.length, celdas, barra: barra(categorias, celdas) };
    })
    .sort((a, b) => b.votos - a.votos || porTexto(a.texto, b.texto));
}

/** Una cámara de un tema: sus votaciones, las categorías (columnas y leyenda) y el reparto por partido y por bancada. */
function camaraDelTema(camara, votaciones, i) {
  const votos = votaciones.flatMap((v) =>
    (i.votos.get(v.id) ?? []).map((x) => {
      const l = i.legisladores.get(Number(x.idLegislador)) ?? {};
      return { partido: valor(l.partidoPolitico), bancada: valor(l.bancada), sentido: x.sentidoVotacion };
    }),
  );
  const categorias = ordenarCategorias(votos.map((x) => x.sentido));
  const partidos = repartoPorGrupo(
    votos.map((x) => ({ grupo: x.partido && partidoUnificado(x.partido).id, texto: x.partido, sentido: x.sentido })),
    categorias,
  ).map((f) => ({ ...f, sigla: siglaDe(f.texto), nombreConocido: nombreConocido(f.texto) }));
  const bancadas = repartoPorGrupo(
    votos.map((x) => ({ grupo: x.bancada, texto: x.bancada, sentido: x.sentido })),
    categorias,
  );
  return {
    camara,
    votaciones: votaciones.map((v) => ({
      id: v.id,
      fecha: v.fecha,
      etapa: v.etapa,
      resultado: v.resultado,
      proyecto: v.proyecto,
      leyes: v.leyes,
      url: v.url,
      pagina: v.pagina,
    })),
    votos: votos.length,
    categorias,
    // Leyenda de colores: las categorías con algún voto.
    leyenda: categorias.filter((c) => votos.some((x) => x.sentido === c)).map((c) => ({ categoria: c, clase: claseDeCategoria(c) })),
    partidos,
    bancadas,
  };
}

const porPeriodo = new Map();

/**
 * Un tema por cada uno de temas.json (y «pendiente de clasificación» si tiene votaciones), en ese orden:
 * { id, nombre, nombreCorto, definicion, url, total, camaras }. `camaras`, primero la de Senadores, solo
 * las que tienen votaciones del tema. `total` es la cantidad de votaciones del tema.
 */
export function votosPorTema(periodo) {
  if (porPeriodo.has(periodo)) return porPeriodo.get(periodo);
  const i = indice(periodo);
  const { votaciones } = votacionesDelPeriodo(periodo);
  const lista = [...temas(), { id: PENDIENTE, nombre: TEXTO_PENDIENTE, nombreCorto: TEXTO_PENDIENTE, definicion: null }]
    .map((t) => {
      const delTema = votaciones.filter((v) => v.temas.filtro.includes(t.id));
      const camaras = [...new Set(delTema.map((v) => v.camara))]
        .sort((a, b) => posicionCamara(a) - posicionCamara(b) || porTexto(a ?? "", b ?? ""))
        .map((c) => camaraDelTema(c, delTema.filter((v) => v.camara === c), i));
      return { id: t.id, nombre: t.nombre, nombreCorto: t.nombreCorto, definicion: t.definicion, url: rutas.votosPorTema(t.id), total: delTema.length, camaras };
    })
    .filter((t) => t.id !== PENDIENTE || t.total > 0);
  porPeriodo.set(periodo, lista);
  return lista;
}

/** Columnas de la tabla descargable, en orden. */
export const COLUMNAS_VOTOS_POR_TEMA = [
  "periodo",
  "tema",
  "camara",
  "votaciones",
  "tipoGrupo",
  "grupo",
  "textoOficial",
  "votosRegistrados",
  "categoria",
  "votos",
];

/**
 * Tabla descargable: una fila por tema, cámara, grupo y categoría oficial con votos. grupo es el partido
 * unificado o el texto oficial de la bancada. Cálculo propio, no oficial.
 */
export function tablaVotosPorTema(periodo) {
  const filas = [];
  for (const t of votosPorTema(periodo)) {
    for (const c of t.camaras) {
      for (const [tipoGrupo, grupos] of [["partido", c.partidos], ["bancada", c.bancadas]]) {
        for (const g of grupos) {
          c.categorias.forEach((categoria, n) => {
            if (!g.celdas[n].cantidad) return;
            filas.push({
              periodo,
              tema: t.id,
              camara: c.camara,
              votaciones: c.votaciones.length,
              tipoGrupo,
              grupo: g.id,
              textoOficial: g.texto,
              votosRegistrados: g.votos,
              categoria,
              votos: g.celdas[n].cantidad,
            });
          });
        }
      }
    }
  }
  return filas;
}
