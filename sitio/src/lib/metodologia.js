// Prepara la lista pública de observaciones sobre los datos oficiales para la página de
// metodología, a partir de datos/propios/notas.json. Sin HTML.
//
// Criterios (alcance acordado en #9):
// - Todas las notas, agrupadas por tipo, con enlace a la ley o votación en el sitio y a la fuente
//   oficial. El detalle es el que escribe el importador; las explicaciones de cada tipo son del sitio.
// - Las explicaciones no interpretan la causa cuando la fuente no la informa.

import { notas } from "./datos.js";
import { indice, nombreDe, valor } from "./ficha.js";
import * as rutas from "./rutas.js";

/** Tipos de nota en el orden en que se muestran, con su título y explicación. */
const TIPOS = [
  [
    "menos_votos_que_miembros",
    "Votaciones con menos votos individuales que miembros de la cámara",
    "La lista de votos tiene menos nombres que miembros con voto de la cámara (45 en el Senado, 80 en Diputados). Puede haber varias causas. La fuente no indica la causa y este sitio no la interpreta.",
  ],
  [
    "totales_no_coinciden",
    "Votaciones cuyos totales publicados no coinciden con los votos individuales",
    "Al contar los votos individuales por categoría, el resultado no coincide con el total que publica el Congreso para esa categoría. El sitio muestra el total oficial.",
  ],
  [
    "legislador_repetido_en_votacion",
    "Legisladores que figuran más de una vez en la misma votación",
    "La lista oficial de votos incluye al mismo legislador más de una vez.",
  ],
  ["voto_sin_legislador", "Votos sin legislador", "Un voto individual no identifica al legislador que lo emitió."],
  [
    "legislador_solo_en_votaciones",
    "Legisladores que solo aparecen en votaciones",
    "Votan en el período pero no figuran en los listados de legisladores de la API. El sitio los incluye con los datos que trae el voto.",
  ],
  [
    "enlace_no_resuelto",
    "Votaciones que no se pudieron enlazar con su ley",
    "La votación es del mismo proyecto que la ley, pero su trámite no figura entre las tramitaciones publicadas. El sitio no adivina el enlace.",
  ],
  ["fecha_mal_formada", "Fechas no válidas", "La fecha publicada no es una fecha válida. Se muestra tal como viene."],
  ["proyecto_sin_tramitaciones", "Proyectos sin tramitaciones", "La API no devuelve las tramitaciones del proyecto de la ley."],
  [
    "proyecto_sin_autores",
    "Proyectos de ley sin autores publicados",
    "El proyecto es de iniciativa parlamentaria y tiene votaciones en el período, pero la API no publica sus autores. La página de votaciones no muestra «Presentado por».",
  ],
  ["proyecto_sin_adjuntos", "Proyectos sin documentos adjuntos", "La API no devuelve los documentos adjuntos del proyecto de la ley, como el texto de la ley."],
  [
    "numero_ley_repetido_en_otro_periodo",
    "Números de ley repetidos en otra legislatura",
    "El número de una ley del período también figura en otra legislatura.",
  ],
  [
    "numero_ley_ausente_en_historico",
    "Números de ley que no figuran en el listado histórico",
    "Un número de ley del período no figura en el listado histórico de leyes de la API.",
  ],
  [
    "ley_del_periodo_fuera_de_listado",
    "Leyes del período que no figuran en su listado",
    "Según el listado histórico, la ley se sancionó dentro del período, pero no figura en el listado del período.",
  ],
];

const posicion = (tipo) => {
  const n = TIPOS.findIndex(([t]) => t === tipo);
  return n === -1 ? TIPOS.length : n;
};

/**
 * Registro afectado por una nota: { titulo, sitio, fueraDelSitio, oficial }. sitio y oficial son
 * enlaces { url, texto } o null. fueraDelSitio: la votación es de un proyecto que no es ley
 * sancionada del período, así que el sitio no la muestra.
 */
function registro({ entidad, id, periodoLegislativo }) {
  const i = indice(periodoLegislativo);
  const sinRegistro = { titulo: `Registro ${id}`, sitio: null, fueraDelSitio: false, oficial: null };
  if (entidad === "votacion") {
    const oficial = { url: rutas.votacionSilpy(id), texto: "Votación en SILpy" };
    const v = i.votaciones.get(id);
    if (!v) return { ...sinRegistro, titulo: `Votación ${id}`, oficial };
    const t = v.tramitacion ?? {};
    const ley = i.leyes.get((v._propio?.idLeyes ?? [])[0]);
    return {
      titulo: `Votación del ${valor(t.fechaTramite) ?? "(sin fecha)"} · ${valor(t.camaraTramite) ?? "(sin cámara)"}`,
      sitio: ley ? { url: rutas.votacionEnLey(ley._propio.numeroLey, id), texto: `En la ficha de la Ley ${ley._propio.numeroLey}` } : null,
      fueraDelSitio: !ley,
      oficial: { ...oficial, url: valor(v.appURL) ?? oficial.url },
    };
  }
  if (entidad === "ley") {
    const r = i.leyes.get(id);
    if (!r) return sinRegistro;
    const url = valor(r.appURL) ?? valor(r.proyecto?.appURL);
    return {
      titulo: `Ley ${r._propio.numeroLey}`,
      sitio: { url: rutas.ley(r._propio.numeroLey), texto: "Ficha de la ley" },
      fueraDelSitio: false,
      oficial: url ? { url, texto: "Ley en SILpy" } : null,
    };
  }
  if (entidad === "proyecto") {
    // Los datos del proyecto se toman de sus votaciones.
    const p = [...i.votaciones.values()].find((v) => v.proyecto?.idProyecto === id)?.proyecto;
    if (!p) return { ...sinRegistro, titulo: `Proyecto ${id}` };
    return {
      titulo: `Proyecto ${valor(p.expedienteCamara) ?? id}`,
      sitio: null,
      fueraDelSitio: false,
      oficial: valor(p.appURL) ? { url: p.appURL, texto: "Expediente en SILpy" } : null,
    };
  }
  if (entidad === "legislador") {
    const l = i.legisladores.get(id);
    if (!l) return sinRegistro;
    return {
      titulo: nombreDe(l) ?? `Legislador ${id}`,
      sitio: l._propio?.slug ? { url: rutas.legislador(l._propio.slug), texto: "Ficha del legislador" } : null,
      fueraDelSitio: false,
      oficial: valor(l.appURL) ? { url: l.appURL, texto: "Ficha en SILpy" } : null,
    };
  }
  return sinRegistro;
}

/** Observaciones sobre los datos, agrupadas por tipo: { total, grupos: [{ tipo, ancla, titulo, explicacion, casos }] }. */
export function observacionesDeLosDatos() {
  const grupos = new Map();
  for (const n of notas()) {
    if (!grupos.has(n.tipo)) grupos.set(n.tipo, []);
    grupos.get(n.tipo).push({ id: n.id, detalle: n.detalle, manual: n.origen === "manual", ...registro(n) });
  }
  const lista = [...grupos.entries()]
    .sort(([a], [b]) => posicion(a) - posicion(b) || a.localeCompare(b))
    .map(([tipo, casos]) => {
      const [, titulo, explicacion] = TIPOS[posicion(tipo)] ?? [tipo, tipo, null];
      return {
        tipo,
        ancla: `observacion-${tipo.replaceAll("_", "-")}`,
        titulo,
        explicacion,
        casos: casos.sort((a, b) => a.id - b.id),
      };
    });
  return { total: notas().length, grupos: lista };
}
