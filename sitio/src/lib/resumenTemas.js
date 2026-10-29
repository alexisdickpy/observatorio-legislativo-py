// Cuadro de leyes por tema (#36) de la portada y del catálogo. Sin HTML.
//
// Criterios (ver docs/metodologia.md):
// - Leyes: las del catálogo (un número de ley cuenta una vez) con ese tema (lib/temas.js).
// - Proyectos votados sin ley: los proyectos de ley con votación nominal en el período que no son el
//   proyecto de ninguna ley del catálogo, por su estado oficial (estadoProyecto de su votación más
//   reciente): archivados, en trámite y los demás estados.
// - Una ley o un proyecto con dos temas cuenta en los dos. Orden de más a menos leyes; a igual cantidad,
//   el de temas.json. «Pendiente de clasificación» solo aparece si tiene alguno.

import { leyes } from "./catalogo.js";
import { indice, valor } from "./ficha.js";
import { esDeProyectoDeLey } from "./legisladores.js";
import * as rutas from "./rutas.js";
import { PENDIENTE, TEXTO_PENDIENTE, temas, temasDeProyectos } from "./temas.js";

const ARCHIVADO = "ARCHIVADO";
const EN_TRAMITE = "EN TRAMITE";

/** Proyectos de ley votados en el período sin ley en el catálogo: { idProyecto: estado oficial más reciente }. */
function proyectosSinLey(periodo) {
  const conLey = new Set(leyes().flatMap((l) => l.registros.filter((r) => r.periodo === periodo).map((r) => r.idProyecto)));
  const estados = new Map();
  const votaciones = [...indice(periodo).votaciones.values()].filter(esDeProyectoDeLey).sort((a, b) => a.idVotacion - b.idVotacion);
  for (const v of votaciones) {
    const id = v.proyecto?.idProyecto;
    if (id !== undefined && id !== null && !conLey.has(id)) estados.set(id, valor(v.proyecto?.estadoProyecto));
  }
  return estados;
}

/**
 * Un cuadro por tema: { id, nombre, url, leyes, archivados, enTramite, otros }. Las cifras son de las
 * leyes del catálogo (todos los períodos) y de los proyectos votados sin ley del período.
 */
export function resumenPorTema(periodo) {
  const sinLey = [...proyectosSinLey(periodo)].map(([idProyecto, estado]) => ({
    estado,
    temas: temasDeProyectos([{ periodo, idProyecto }]).filtro,
  }));
  const todos = [...temas(), { id: PENDIENTE, nombre: TEXTO_PENDIENTE, url: rutas.leyesPorTema(PENDIENTE) }];
  return todos
    .map((t, orden) => {
      const proyectos = sinLey.filter((p) => p.temas.includes(t.id));
      const archivados = proyectos.filter((p) => p.estado === ARCHIVADO).length;
      const enTramite = proyectos.filter((p) => p.estado === EN_TRAMITE).length;
      return {
        ...t,
        orden,
        leyes: leyes().filter((l) => l.filtro.temas.includes(t.id)).length,
        archivados,
        enTramite,
        otros: proyectos.length - archivados - enTramite,
      };
    })
    .filter((t) => t.id !== PENDIENTE || t.leyes + t.archivados + t.enTramite + t.otros > 0)
    .sort((a, b) => b.leyes - a.leyes || a.orden - b.orden);
}
