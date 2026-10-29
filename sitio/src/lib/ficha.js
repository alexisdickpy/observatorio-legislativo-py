// Prepara el detalle de cada registro de ley para su ficha: iniciativa, autores y votaciones
// nominales. Sin HTML.
//
// Criterios (ver docs/decisiones/0001-arquitectura.md y el alcance acordado en #7):
// - Todos los textos que se muestran son los oficiales, sin cambios. Los valores vacíos de la
//   fuente se devuelven como null para que la página diga "Sin dato".
// - Votaciones: las enlazadas en _propio.idVotaciones. Se agrupan por cámara (primero la Cámara de
//   Senadores, la cámara alta) y, dentro de cada cámara, van de la más reciente a la más antigua.
// - Categorías de voto oficiales, sin fusionar. Los totales son los que publica el Congreso; las
//   categorías sin total publicado (MOCIÓN 1, 2…) se cuentan desde los votos individuales y se
//   señalan como recuento propio.
// - Partido y bancada de cada votante: los de legisladores.json, que la API da por período.
// - Nombre conocido de un partido (datos/propios/partidos.json): se agrega aparte, para mostrarlo
//   entre paréntesis y señalado como propio. El nombre oficial no cambia.
// - Porcentajes sobre todos los legisladores del grupo registrados en la votación (incluidos
//   AUSENTE y NO VOTA), con el denominador escrito.
// - Posición de cada partido (alcance acordado en #44): la categoría con más votos entre los votos
//   emitidos de sus miembros (mayoriaDe, el mismo criterio de la coincidencia de votos), con la sigla
//   propia de datos/propios/partidos.json. La ficha la agrupa por sentido, junto a los totales.

import { fuente, notas } from "./datos.js";
import { mayoriaDe } from "./mayoria.js";
import { nombreConocido, siglaDe } from "./partidos.js";
import * as rutas from "./rutas.js";
import { recortar, slug } from "./texto.js";

/** Categorías con total publicado por el Congreso, en el orden en que se muestran. */
const TOTALES_OFICIALES = [
  ["SI", "totalSI"],
  ["NO", "totalNO"],
  ["ABSTENCIÓN/BLANCO", "totalAbstencion"],
  ["NO VOTA", "totalNoVota"],
  ["AUSENTE", "totalAusente"],
];
const CATEGORIAS_FINALES = ["NO VOTA", "AUSENTE"];

export const valor = (v) => (v === undefined || v === null || String(v).trim() === "" ? null : v);
const porNombre = (a, b) => a.localeCompare(b, "es");

const formatoPorcentaje = new Intl.NumberFormat("es-PY", { style: "percent", maximumFractionDigits: 1 });
const formatoNumero = new Intl.NumberFormat("es-PY");

/** "12 de 30 (40 %)". El denominador siempre se escribe. */
export function proporcion(cantidad, total) {
  const porcentaje = total ? cantidad / total : 0;
  const fraccion = `${formatoNumero.format(cantidad)} de ${formatoNumero.format(total)}`;
  const porcentajeTexto = formatoPorcentaje.format(porcentaje);
  return { cantidad, total, porcentaje, fraccion, porcentajeTexto, texto: `${fraccion} (${porcentajeTexto})` };
}

/** Orden de las columnas: SI, NO, ABSTENCIÓN/BLANCO, las demás presentes (MOCIÓN…), NO VOTA, AUSENTE. */
export function ordenarCategorias(categorias) {
  const fijas = TOTALES_OFICIALES.map(([c]) => c).filter((c) => !CATEGORIAS_FINALES.includes(c));
  const otras = [...new Set(categorias)]
    .filter((c) => !TOTALES_OFICIALES.some(([o]) => o === c))
    .sort(porNombre);
  return [...fijas, ...otras, ...CATEGORIAS_FINALES];
}

/** Clase de color de una categoría (los colores están en tokens.css: --color-voto-…). */
const CLASES_CONOCIDAS = ["si", "no", "abstencion", "no-vota", "ausente", "mocion-1", "mocion-2", "mocion-3"];
export function claseDeCategoria(categoria) {
  const s = slug(categoria).replace(/^abstencion-blanco$/, "abstencion");
  return `voto-${CLASES_CONOCIDAS.includes(s) ? s : "otro"}`;
}

/**
 * Barra apilada: un segmento por categoría con votos, con su ancho en porcentaje.
 * `celdas` son proporciones en el mismo orden que `categorias`.
 */
export function barra(categorias, celdas) {
  const segmentos = categorias
    .map((categoria, i) => ({ categoria, ...celdas[i] }))
    .filter((c) => c.cantidad > 0)
    .map((c) => ({
      categoria: c.categoria,
      clase: claseDeCategoria(c.categoria),
      ancho: Math.round(c.porcentaje * 10000) / 100,
      texto: `${c.categoria} ${c.texto}`,
    }));
  return { segmentos, etiqueta: segmentos.map((x) => x.texto).join("; ") };
}

// Índices por período, armados una sola vez. También los usa legisladores.js.
const indices = new Map();
export function indice(periodo) {
  if (indices.has(periodo)) return indices.get(periodo);
  const agrupar = (lista, clave) => {
    const m = new Map();
    for (const x of lista) {
      const k = clave(x);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(x);
    }
    return m;
  };
  const notasDelPeriodo = notas().filter((n) => n.periodoLegislativo === periodo);
  const i = {
    leyes: new Map(fuente(periodo, "leyes.json").map((r) => [r.idLey, r])),
    autores: agrupar(fuente(periodo, "autores.json"), (a) => a.idProyecto),
    votaciones: new Map(fuente(periodo, "votaciones.json").map((v) => [v.idVotacion, v])),
    votos: agrupar(fuente(periodo, "votos.csv"), (v) => Number(v.idVotacion)),
    legisladores: new Map(fuente(periodo, "legisladores.json").map((l) => [l.idLegislador, l])),
    notas: agrupar(notasDelPeriodo, (n) => `${n.entidad}:${n.id}`),
  };
  indices.set(periodo, i);
  return i;
}

export { nombreConocido };

export const nombreDe = (l) => [valor(l.nombres), valor(l.apellidos)].filter(Boolean).join(" ") || null;

/** Ficha propia de un legislador del período (con slug), o null. */
const fichaDe = (slug) => (slug ? rutas.legislador(slug) : null);

function prepararAutor(a, periodo) {
  const l = a.legislador ?? {};
  const delPeriodo = a._propio?.delPeriodo ?? l.periodoLegislativo === periodo;
  return {
    nombre: nombreDe(l),
    url: valor(l.appURL),
    ficha: delPeriodo ? fichaDe(a._propio?.slug) : null,
    partido: valor(l.partidoPolitico),
    partidoConocido: nombreConocido(l.partidoPolitico),
    bancada: valor(l.bancada),
    camara: valor(l.camaraParlamentario),
    legislatura: valor(l.periodoLegislativo),
    delPeriodo,
  };
}

/**
 * Totales de una votación: los que publica el Congreso y, para las categorías sin total publicado
 * (MOCIÓN 1, 2…), el recuento propio de los votos individuales. `sentidos` son los votos de la lista
 * oficial; su cantidad es el denominador.
 */
export function totalesDe(v, sentidos) {
  const categorias = ordenarCategorias(sentidos);
  const oficial = new Map(TOTALES_OFICIALES);
  const totales = categorias.map((categoria) => {
    const campo = oficial.get(categoria);
    const cantidad = campo ? v[campo] : sentidos.filter((s) => s === categoria).length;
    return { categoria, ...proporcion(cantidad, sentidos.length), recuentoPropio: !campo };
  });
  return { categorias, totales };
}

/** Clase de las posiciones sin categoría (empate o ningún voto emitido): sin color de voto. */
export const CLASE_SIN_POSICION = "voto-sin-posicion";

/**
 * Posición de cada partido en una votación, a partir de los votos de su lista oficial ({ partido,
 * sentido }, partido = texto oficial). Cada votación es de una sola cámara, donde cada partido unificado
 * tiene un solo texto oficial. Por partido: su sigla, sus miembros en la lista, sus votos emitidos, la
 * posición (la categoría; null si hubo empate en el primer lugar; undefined si ninguno emitió voto) y
 * cuántos votos tuvo esa categoría. De más a menos miembros y, a igualdad, por nombre. Quedan fuera
 * los votantes sin partido registrado.
 */
export function posicionesDePartidos(votos) {
  const grupos = new Map();
  for (const x of votos) {
    const partido = valor(x.partido);
    if (!partido) continue;
    if (!grupos.has(partido)) grupos.set(partido, []);
    grupos.get(partido).push(x.sentido);
  }
  return [...grupos.entries()]
    .map(([partido, sentidos]) => {
      const { mayoria, votantes } = mayoriaDe(sentidos);
      const posicion = votantes > 0 ? mayoria : undefined;
      const conPosicion = Boolean(posicion);
      return {
        partido,
        sigla: siglaDe(partido),
        miembros: sentidos.length,
        votantes,
        posicion,
        cantidad: conPosicion ? sentidos.filter((s) => s === posicion).length : null,
        texto: conPosicion ? posicion : posicion === null ? "empate" : "sin votos emitidos",
        clase: conPosicion ? claseDeCategoria(posicion) : CLASE_SIN_POSICION,
      };
    })
    .sort((a, b) => b.miembros - a.miembros || porNombre(a.partido, b.partido));
}

/**
 * Partidos agrupados por su posición: un grupo por categoría (en el orden de las columnas), después
 * los empates y al final los partidos sin votos emitidos. Solo los grupos con algún partido.
 */
export function porSentido(posiciones) {
  const categorias = ordenarCategorias(posiciones.filter((p) => p.posicion).map((p) => p.posicion));
  return [
    ...categorias.map((c) => ({ titulo: c, clase: claseDeCategoria(c), partidos: posiciones.filter((p) => p.posicion === c) })),
    { titulo: "Empate", clase: CLASE_SIN_POSICION, partidos: posiciones.filter((p) => p.posicion === null) },
    { titulo: "Sin votos emitidos", clase: CLASE_SIN_POSICION, partidos: posiciones.filter((p) => p.posicion === undefined) },
  ].filter((g) => g.partidos.length);
}

/** Desglose de una votación por un campo del legislador (partido o bancada). */
function desglose(votos, campo, categorias) {
  const grupos = new Map();
  for (const v of votos) {
    const nombre = v[campo];
    if (!grupos.has(nombre)) grupos.set(nombre, []);
    grupos.get(nombre).push(v);
  }
  return [...grupos.entries()]
    .map(([nombre, lista]) => {
      const celdas = categorias.map((categoria) =>
        proporcion(lista.filter((v) => v.sentido === categoria).length, lista.length),
      );
      return {
        nombre,
        nombreConocido: campo === "partido" ? nombreConocido(nombre) : null,
        total: lista.length,
        celdas,
        barra: barra(categorias, celdas),
      };
    })
    .sort((a, b) => b.total - a.total || porNombre(a.nombre ?? "", b.nombre ?? ""));
}

function prepararVotacion(v, i) {
  const t = v.tramitacion ?? {};
  const s = t.idSesion ?? {};
  const votos = (i.votos.get(v.idVotacion) ?? [])
    .map((voto) => {
      const l = i.legisladores.get(Number(voto.idLegislador)) ?? {};
      return {
        nombre: nombreDe(l),
        ficha: fichaDe(l._propio?.slug),
        apellidos: valor(l.apellidos) ?? "",
        partido: valor(l.partidoPolitico),
        partidoConocido: nombreConocido(l.partidoPolitico),
        bancada: valor(l.bancada),
        sentido: voto.sentidoVotacion,
        observacion: valor(voto.observacion),
      };
    });
  const { categorias, totales } = totalesDe(v, votos.map((x) => x.sentido));
  const posicion = new Map(categorias.map((c, n) => [c, n]));
  votos.sort(
    (a, b) => posicion.get(a.sentido) - posicion.get(b.sentido) || porNombre(a.apellidos, b.apellidos),
  );
  const recuento = (c) => votos.filter((x) => x.sentido === c).length;
  return {
    id: v.idVotacion,
    ancla: rutas.anclaVotacion(v.idVotacion),
    // Página propia de la votación (#45): todas las de una ficha de ley son sobre un proyecto de ley.
    pagina: rutas.votacion(v.idVotacion),
    url: valor(v.appURL) ?? rutas.votacionSilpy(v.idVotacion),
    fecha: valor(t.fechaTramite),
    fechaIso: t._propio?.fechaTramite ?? null,
    camara: valor(t.camaraTramite),
    etapa: valor(t.descripcionEtapa),
    subetapa: valor(t.descripcionSubEtapa),
    resultado: valor(t.resultadoTramite),
    descripcion: valor(v.descripcion),
    descripcionCorta: valor(v.descripcion) && recortar(v.descripcion, 90),
    observacion: valor(v.observacion),
    sesion: {
      numero: valor(s.numeroSesion),
      tipo: valor(s.tipoSesion),
      fecha: valor(s.fechaSesion),
      url: valor(s.appURL),
    },
    registrados: votos.length,
    categorias,
    leyenda: totales
      .filter((t) => t.cantidad > 0)
      .map((t) => ({ categoria: t.categoria, clase: claseDeCategoria(t.categoria) })),
    totales,
    barraTotal: barra(categorias, totales),
    hayRecuentoPropio: totales.some((x) => x.recuentoPropio),
    totalesCoinciden: v._propio?.totalesCoinciden ?? true,
    recalculados: categorias.map((c) => ({ categoria: c, cantidad: recuento(c) })),
    porPartido: desglose(votos, "partido", categorias),
    posicionesPorSentido: porSentido(posicionesDePartidos(votos)),
    porBancada: desglose(votos, "bancada", categorias),
    votos,
    notas: (i.notas.get(`votacion:${v.idVotacion}`) ?? []).map((n) => n.detalle),
  };
}

/** Detalle de una votación para su página propia (#45), el mismo de la ficha de la ley. */
export function detalleDeVotacion(periodo, idVotacion) {
  const i = indice(periodo);
  return prepararVotacion(i.votaciones.get(idVotacion), i);
}

/** De la más reciente a la más antigua; a igual fecha, la de mayor id primero. */
export const masRecientePrimero = (a, b) =>
  (b.fechaIso ?? "").localeCompare(a.fechaIso ?? "") || b.id - a.id;

/** Orden de las cámaras: primero la cámara alta. Las demás, por nombre. */
const ORDEN_CAMARAS = ["CAMARA DE SENADORES", "CAMARA DE DIPUTADOS"];
export const posicionCamara = (c) => (ORDEN_CAMARAS.includes(c) ? ORDEN_CAMARAS.indexOf(c) : ORDEN_CAMARAS.length);

/** Agrupa por cámara (Senadores, luego Diputados); dentro, de la más reciente a la más antigua. */
export function agruparPorCamara(votaciones) {
  const camaras = new Map();
  for (const v of [...votaciones].sort(masRecientePrimero)) {
    if (!camaras.has(v.camara)) camaras.set(v.camara, []);
    camaras.get(v.camara).push(v);
  }
  return [...camaras.entries()]
    .map(([camara, lista]) => ({ camara, votaciones: lista }))
    .sort((a, b) => posicionCamara(a.camara) - posicionCamara(b.camara) || porNombre(a.camara ?? "", b.camara ?? ""));
}

/** Detalle de un registro de ley ya preparado por catalogo.js ({ periodo, idLey }). */
export function detalleDeRegistro({ periodo, idLey }) {
  const i = indice(periodo);
  const r = i.leyes.get(idLey);
  const p = r.proyecto ?? {};
  const propio = r._propio ?? {};
  const votaciones = (propio.idVotaciones ?? []).map((id) => prepararVotacion(i.votaciones.get(id), i));
  const autores = (i.autores.get(p.idProyecto) ?? [])
    .slice()
    .sort((a, b) => (a._propio?.orden ?? 0) - (b._propio?.orden ?? 0))
    .map((a) => prepararAutor(a, periodo));
  const enlaces = (ids) => (ids ?? []).map((id) => ({ id, url: rutas.votacionSilpy(id) }));
  const conNombreConocido =
    autores.some((a) => a.partidoConocido) ||
    votaciones.some((v) => v.porPartido.some((g) => g.nombreConocido));
  return {
    periodo,
    conNombreConocido,
    iniciativa: valor(p.iniciativa),
    ministerios: (p.ministerios ?? []).filter((m) => valor(m)),
    autores,
    votaciones: {
      cantidad: votaciones.length,
      indice: [...votaciones].sort(masRecientePrimero),
      camaras: agruparPorCamara(votaciones),
      noResueltas: enlaces(propio.idVotacionesNoResueltas),
      otrosPeriodos: enlaces(propio.idVotacionesOtrosPeriodos),
    },
    notas: (i.notas.get(`ley:${idLey}`) ?? []).map((n) => n.detalle),
  };
}
