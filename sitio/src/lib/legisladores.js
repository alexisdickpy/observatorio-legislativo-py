// Prepara el listado y las fichas de legisladores. Sin HTML.
//
// Criterios (alcance acordado en #8):
// - Una ficha por persona (slug de datos/propios/personas.json) con un bloque por cada período en
//   que fue legislador. Tienen ficha todos los legisladores del período, en ejercicio o no
//   (_propio.vigente: si figura en el listado de legisladores en ejercicio de la API).
// - Los textos que se muestran son los oficiales, sin cambios. Los vacíos se devuelven como null
//   para que la página diga "Sin dato".
// - Votos (alcance acordado en #28): los de cada votación nominal del período sobre un proyecto de
//   ley (tipoProyecto oficial "PROYECTO DE LEY"), haya llegado a ser ley o no, en cuya lista
//   oficial figura el legislador. Quedan fuera resoluciones, declaraciones, pedidos de informe y
//   demás tipos de expediente. Cada votación lleva el estado oficial del proyecto (estadoProyecto,
//   el de la última actualización) y la etapa en que se votó. Categorías oficiales sin fusionar;
//   cada cantidad lleva su denominador.
// - Ausencias en votaciones nominales (alcance acordado en #29): votaciones en que figura como
//   "AUSENTE" sobre todas las votaciones nominales del período en cuya lista oficial figura, de
//   cualquier tipo de expediente. La lista de cada votación incluye solo a quienes ocupaban el cargo
//   ese día. No es asistencia a la sesión, y no se agrupa por día.
// - NO VOTA y ABSTENCIÓN/BLANCO (alcance acordado en #38): votaciones en que figura con cada una de esas
//   categorías, sobre el mismo denominador que las ausencias. Son dos cifras separadas, nunca sumadas
//   entre sí ni con las ausencias. La vista comparativa las reúne por cámara, sin calificar a nadie.
// - Votos distintos a la mayoría (alcance acordado en #39): en todas las votaciones nominales de su
//   lista, su voto emitido comparado con la categoría más votada entre los votos emitidos de su bancada
//   y, por separado, de su partido (texto oficial del período, dentro de su cámara). Fuera del cálculo
//   los empates, las votaciones en que fue el único votante del grupo y AUSENTE y NO VOTA.
// - Autoría: leyes sancionadas del período de cuyo proyecto figura como autor (autores.json,
//   registros con _propio.delPeriodo).
// - Expedientes presentados (alcance acordado en #27, lib/expedientes.js): totales por tipo oficial y, de
//   los proyectos de ley, cantidad y porcentaje por estado oficial. La lista va en una página aparte.
// - Comisiones (alcance acordado en #30, lib/comisiones.js): las comisiones de las que figura como miembro
//   en cada período parlamentario, sin cargo, porque la API no lo publica.
// - Partido y bancada: los que la API registra para el período, no por fecha.
// - Partido unificado (alcance acordado en #42, lib/partidos.js): dato propio que dice qué textos
//   oficiales de partido son el mismo partido. Lo usa el filtro "Partido" del listado, con un solo
//   nombre por partido. La ficha muestra solo el texto oficial. No cambia ninguna cifra: todas se
//   calculan dentro de cada cámara.
// - Correo y teléfono: los que la API publica para el legislador, sin cambios.
// - Orden: primero la Cámara de Senadores y luego la de Diputados; dentro, por apellido.

import { existeEnDatos, fuente, periodos, personas } from "./datos.js";
import {
  barra,
  claseDeCategoria,
  indice,
  masRecientePrimero,
  nombreConocido,
  nombreDe,
  ordenarCategorias,
  posicionCamara,
  proporcion,
  valor,
} from "./ficha.js";
import { comisionesDe } from "./comisiones.js";
import { expedientesDe } from "./expedientes.js";
import { esVotoEmitido, mayoriaDe } from "./mayoria.js";
import { partidoUnificado } from "./partidos.js";
import * as rutas from "./rutas.js";
import { normalizar, recortar, slug } from "./texto.js";

const AUSENTE = "AUSENTE";
const NO_VOTA = "NO VOTA";
const ABSTENCION = "ABSTENCIÓN/BLANCO";
const PROYECTO_DE_LEY = "PROYECTO DE LEY";
const porTexto = (a, b) => a.localeCompare(b, "es");
const porCamaraYApellido = (a, b) =>
  posicionCamara(a.camara) - posicionCamara(b.camara) ||
  porTexto(normalizar(a.apellidos), normalizar(b.apellidos)) ||
  porTexto(normalizar(a.nombre), normalizar(b.nombre));

/** Si una votación es sobre un proyecto de ley. Las enlazadas a una ley sancionada siempre lo son. */
export const esDeProyectoDeLey = (v) => v.proyecto?.tipoProyecto === PROYECTO_DE_LEY || v._propio?.idLeyes?.length > 0;

// Votos de cada legislador en todas las votaciones nominales, por período.
const votosPorPeriodo = new Map();
function votosDelPeriodo(periodo) {
  if (votosPorPeriodo.has(periodo)) return votosPorPeriodo.get(periodo);
  const i = indice(periodo);
  const porLegislador = new Map();
  for (const [idVotacion, votos] of i.votos) {
    const v = i.votaciones.get(idVotacion);
    if (!v) continue;
    for (const voto of votos) {
      const id = Number(voto.idLegislador);
      if (!porLegislador.has(id)) porLegislador.set(id, []);
      porLegislador.get(id).push({ votacion: v, sentido: voto.sentidoVotacion, observacion: valor(voto.observacion) });
    }
  }
  votosPorPeriodo.set(periodo, porLegislador);
  return porLegislador;
}

// Proyectos de cada autor del período, por período.
const autoriaPorPeriodo = new Map();
function autoriaDelPeriodo(periodo) {
  if (autoriaPorPeriodo.has(periodo)) return autoriaPorPeriodo.get(periodo);
  const porLegislador = new Map();
  for (const a of fuente(periodo, "autores.json")) {
    if (!a._propio?.delPeriodo) continue;
    const id = a.legislador?.idLegislador;
    if (!porLegislador.has(id)) porLegislador.set(id, new Set());
    porLegislador.get(id).add(a.idProyecto);
  }
  autoriaPorPeriodo.set(periodo, porLegislador);
  return porLegislador;
}

/** Ley o leyes de una votación: número (enlace a la votación en su ficha) y título oficial. */
export function leyesDeVotacion(v, i) {
  const vistas = new Map();
  for (const idLey of v._propio.idLeyes) {
    const r = i.leyes.get(idLey);
    const numero = r?._propio?.numeroLey;
    if (!numero || vistas.has(numero)) continue;
    const titulo = valor(r.proyecto?.acapite);
    vistas.set(numero, {
      numero,
      url: rutas.votacionEnLey(numero, v.idVotacion),
      titulo,
      tituloCorto: titulo && recortar(titulo, 70),
    });
  }
  return [...vistas.values()];
}

/** Proyecto de una votación: expediente oficial, título y estado oficial, con su valor de filtro. */
export function proyectoDeVotacion(v, estados) {
  const p = v.proyecto ?? {};
  const titulo = valor(p.acapite);
  const estadoOficial = valor(p.estadoProyecto);
  return {
    expediente: valor(p.expedienteCamara),
    url: valor(p.appURL),
    titulo,
    tituloCorto: titulo && recortar(titulo, 70),
    estado: estadoOficial,
    estadoFiltro: estados.get(estadoOficial) ?? SIN_ESTADO,
  };
}

/** Valor de filtro de los proyectos sin estado oficial. */
const SIN_ESTADO = "sin-dato";

function resumenDeVotos(lista) {
  const categorias = ordenarCategorias(lista.map((x) => x.sentido));
  const celdas = categorias.map((c) => proporcion(lista.filter((x) => x.sentido === c).length, lista.length));
  return {
    total: lista.length,
    totales: categorias.map((categoria, n) => ({ categoria, clase: claseDeCategoria(categoria), ...celdas[n] })),
    barra: barra(categorias, celdas),
  };
}

/**
 * Ausencias en votaciones nominales: las votaciones en que figura como AUSENTE, con su sesión, sobre
 * todas las de su lista (cualquier tipo de expediente). Cada una enlaza a la votación oficial en SILpy.
 */
function ausenciasDe(todas) {
  const lista = todas
    .filter((x) => x.sentido === AUSENTE)
    .map(({ votacion: v }) => {
      const t = v.tramitacion ?? {};
      const s = t.idSesion ?? {};
      return {
        id: v.idVotacion,
        fecha: valor(t.fechaTramite),
        fechaIso: t._propio?.fechaTramite ?? null,
        sesion: { numero: valor(s.numeroSesion ?? t.numeroSesion), tipo: valor(s.tipoSesion) },
        expediente: valor(v.proyecto?.expedienteCamara),
        url: valor(v.appURL),
      };
    })
    .sort(masRecientePrimero);
  return { ...proporcion(lista.length, todas.length), lista };
}

/** Votaciones en que figura con una categoría oficial, sobre todas las de su lista (como las ausencias). */
const cifraDe = (todas, categoria) => proporcion(todas.filter((x) => x.sentido === categoria).length, todas.length);

/** NO VOTA y ABSTENCIÓN/BLANCO, cada una por separado. */
function participacionDe(todas) {
  return { noVota: cifraDe(todas, NO_VOTA), abstencion: cifraDe(todas, ABSTENCION) };
}

export { esVotoEmitido, mayoriaDe };

/** Grupos de la comparación con la mayoría (alcance acordado en #39): campo del legislador en la API. */
export const GRUPOS_MAYORIA = [
  { grupo: "bancada", campoOficial: "bancada" },
  { grupo: "partido", campoOficial: "partidoPolitico" },
];

/** Bancada y partido oficiales de un legislador del período, o null si no tiene registro o el texto está vacío. */
const gruposDe = (l) => Object.fromEntries(GRUPOS_MAYORIA.map((g) => [g.grupo, l ? valor(l[g.campoOficial]) : null]));

// Mayoría de cada bancada y de cada partido en cada votación nominal, por período. Cada votación es de
// una sola cámara, así que cada grupo reúne a sus miembros de esa cámara. La usa también la
// coincidencia de votos entre grupos (lib/coincidencia.js).
const mayoriasPorPeriodo = new Map();
export function mayoriasDelPeriodo(periodo) {
  if (mayoriasPorPeriodo.has(periodo)) return mayoriasPorPeriodo.get(periodo);
  const i = indice(periodo);
  const porVotacion = new Map();
  for (const [idVotacion, votos] of i.votos) {
    const sentidos = Object.fromEntries(GRUPOS_MAYORIA.map((g) => [g.grupo, new Map()]));
    for (const voto of votos) {
      const grupos = gruposDe(i.legisladores.get(Number(voto.idLegislador)));
      for (const g of GRUPOS_MAYORIA) {
        const texto = grupos[g.grupo];
        if (!texto) continue;
        if (!sentidos[g.grupo].has(texto)) sentidos[g.grupo].set(texto, []);
        sentidos[g.grupo].get(texto).push(voto.sentidoVotacion);
      }
    }
    porVotacion.set(
      idVotacion,
      Object.fromEntries(
        GRUPOS_MAYORIA.map((g) => [g.grupo, new Map([...sentidos[g.grupo]].map(([texto, s]) => [texto, mayoriaDe(s)]))]),
      ),
    );
  }
  mayoriasPorPeriodo.set(periodo, porVotacion);
  return porVotacion;
}

/**
 * Comparación de un voto con la mayoría de su grupo: "distinto" o "igual" si cuenta, y si no,
 * "empate" (el grupo no tiene mayoría), "unico" (fue el único del grupo que emitió voto) o
 * "sin-grupo" (la API no le registra bancada o partido).
 */
function comparacion(sentido, m) {
  if (!m) return { estado: "sin-grupo", mayoria: null };
  if (m.votantes < 2) return { estado: "unico", mayoria: null };
  if (!m.mayoria) return { estado: "empate", mayoria: null };
  return { estado: sentido === m.mayoria ? "igual" : "distinto", mayoria: m.mayoria };
}

/**
 * Votos distintos a la mayoría de su bancada y de su partido (alcance acordado en #39): en cada grupo,
 * votaciones en que su voto emitido difiere de la mayoría del grupo, sobre las votaciones en que emitió
 * voto y el grupo tuvo mayoría con al menos dos votantes. Los empates y las votaciones en que fue el
 * único votante del grupo quedan fuera y se cuentan aparte. La lista reúne las votaciones en que votó
 * distinto a una u otra mayoría, con las dos comparaciones.
 */
function votosDistintosDe(id, todas, periodo) {
  const i = indice(periodo);
  const grupos = gruposDe(i.legisladores.get(id));
  const mayorias = mayoriasDelPeriodo(periodo);
  const emitidos = todas
    .filter((x) => esVotoEmitido(x.sentido))
    .map((x) => {
      const m = mayorias.get(x.votacion.idVotacion);
      const porGrupo = Object.fromEntries(
        GRUPOS_MAYORIA.map((g) => [g.grupo, comparacion(x.sentido, grupos[g.grupo] && m[g.grupo].get(grupos[g.grupo]))]),
      );
      return { ...x, porGrupo };
    });
  const cifras = Object.fromEntries(
    GRUPOS_MAYORIA.map(({ grupo }) => {
      const cuenta = (estado) => emitidos.filter((x) => x.porGrupo[grupo].estado === estado).length;
      const distintos = cuenta("distinto");
      return [
        grupo,
        {
          grupo: grupos[grupo],
          ...proporcion(distintos, distintos + cuenta("igual")),
          empates: cuenta("empate"),
          unico: cuenta("unico"),
        },
      ];
    }),
  );
  const lista = emitidos
    .filter((x) => GRUPOS_MAYORIA.some(({ grupo }) => x.porGrupo[grupo].estado === "distinto"))
    .map(({ votacion: v, sentido, porGrupo }) => {
      const t = v.tramitacion ?? {};
      return {
        id: v.idVotacion,
        fecha: valor(t.fechaTramite),
        fechaIso: t._propio?.fechaTramite ?? null,
        expediente: valor(v.proyecto?.expedienteCamara),
        etapa: valor(t.descripcionEtapa),
        url: valor(v.appURL),
        sentido,
        ...porGrupo,
      };
    })
    .sort(masRecientePrimero);
  return { emitidos: emitidos.length, ...cifras, lista };
}

function historialDeVotos(lista, i, estados) {
  return lista
    .map(({ votacion: v, sentido, observacion }) => {
      const t = v.tramitacion ?? {};
      return {
        proyecto: proyectoDeVotacion(v, estados),
        id: v.idVotacion,
        fecha: valor(t.fechaTramite),
        fechaIso: t._propio?.fechaTramite ?? null,
        etapa: valor(t.descripcionEtapa),
        resultado: valor(t.resultadoTramite),
        leyes: leyesDeVotacion(v, i),
        sentido,
        clase: claseDeCategoria(sentido),
        observacion,
      };
    })
    .sort(masRecientePrimero);
}

function leyesDeSuAutoria(idLegislador, periodo, i) {
  const proyectos = autoriaDelPeriodo(periodo).get(idLegislador) ?? new Set();
  const porNumero = new Map();
  for (const r of i.leyes.values()) {
    if (!proyectos.has(r.proyecto?.idProyecto)) continue;
    const numero = r._propio.numeroLey;
    if (porNumero.has(numero)) continue;
    porNumero.set(numero, {
      numero,
      url: rutas.ley(numero),
      titulo: valor(r.proyecto?.acapite),
      fechaSancion: valor(r.fechaSancion),
      fechaIso: r._propio?.fechaSancion ?? null,
    });
  }
  return [...porNumero.values()].sort(
    (a, b) => (b.fechaIso ?? "").localeCompare(a.fechaIso ?? "") || Number(b.numero) - Number(a.numero),
  );
}

/** Datos oficiales de un legislador en un período, para el listado y el encabezado de la ficha. */
function prepararRegistro(l, periodo) {
  const foto = `fotos/${periodo}/${l.idLegislador}.jpg`;
  const partido = valor(l.partidoPolitico);
  return {
    periodo,
    id: l.idLegislador,
    nombre: nombreDe(l),
    apellidos: valor(l.apellidos) ?? "",
    camara: valor(l.camaraParlamentario),
    tipo: valor(l.tipoParlamentario),
    departamento: valor(l.departamento),
    partido,
    partidoConocido: nombreConocido(partido),
    partidoUnificado: partidoUnificado(partido),
    bancada: valor(l.bancada),
    cargoBancada: valor(l.cargoBancada),
    correo: valor(l.emailParlamentario),
    telefono: valor(l.telefonoParlamentario),
    vigente: Boolean(l._propio?.vigente),
    urlSilpy: valor(l.appURL),
    foto: existeEnDatos(foto) ? rutas.fotoLegislador(periodo, l.idLegislador) : null,
  };
}

let cachePersonas;

/** Una entrada por persona con ficha: su slug, su URL y sus registros por período (el más reciente primero). */
export function legisladores() {
  if (cachePersonas) return cachePersonas;
  const orden = periodos().map((p) => p.id);
  cachePersonas = personas()
    .map((p) => {
      const registros = p.legisladores
        .filter((x) => orden.includes(x.periodoLegislativo))
        .map((x) => {
          const l = indice(x.periodoLegislativo).legisladores.get(x.idLegislador);
          return l && prepararRegistro(l, x.periodoLegislativo);
        })
        .filter(Boolean)
        .sort((a, b) => orden.indexOf(b.periodo) - orden.indexOf(a.periodo));
      return { slug: p.slug, url: rutas.legislador(p.slug), registros };
    })
    .filter((p) => p.registros.length);
  return cachePersonas;
}

const CAMPOS_FILTRO = ["camara", "partido", "bancada", "departamento"];

/**
 * Valor de URL de cada texto oficial (su slug). Si dos textos distintos dan el mismo slug
 * (por ejemplo, «"PEN"» y «(PEN)»), el segundo en orden alfabético recibe "-2": no se fusionan.
 */
export function valoresUnicos(textos) {
  const valores = new Map();
  const usados = new Set();
  for (const t of [...new Set(textos.filter(Boolean))].sort(porTexto)) {
    const base = slug(t) || "sin-nombre";
    let v = base;
    for (let n = 2; usados.has(v); n++) v = `${base}-${n}`;
    usados.add(v);
    valores.set(t, v);
  }
  return valores;
}

/** Valor de URL del filtro de partido: el identificador del partido unificado, no el texto oficial. */
const valoresDePartido = (textos) => new Map([...new Set(textos.filter(Boolean))].map((t) => [t, partidoUnificado(t).id]));

/** Una opción por partido unificado, con su nombre y, si lo tiene, el nombre conocido entre paréntesis. */
function opcionesDePartido(valores) {
  const grupos = new Map();
  for (const [texto, id] of valores) {
    if (!grupos.has(id)) grupos.set(id, { valor: id, nombre: partidoUnificado(texto).nombre, conocido: null });
    grupos.get(id).conocido ??= nombreConocido(texto);
  }
  return [...grupos.values()]
    .map((g) => ({ valor: g.valor, etiqueta: g.conocido ? `${g.nombre} (${g.conocido})` : g.nombre }))
    .sort((a, b) => porTexto(a.etiqueta, b.etiqueta));
}

const listados = new Map();

/**
 * Legisladores de un período para el listado: en ejercicio y los que ya no ejercen, por separado.
 * Cada fila lleva la entrada que usa el filtro (lib/filtroLegisladores.js).
 */
export function listado(periodo) {
  if (listados.has(periodo)) return listados.get(periodo);
  const filas = legisladores()
    .map((p) => {
      const r = p.registros.find((x) => x.periodo === periodo);
      return r && { ...r, slug: p.slug, url: p.url };
    })
    .filter(Boolean)
    .sort(porCamaraYApellido);
  const valores = Object.fromEntries(
    CAMPOS_FILTRO.map((c) => [c, (c === "partido" ? valoresDePartido : valoresUnicos)(filas.map((r) => r[c]))]),
  );
  for (const r of filas) {
    r.filtro = {
      slug: r.slug,
      textoBusqueda: normalizar(r.nombre),
      ...Object.fromEntries(CAMPOS_FILTRO.map((c) => [c, valores[c].get(r[c]) ?? ""])),
    };
  }
  const resultado = { enEjercicio: filas.filter((r) => r.vigente), noEjercen: filas.filter((r) => !r.vigente), valores };
  listados.set(periodo, resultado);
  return resultado;
}

/** Opciones de los filtros del listado: valor de URL y texto oficial (el partido, unificado y con su nombre conocido). */
export function opcionesDelListado(periodo) {
  const { valores } = listado(periodo);
  const opciones = (campo) => [...valores[campo].entries()].map(([texto, valor]) => ({ valor, etiqueta: texto }));
  return {
    camaras: opciones("camara").sort((a, b) => posicionCamara(a.etiqueta) - posicionCamara(b.etiqueta)),
    partidos: opcionesDePartido(valores.partido),
    bancadas: opciones("bancada"),
    departamentos: opciones("departamento"),
  };
}

// Estados oficiales de los proyectos votados en cada período, con su valor de filtro (slug).
const estadosPorPeriodo = new Map();
export function estadosDelPeriodo(periodo) {
  if (!estadosPorPeriodo.has(periodo)) {
    const textos = [...indice(periodo).votaciones.values()]
      .filter(esDeProyectoDeLey)
      .map((v) => valor(v.proyecto?.estadoProyecto));
    estadosPorPeriodo.set(periodo, valoresUnicos(textos));
  }
  return estadosPorPeriodo.get(periodo);
}

/**
 * Votos de un legislador en un período sobre proyectos de ley: resumen de todas sus votaciones, un
 * resumen por estado oficial del proyecto (para el filtro de la ficha) y el historial.
 */
function votosDe(todas, periodo) {
  const i = indice(periodo);
  const estados = estadosDelPeriodo(periodo);
  const lista = todas.filter((x) => esDeProyectoDeLey(x.votacion));
  const historial = historialDeVotos(lista, i, estados);
  const porEstado = [...estados.entries()]
    .map(([estado, filtro]) => {
      const deEste = lista.filter((x) => valor(x.votacion.proyecto?.estadoProyecto) === estado);
      return { estado, filtro, ...resumenDeVotos(deEste) };
    })
    .filter((e) => e.total > 0);
  const sinEstado = lista.filter((x) => !valor(x.votacion.proyecto?.estadoProyecto));
  if (sinEstado.length) porEstado.push({ estado: null, filtro: SIN_ESTADO, ...resumenDeVotos(sinEstado) });
  return { ...resumenDeVotos(lista), porEstado, historial };
}

/**
 * Ficha de una persona: por período, sus datos, el resumen y el historial de sus votos, sus ausencias,
 * NO VOTA y abstenciones en votaciones nominales, sus votos distintos a la mayoría de su bancada y de su
 * partido y sus leyes.
 */
export function ficha(persona) {
  const bloques = persona.registros.map((r) => {
    const i = indice(r.periodo);
    const todas = votosDelPeriodo(r.periodo).get(r.id) ?? [];
    return {
      ...r,
      periodoVigente: Boolean(periodos().find((p) => p.id === r.periodo)?.vigente),
      votos: votosDe(todas, r.periodo),
      ausencias: ausenciasDe(todas),
      ...participacionDe(todas),
      mayoria: votosDistintosDe(r.id, todas, r.periodo),
      autoria: leyesDeSuAutoria(r.id, r.periodo, i),
      expedientes: expedientesDe(r.id, r.periodo),
      comisiones: comisionesDe(r.id, r.periodo),
    };
  });
  return {
    slug: persona.slug,
    nombre: bloques[0].nombre,
    conNombreConocido: bloques.some((b) => b.partidoConocido),
    bloques,
  };
}

/** Personas con al menos un proyecto de ley presentado en algún período: tienen página de expedientes. */
export const conProyectosDeLey = () =>
  legisladores().filter((p) => p.registros.some((r) => expedientesDe(r.id, r.periodo).proyectosDeLey.total > 0));

/** Cifras de la vista comparativa, en el orden de sus columnas. */
export const CIFRAS_COMPARATIVAS = [
  { campo: "ausencias", categoria: AUSENTE, titulo: "Ausencias en votaciones nominales" },
  { campo: "noVota", categoria: NO_VOTA, titulo: "NO VOTA" },
  { campo: "abstencion", categoria: ABSTENCION, titulo: "ABSTENCIÓN/BLANCO" },
];

/** Cifras de votos distintos a la mayoría en la vista comparativa, en el orden de sus columnas. */
export const CIFRAS_MAYORIA = [
  { campo: "mayoriaBancada", grupo: "bancada", titulo: "Votos distintos a la mayoría de su bancada" },
  { campo: "mayoriaPartido", grupo: "partido", titulo: "Votos distintos a la mayoría de su partido" },
];

const comparativas = new Map();

/**
 * Vista comparativa de un período: por cámara, cada legislador que figura en al menos una votación
 * nominal, con sus ausencias, NO VOTA y abstenciones por separado (cantidad, total y porcentaje) y sus
 * votos distintos a la mayoría de su bancada y de su partido, cada uno con su propio denominador.
 * Mismo orden que el listado: por cámara y, dentro, por apellido.
 */
export function comparativa(periodo) {
  if (comparativas.has(periodo)) return comparativas.get(periodo);
  const { enEjercicio, noEjercen } = listado(periodo);
  const porLegislador = votosDelPeriodo(periodo);
  /** Votaciones nominales distintas de cada cámara (cada votación es de una sola cámara). */
  const votacionesDe = new Map();
  const filas = [...enEjercicio, ...noEjercen]
    .map((r) => {
      const todas = porLegislador.get(r.id) ?? [];
      if (!votacionesDe.has(r.camara)) votacionesDe.set(r.camara, new Set());
      for (const t of todas) votacionesDe.get(r.camara).add(t.votacion);
      const cifras = Object.fromEntries(CIFRAS_COMPARATIVAS.map((c) => [c.campo, cifraDe(todas, c.categoria)]));
      const mayoria = votosDistintosDe(r.id, todas, periodo);
      for (const c of CIFRAS_MAYORIA) cifras[c.campo] = mayoria[c.grupo];
      return { id: r.id, slug: r.slug, url: r.url, nombre: r.nombre, apellidos: r.apellidos, camara: r.camara, vigente: r.vigente, foto: r.foto, ...cifras };
    })
    .filter((f) => f.ausencias.total > 0)
    .sort(porCamaraYApellido);
  const camaras = [...new Set(filas.map((f) => f.camara))].map((camara) => ({
    camara,
    votaciones: votacionesDe.get(camara).size,
    filas: filas.filter((f) => f.camara === camara),
  }));
  const resultado = { periodo, camaras };
  comparativas.set(periodo, resultado);
  return resultado;
}

/** Columnas de la tabla descargable, en orden. */
export const COLUMNAS_TABLA = [
  "periodo",
  "camara",
  "slug",
  "idLegislador",
  "nombre",
  "vigente",
  "votacionesEnSuLista",
  "ausente",
  "porcentajeAusente",
  "noVota",
  "porcentajeNoVota",
  "abstencionBlanco",
  "porcentajeAbstencionBlanco",
  "bancada",
  "votacionesComparablesBancada",
  "distintasBancada",
  "porcentajeDistintasBancada",
  "partido",
  "votacionesComparablesPartido",
  "distintasPartido",
  "porcentajeDistintasPartido",
];

/** Porcentaje con un decimal (0,1234 → 12.3). */
const redondear = (p) => Math.round(p * 1000) / 10;

/** Columnas de un grupo en la tabla descargable; sin votaciones comparables, cantidad y porcentaje vacíos. */
const columnasMayoria = (c, sufijo) => ({
  [sufijo.toLowerCase()]: c.grupo,
  [`votacionesComparables${sufijo}`]: c.total,
  [`distintas${sufijo}`]: c.total ? c.cantidad : null,
  [`porcentajeDistintas${sufijo}`]: c.total ? redondear(c.porcentaje) : null,
});

/**
 * Tabla descargable de la vista comparativa: una fila por legislador, con la cantidad y el porcentaje
 * de cada cifra sobre el mismo denominador (votacionesEnSuLista), y los votos distintos a la mayoría de
 * su bancada y de su partido sobre las votaciones comparables de cada grupo (vacíos si la API no le
 * registra el grupo o no hay ninguna comparable). Cálculo propio, no oficial.
 */
export function tablaComparativa(periodo) {
  return comparativa(periodo).camaras.flatMap(({ filas }) =>
    filas.map((f) => ({
      periodo,
      camara: f.camara,
      slug: f.slug,
      idLegislador: f.id,
      nombre: f.nombre,
      vigente: f.vigente,
      votacionesEnSuLista: f.ausencias.total,
      ausente: f.ausencias.cantidad,
      porcentajeAusente: redondear(f.ausencias.porcentaje),
      noVota: f.noVota.cantidad,
      porcentajeNoVota: redondear(f.noVota.porcentaje),
      abstencionBlanco: f.abstencion.cantidad,
      porcentajeAbstencionBlanco: redondear(f.abstencion.porcentaje),
      ...columnasMayoria(f.mayoriaBancada, "Bancada"),
      ...columnasMayoria(f.mayoriaPartido, "Partido"),
    })),
  );
}
