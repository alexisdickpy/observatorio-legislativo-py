// Prepara las leyes para mostrar: agrupa los registros por número de ley y arma los valores
// que usan el catálogo, las fichas y el filtro. Sin HTML.
//
// Criterios:
// - La agrupación usa _propio.numeroLey (número sin espacios); el número oficial se conserva.
// - Los textos que se muestran (título, fechas, cámara) son los oficiales, sin cambios. Si los
//   registros de un mismo número tienen valores distintos, se muestran todos.
// - Los temas son la clasificación propia de lib/temas.js (#36), con sus opciones de filtro.
// - Las fechas ISO de _propio se usan solo para ordenar y para el año del filtro: se toma la
//   fecha de sanción más antigua del grupo.

import { textos } from "./contenido.js";
import { registrosDeLey, estado } from "./datos.js";
import * as rutas from "./rutas.js";
import { PENDIENTE, TEXTO_PENDIENTE, temas as temasDelSitio, temasDeProyectos } from "./temas.js";
import { normalizar, slug } from "./texto.js";

const distintos = (valores) => [...new Set(valores.filter((v) => v !== null && v !== undefined && v !== ""))];

function prepararRegistro({ periodo, registro: r }) {
  const p = r.proyecto ?? {};
  return {
    periodo,
    idLey: r.idLey,
    idProyecto: p.idProyecto ?? null,
    numeroOficial: r.numeroLey,
    titulo: p.acapite ?? null,
    fechaSancion: r.fechaSancion,
    fechaPromulgacion: r.fechaPromulgacion,
    fechaPublicacion: r.fechaPublicacion,
    tipoPromulgacion: r.tipoPromulgacion,
    observacionDecreto: r.observacionDecreto,
    camaraOrigen: p.origenProyecto ?? null,
    expediente: p.expedienteCamara ?? null,
    estadoProyecto: p.estadoProyecto ?? null,
    urlLey: r.appURL ?? null,
    urlExpediente: p.appURL ?? null,
    textosDeLey: (p.archivosAdjuntos ?? [])
      .filter((a) => a.tipoAdjunto === "LEY")
      .map((a) => ({ url: a.appURL, descripcion: a.infoAdjunto, formato: a.tipoArchivo })),
    _fechaSancionIso: r._propio?.fechaSancion ?? null,
  };
}

let leyesCache;

/** Una entrada por número de ley, ordenadas por número. */
export function leyes() {
  if (leyesCache) return leyesCache;
  const grupos = new Map();
  for (const item of registrosDeLey()) {
    const numero = item.registro._propio.numeroLey;
    if (!grupos.has(numero)) grupos.set(numero, []);
    grupos.get(numero).push(prepararRegistro(item));
  }
  leyesCache = [...grupos.entries()]
    .map(([numero, registros]) => {
      registros.sort((a, b) => a.idLey - b.idLey);
      const fechaOrden = distintos(registros.map((r) => r._fechaSancionIso)).sort()[0] ?? null;
      const camaras = distintos(registros.map((r) => r.camaraOrigen));
      const titulos = distintos(registros.map((r) => r.titulo));
      const clasificacion = temasDeProyectos(registros.map((r) => ({ periodo: r.periodo, idProyecto: r.idProyecto })));
      return {
        numero,
        url: rutas.ley(numero),
        periodos: distintos(registros.map((r) => r.periodo)),
        registros,
        titulos,
        fechasSancion: distintos(registros.map((r) => r.fechaSancion)),
        fechasPromulgacion: distintos(registros.map((r) => r.fechaPromulgacion)),
        fechasPublicacion: distintos(registros.map((r) => r.fechaPublicacion)),
        camaras,
        temas: clasificacion,
        anio: fechaOrden ? fechaOrden.slice(0, 4) : "",
        fechaOrden,
        filtro: {
          numero,
          textoBusqueda: normalizar([numero, ...titulos].join(" ")),
          anio: fechaOrden ? fechaOrden.slice(0, 4) : "",
          camaras: camaras.map(slug),
          temas: clasificacion.filtro,
          fechaOrden,
        },
      };
    })
    .sort((a, b) => Number(a.numero) - Number(b.numero) || a.numero.localeCompare(b.numero));
  return leyesCache;
}

/** Opciones de los filtros del catálogo. */
export function opcionesDeFiltro() {
  const lista = leyes();
  const anios = distintos(lista.map((l) => l.anio)).sort().reverse();
  const camaras = distintos(lista.flatMap((l) => l.camaras))
    .sort()
    .map((c) => ({ valor: slug(c), etiqueta: c }));
  const conTema = (id) => lista.filter((l) => l.filtro.temas.includes(id)).length;
  const temas = [...temasDelSitio().map((t) => ({ valor: t.id, etiqueta: t.nombre })), { valor: PENDIENTE, etiqueta: TEXTO_PENDIENTE }]
    .map((t) => ({ ...t, total: conTema(t.valor) }))
    .filter((t) => t.total > 0);
  return { anios, camaras, temas };
}

/** Fecha de la última comprobación de los datos con la fuente, para la cita. */
export function actualizacion() {
  const iso = estado().ultimaComprobacion;
  const texto = new Intl.DateTimeFormat("es-PY", {
    timeZone: "America/Asuncion",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
  return { iso, texto };
}

export const cita = () => ({ ...estado().fuente, cita: textos.general.sitio.cita });
