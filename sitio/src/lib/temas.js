// Clasificación temática propia de los proyectos de ley (#36). Sin HTML.
//
// Criterios (ver docs/metodologia.md):
// - Los temas y su definición están en datos/propios/temas.json; los de cada proyecto, en
//   datos/propios/clasificacion-temas.json (importador/temas.py). Es un dato propio, nunca oficial.
// - Una ley o una votación toma los temas de su proyecto. Una ley con más de un registro toma los
//   temas de todos sus proyectos, en el orden de temas.json.
// - Sin ningún tema, figura como pendiente de clasificación (valor de filtro PENDIENTE).

import { leerJson } from "./datos.js";
import * as rutas from "./rutas.js";

/** Valor de filtro de las leyes y votaciones pendientes de clasificación. */
export const PENDIENTE = "pendiente";
export const TEXTO_PENDIENTE = "Pendiente de clasificación";

let temasCache;
/** Temas en el orden de temas.json: { id, nombre, nombreCorto (etiquetas), definicion, url (catálogo filtrado) }. */
export function temas() {
  temasCache ??= leerJson("propios/temas.json").temas.map((t) => ({
    id: t.id,
    nombre: t.nombre,
    nombreCorto: t.nombreCorto ?? t.nombre,
    definicion: t.definicion,
    url: rutas.leyesPorTema(t.id),
  }));
  return temasCache;
}

let clasificacion;
function entrada(periodo, idProyecto) {
  clasificacion ??= new Map(
    leerJson("propios/clasificacion-temas.json").proyectos.map((e) => [`${e.periodoLegislativo}:${e.idProyecto}`, e]),
  );
  return clasificacion.get(`${periodo}:${idProyecto}`) ?? null;
}

/**
 * Temas de uno o más proyectos ([{ periodo, idProyecto }]), sin repetir y en el orden de temas.json, y sus
 * valores de filtro (los identificadores, o PENDIENTE si no tiene ninguno).
 */
export function temasDeProyectos(proyectos) {
  const entradas = proyectos.map((p) => entrada(p.periodo, p.idProyecto));
  const faltan = proyectos.filter((p, i) => !entradas[i]).map((p) => `${p.idProyecto} (${p.periodo})`);
  // La compilación falla si un proyecto no tiene tema ni figura como pendiente (python -m importador.temas lo agrega).
  if (faltan.length) throw new Error(`Proyectos sin clasificación temática en datos/propios/clasificacion-temas.json: ${faltan.join(", ")}`);
  const ids = new Set(entradas.flatMap((e) => (e?.temas ?? []).map((t) => t.tema)));
  const lista = temas().filter((t) => ids.has(t.id));
  return {
    temas: lista,
    pendiente: lista.length === 0,
    filtro: lista.length ? lista.map((t) => t.id) : [PENDIENTE],
  };
}
