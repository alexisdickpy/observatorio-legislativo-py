// Pruebas del mapa de diputados por departamento (#65) con los datos reales de datos/.
import assert from "node:assert/strict";
import { test } from "node:test";

import contorno from "../../src/mapa/departamentos.json" with { type: "json" };
import { listado } from "../../src/lib/legisladores.js";
import { agruparPorDepartamento, CAMARA_DIPUTADOS, CORRESPONDENCIA, mapaDeDiputados, nivelDe, zonaDe } from "../../src/lib/mapa.js";

const PERIODO = "2023-2028";
const diputados = () => listado(PERIODO).enEjercicio.filter((f) => f.camara === CAMARA_DIPUTADOS);

test("el contorno tiene los 17 departamentos y Asunción, y cada código de la correspondencia existe", () => {
  const codigos = new Set(contorno.zonas.map((z) => z.codigo));
  assert.equal(codigos.size, 18);
  for (const codigo of Object.values(CORRESPONDENCIA)) assert.ok(codigos.has(codigo), codigo);
  for (const z of contorno.zonas) assert.match(z.ruta, /^M[\d. LMZ]+Z$/, z.codigo);
});

test("cada departamento de los diputados en ejercicio tiene su zona en el mapa", () => {
  for (const d of new Set(diputados().map((f) => f.departamento))) assert.ok(zonaDe(d), `Sin zona para ${d}`);
});

test("la suma del mapa es el total de diputados en ejercicio, sin senadores ni quienes ya no ejercen", () => {
  const m = mapaDeDiputados(PERIODO);
  assert.equal(m.total, diputados().length);
  assert.equal(m.zonas.reduce((s, z) => s + z.cantidad, 0) + m.sinZona.reduce((s, g) => s + g.diputados.length, 0), m.total);
  assert.equal(m.zonas.length, 18);
  assert.ok(m.zonas.every((z) => z.diputados.every((d) => d.url.startsWith("/legisladores/"))));
  assert.equal(m.zonas.find((z) => z.codigo === "PY-ASU").oficialDistinto[0], "CAPITAL");
});

test("textos oficiales con y sin tildes o abreviados; los desconocidos quedan aparte", () => {
  assert.equal(zonaDe("CONCEPCION"), "PY-1");
  assert.equal(zonaDe("Concepción"), "PY-1");
  assert.equal(zonaDe("PTE. HAYES"), "PY-15");
  assert.equal(zonaDe("ÑEEMBUCÚ"), "PY-12");
  assert.equal(zonaDe("NACIONAL"), null);
  const { porZona, sinZona } = agruparPorDepartamento([
    { departamento: "CAPITAL" },
    { departamento: "ALTO PARANÁ" },
    { departamento: "EXTRANJERO" },
    { departamento: null },
  ]);
  assert.deepEqual([...porZona.keys()].sort(), ["PY-10", "PY-ASU"]);
  assert.deepEqual([...sinZona.keys()], ["EXTRANJERO", "Sin dato"]);
});

test("el color depende solo de la cantidad", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 8, 9, 20].map(nivelDe), [0, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
});
