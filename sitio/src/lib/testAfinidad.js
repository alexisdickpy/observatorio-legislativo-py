// Datos del test de afinidad (alcance acordado en #63), preparados al compilar. Sin HTML. El cálculo
// del resultado está en lib/afinidad.js, que corre en el navegador con estos datos.
//
// Criterios (ver docs/metodologia.md):
// - Preguntas en datos/propios/test-afinidad.json: cada una con una votación nominal por cámara como
//   máximo, de un proyecto que llegó a ser la ley indicada. La compilación falla si una votación no
//   existe, no es de esa ley o repite cámara.
// - Legislador: su voto oficial en la votación de su cámara. SI o NO se comparan según votoAFavor;
//   ABSTENCIÓN/BLANCO, NO VOTA y AUSENTE quedan sin comparar.
// - Bancada: su mayoría en la votación de su cámara (mayoriaDe, la misma regla de la coincidencia de
//   votos y de la posición de cada partido). Partido: su mayoría en cada cámara, con el partido
//   unificado; si las dos cámaras tuvieron posiciones distintas, la pregunta no se compara. Un grupo sin
//   mayoría (empate, otra opción o ningún voto emitido) queda sin comparar en esa votación.
// - Partido y bancada: los que la API registra para el período, no por fecha.

import { leerJson, personas } from "./datos.js";
import { indice, nombreDe, posicionCamara, valor } from "./ficha.js";
import { mayoriasDelPeriodo } from "./legisladores.js";
import { posicionDe } from "./coincidencia.js";
import { POSICION } from "./afinidad.js";
import { nombreConocido, partidoUnificado, siglaDe } from "./partidos.js";
import { temas } from "./temas.js";
import * as rutas from "./rutas.js";

const OPUESTO = { SI: "NO", NO: "SI" };
const LETRA_DE_VOTO = { "ABSTENCIÓN/BLANCO": POSICION.abstencion, "NO VOTA": POSICION.noVota, AUSENTE: POSICION.ausente };

/** Posición (letra) que corresponde a un voto oficial o a una mayoría, según el voto que equivale a «A favor». */
export function letraDe(sentido, votoAFavor) {
  if (sentido === votoAFavor) return POSICION.favor;
  if (sentido === OPUESTO[votoAFavor]) return POSICION.contra;
  return LETRA_DE_VOTO[sentido] ?? POSICION.sinMayoria;
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
 * Preguntas y posiciones del test para un período. Cada pregunta lleva su ley, su tema (de lib/temas.js) y sus votaciones
 * (con cámara, fecha y página propia). Partidos, bancadas y legisladores llevan una cadena `posiciones`
 * con una letra por pregunta (POSICION de lib/afinidad.js).
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
    const votaciones = p.votaciones.map((id) => {
      const v = i.votaciones.get(id);
      if (!v) throw new Error(`La pregunta ${p.id} usa la votación ${id}, que no está en los datos`);
      const leyes = (v._propio?.idLeyes ?? []).map((idLey) => i.leyes.get(idLey)?.numeroLey);
      if (!leyes.includes(p.numeroLey)) throw new Error(`La votación ${id} de la pregunta ${p.id} no es de la ley ${p.numeroLey}`);
      const camara = valor(v.tramitacion?.camaraTramite);
      if (!camara || camaras.has(camara)) throw new Error(`La pregunta ${p.id} tiene más de una votación de ${camara ?? "una cámara sin nombre"}`);
      camaras.add(camara);
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
      basico: Boolean(p.basico),
      votoAFavor: p.votoAFavor,
      numeroLey: p.numeroLey,
      ley: rutas.ley(p.numeroLey),
      tema: temasPorId.get(p.tema),
      votaciones,
    };
  });

  const n = preguntas.length;
  const cadena = () => Array(n).fill(POSICION.noCorresponde);

  // Partidos (unificados): letras por cámara de cada pregunta, combinadas después.
  const partidos = new Map();
  // Bancadas: por cámara y texto oficial.
  const bancadas = new Map();
  preguntas.forEach((p, k) => {
    for (const v of p.votaciones) {
      const m = mayorias.get(v.id);
      for (const [texto, mayoria] of m.partido) {
        const u = partidoUnificado(texto);
        if (!partidos.has(u.id)) {
          partidos.set(u.id, { id: u.id, nombre: u.nombre, sigla: siglaDe(texto), conocido: nombreConocido(texto), letras: preguntas.map(() => []) });
        }
        const posicion = posicionDe(mayoria);
        partidos.get(u.id).letras[k].push(posicion ? letraDe(posicion, p.votoAFavor) : POSICION.sinMayoria);
      }
      for (const [texto, mayoria] of m.bancada) {
        const clave = `${v.camara}|${texto}`;
        if (!bancadas.has(clave)) bancadas.set(clave, { nombre: texto, camara: v.camara, posiciones: cadena() });
        const posicion = posicionDe(mayoria);
        bancadas.get(clave).posiciones[k] = posicion ? letraDe(posicion, p.votoAFavor) : POSICION.sinMayoria;
      }
    }
  });

  // Legisladores: su voto en la votación de su cámara.
  const slugs = new Map(
    personas().flatMap((x) => x.legisladores.filter((r) => r.periodoLegislativo === periodo).map((r) => [r.idLegislador, x.slug])),
  );
  const legisladores = new Map();
  preguntas.forEach((p, k) => {
    for (const v of p.votaciones) {
      for (const voto of i.votos.get(v.id) ?? []) {
        const id = Number(voto.idLegislador);
        const l = i.legisladores.get(id);
        if (!legisladores.has(id)) {
          const slug = slugs.get(id);
          legisladores.set(id, {
            nombre: (l && nombreDe(l)) ?? `Legislador ${id}`,
            sigla: l ? siglaDe(l.partidoPolitico) : null,
            camara: valor(l?.camaraParlamentario) ?? v.camara,
            ficha: slug ? rutas.legislador(slug) : null,
            posiciones: cadena(),
          });
        }
        legisladores.get(id).posiciones[k] = letraDe(voto.sentidoVotacion, p.votoAFavor);
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
    bancadas: [...bancadas.values()]
      .map((b) => ({ ...b, posiciones: b.posiciones.join("") }))
      .sort((a, b) => posicionCamara(a.camara) - posicionCamara(b.camara) || porTexto(a.nombre, b.nombre)),
    legisladores: [...legisladores.values()]
      .map((l) => ({ ...l, posiciones: l.posiciones.join("") }))
      .sort((a, b) => porTexto(a.nombre, b.nombre)),
  };
  cache.set(periodo, datos);
  return datos;
}
