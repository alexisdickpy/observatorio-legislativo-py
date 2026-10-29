// Prepara la página de datos abiertos: qué archivos hay, su descripción y su tamaño.
// Las descripciones son textos breves para el público; si una tabla nueva no tiene el suyo, se usa
// la descripción de datos/diccionario.json. Las rutas salen de lib/rutas.

import { archivosCalculados, NOMBRE_COINCIDENCIA, NOMBRE_VOTACIONES_NOMINALES, NOMBRE_VOTOS_POR_TEMA } from "./calculados.js";
import { archivosDeDatos, diccionario, periodos } from "./datos.js";
import * as rutas from "./rutas.js";

const GENERALES = {
  "diccionario.md": "Diccionario de datos, con cada campo de cada tabla, su tipo, su origen (oficial o propio) y su descripción.",
  "diccionario.json": "El mismo diccionario, en formato JSON.",
  "estado.json": "Fecha de la última comprobación con la fuente, última modificación y cantidades por período.",
  "periodos.json": "Períodos legislativos incluidos, con sus fechas.",
  "sincronizaciones.json": "Registro de las últimas sincronizaciones con la API del Congreso.",
  "README.md": "Explicación de los archivos y sus convenciones.",
};

const TABLAS = {
  leyes: "Una fila por ley sancionada en el período, con datos de su proyecto.",
  tramitaciones: "Cada paso de la tramitación del proyecto de cada ley.",
  votaciones: "Una fila por votación nominal, con sus totales. El voto de cada legislador está en votos.",
  votos: "El voto de cada legislador en cada votación nominal.",
  legisladores: "Legisladores del período, vigentes o no.",
  autores: "Autores del proyecto de cada ley y de los proyectos de ley votados en el período.",
  personas: "Identificador propio de cada legislador, que se mantiene igual entre legislaturas y se usa en las direcciones del sitio.",
  partidos: "Partido unificado de cada texto oficial de partido, que dice qué textos corresponden al mismo partido, con el fundamento de cada caso y los nombres conocidos. Los textos oficiales no cambian.",
  temas: "Temas de la clasificación propia de las leyes, con la definición de cada uno y las palabras clave de sus reglas.",
  "clasificacion-temas": "Temas de cada proyecto de ley con ley o con votación en el período, con la regla o la revisión que asignó cada uno. Es una clasificación propia, no oficial.",
  notas: "Problemas que este proyecto detectó en los datos oficiales (fechas mal escritas, totales que no coinciden, etc.). Los valores oficiales no se corrigen.",
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
    "Por legislador, las votaciones nominales en que figura como AUSENTE, NO VOTA y ABSTENCIÓN/BLANCO, cada una por separado, sobre todas las votaciones nominales en cuya lista figura, y las votaciones en que votó distinto a la mayoría de su bancada y de su partido, sobre las votaciones comparables de cada grupo. Es la tabla de la vista comparativa.",
  [NOMBRE_COINCIDENCIA]:
    "Por cámara, cada par de partidos y cada par de bancadas, con las votaciones nominales sobre proyectos de ley en que los dos tuvieron posición y en cuántas fue la misma. Los partidos se identifican con el partido unificado y las bancadas con su nombre oficial. El porcentaje queda vacío con menos de 20 votaciones en común. Es la tabla de la página de coincidencia de votos.",
  [NOMBRE_VOTOS_POR_TEMA]:
    "Por tema, cámara, partido o bancada y categoría oficial de voto, cuántos votos individuales sumaron sus legisladores en las votaciones nominales sobre proyectos de ley de ese tema, sobre sus votos registrados. El tema es la clasificación propia; los partidos se identifican con el partido unificado y las bancadas con su nombre oficial. Es la tabla de la página de votos por tema.",
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
      titulo: "Documentación y estado",
      tablas: Object.entries(GENERALES)
        .map(([ruta, descripcion]) => ({ nombre: ruta, descripcion, archivos: [archivo(ruta)].filter(Boolean) }))
        .filter((t) => t.archivos.length),
    },
    ...periodos().map((p) => ({
      titulo: `Valores oficiales del período legislativo ${p.id}`,
      tablas: tablasDe((a) => a.startsWith("fuente/"), p.id),
    })),
    { titulo: "Datos agregados por este proyecto (no oficiales)", tablas: tablasDe((a) => a.startsWith("propios/"), "") },
    { titulo: "Cifras calculadas por este proyecto (no oficiales)", tablas: calculadas() },
  ];
  const otros = [...archivos.keys()].filter((r) => !usados.has(r));
  if (otros.length) {
    grupos.push({
      titulo: "Otros archivos",
      tablas: otros.map((ruta) => ({ nombre: ruta, descripcion: "", archivos: [archivo(ruta)] })),
    });
  }
  return grupos;
}
