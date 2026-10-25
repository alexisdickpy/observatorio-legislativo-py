// Pruebas del test de afinidad (lib/afinidad.js y lib/testAfinidad.js, #63).
import assert from "node:assert/strict";
import { test } from "node:test";

import { calcularAfinidad, coincidenciaDe, MINIMO_COMPARADAS, POSICION, preguntasDelModo } from "../../src/lib/afinidad.js";
import { fuente, leerJson } from "../../src/lib/datos.js";
import { mayoriaDe } from "../../src/lib/mayoria.js";
import { partidoUnificado } from "../../src/lib/partidos.js";
import { datosDelTest, letraDe, posicionCombinada } from "../../src/lib/testAfinidad.js";

const PERIODO = "2023-2028";
const { favor: F, contra: C, abstencion: A, noVota: N, ausente: U, sinMayoria: E, dividido: D, noCorresponde: X } = POSICION;

test("coincidencia: Sin posición no cuenta, abstención y ausencias quedan sin comparar, otra cámara no figura", () => {
  const respuestas = ["favor", "contra", "favor", "sin", "favor", "contra", undefined, "favor"];
  const c = coincidenciaDe([F, F, C, F, A, U, F, X].join(""), respuestas, [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual([c.coinciden, c.comparadas, c.sinComparar, c.suficiente], [1, 3, 2, false]);
  assert.equal(c.texto, "1 de 3");
  // Las preguntas fuera del modo no cuentan.
  assert.equal(coincidenciaDe("FFFF", ["favor", "favor", "favor", "favor"], [0, 1]).comparadas, 2);
});

test("coincidencia: porcentaje solo con el mínimo de preguntas comparadas", () => {
  const n = MINIMO_COMPARADAS;
  const c = coincidenciaDe(F.repeat(n - 1) + C, Array(n).fill("favor"), [...Array(n).keys()]);
  assert.equal(c.suficiente, true);
  assert.equal(c.porcentaje, (n - 1) / n);
  assert.match(c.texto, new RegExp(`^${n - 1} de ${n} \\(\\d+ ?%\\)$`));
});

test("resultado: orden por coincidencia, los que no alcanzan el mínimo al final y sin los que no se comparan", () => {
  const datos = {
    preguntas: [{ basico: true }, { basico: true }, { basico: true }, { basico: true }, { basico: false }],
    partidos: [
      { nombre: "B", posiciones: "FFFCF" },
      { nombre: "A", posiciones: "FFFFC" },
      { nombre: "C", posiciones: "FF--F" },
      { nombre: "D", posiciones: "AAAAA" },
    ],
    bancadas: [],
    legisladores: [],
  };
  const r = calcularAfinidad(datos, ["favor", "favor", "favor", "favor", "favor"], "basico");
  assert.deepEqual(r.indices, [0, 1, 2, 3]);
  assert.equal(r.respondidas, 4);
  assert.deepEqual(r.partidos.map((x) => [x.nombre, x.c.texto]), [["A", "4 de 4 (100%)"], ["B", "3 de 4 (75%)"], ["C", "2 de 2"]]);
  const avanzado = calcularAfinidad(datos, ["favor", "favor", "favor", "favor", "favor"], "avanzado");
  // A y B empatan en 4 de 5: van por nombre.
  assert.deepEqual(avanzado.partidos.map((x) => x.nombre), ["A", "B", "C"]);
  assert.deepEqual(preguntasDelModo(datos.preguntas, "avanzado"), [0, 1, 2, 3, 4]);
});

test("letras de votos y mayorías, y posición combinada de un partido en las dos cámaras", () => {
  assert.equal(letraDe("SI", "SI"), F);
  assert.equal(letraDe("NO", "SI"), C);
  assert.equal(letraDe("SI", "NO"), C);
  assert.equal(letraDe("ABSTENCIÓN/BLANCO", "SI"), A);
  assert.equal(letraDe("NO VOTA", "SI"), N);
  assert.equal(letraDe("AUSENTE", "SI"), U);
  assert.equal(letraDe("MOCIÓN 1", "SI"), E);
  assert.equal(posicionCombinada([F, F]), F);
  assert.equal(posicionCombinada([F, E]), F);
  assert.equal(posicionCombinada([F, C]), D);
  assert.equal(posicionCombinada([E]), E);
  assert.equal(posicionCombinada([]), X);
});

test("preguntas del archivo: 24, 12 básicas, votaciones existentes de su ley y una por cámara", () => {
  const archivo = leerJson("propios/test-afinidad.json");
  const datos = datosDelTest(PERIODO);
  assert.equal(datos.preguntas.length, 24);
  assert.equal(datos.preguntas.filter((p) => p.basico).length, 12);
  assert.equal(datos.preliminar, archivo.estado === "preliminar");
  for (const p of datos.preguntas) {
    assert.match(p.pregunta, /^¿.+\?$/, `La pregunta ${p.id} no tiene forma de pregunta`);
    assert.equal(new Set(p.votaciones.map((v) => v.camara)).size, p.votaciones.length);
  }
  // Cada cadena tiene una letra por pregunta.
  for (const x of [...datos.partidos, ...datos.bancadas, ...datos.legisladores]) assert.equal(x.posiciones.length, 24);
});

test("recuento a mano de un legislador y de un partido en una pregunta", () => {
  const datos = datosDelTest(PERIODO);
  const k = datos.preguntas.findIndex((p) => p.id === "alimentacion-escolar");
  const id = datos.preguntas[k].votaciones[0].id;
  const votos = fuente(PERIODO, "votos.csv").filter((v) => Number(v.idVotacion) === id);
  const legisladores = new Map(fuente(PERIODO, "legisladores.json").map((l) => [l.idLegislador, l]));
  // Legislador: su voto oficial.
  const unVoto = votos.find((v) => v.sentidoVotacion === "NO");
  const l = legisladores.get(Number(unVoto.idLegislador));
  const fila = datos.legisladores.find((x) => x.nombre === `${l.nombres} ${l.apellidos}`);
  assert.equal(fila.posiciones[k], C);
  // Partido: la mayoría de sus votos emitidos en esa votación (es de una sola cámara).
  for (const partido of datos.partidos) {
    const sentidos = votos
      .filter((v) => partidoUnificado(legisladores.get(Number(v.idLegislador))?.partidoPolitico)?.id === partido.id)
      .map((v) => v.sentidoVotacion);
    if (!sentidos.length) {
      assert.equal(partido.posiciones[k], X);
      continue;
    }
    const { mayoria } = mayoriaDe(sentidos);
    assert.equal(partido.posiciones[k], mayoria ? letraDe(mayoria, "SI") : E, partido.nombre);
  }
});
