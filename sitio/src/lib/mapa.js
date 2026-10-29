// Prepara el mapa de diputados por departamento (#65). Sin HTML.
//
// Criterios:
// - Solo diputados en ejercicio: la Cámara de Diputados se elige por departamento. Los senadores
//   (departamento oficial NACIONAL) y quienes ya no ejercen se cuentan aparte, sin zona.
// - El departamento es el texto oficial de la API, sin cambios. CORRESPONDENCIA es un dato propio que
//   dice a qué zona del mapa corresponde cada texto. Un texto sin correspondencia queda aparte.
// - El contorno es la copia propia de src/mapa/departamentos.json (scripts/mapa-departamentos.js).
// - El color depende solo de la cantidad de diputados, nunca del partido.

import contorno from "../mapa/departamentos.json" with { type: "json" };
import { listado } from "./legisladores.js";
import { normalizar, slug } from "./texto.js";

export const CAMARA_DIPUTADOS = "CAMARA DE DIPUTADOS";
const NACIONAL = "NACIONAL";

/** Texto oficial de departamento (normalizado, lib/texto.js) → código ISO 3166-2 de su zona en el mapa. */
export const CORRESPONDENCIA = {
  capital: "PY-ASU",
  concepcion: "PY-1",
  "san pedro": "PY-2",
  cordillera: "PY-3",
  guaira: "PY-4",
  caaguazu: "PY-5",
  caazapa: "PY-6",
  itapua: "PY-7",
  misiones: "PY-8",
  paraguari: "PY-9",
  "alto parana": "PY-10",
  central: "PY-11",
  neembucu: "PY-12",
  amambay: "PY-13",
  canindeyu: "PY-14",
  "pte hayes": "PY-15",
  "presidente hayes": "PY-15",
  "alto paraguay": "PY-16",
  boqueron: "PY-19",
};

/** Código de la zona del mapa de un texto oficial de departamento, o null si no tiene. */
export const zonaDe = (departamento) => CORRESPONDENCIA[normalizar(departamento)] ?? null;

/** Tramos de la escala de colores, por cantidad de diputados. */
export const NIVELES = [
  { nivel: 1, desde: 1, hasta: 1 },
  { nivel: 2, desde: 2, hasta: 3 },
  { nivel: 3, desde: 4, hasta: 5 },
  { nivel: 4, desde: 6, hasta: 8 },
  { nivel: 5, desde: 9, hasta: Infinity },
];
export const nivelDe = (cantidad) => NIVELES.find((n) => cantidad >= n.desde && cantidad <= n.hasta)?.nivel ?? 0;
export const textoNivel = (n) => (n.hasta === Infinity ? `${n.desde} o más` : n.desde === n.hasta ? `${n.desde}` : `${n.desde} a ${n.hasta}`);

/**
 * Agrupa filas de diputados por zona del mapa. Devuelve un Map código → filas y, aparte, las filas
 * cuyo departamento oficial no tiene zona, agrupadas por ese texto.
 */
export function agruparPorDepartamento(filas) {
  const porZona = new Map();
  const sinZona = new Map();
  for (const f of filas) {
    const codigo = zonaDe(f.departamento);
    const destino = codigo ? porZona : sinZona;
    const clave = codigo ?? f.departamento ?? "Sin dato";
    if (!destino.has(clave)) destino.set(clave, []);
    destino.get(clave).push(f);
  }
  return { porZona, sinZona };
}

const diputado = (f) => ({ nombre: f.nombre, url: f.url, foto: f.foto, partido: f.partido, partidoConocido: f.partidoConocido });

/** Datos de la página del mapa de un período. */
export function mapaDeDiputados(periodo) {
  const { enEjercicio, noEjercen } = listado(periodo);
  const diputados = enEjercicio.filter((f) => f.camara === CAMARA_DIPUTADOS);
  const { porZona, sinZona } = agruparPorDepartamento(diputados);
  const zonas = contorno.zonas
    .map((z) => {
      const filas = porZona.get(z.codigo) ?? [];
      const oficiales = [...new Set(filas.map((f) => f.departamento))];
      return {
        ...z,
        ancla: `departamento-${slug(z.nombre)}`,
        // El texto oficial se muestra cuando no coincide con el nombre de la zona (CAPITAL, PTE. HAYES).
        oficialDistinto: oficiales.filter((o) => normalizar(o) !== normalizar(z.nombre)),
        cantidad: filas.length,
        nivel: nivelDe(filas.length),
        diputados: filas.map(diputado),
      };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  return {
    ancho: contorno.ancho,
    alto: contorno.alto,
    fuente: contorno.fuente,
    urlFuente: contorno.urlFuente,
    licencia: contorno.licencia,
    zonas,
    sinZona: [...sinZona].map(([departamento, filas]) => ({ departamento, diputados: filas.map(diputado) })),
    total: diputados.length,
    senadores: enEjercicio.filter((f) => f.departamento === NACIONAL).length,
    diputadosQueNoEjercen: noEjercen.filter((f) => f.camara === CAMARA_DIPUTADOS).length,
    niveles: NIVELES.map((n) => ({ ...n, texto: textoNivel(n) })),
  };
}
