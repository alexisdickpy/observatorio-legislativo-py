// Pruebas de los expedientes presentados de cada legislador (#27), contra expedientes.json.
import assert from "node:assert/strict";
import { test } from "node:test";

import { fuente } from "../../src/lib/datos.js";
import { expedientesDe, PROYECTO_DE_LEY } from "../../src/lib/expedientes.js";
import { conProyectosDeLey, ficha, legisladores } from "../../src/lib/legisladores.js";

const PERIODO = "2023-2028";
const registros = () => fuente(PERIODO, "expedientes.json");

test("los totales de cada legislador suman sus registros, por tipo oficial y en orden alfabético", () => {
  const porLegislador = new Map();
  for (const e of registros()) porLegislador.set(e.idLegislador, (porLegislador.get(e.idLegislador) ?? 0) + 1);
  for (const persona of legisladores()) {
    const r = persona.registros.find((x) => x.periodo === PERIODO);
    const e = expedientesDe(r.id, PERIODO);
    assert.equal(e.total, porLegislador.get(r.id) ?? 0, persona.slug);
    assert.equal(e.porTipo.reduce((s, t) => s + t.cantidad, 0), e.total, persona.slug);
    const tipos = e.porTipo.map((t) => t.tipo);
    assert.deepEqual(tipos, [...tipos].sort((a, b) => a.localeCompare(b, "es")), persona.slug);
  }
});

test("estados de los proyectos de ley con cantidad, total y porcentaje, sin fusionar categorías", () => {
  for (const persona of legisladores()) {
    const r = persona.registros[0];
    const { proyectosDeLey: p } = expedientesDe(r.id, r.periodo);
    assert.equal(p.lista.length, p.total);
    assert.equal(p.porEstado.reduce((s, x) => s + x.cantidad, 0), p.total);
    for (const x of p.porEstado) {
      assert.equal(x.total, p.total);
      assert.match(x.texto, /^\d+ de \d+ \(.+%\)$/);
    }
    const oficiales = new Set(registros().filter((e) => e.idLegislador === r.id && e.tipoProyecto === PROYECTO_DE_LEY).map((e) => e.estadoProyecto));
    assert.deepEqual(new Set(p.porEstado.map((x) => x.estado)), oficiales, persona.slug);
  }
});

test("la lista va del más reciente al más antiguo, con fechas del período y enlace a SILpy", () => {
  for (const persona of conProyectosDeLey()) {
    const { lista } = ficha(persona).bloques[0].expedientes.proyectosDeLey;
    for (let i = 1; i < lista.length; i++) assert.ok(lista[i - 1].fechaIso >= lista[i].fechaIso, persona.slug);
    for (const x of lista) {
      assert.ok(x.fechaIso >= "2023-07-01", `${persona.slug} ${x.id}`);
      assert.match(x.url, /^https:\/\/silpy\.congreso\.gov\.py\/expediente\/\d+$/);
    }
  }
});

test("los valores oficiales no cambian y un expediente con varios autores cuenta para cada uno", () => {
  const autores = new Map();
  for (const e of registros()) autores.set(e.idProyecto, (autores.get(e.idProyecto) ?? 0) + 1);
  assert.ok([...autores.values()].some((n) => n > 1));
  const e = registros().find((x) => x.tipoProyecto === PROYECTO_DE_LEY);
  const item = expedientesDe(e.idLegislador, PERIODO).proyectosDeLey.lista.find((x) => x.id === e.idProyecto);
  assert.equal(item.titulo, e.acapite);
  assert.equal(item.estado, e.estadoProyecto);
  assert.equal(item.fecha, e.fechaIngresoExpediente);
});
