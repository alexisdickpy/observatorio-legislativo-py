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
import { textos, fill } from "./contenido.js";
const tx = textos.metodologia.observaciones;
const txc = textos.general.comunes;

/** Tipos de nota en el orden en que se muestran, con su título y explicación. */
const TIPOS = [
  [
    "menos_votos_que_miembros",
    tx.votacionesConMenosVotosIndividuales,
    tx.laListaDeVotosTiene,
  ],
  [
    "totales_no_coinciden",
    tx.votacionesCuyosTotalesPublicadosNo,
    tx.alContarLosVotosIndividuales,
  ],
  [
    "legislador_repetido_en_votacion",
    tx.legisladoresQueFiguranMasDe,
    tx.laListaOficialDeVotos,
  ],
  ["voto_sin_legislador", tx.votosSinLegislador, tx.unVotoIndividualNoIdentifica],
  [
    "legislador_solo_en_votaciones",
    tx.legisladoresQueSoloAparecenEn,
    tx.votanEnElPeriodoPero,
  ],
  [
    "enlace_no_resuelto",
    tx.votacionesQueNoSePudieron,
    tx.laVotacionEsDelMismo,
  ],
  ["fecha_mal_formada", tx.fechasNoValidas, tx.laFechaPublicadaNoEs],
  ["proyecto_sin_tramitaciones", tx.proyectosSinTramitaciones, tx.laApiNoDevuelveLas],
  [
    "proyecto_sin_autores",
    tx.proyectosDeLeySinAutores,
    tx.elProyectoEsDeIniciativa,
  ],
  ["proyecto_sin_adjuntos", tx.proyectosSinDocumentosAdjuntos, tx.laApiNoDevuelveLos],
  [
    "numero_ley_repetido_en_otro_periodo",
    tx.numerosDeLeyRepetidosEn,
    tx.elNumeroDeUnaLey,
  ],
  [
    "numero_ley_ausente_en_historico",
    tx.numerosDeLeyQueNo,
    tx.unNumeroDeLeyDel,
  ],
  [
    "ley_del_periodo_fuera_de_listado",
    tx.leyesDelPeriodoQueNo,
    tx.segunElListadoHistoricoLa,
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
  const sinRegistro = { titulo: fill(tx.registro, { id: id }), sitio: null, fueraDelSitio: false, oficial: null };
  if (entidad === "votacion") {
    const oficial = { url: rutas.votacionSilpy(id), texto: txc.votacionEnSilpy };
    const v = i.votaciones.get(id);
    if (!v) return { ...sinRegistro, titulo: fill(tx.votacion, { id: id }), oficial };
    const t = v.tramitacion ?? {};
    const ley = i.leyes.get((v._propio?.idLeyes ?? [])[0]);
    return {
      titulo: fill(tx.votacionDelFecha, { fecha: valor(t.fechaTramite) ?? tx.sinFecha, camara: valor(t.camaraTramite) ?? tx.sinCamara }),
      sitio: ley ? { url: rutas.votacionEnLey(ley._propio.numeroLey, id), texto: fill(tx.enLaFichaDeLa, { numeroLey: ley._propio.numeroLey }) } : null,
      fueraDelSitio: !ley,
      oficial: { ...oficial, url: valor(v.appURL) ?? oficial.url },
    };
  }
  if (entidad === "ley") {
    const r = i.leyes.get(id);
    if (!r) return sinRegistro;
    const url = valor(r.appURL) ?? valor(r.proyecto?.appURL);
    return {
      titulo: fill(tx.ley, { numeroLey: r._propio.numeroLey }),
      sitio: { url: rutas.ley(r._propio.numeroLey), texto: tx.fichaDeLaLey },
      fueraDelSitio: false,
      oficial: url ? { url, texto: tx.leyEnSilpy } : null,
    };
  }
  if (entidad === "proyecto") {
    // Los datos del proyecto se toman de sus votaciones.
    const p = [...i.votaciones.values()].find((v) => v.proyecto?.idProyecto === id)?.proyecto;
    if (!p) return { ...sinRegistro, titulo: fill(tx.proyecto, { id: id }) };
    return {
      titulo: fill(tx.proyecto, { id: valor(p.expedienteCamara) ?? id }),
      sitio: null,
      fueraDelSitio: false,
      oficial: valor(p.appURL) ? { url: p.appURL, texto: tx.expedienteEnSilpy } : null,
    };
  }
  if (entidad === "legislador") {
    const l = i.legisladores.get(id);
    if (!l) return sinRegistro;
    return {
      titulo: nombreDe(l) ?? fill(tx.legislador, { id: id }),
      sitio: l._propio?.slug ? { url: rutas.legislador(l._propio.slug), texto: tx.fichaDelLegislador } : null,
      fueraDelSitio: false,
      oficial: valor(l.appURL) ? { url: l.appURL, texto: tx.fichaEnSilpy } : null,
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
