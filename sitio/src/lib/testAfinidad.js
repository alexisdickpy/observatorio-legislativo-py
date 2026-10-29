// Datos del test de afinidad (alcance acordado en #63), preparados al compilar. Sin HTML. El cálculo
// del resultado está en lib/afinidad.js, que corre en el navegador con estos datos.
//
// Criterios (ver docs/metodologia.md):
// - Preguntas en datos/propios/test-afinidad.json: cada una con una votación nominal por cámara como
//   máximo, de un proyecto que llegó a ser la ley indicada. La compilación falla si una votación no
//   existe, no es de esa ley o repite cámara. Cada pregunta enlaza al expediente oficial del proyecto.
// - Partido: su mayoría en la votación de cada cámara (mayoriaDe, la misma regla de la coincidencia de
//   votos y de la posición de cada partido), con el partido unificado. SI o NO se comparan según
//   votoAFavor. Si las dos cámaras tuvieron posiciones distintas, la pregunta no se compara. Sin mayoría
//   SI o NO (empate, abstención u otra opción, o ningún voto emitido) queda sin comparar en esa votación.
// - Partido: el que la API registra para el período, no por fecha.

import { leerJson } from "./datos.js";
import { indice, posicionCamara, valor } from "./ficha.js";
import { mayoriasDelPeriodo } from "./legisladores.js";
import { posicionDe } from "./coincidencia.js";
import { POSICION } from "./afinidad.js";
import { nombreConocido, partidoUnificado, siglaDe } from "./partidos.js";
import { temas } from "./temas.js";
import * as rutas from "./rutas.js";

const OPUESTO = { SI: "NO", NO: "SI" };

/** Posición (letra) que corresponde a una mayoría, según el voto que equivale a «A favor». */
export function letraDe(sentido, votoAFavor) {
  if (sentido === votoAFavor) return POSICION.favor;
  if (sentido === OPUESTO[votoAFavor]) return POSICION.contra;
  return POSICION.sinMayoria;
}

/** Posición de un partido en una pregunta, a partir de sus posiciones en cada cámara (letras). */
export function posicionCombinada(letras) {
  const comparables = [...new Set(letras.filter((l) => l === POSICION.favor || l === POSICION.contra))];
  if (comparables.length > 1) return POSICION.dividido;
  if (comparables.length === 1) return comparables[0];
  return letras.length ? POSICION.sinMayoria : POSICION.noCorresponde;
}

/** Si el test es todavía una versión preliminar: sin enlace en el menú ni en el sitemap y con noindex. */
export const esPreliminar = () => leerJson("propios/test-afinidad.json").estado === "preliminar";

const porTexto = (a, b) => a.localeCompare(b, "es");

const cache = new Map();

/**
 * Preguntas y posiciones del test para un período. Cada pregunta lleva su ley, el enlace oficial a su
 * proyecto, su tema (de lib/temas.js), su explicación y sus votaciones (con cámara, fecha y página propia).
 * Cada partido lleva una cadena `posiciones` con una letra por pregunta (POSICION de lib/afinidad.js).
 */
export function datosDelTest(periodo) {
  if (cache.has(periodo)) return cache.get(periodo);
  const archivo = leerJson("propios/test-afinidad.json");
  if (archivo.periodoLegislativo !== periodo) throw new Error(`El test de afinidad es del período ${archivo.periodoLegislativo}, no de ${periodo}`);
  const i = indice(periodo);
  const mayorias = mayoriasDelPeriodo(periodo);
  const temasPorId = new Map(temas().map((t) => [t.id, t]));
  const ids = new Set();

  const preguntas = archivo.preguntas.map((p) => {
    if (ids.has(p.id)) throw new Error(`Pregunta repetida en el test de afinidad: ${p.id}`);
    ids.add(p.id);
    if (!OPUESTO[p.votoAFavor]) throw new Error(`votoAFavor debe ser SI o NO en la pregunta ${p.id}`);
    if (!temasPorId.has(p.tema)) throw new Error(`Tema desconocido en la pregunta ${p.id}: ${p.tema}`);
    const camaras = new Set();
    let proyecto = null;
    const votaciones = p.votaciones.map((id) => {
      const v = i.votaciones.get(id);
      if (!v) throw new Error(`La pregunta ${p.id} usa la votación ${id}, que no está en los datos`);
      const leyes = (v._propio?.idLeyes ?? []).map((idLey) => i.leyes.get(idLey)?.numeroLey);
      if (!leyes.includes(p.numeroLey)) throw new Error(`La votación ${id} de la pregunta ${p.id} no es de la ley ${p.numeroLey}`);
      const camara = valor(v.tramitacion?.camaraTramite);
      if (!camara || camaras.has(camara)) throw new Error(`La pregunta ${p.id} tiene más de una votación de ${camara ?? "una cámara sin nombre"}`);
      camaras.add(camara);
      proyecto ??= valor(v.proyecto?.appURL);
      return {
        id,
        camara,
        fecha: v.tramitacion?._propio?.fechaTramite ?? null,
        fechaTexto: valor(v.tramitacion?.fechaTramite),
        url: rutas.votacion(id),
      };
    });
    if (!votaciones.length) throw new Error(`La pregunta ${p.id} no tiene votaciones`);
    votaciones.sort((a, b) => posicionCamara(a.camara) - posicionCamara(b.camara));
    return {
      id: p.id,
      pregunta: p.pregunta,
      explicacion: valor(p.explicacion),
      votoAFavor: p.votoAFavor,
      numeroLey: p.numeroLey,
      ley: rutas.ley(p.numeroLey),
      proyecto,
      tema: temasPorId.get(p.tema),
      votaciones,
    };
  });

  // Partidos (unificados): letras por cámara de cada pregunta, combinadas después.
  const partidos = new Map();
  preguntas.forEach((p, k) => {
    for (const v of p.votaciones) {
      for (const [texto, mayoria] of mayorias.get(v.id).partido) {
        const u = partidoUnificado(texto);
        if (!partidos.has(u.id)) {
          partidos.set(u.id, { id: u.id, nombre: u.nombre, sigla: siglaDe(texto), conocido: nombreConocido(texto), letras: preguntas.map(() => []) });
        }
        const posicion = posicionDe(mayoria);
        partidos.get(u.id).letras[k].push(posicion ? letraDe(posicion, p.votoAFavor) : POSICION.sinMayoria);
      }
    }
  });

  const datos = {
    periodo,
    preliminar: archivo.estado === "preliminar",
    preguntas,
    partidos: [...partidos.values()]
      .map(({ letras, ...x }) => ({ ...x, posiciones: letras.map(posicionCombinada).join("") }))
      .sort((a, b) => porTexto(a.nombre, b.nombre)),
  };
  cache.set(periodo, datos);
  return datos;
}
