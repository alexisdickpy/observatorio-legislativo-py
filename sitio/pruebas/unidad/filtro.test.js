// Pruebas del filtro del catálogo con casos reales de datos/.
import assert from "node:assert/strict";
import { test } from "node:test";

import { leyes, opcionesDeFiltro } from "../../src/lib/catalogo.js";
import { escribirFiltros, filtrar, leerFiltros, ORDEN_PREDETERMINADO } from "../../src/lib/filtro.js";
import { parametrosCatalogo as nombres } from "../../src/lib/rutas.js";
import { normalizar, slug } from "../../src/lib/texto.js";
import { estado, periodos } from "../../src/lib/datos.js";

const entradas = () => leyes().map((l) => l.filtro);
const buscar = (cambios) =>
  filtrar(entradas(), { texto: "", anio: "", camara: "", orden: ORDEN_PREDETERMINADO, ...cambios }).map(
    (e) => e.numero,
  );

test("una entrada por número de ley, igual a la cantidad de estado.json", () => {
  const esperado = periodos().reduce((s, p) => s + estado().periodos[p.id].cantidades.numerosDeLey, 0);
  assert.equal(leyes().length, esperado);
  assert.equal(new Set(leyes().map((l) => l.numero)).size, esperado);
});

test("los números con varios registros se agrupan y conservan todos los títulos", () => {
  const ley = leyes().find((l) => l.numero === "7081");
  assert.equal(ley.registros.length, 3);
  assert.equal(ley.titulos.length, 3);
  assert.deepEqual(ley.fechasSancion, ["09/08/2023"]);
});

test("valores oficiales sin cambios", () => {
  const ley = leyes().find((l) => l.numero === "7076");
  assert.deepEqual(ley.fechasSancion, ["12/07/2023"]);
  assert.deepEqual(ley.camaras, ["CAMARA DE SENADORES"]);
  assert.ok(ley.titulos[0].startsWith("Proyecto de Ley"));
});

test("búsqueda por número: la ley exacta va primero", () => {
  assert.equal(buscar({ texto: "7076" })[0], "7076");
  assert.equal(buscar({ texto: "Ley 7081" })[0], "7081");
  assert.equal(buscar({ texto: "ley n° 7081" })[0], "7081");
});

test("búsqueda por palabras del título, sin distinguir mayúsculas ni acentos", () => {
  const conAcento = buscar({ texto: "aeródromo villarrica" });
  const sinAcento = buscar({ texto: "AERODROMO Villarrica" });
  assert.ok(conAcento.includes("7076"));
  assert.deepEqual(conAcento, sinAcento);
  // Todas las palabras deben aparecer.
  for (const numero of buscar({ texto: "conscriptos indemnizacion" })) {
    const t = normalizar(leyes().find((l) => l.numero === numero).titulos.join(" "));
    assert.ok(t.includes("conscriptos") && t.includes("indemnizacion"));
  }
  assert.ok(buscar({ texto: "conscriptos indemnizacion" }).includes("7081"));
  assert.deepEqual(buscar({ texto: "palabrainexistentexyz" }), []);
});

test("filtro por año de sanción y por cámara de origen", () => {
  const de2023 = buscar({ anio: "2023" });
  assert.ok(de2023.length > 0);
  for (const n of de2023) assert.ok(leyes().find((l) => l.numero === n).fechaOrden.startsWith("2023"));
  const diputados = slug("CAMARA DE DIPUTADOS");
  const deDiputados = buscar({ camara: diputados });
  assert.ok(deDiputados.length > 0 && deDiputados.length < leyes().length);
  for (const n of deDiputados) assert.ok(leyes().find((l) => l.numero === n).camaras.includes("CAMARA DE DIPUTADOS"));
  const opciones = opcionesDeFiltro();
  assert.ok(opciones.anios.includes("2023"));
  assert.ok(opciones.camaras.some((c) => c.valor === diputados));
});

test("filtro por tema: clasificación propia, una ley puede tener más de un tema", () => {
  assert.deepEqual(leyes().find((l) => l.numero === "7076").filtro.temas, ["inmuebles"]);
  const ley7081 = leyes().find((l) => l.numero === "7081");
  assert.ok(ley7081.filtro.temas.includes("seguridad"));
  assert.ok(buscar({ tema: "seguridad" }).includes("7081"));
  assert.ok(!buscar({ tema: "seguridad" }).includes("7076"));
  for (const n of buscar({ tema: "salud" })) assert.ok(leyes().find((l) => l.numero === n).filtro.temas.includes("salud"));
  // Cada ley tiene al menos un tema o figura como pendiente; las opciones cuentan sus leyes.
  for (const l of leyes()) assert.ok(l.filtro.temas.length > 0, l.numero);
  const { temas } = opcionesDeFiltro();
  for (const t of temas) assert.equal(t.total, buscar({ tema: t.valor }).length, t.valor);
});

test("orden por fecha de sanción y por número", () => {
  const fechas = buscar({}).map((n) => leyes().find((l) => l.numero === n).fechaOrden);
  assert.deepEqual(fechas, [...fechas].sort().reverse());
  const asc = buscar({ orden: "numero-asc" }).map(Number);
  assert.deepEqual(asc, [...asc].sort((a, b) => a - b));
});

test("los filtros se leen y se escriben en la dirección", () => {
  const p = new URLSearchParams("q=salud&anio=2024&camara=camara-de-senadores&tema=salud&orden=numero-asc");
  const f = leerFiltros(p, nombres);
  assert.deepEqual(f, { texto: "salud", anio: "2024", camara: "camara-de-senadores", tema: "salud", orden: "numero-asc" });
  assert.equal(escribirFiltros(f, nombres).toString(), p.toString());
  // Valores vacíos y orden predeterminado no ensucian la dirección; un orden desconocido se ignora.
  assert.equal(escribirFiltros(leerFiltros(new URLSearchParams("orden=otro"), nombres), nombres).toString(), "");
});

test("cuadro de leyes por tema: cuenta las leyes de cada tema y los proyectos votados sin ley", async () => {
  const { resumenPorTema } = await import("../../src/lib/resumenTemas.js");
  const vigente = periodos().find((p) => p.vigente).id;
  const cuadros = resumenPorTema(vigente);
  for (const c of cuadros) assert.equal(c.leyes, buscar({ tema: c.id }).length, c.id);
  for (let n = 1; n < cuadros.length; n++) assert.ok(cuadros[n - 1].leyes >= cuadros[n].leyes);
  // Los proyectos votados sin ley con algún tema suman al menos los 238 de la clasificación.
  const sinLey = cuadros.reduce((s, c) => s + c.archivados + c.enTramite + c.otros, 0);
  assert.ok(sinLey >= 238, String(sinLey));
  assert.ok(cuadros.find((c) => c.id === "deporte").archivados >= 0);
});
