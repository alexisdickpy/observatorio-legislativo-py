// Partidos unificados y nombres conocidos (datos/propios/partidos.json). Sin HTML.
//
// Criterios (alcance acordado en #42, ver docs/metodologia.md):
// - Cada texto oficial de partido (`partidoPolitico`) tiene un identificador de partido unificado,
//   propio de este proyecto, con el fundamento de la agrupación. Solo se agrupan los textos que con
//   seguridad son el mismo partido; los demás quedan solos.
// - El texto oficial no cambia y se sigue mostrando. El partido unificado solo dice qué textos son el
//   mismo partido: las cifras se siguen calculando dentro de cada cámara, sin sumar senadores y
//   diputados.
// - Un texto nuevo que todavía no está en la tabla queda solo, con el slug de su texto, para que el
//   sitio compile. La prueba de partidos falla hasta que se agregue a la tabla.

import { partidosConocidos } from "./datos.js";
import { slug } from "./texto.js";

const porTexto = (a, b) => a.localeCompare(b, "es");

/** Entrada de la tabla para un texto oficial, o undefined. */
const entradaDe = (partidoOficial) => partidosConocidos().find((p) => p.partidoPolitico === partidoOficial);

/** Nombre conocido de un partido oficial, o null. */
export function nombreConocido(partidoOficial) {
  return entradaDe(partidoOficial)?.nombreConocido ?? null;
}

/**
 * Sigla de un partido oficial (dato propio, #44), para los lugares con poco espacio. Si el texto todavía
 * no está en la tabla, el texto oficial completo; null si está vacío.
 */
export function siglaDe(partidoOficial) {
  const texto = String(partidoOficial ?? "").trim();
  if (!texto) return null;
  return entradaDe(partidoOficial)?.sigla ?? texto;
}

/**
 * Partido unificado de un texto oficial: { id, nombre, enTabla }, o null si el texto está vacío.
 * `enTabla` es false si el texto todavía no figura en la tabla (queda solo).
 */
export function partidoUnificado(partidoOficial) {
  const texto = String(partidoOficial ?? "").trim();
  if (!texto) return null;
  const e = entradaDe(partidoOficial);
  return e
    ? { id: e.partidoUnificado, nombre: e.nombreUnificado, enTabla: true }
    : { id: slug(texto), nombre: texto, enTabla: false };
}

/** Textos oficiales (sin repetir) que no tienen entrada en la tabla. */
export function textosSinIdentificador(textos) {
  return [...new Set(textos.map((t) => String(t ?? "").trim()).filter(Boolean))]
    .filter((t) => !entradaDe(t))
    .sort(porTexto);
}

/**
 * Tabla de partidos unificados para la metodología: un grupo por partido unificado, con sus textos
 * oficiales y el fundamento de cada uno. Primero los que agrupan más de un texto.
 */
export function tablaDePartidos() {
  const grupos = new Map();
  for (const e of partidosConocidos()) {
    if (!grupos.has(e.partidoUnificado)) {
      grupos.set(e.partidoUnificado, { id: e.partidoUnificado, nombre: e.nombreUnificado, textos: [] });
    }
    grupos.get(e.partidoUnificado).textos.push({
      texto: e.partidoPolitico,
      fundamento: e.fundamentoUnificado,
      nombreConocido: e.nombreConocido ?? null,
    });
  }
  return [...grupos.values()]
    .map((g) => ({ ...g, textos: g.textos.sort((a, b) => porTexto(a.texto, b.texto)) }))
    .sort((a, b) => b.textos.length - a.textos.length || porTexto(a.nombre, b.nombre));
}
