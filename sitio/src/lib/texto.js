// Utilidades de texto sin HTML ni lectura de archivos: se usan en la compilación y en el navegador.

/** Minúsculas, sin acentos ni signos: para comparar textos al buscar. */
export function normalizar(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, " ")
    .trim();
}

/** Identificador de URL a partir de un valor oficial: "CAMARA DE DIPUTADOS" → "camara-de-diputados". */
export function slug(texto) {
  return normalizar(texto).replace(/ /g, "-");
}

/** Recorta un texto largo en el último espacio antes de `maximo` caracteres y agrega "…". */
export function recortar(texto, maximo) {
  const t = String(texto ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= maximo) return t;
  const corte = t.lastIndexOf(" ", maximo);
  return `${t.slice(0, corte > 0 ? corte : maximo)}…`;
}

/** Siglas y palabras que van siempre en mayúsculas o en minúsculas al mostrar un nombre (legible). */
const SIGLAS = new Set(["ANR", "PLRA", "PEN", "PDP", "PPQ", "PPC", "PPS", "CN", "PL", "RR"]);
const MINUSCULAS = new Set(["de", "del", "la", "las", "el", "los", "y", "en"]);

/**
 * Nombre de un partido o una bancada para mostrar, sin todo en mayúsculas (#80). Solo cambia los textos
 * sin ninguna minúscula; las letras no se tocan, así que un acento que falta en la fuente sigue faltando.
 * El dato oficial no cambia y queda en las descargas.
 */
export function legible(texto) {
  if (texto == null || /\p{Ll}/u.test(texto)) return texto;
  let primera = true;
  return texto.replace(/\p{L}+/gu, (palabra) => {
    const inicial = primera;
    primera = false;
    if (SIGLAS.has(palabra) || palabra.length === 1) return palabra;
    const baja = palabra.toLocaleLowerCase("es");
    if (!inicial && MINUSCULAS.has(baja)) return baja;
    return baja[0].toLocaleUpperCase("es") + baja.slice(1);
  });
}
