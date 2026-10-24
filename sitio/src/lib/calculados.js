// Archivos calculados por este proyecto a partir de datos/ (no oficiales), que el sitio sirve para
// descargar junto a los datos abiertos. Los genera la compilación con los mismos cálculos que las
// páginas, así que siempre coinciden con lo que se muestra. Sin HTML.
//
// Mismas convenciones que el importador (importador/escribir.py): CSV en UTF-8 con BOM, saltos de
// línea \n y columnas fijas; JSON con sangría de 2 espacios y salto de línea final.

import { periodos } from "./datos.js";
import { COLUMNAS_COINCIDENCIA, tablaCoincidencia } from "./coincidencia.js";
import { COLUMNAS_TABLA, tablaComparativa } from "./legisladores.js";
import * as rutas from "./rutas.js";
import { COLUMNAS_VOTOS_POR_TEMA, tablaVotosPorTema } from "./votosPorTema.js";

const BOM = "﻿";

/** Un campo de CSV (RFC 4180): entre comillas si lleva coma, comillas o salto de línea. */
const campoCsv = (v) => {
  const t = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(t) ? `"${t.replaceAll('"', '""')}"` : t;
};

export function csv(columnas, filas) {
  const lineas = [columnas, ...filas.map((f) => columnas.map((c) => f[c]))].map((l) => l.map(campoCsv).join(","));
  return BOM + lineas.join("\n") + "\n";
}

const json = (filas) => JSON.stringify(filas, null, 2) + "\n";

export const NOMBRE_VOTACIONES_NOMINALES = "votaciones-nominales-por-legislador";
export const NOMBRE_COINCIDENCIA = "coincidencia-de-votos-entre-grupos";
export const NOMBRE_VOTOS_POR_TEMA = "votos-por-tema";

/** Tablas calculadas: nombre del archivo, columnas y filas de un período. */
const TABLAS = [
  { nombre: NOMBRE_VOTACIONES_NOMINALES, columnas: COLUMNAS_TABLA, filas: tablaComparativa },
  { nombre: NOMBRE_COINCIDENCIA, columnas: COLUMNAS_COINCIDENCIA, filas: tablaCoincidencia },
  { nombre: NOMBRE_VOTOS_POR_TEMA, columnas: COLUMNAS_VOTOS_POR_TEMA, filas: tablaVotosPorTema },
];

/** Archivos calculados de cada período: ruta publicada, formato y contenido. */
export function archivosCalculados() {
  return periodos().flatMap((p) =>
    TABLAS.flatMap((t) => {
      const filas = t.filas(p.id);
      return [
        { periodo: p.id, formato: "CSV", contenido: csv(t.columnas, filas) },
        { periodo: p.id, formato: "JSON", contenido: json(filas) },
      ].map((a) => ({
        ...a,
        nombre: t.nombre,
        url: rutas.archivoCalculado(p.id, t.nombre, a.formato.toLowerCase()),
        bytes: Buffer.byteLength(a.contenido, "utf-8"),
      }));
    }),
  );
}
