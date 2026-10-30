// Geometría del hemiciclo de puntos (#80): un punto por legislador, en arcos concéntricos. Sin HTML. Los
// puntos se ordenan por ángulo, de izquierda a derecha, para que cada voto forme un bloque continuo. La
// posición no es la de las bancas reales: el Congreso no publica esa ubicación.

export const ANCHO = 600;
export const ALTO = 322;
const CENTRO_X = ANCHO / 2;
const CENTRO_Y = 300;
const RADIO_MENOR = 128;
const RADIO_MAYOR = 276;
/** Proporción del espacio libre entre puntos vecinos que ocupa cada punto. */
const PROPORCION_PUNTO = 0.38;
const RADIO_MAXIMO = 19;

/** Arcos según la cantidad de legisladores: más gente, más filas. */
const filasPara = (n) => (n <= 12 ? 2 : n <= 30 ? 3 : n <= 60 ? 4 : 5);

/** Reparte n puntos entre las filas en proporción a su largo, por el método del mayor resto. */
function repartir(n, radios) {
  const suma = radios.reduce((a, r) => a + r, 0);
  const exactos = radios.map((r) => (n * r) / suma);
  const cantidades = exactos.map(Math.floor);
  const faltantes = n - cantidades.reduce((a, c) => a + c, 0);
  exactos
    .map((e, i) => ({ resto: e - Math.floor(e), i }))
    .sort((a, b) => b.resto - a.resto || b.i - a.i)
    .slice(0, faltantes)
    .forEach(({ i }) => cantidades[i]++);
  return cantidades;
}

/**
 * Posición de n puntos: { x, y }, de izquierda a derecha, y el radio común `r`. Las coordenadas están
 * en el sistema de ANCHO × ALTO.
 */
export function asientos(n) {
  if (n <= 0) return { r: 0, puntos: [] };
  const filas = filasPara(n);
  const paso = filas > 1 ? (RADIO_MAYOR - RADIO_MENOR) / (filas - 1) : 0;
  const radios = Array.from({ length: filas }, (_, i) => RADIO_MENOR + i * paso);
  const puntos = repartir(n, radios).flatMap((cantidad, f) =>
    Array.from({ length: cantidad }, (_, i) => {
      const angulo = Math.PI - (cantidad > 1 ? (i * Math.PI) / (cantidad - 1) : Math.PI / 2);
      return {
        angulo,
        x: Math.round((CENTRO_X + radios[f] * Math.cos(angulo)) * 10) / 10,
        y: Math.round((CENTRO_Y - radios[f] * Math.sin(angulo)) * 10) / 10,
      };
    }),
  );
  puntos.sort((a, b) => b.angulo - a.angulo || b.y - a.y);
  const separacion = (Math.PI * radios.reduce((a, r) => a + r, 0)) / n;
  const r = Math.min(RADIO_MAXIMO, Math.round(PROPORCION_PUNTO * Math.min(separacion, paso || separacion) * 10) / 10);
  return { r, puntos: puntos.map(({ x, y }) => ({ x, y })) };
}
