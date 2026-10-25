// Cálculo del resultado del test de afinidad (alcance acordado en #63). Sin HTML y sin acceso a
// archivos: lo usa la página en el navegador y lo prueban las pruebas de unidad. Los datos los prepara
// lib/testAfinidad.js al compilar.
//
// Criterios (ver docs/metodologia.md):
// - Respuestas "favor", "contra" o "sin" (sin posición). Solo cuentan "favor" y "contra"; "sin" no es
//   coincidencia ni diferencia.
// - Cada grupo o legislador tiene, por pregunta, una posición codificada en una letra (POSICION). Se
//   compara solo si es A favor o En contra. Las demás (abstención, NO VOTA, AUSENTE, otra cámara, sin
//   posición del grupo) quedan sin comparar y se cuentan aparte.
// - Coincidencia = preguntas en que la posición fue la misma que la respuesta ÷ preguntas comparadas.
//   Con menos de MINIMO_COMPARADAS preguntas comparadas se muestran las cantidades sin porcentaje.

/** Letra de cada posición en las cadenas de datos: una letra por pregunta, en el orden de las preguntas. */
export const POSICION = {
  favor: "F",
  contra: "C",
  abstencion: "A",
  noVota: "N",
  ausente: "U",
  /** El grupo emitió votos, pero no tuvo una mayoría A favor o En contra (empate u otra opción). */
  sinMayoria: "E",
  /** Las dos cámaras tuvieron posiciones distintas (solo partidos). */
  dividido: "D",
  /** Sin votación de su cámara o sin registro en ella. */
  noCorresponde: "-",
};

/** Respuestas posibles, en el orden de los botones. */
export const RESPUESTAS = [
  { valor: "favor", texto: "A favor" },
  { valor: "contra", texto: "En contra" },
  { valor: "sin", texto: "Sin posición" },
];

/** Preguntas comparadas por debajo de las cuales no se muestra el porcentaje. */
export const MINIMO_COMPARADAS = 4;

/** Modos del test. El básico usa las preguntas marcadas como básicas. */
export const MODOS = {
  basico: { valor: "basico", texto: "Básico" },
  avanzado: { valor: "avanzado", texto: "Avanzado" },
};

/** Índices de las preguntas de un modo. */
export const preguntasDelModo = (preguntas, modo) =>
  preguntas.map((p, n) => (modo === MODOS.avanzado.valor || p.basico ? n : -1)).filter((n) => n >= 0);

const formatoPorcentaje = new Intl.NumberFormat("es-PY", { style: "percent", maximumFractionDigits: 0 });

/**
 * Coincidencia de una cadena de posiciones con las respuestas, en las preguntas `indices`.
 * `respuestas[n]` es la respuesta a la pregunta n (o undefined).
 */
export function coincidenciaDe(posiciones, respuestas, indices) {
  let comparadas = 0;
  let coinciden = 0;
  let sinComparar = 0;
  for (const n of indices) {
    const r = respuestas[n];
    if (r !== "favor" && r !== "contra") continue;
    const p = posiciones[n];
    if (p === POSICION.noCorresponde) continue;
    if (p !== POSICION.favor && p !== POSICION.contra) {
      sinComparar++;
      continue;
    }
    comparadas++;
    if ((p === POSICION.favor) === (r === "favor")) coinciden++;
  }
  const suficiente = comparadas >= MINIMO_COMPARADAS;
  const porcentaje = comparadas ? coinciden / comparadas : 0;
  const porcentajeTexto = suficiente ? formatoPorcentaje.format(porcentaje) : null;
  return {
    coinciden,
    comparadas,
    sinComparar,
    porcentaje,
    porcentajeTexto,
    suficiente,
    texto: `${coinciden} de ${comparadas}${suficiente ? ` (${porcentajeTexto})` : ""}`,
  };
}

/**
 * Orden del resultado: primero los que alcanzan el mínimo, de mayor a menor coincidencia; después los
 * demás, de más a menos preguntas comparadas; a igualdad, por nombre.
 */
const porCoincidencia = (a, b) =>
  Number(b.c.suficiente) - Number(a.c.suficiente) ||
  (a.c.suficiente ? b.c.porcentaje - a.c.porcentaje : 0) ||
  b.c.comparadas - a.c.comparadas ||
  a.nombre.localeCompare(b.nombre, "es");

/** Cantidad de preguntas respondidas A favor o En contra entre las del modo. */
export const respondidas = (respuestas, indices) => indices.filter((n) => respuestas[n] === "favor" || respuestas[n] === "contra").length;

/**
 * Resultado del test. `datos` son los de lib/testAfinidad.js (partidos, bancadas, legisladores, cada
 * uno con su cadena `posiciones`). Devuelve cada lista ordenada, sin los que no tuvieron ninguna pregunta
 * comparada.
 */
export function calcularAfinidad(datos, respuestas, modo) {
  const indices = preguntasDelModo(datos.preguntas, modo);
  const ordenar = (lista) =>
    lista
      .map((x) => ({ ...x, c: coincidenciaDe(x.posiciones, respuestas, indices) }))
      .filter((x) => x.c.comparadas > 0)
      .sort(porCoincidencia);
  return {
    indices,
    respondidas: respondidas(respuestas, indices),
    partidos: ordenar(datos.partidos),
    bancadas: ordenar(datos.bancadas),
    legisladores: ordenar(datos.legisladores),
  };
}
