// Mayoría de un grupo de legisladores en una votación (alcance acordado en #39). Sin HTML. La usan los
// votos distintos a la mayoría (lib/legisladores.js), la coincidencia de votos (lib/coincidencia.js) y
// la posición de cada partido en las votaciones (lib/ficha.js y lib/votaciones.js, #44). Está aparte
// para que ficha.js la use sin importar legisladores.js, que a su vez importa ficha.js.

const AUSENTE = "AUSENTE";
const NO_VOTA = "NO VOTA";

/** Si un voto fue emitido: toda categoría oficial salvo AUSENTE y NO VOTA (SI, NO, ABSTENCIÓN/BLANCO, MOCIÓN n). */
export const esVotoEmitido = (sentido) => String(sentido ?? "").trim() !== "" && sentido !== AUSENTE && sentido !== NO_VOTA;

/**
 * Mayoría de un grupo en una votación, a partir de los votos emitidos de sus miembros: la categoría
 * con más votos, o null si dos o más empatan en el primer lugar. votantes = cantidad de votos emitidos.
 */
export function mayoriaDe(sentidos) {
  const cuenta = new Map();
  for (const s of sentidos.filter(esVotoEmitido)) cuenta.set(s, (cuenta.get(s) ?? 0) + 1);
  const orden = [...cuenta.entries()].sort((a, b) => b[1] - a[1]);
  const empate = orden.length > 1 && orden[0][1] === orden[1][1];
  return { mayoria: orden.length && !empate ? orden[0][0] : null, votantes: [...cuenta.values()].reduce((n, c) => n + c, 0) };
}
