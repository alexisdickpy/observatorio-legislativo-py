// Listado general de proyectos de ley del período, con o sin votación nominal. Sin HTML.
//
// Criterios (ver docs/metodologia.md):
// - Base: proyectos.json, todos los ingresados en el período según el listado general de la API. Se les suman
//   los proyectos de otras fuentes, como los ingresados antes del período y votados o sancionados en él.
// - Título, estado y expediente son los oficiales. El título se recorta en la lista por el peso de la página;
//   el completo está en el expediente en SILpy.

import { leyes } from "./catalogo.js";
import { existeEnDatos, fuente } from "./datos.js";
import { decisionesSinNominal } from "./decisiones.js";
import { valor } from "./ficha.js";
import * as rutas from "./rutas.js";
import { recortar, slug } from "./texto.js";

const PROYECTO_DE_LEY = "PROYECTO DE LEY";
/** Largo máximo del título en la lista. */
const LARGO_TITULO = 180;
const SIN_DATO = "sin-dato";

const porPeriodo = new Map();

/** Proyectos de ley de un período, del ingreso más reciente al más antiguo. */
export function proyectosDeLey(periodo) {
  if (porPeriodo.has(periodo)) return porPeriodo.get(periodo);
  const votaciones = fuente(periodo, "votaciones.json").filter((v) => v.proyecto?.tipoProyecto === PROYECTO_DE_LEY);
  const registros = new Map();
  const anotar = (p, id = p?.idProyecto) => {
    if (!id || !valor(p?.acapite)) return;
    const r = registros.get(id) ?? {};
    registros.set(id, {
      id,
      titulo: r.titulo ?? valor(p.acapite),
      url: r.url ?? valor(p.appURL),
      expediente: r.expediente ?? valor(p.expedienteCamara),
      estado: r.estado ?? valor(p.estadoProyecto),
      ingreso: r.ingreso ?? p._propio?.fechaIngreso ?? p._propio?.fechaIngresoExpediente ?? null,
    });
  };
  if (existeEnDatos(`fuente/${periodo}/proyectos.json`)) for (const p of fuente(periodo, "proyectos.json")) anotar(p);
  for (const l of fuente(periodo, "leyes.json")) anotar(l.proyecto);
  for (const v of votaciones) anotar(v.proyecto);
  for (const e of fuente(periodo, "expedientes.json")) if (e.tipoProyecto === PROYECTO_DE_LEY) anotar(e);
  for (const p of fuente(periodo, "proyectos-recientes.json")) anotar(p);
  for (const d of fuente(periodo, "decisiones-plenario.json").decisiones) anotar(d);

  const nominales = new Map();
  for (const v of votaciones) {
    const id = v.proyecto.idProyecto;
    if (!nominales.has(id)) nominales.set(id, []);
    nominales.get(id).push(v.idVotacion);
  }
  const decisiones = new Map();
  for (const d of decisionesSinNominal(periodo)) {
    if (!decisiones.has(d.idProyecto)) decisiones.set(d.idProyecto, d);
  }
  const leyDe = new Map();
  for (const l of leyes()) for (const r of l.registros) if (r.periodo === periodo) leyDe.set(r.idProyecto, l);

  const lista = [...registros.values()]
    .map((r) => {
      const ids = nominales.get(r.id) ?? [];
      const ley = leyDe.get(r.id);
      const decision = decisiones.get(r.id);
      return {
        ...r,
        titulo: recortar(r.titulo, LARGO_TITULO),
        anio: (r.ingreso ?? "").slice(0, 4) || null,
        estadoFiltro: r.estado ? slug(r.estado) : SIN_DATO,
        votaciones: ids.length,
        // La más reciente de sus votaciones nominales: el identificador crece con el tiempo.
        votacion: ids.length ? rutas.votacion(Math.max(...ids)) : null,
        ley: ley ? { numero: ley.numero, url: ley.url } : null,
        decision: decision ? { fecha: decision.fecha, resultado: decision.resultado, camara: decision.camara } : null,
      };
    })
    .sort((a, b) => (b.ingreso ?? "").localeCompare(a.ingreso ?? "") || b.id - a.id);
  porPeriodo.set(periodo, lista);
  return lista;
}
