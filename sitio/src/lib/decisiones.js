// Decisiones del plenario sobre proyectos de ley sin votación nominal publicada. Sin HTML.
//
// Criterios (ver docs/metodologia.md):
// - Un trámite de discusión en el plenario con un resultado oficial que decide sobre el proyecto, el mismo
//   criterio de los avisos de Telegram: fuera POSTERGADO y los envíos a comisión.
// - Fuentes: tramitaciones.json y decisiones-plenario.json, sin repetir trámites. Solo proyectos de ley, con
//   fecha dentro del período.
// - Sin votación nominal: el trámite no figura en votaciones.json. No hay votos individuales, así que no hay
//   hemiciclo, posición de partidos ni coincidencia. Solo los textos oficiales.
// - No es la lista de todo lo decidido: solo incluye los proyectos cuyo detalle guarda esta copia de los datos.

import { valor } from "./ficha.js";
import { fuente, periodos } from "./datos.js";
import { slug } from "./texto.js";
import { leyes } from "./catalogo.js";

const PROYECTO_DE_LEY = "PROYECTO DE LEY";
const SUB_ETAPA_PLENARIO = "DISCUSIÓN PLENARIO";

/** Si el trámite decide sobre el proyecto (el mismo criterio de importador/transformar.py). */
export function esDecision(t) {
  const resultado = (t.resultadoTramite ?? "").trim().toUpperCase();
  return (t.descripcionSubEtapa ?? "").toUpperCase().startsWith(SUB_ETAPA_PLENARIO) && Boolean(resultado) && resultado !== "POSTERGADO" && !resultado.startsWith("SE ENVÍA A COMISIÓN");
}

const porPeriodo = new Map();

/** Decisiones de un período, de la más reciente a la más antigua. */
export function decisionesSinNominal(periodo) {
  if (porPeriodo.has(periodo)) return porPeriodo.get(periodo);
  const { fechaInicio, fechaFin } = periodos().find((p) => p.id === periodo);
  const votaciones = fuente(periodo, "votaciones.json");
  const documento = fuente(periodo, "decisiones-plenario.json");
  const nominales = new Set(votaciones.map((v) => v.tramitacion?.idTramitacion));

  // Título y número de expediente de cada proyecto de ley, de donde estén publicados.
  const proyectos = new Map();
  const anotar = (p, id = p?.idProyecto) => {
    if (id && !proyectos.has(id) && valor(p.acapite)) proyectos.set(id, { titulo: valor(p.acapite), url: valor(p.appURL), expediente: valor(p.expedienteCamara) });
  };
  for (const l of fuente(periodo, "leyes.json")) anotar(l.proyecto);
  for (const v of votaciones) if (v.proyecto?.tipoProyecto === PROYECTO_DE_LEY) anotar(v.proyecto);
  for (const e of fuente(periodo, "expedientes.json")) if (e.tipoProyecto === PROYECTO_DE_LEY) anotar(e);
  for (const d of documento.decisiones) anotar(d);

  // Ley sancionada de cada proyecto, para enlazar a su ficha.
  const leyDe = new Map();
  for (const l of leyes()) for (const r of l.registros) if (r.periodo === periodo) leyDe.set(r.idProyecto, l);

  const tramites = new Map();
  for (const x of [...fuente(periodo, "tramitaciones.json"), ...documento.decisiones]) {
    const t = x.tramitacion;
    const fecha = t._propio?.fechaTramite;
    if (!fecha || fecha < fechaInicio || fecha > fechaFin) continue;
    if (!esDecision(t) || nominales.has(t.idTramitacion) || !proyectos.has(x.idProyecto)) continue;
    tramites.set(t.idTramitacion, { ...x, tramitacion: t });
  }
  const lista = [...tramites.values()]
    .map(({ idProyecto, tramitacion: t }) => {
      const p = proyectos.get(idProyecto);
      const ley = leyDe.get(idProyecto);
      const camara = valor(t.camaraTramite);
      const resultado = valor(t.resultadoTramite);
      return {
        id: t.idTramitacion,
        idProyecto,
        fecha: valor(t.fechaTramite),
        fechaIso: t._propio.fechaTramite,
        anio: t._propio.fechaTramite.slice(0, 4),
        camara,
        camaraFiltro: camara ? slug(camara) : "",
        etapa: valor(t.descripcionEtapa),
        resultado,
        resultadoFiltro: slug(resultado),
        titulo: p.titulo,
        expediente: p.expediente,
        url: p.url,
        ley: ley ? { numero: ley.numero, url: ley.url } : null,
        sesion: valor(t.idSesion?.appURL),
      };
    })
    .sort((a, b) => b.fechaIso.localeCompare(a.fechaIso) || b.id - a.id);
  porPeriodo.set(periodo, lista);
  return lista;
}

/** Las decisiones sin votación nominal de un proyecto. */
export const decisionesDeProyecto = (periodo, idProyecto) => decisionesSinNominal(periodo).filter((d) => d.idProyecto === idProyecto);
