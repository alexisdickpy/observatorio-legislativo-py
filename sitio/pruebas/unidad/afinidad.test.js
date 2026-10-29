// Pruebas del test de afinidad (lib/afinidad.js y lib/testAfinidad.js, #63).
import assert from "node:assert/strict";
import { test } from "node:test";

import { calcularAfinidad, coincidenciaDe, MINIMO_COMPARADAS, POSICION } from "../../src/lib/afinidad.js";
import { fuente, leerJson } from "../../src/lib/datos.js";
import { mayoriaDe } from "../../src/lib/mayoria.js";
import { partidoUnificado } from "../../src/lib/partidos.js";
import { datosDelTest, letraDe, posicionCombinada } from "../../src/lib/testAfinidad.js";

const PERIODO = "2023-2028";
const { favor: F, contra: C, sinMayoria: E, dividido: D, noCorresponde: X } = POSICION;

test("coincidencia: Sin posición no cuenta, sin mayoría y cámaras distintas quedan sin comparar", () => {
  const respuestas = ["favor", "contra", "favor", "sin", "favor", "contra", undefined, "favor"];
  const c = coincidenciaDe([F, F, C, F, E, D, F, X].join(""), respuestas, [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual([c.coinciden, c.comparadas, c.sinComparar, c.suficiente], [1, 3, 2, false]);
  assert.equal(c.texto, "1 de 3");
  // Las preguntas fuera de la lista no cuentan.
  assert.equal(coincidenciaDe("FFFF", ["favor", "favor", "favor", "favor"], [0, 1]).comparadas, 2);
});

test("coincidencia: porcentaje solo con el mínimo de preguntas comparadas", () => {
  const n = MINIMO_COMPARADAS;
  const c = coincidenciaDe(F.repeat(n - 1) + C, Array(n).fill("favor"), [...Array(n).keys()]);
  assert.equal(c.suficiente, true);
  assert.equal(c.porcentaje, (n - 1) / n);
  assert.match(c.texto, new RegExp(`^${n - 1} de ${n} \\(\\d+%\\)$`));
});

test("resultado: orden por coincidencia, los que no alcanzan el mínimo al final y sin los que no se comparan", () => {
  const datos = {
    preguntas: [{}, {}, {}, {}, {}],
    partidos: [
      { nombre: "B", posiciones: "FFFCC" },
      { nombre: "A", posiciones: "FFFFC" },
      { nombre: "C", posiciones: "FF---" },
      { nombre: "D", posiciones: "EEEEE" },
    ],
  };
  const r = calcularAfinidad(datos, ["favor", "favor", "favor", "favor", "sin"]);
  assert.equal(r.respondidas, 4);
  assert.deepEqual(r.partidos.map((x) => [x.nombre, x.c.texto]), [["A", "4 de 4 (100%)"], ["B", "3 de 4 (75%)"], ["C", "2 de 2"]]);
  // A igual porcentaje, por nombre.
  const empate = calcularAfinidad({ preguntas: datos.preguntas, partidos: [datos.partidos[0], { nombre: "Z", posiciones: "FFFCC" }] }, ["favor", "favor", "favor", "favor"]);
  assert.deepEqual(empate.partidos.map((x) => x.nombre), ["B", "Z"]);
});

test("letras de las mayorías y posición combinada de un partido en las dos cámaras", () => {
  assert.equal(letraDe("SI", "SI"), F);
  assert.equal(letraDe("NO", "SI"), C);
  assert.equal(letraDe("SI", "NO"), C);
  assert.equal(letraDe("ABSTENCIÓN/BLANCO", "SI"), E);
  assert.equal(letraDe("MOCIÓN 1", "SI"), E);
  assert.equal(posicionCombinada([F, F]), F);
  assert.equal(posicionCombinada([F, E]), F);
  assert.equal(posicionCombinada([F, C]), D);
  assert.equal(posicionCombinada([E]), E);
  assert.equal(posicionCombinada([]), X);
});

test("preguntas del archivo: 12, cortas, con enlace al proyecto, votaciones de su ley y una por cámara", () => {
  const archivo = leerJson("propios/test-afinidad.json");
  const datos = datosDelTest(PERIODO);
  assert.equal(datos.preguntas.length, 12);
  assert.equal(datos.preliminar, archivo.estado === "preliminar");
  const porTema = new Map();
  for (const p of datos.preguntas) {
    assert.match(p.pregunta, /^¿.+\?$/, `La pregunta ${p.id} no tiene forma de pregunta`);
    assert.ok(p.pregunta.length <= 140, `La pregunta ${p.id} es larga`);
    assert.ok(!p.explicacion || p.explicacion.length <= 260, `La explicación de ${p.id} es larga`);
    assert.match(p.proyecto ?? "", /^https:\/\/silpy\.congreso\.gov\.py\//, `Falta el enlace al proyecto de ${p.id}`);
    assert.equal(new Set(p.votaciones.map((v) => v.camara)).size, p.votaciones.length);
    porTema.set(p.tema.id, (porTema.get(p.tema.id) ?? 0) + 1);
  }
  assert.ok([...porTema.values()].every((n) => n <= 3), "Ningún tema con más de 3 preguntas");
  for (const x of datos.partidos) assert.equal(x.posiciones.length, 12);
});

test("criterios de selección (#64): votaciones divididas sobre la ley, publicado y fuentes de cada explicación", () => {
  const archivo = leerJson("propios/test-afinidad.json");
  assert.equal(archivo.estado, "publicado");
  const votaciones = new Map(fuente(PERIODO, "votaciones.json").map((v) => [v.idVotacion, v]));
  // Votaciones en las que SI y NO no son a favor o en contra de la ley: entre versiones o mociones, sobre
  // un veto, un artículo o las modificaciones de la otra cámara.
  const noSobreLaLey = /versi[oó]n|moci[oó]n|objeci[oó]n|veto|art[ií]culo \d|modificaciones introducidas|postergaci[oó]n/i;
  for (const p of archivo.preguntas) {
    for (const id of p.votaciones) {
      const v = votaciones.get(id);
      assert.ok(!noSobreLaLey.test(`${v.descripcion} ${v.observacion ?? ""}`), `La votación ${id} de ${p.id} no es sobre la ley en general`);
      const { totalSI: si, totalNO: no } = v;
      assert.ok(si > no, `En la votación ${id} de ${p.id} no ganó el SI`);
      assert.ok(si / (si + no) <= 0.9 || p.justificacion, `La votación ${id} de ${p.id} supera el 90 % sin justificación`);
    }
    if (p.explicacion) assert.ok(p.fuentes.length > 0, `La explicación de ${p.id} no tiene fuentes`);
    for (const f of p.fuentes) assert.match(f, /^https:\/\//);
  }
});

test("recuento a mano de la mayoría de cada partido en una pregunta", () => {
  const datos = datosDelTest(PERIODO);
  const k = datos.preguntas.findIndex((p) => p.id === "alimentacion-escolar");
  const id = datos.preguntas[k].votaciones[0].id;
  const votos = fuente(PERIODO, "votos.csv").filter((v) => Number(v.idVotacion) === id);
  const legisladores = new Map(fuente(PERIODO, "legisladores.json").map((l) => [l.idLegislador, l]));
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
  // En esa votación de Diputados, la ANR votó SI y el PLRA NO.
  const sigla = (s) => datos.partidos.find((x) => x.sigla === s).posiciones[k];
  assert.deepEqual([sigla("ANR"), sigla("PLRA")], [F, C]);
});
