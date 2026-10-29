// Pruebas de las comisiones de cada legislador (#30), contra comisiones.json.
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  COMISIONES_ESPECIALES,
  comisionesDe,
  NOTA_COMISIONES_ESPECIALES,
  tipoBase,
  tipoLegible,
} from "../../src/lib/comisiones.js";
import { fuente } from "../../src/lib/datos.js";
import { legisladores } from "../../src/lib/legisladores.js";

const PERIODO = "2023-2028";
const registros = () => fuente(PERIODO, "comisiones.json");

test("tipo sin el agregado (A) ni espacios de más", () => {
  assert.equal(tipoBase("ESPECIAL  (A)"), "ESPECIAL");
  assert.equal(tipoLegible("FRENTE PARLAMENTARIO"), "Frente parlamentario");
  assert.equal(tipoLegible("BICAMERAL (A)"), "Bicameral");
  assert.equal(tipoLegible(""), null);
});

test("cada legislador tiene todas sus integraciones, agrupadas por período parlamentario", () => {
  const porLegislador = new Map();
  for (const c of registros()) porLegislador.set(c.idLegislador, (porLegislador.get(c.idLegislador) ?? 0) + 1);
  let conComisiones = 0;
  for (const persona of legisladores()) {
    const r = persona.registros.find((x) => x.periodo === PERIODO);
    const c = comisionesDe(r.id, PERIODO);
    assert.equal(c.total, porLegislador.get(r.id) ?? 0, persona.slug);
    const ids = c.periodos.map((p) => p.id);
    assert.deepEqual(ids, [...ids].sort((a, b) => b - a), persona.slug);
    for (const p of c.periodos) {
      assert.ok(p.nombre, persona.slug);
      const ordenes = p.comisiones.map((x) => x.orden);
      assert.deepEqual(ordenes, [...ordenes].sort((a, b) => a - b), persona.slug);
    }
    if (c.total) conComisiones += 1;
  }
  assert.ok(conComisiones > 100, `solo ${conComisiones} legisladores con comisiones`);
});

test("la entrada sin comisión especial identificada lleva su nota", () => {
  const registro = registros().find((c) => c.nombreComision === COMISIONES_ESPECIALES);
  assert.ok(registro, "no hay registros de COMISIONES ESPECIALES");
  const c = comisionesDe(registro.idLegislador, PERIODO);
  const especiales = c.periodos.flatMap((p) => p.comisiones).filter((x) => x.nombre === COMISIONES_ESPECIALES);
  assert.ok(especiales.length > 0);
  for (const x of especiales) assert.equal(x.nota, NOTA_COMISIONES_ESPECIALES);
  const otras = c.periodos.flatMap((p) => p.comisiones).filter((x) => x.nombre !== COMISIONES_ESPECIALES);
  for (const x of otras) assert.equal(x.nota, null);
});

test("registros con valores oficiales y sin datos de contacto", () => {
  for (const c of registros()) {
    assert.ok(Number.isInteger(c.idComision) && Number.isInteger(c.idLegislador) && Number.isInteger(c.idPeriodoParlamentario));
    assert.ok(c.appURL?.startsWith("https://silpy.congreso.gov.py/"), String(c.idComision));
    assert.equal(c.emailParlamentario, undefined);
  }
});
