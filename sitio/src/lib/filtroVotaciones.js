// Filtro de la página de votaciones de un año por cámara, estado oficial del proyecto, resultado
// oficial (#44) y tema según la clasificación propia (#36). Se usa en el navegador (componente FiltroVotaciones) y en las pruebas. Trabaja con los
// valores de filtro (slug) que prepara lib/votaciones.js, sin tocar los valores oficiales.

/** Campos del filtro, en el orden del formulario. */
export const CAMPOS = ["camara", "estado", "resultado", "tema"];

/** Filtros elegidos en la dirección. Un campo sin valor o con un valor que no es una de sus opciones queda en "". */
export function leerFiltrosVotaciones(parametros, nombres, opciones) {
  return Object.fromEntries(
    CAMPOS.map((c) => {
      const valor = (parametros.get(nombres[c]) ?? "").trim();
      return [c, (opciones[c] ?? []).includes(valor) ? valor : ""];
    }),
  );
}

/** La dirección con los filtros elegidos, sin los campos en "todos" y conservando los demás parámetros. */
export function escribirFiltrosVotaciones(parametros, nombres, filtros) {
  const p = new URLSearchParams(parametros);
  for (const c of CAMPOS) {
    if (filtros[c]) p.set(nombres[c], filtros[c]);
    else p.delete(nombres[c]);
  }
  return p;
}

/** Si el valor de una entrada (o uno de sus valores, si es una lista, como los temas) es el elegido. */
const cumple = (valor, elegido) => (Array.isArray(valor) ? valor.includes(elegido) : valor === elegido);

/** Entradas ({ camara, estado, resultado, tema: [ids] }) que cumplen todos los filtros, en el mismo orden. */
export const filtrarVotaciones = (entradas, filtros) => entradas.filter((e) => CAMPOS.every((c) => !filtros[c] || cumple(e[c], filtros[c])));
