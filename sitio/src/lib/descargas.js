// Prepara la página de datos abiertos: qué archivos hay, su descripción y su tamaño.
// Las descripciones son textos breves para el público; si una tabla nueva no tiene el suyo, se usa
// la descripción de datos/diccionario.json. Las rutas salen de lib/rutas.

import { archivosCalculados, NOMBRE_COINCIDENCIA, NOMBRE_VOTACIONES_NOMINALES, NOMBRE_VOTOS_POR_TEMA } from "./calculados.js";
import { archivosDeDatos, diccionario, periodos } from "./datos.js";
import * as rutas from "./rutas.js";
import { textos, fill } from "./contenido.js";
const tx = textos.datos.descargas;

const GENERALES = {
  "diccionario.md": tx.diccionarioDeDatosConCada,
  "diccionario.json": tx.elMismoDiccionarioEnFormato,
  "estado.json": tx.fechaDeLaUltimaComprobacion,
  "periodos.json": tx.periodosLegislativosIncluidosConSus,
  "sincronizaciones.json": tx.registroDeLasUltimasSincronizaciones,
  "README.md": tx.explicacionDeLosArchivosY,
};

const TABLAS = {
  leyes: tx.unaFilaPorLeySancionada,
  tramitaciones: tx.cadaPasoDeLaTramitacion,
  votaciones: tx.unaFilaPorVotacionNominal,
  votos: tx.elVotoDeCadaLegislador,
  legisladores: tx.legisladoresDelPeriodoVigentesO,
  autores: tx.autoresDelProyectoDeCada,
  personas: tx.identificadorPropioDeCadaLegislador,
  partidos: tx.partidoUnificadoDeCadaTexto,
  temas: tx.temasDeLaClasificacionPropia,
  "clasificacion-temas": tx.temasDeCadaProyectoDe,
  notas: tx.problemasQueEsteProyectoDetecto,
};

const sinMarcas = (texto) => texto.replaceAll("`", "");

export function tamano(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb).toLocaleString("es-PY")} KB`;
  return `${(kb / 1024).toLocaleString("es-PY", { maximumFractionDigits: 1 })} MB`;
}

const formato = (ruta) => ruta.split(".").pop().toUpperCase();

const CALCULADOS = {
  [NOMBRE_VOTACIONES_NOMINALES]:
    tx.porLegisladorLasVotacionesNominales,
  [NOMBRE_COINCIDENCIA]:
    tx.porCamaraCadaParDe,
  [NOMBRE_VOTOS_POR_TEMA]:
    tx.porTemaCamaraPartidoO,
};

/** Archivos que genera la compilación (lib/calculados.js), agrupados por período y nombre. */
function calculadas() {
  const porNombre = new Map();
  for (const a of archivosCalculados()) {
    const clave = `${a.periodo}/${a.nombre}`;
    if (!porNombre.has(clave)) {
      porNombre.set(clave, { nombre: `${a.nombre} (${a.periodo})`, descripcion: CALCULADOS[a.nombre] ?? "", archivos: [] });
    }
    porNombre.get(clave).archivos.push({ ruta: a.url, url: a.url, formato: a.formato, tamano: tamano(a.bytes) });
  }
  return [...porNombre.values()];
}

/** Grupos de archivos para la página de descargas. Ningún archivo de datos/ queda fuera. */
export function descargas() {
  const archivos = new Map(archivosDeDatos().map((a) => [a.ruta, a]));
  const usados = new Set();
  const archivo = (ruta) => {
    const a = archivos.get(ruta);
    if (!a) return null;
    usados.add(ruta);
    return { ruta, url: rutas.archivoDatos(ruta), formato: formato(ruta), tamano: tamano(a.bytes) };
  };
  const tablas = Object.entries(diccionario().tablas);
  const tablasDe = (filtro, periodo) =>
    tablas
      .map(([nombre, t]) => ({
        nombre,
        descripcion: TABLAS[nombre] ?? sinMarcas(t.descripcion),
        archivos: t.archivos
          .filter(filtro)
          .map((patron) => archivo(patron.replace("{período}", periodo)))
          .filter(Boolean),
      }))
      .filter((t) => t.archivos.length);

  const grupos = [
    {
      titulo: tx.documentacionYEstado,
      tablas: Object.entries(GENERALES)
        .map(([ruta, descripcion]) => ({ nombre: ruta, descripcion, archivos: [archivo(ruta)].filter(Boolean) }))
        .filter((t) => t.archivos.length),
    },
    ...periodos().map((p) => ({
      titulo: fill(tx.valoresOficialesDelPeriodoLegislativo, { id: p.id }),
      tablas: tablasDe((a) => a.startsWith("fuente/"), p.id),
    })),
    { titulo: tx.datosAgregadosPorEsteProyecto, tablas: tablasDe((a) => a.startsWith("propios/"), "") },
    { titulo: tx.cifrasCalculadasPorEsteProyecto, tablas: calculadas() },
  ];
  const otros = [...archivos.keys()].filter((r) => !usados.has(r));
  if (otros.length) {
    grupos.push({
      titulo: tx.otrosArchivos,
      tablas: otros.map((ruta) => ({ nombre: ruta, descripcion: "", archivos: [archivo(ruta)] })),
    });
  }
  return grupos;
}
