// Filtro y orden del catálogo de leyes. Se usa en el navegador (componente FiltroLeyes) y en
// las pruebas. Trabaja con las "entradas" que prepara catalogo.js, sin tocar los valores oficiales.

import { normalizar } from "./texto.js";

export const ORDENES = {
  "sancion-desc": "Sanción más reciente primero",
  "sancion-asc": "Sanción más antigua primero",
  "numero-desc": "Número de mayor a menor",
  "numero-asc": "Número de menor a mayor",
};
export const ORDEN_PREDETERMINADO = "sancion-desc";

// Palabras que acompañan a un número de ley ("Ley N° 7076") y no deben exigirse en el título.
const PALABRAS_DE_NUMERO = new Set(["ley", "n", "no", "nro", "numero"]);

/** Lee los filtros desde URLSearchParams, ignorando valores desconocidos. */
export function leerFiltros(parametros, nombres) {
  const orden = parametros.get(nombres.orden) ?? "";
  return {
    texto: (parametros.get(nombres.texto) ?? "").trim(),
    anio: (parametros.get(nombres.anio) ?? "").trim(),
    camara: (parametros.get(nombres.camara) ?? "").trim(),
    tema: (parametros.get(nombres.tema) ?? "").trim(),
    orden: orden in ORDENES ? orden : ORDEN_PREDETERMINADO,
  };
}

/** Escribe los filtros como URLSearchParams, omitiendo los vacíos y el orden predeterminado. */
export function escribirFiltros(filtros, nombres) {
  const p = new URLSearchParams();
  if (filtros.texto) p.set(nombres.texto, filtros.texto);
  if (filtros.anio) p.set(nombres.anio, filtros.anio);
  if (filtros.camara) p.set(nombres.camara, filtros.camara);
  if (filtros.tema) p.set(nombres.tema, filtros.tema);
  if (filtros.orden && filtros.orden !== ORDEN_PREDETERMINADO) p.set(nombres.orden, filtros.orden);
  return p;
}

/**
 * Devuelve las entradas que cumplen los filtros, ordenadas.
 * Cada entrada: { numero, textoBusqueda, anio, camaras: [slug], temas: [id de tema o "pendiente"], fechaOrden: "aaaa-mm-dd" | null }.
 * El texto se busca por palabras: todas deben aparecer en el número o en el título.
 * Si una palabra es exactamente un número de ley, esa ley va primero. Cuando hay un número,
 * se ignoran "ley", "n°", "nro.", etc.
 */
export function filtrar(entradas, filtros) {
  let palabras = normalizar(filtros.texto).split(" ").filter(Boolean);
  if (palabras.some((p) => /^[0-9]+$/.test(p))) palabras = palabras.filter((p) => !PALABRAS_DE_NUMERO.has(p));
  const elegidas = entradas.filter(
    (e) =>
      (!filtros.anio || e.anio === filtros.anio) &&
      (!filtros.camara || e.camaras.includes(filtros.camara)) &&
      (!filtros.tema || (e.temas ?? []).includes(filtros.tema)) &&
      palabras.every((p) => e.textoBusqueda.includes(p)),
  );
  const exactos = new Set(palabras);
  return elegidas.sort(
    (a, b) => (exactos.has(b.numero) - exactos.has(a.numero)) || comparar(a, b, filtros.orden),
  );
}

function comparar(a, b, orden) {
  const [campo, sentido] = (orden in ORDENES ? orden : ORDEN_PREDETERMINADO).split("-");
  const signo = sentido === "asc" ? 1 : -1;
  const porNumero = Number(a.numero) - Number(b.numero) || a.numero.localeCompare(b.numero);
  if (campo === "numero") return signo * porNumero;
  // Sin fecha válida: al final en cualquier sentido.
  if (a.fechaOrden !== b.fechaOrden) {
    if (!a.fechaOrden) return 1;
    if (!b.fechaOrden) return -1;
    return signo * a.fechaOrden.localeCompare(b.fechaOrden);
  }
  return signo * porNumero;
}
