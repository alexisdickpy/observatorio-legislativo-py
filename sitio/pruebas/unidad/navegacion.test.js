// Pruebas del menú principal y de la vista previa de análisis de la portada (lib/navegacion.js y
// lib/portada.js).
import assert from "node:assert/strict";
import { test } from "node:test";

import { coincidencia } from "../../src/lib/coincidencia.js";
import { comparativa } from "../../src/lib/legisladores.js";
import { entradaActual, menuPrincipal, vistasDeAnalisis } from "../../src/lib/navegacion.js";
import { barrasDeReferencia, paresConPorcentaje, vistaPrevia } from "../../src/lib/portada.js";
import * as rutas from "../../src/lib/rutas.js";
import { CANTIDAD_ULTIMAS_PORTADA, votacionesDelPeriodo } from "../../src/lib/votaciones.js";
import { CANTIDAD_PORTADA, votosDistintosAlPartido } from "../../src/lib/votosDistintos.js";

const PERIODO = "2023-2028";

test("el menú tiene una entrada por cada vista de análisis, con direcciones de lib/rutas.js", () => {
  const urls = menuPrincipal().map((e) => e.url);
  for (const v of vistasDeAnalisis()) assert.ok(urls.includes(v.url), `Falta ${v.url} en el menú`);
  assert.deepEqual(
    menuPrincipal().map((e) => e.texto),
    ["Leyes", "Legisladores", "Votaciones", "Partidos", "Rankings", "Votos distintos", "Buscar", "Datos abiertos"],
  );
  assert.ok(urls.includes(rutas.coincidencia()) && urls.includes(rutas.votacionesNominales()));
  assert.equal(new Set(urls).size, urls.length, "Direcciones repetidas en el menú");
  // La tabla de votaciones nominales está en el menú pero no en la portada.
  assert.deepEqual(
    vistasDeAnalisis()
      .filter((v) => v.portada === false)
      .map((v) => v.clave),
    ["votacionesNominales"],
  );
});

test("la entrada actual es la de ruta más larga que contiene la dirección", () => {
  const menu = menuPrincipal();
  assert.equal(entradaActual(menu, rutas.votacionesNominales()).texto, "Rankings");
  assert.equal(entradaActual(menu, rutas.legisladores()).texto, "Legisladores");
  assert.equal(entradaActual(menu, rutas.legislador("alguien")).texto, "Legisladores");
  assert.equal(entradaActual(menu, rutas.coincidencia()).texto, "Partidos");
  assert.equal(entradaActual(menu, rutas.votosDistintosAlPartido()).texto, "Votos distintos");
  assert.equal(entradaActual(menu, rutas.votaciones()).texto, "Votaciones");
  assert.equal(entradaActual(menu, rutas.votaciones("2025")).texto, "Votaciones");
  assert.equal(entradaActual(menu, rutas.inicio()), undefined);
});

test("pares de partidos con porcentaje, de mayor a menor, sin la diagonal ni los repetidos", () => {
  const celda = (cantidad, total) => ({ cantidad, total, porcentaje: cantidad / total, suficiente: total >= 20 });
  const cuadro = {
    filas: [
      { nombre: "A", celdas: [null, celda(18, 20), celda(30, 40)] },
      { nombre: "B", celdas: [celda(18, 20), null, celda(5, 10)] },
      { nombre: "C", celdas: [celda(30, 40), celda(5, 10), null] },
    ],
  };
  const pares = paresConPorcentaje(cuadro);
  assert.deepEqual(
    pares.map((p) => `${p.a}-${p.b}`),
    ["A-B", "A-C"],
  );
});

test("barras del gráfico: coincidencia con el partido de la primera fila, primero las que tienen porcentaje", () => {
  const celda = (cantidad, total) => ({ cantidad, total, porcentaje: cantidad / total, suficiente: total >= 20 });
  const cuadro = {
    filas: [
      { nombre: "A", celdas: [null, celda(5, 10), celda(30, 40), celda(18, 20), celda(0, 0)] },
      { nombre: "B", celdas: [] },
      { nombre: "C", celdas: [] },
      { nombre: "D", celdas: [] },
      { nombre: "E", celdas: [] },
    ],
  };
  const { referencia, barras } = barrasDeReferencia(cuadro);
  assert.equal(referencia, "A");
  assert.deepEqual(
    barras.map((b) => b.nombre),
    ["D", "C", "B"],
  );
  assert.deepEqual(barrasDeReferencia({ filas: [] }), { referencia: null, barras: [] });
  assert.deepEqual(barrasDeReferencia(cuadro, "otro"), { referencia: null, barras: [] });
});

test("vista previa: un gráfico por partido elegible en cada cámara, empezando por el de más legisladores", () => {
  const previa = vistaPrevia(PERIODO);
  const c = coincidencia(PERIODO);
  assert.deepEqual(
    previa.partidos.map((p) => p.id),
    c.partidos.map((p) => p.id),
  );
  assert.match(previa.partidos[0].nombre, /Asociación Nacional Republicana/);
  for (const camara of previa.coincidencia) {
    assert.deepEqual(
      camara.graficos.map((g) => g.id),
      previa.partidos.map((p) => p.id),
    );
    const cuadro = c.cuadros.find((x) => x.camara === camara.camara);
    for (const g of camara.graficos) {
      const fila = cuadro.filas.find((f) => f.id === g.id);
      assert.equal(g.referencia, fila?.nombre ?? null);
      for (const b of g.barras) {
        const celda = fila.celdas[cuadro.filas.findIndex((f) => f.nombre === b.nombre)];
        assert.equal(b.cantidad, celda.cantidad);
        assert.equal(b.total, celda.total);
      }
    }
  }
});

test("vista previa por cámara, con las mismas cifras que las páginas de cada vista", () => {
  const previa = vistaPrevia(PERIODO);
  const c = coincidencia(PERIODO);
  assert.equal(previa.coincidencia.length, c.cuadros.length);
  for (const p of previa.coincidencia) {
    assert.equal(p.votaciones, c.camaras.find((x) => x.camara === p.camara).votaciones);
    assert.ok(p.mayor && p.menor, `Sin pares en ${p.camara}`);
    assert.ok(p.mayor.porcentaje >= p.menor.porcentaje);
    assert.ok(p.mayor.suficiente && p.menor.suficiente);
  }
  const comp = comparativa(PERIODO);
  for (const x of comp.camaras) {
    // Ningún legislador figura en más votaciones nominales que las de su cámara, y alguno figura en todas o casi.
    const maximo = Math.max(...x.filas.map((f) => f.ausencias.total));
    assert.ok(maximo <= x.votaciones && maximo > 0, `${x.camara}, ${maximo} de ${x.votaciones}`);
  }
});

test("vista previa de votos distintos: los primeros del cuadro de cada cámara, en el mismo orden", () => {
  const previa = vistaPrevia(PERIODO);
  const cuadro = votosDistintosAlPartido(PERIODO);
  assert.equal(previa.votosDistintos.length, cuadro.camaras.length);
  for (const [i, c] of previa.votosDistintos.entries()) {
    assert.equal(c.camara, cuadro.camaras[i].camara);
    assert.equal(c.filas.length, CANTIDAD_PORTADA);
    assert.deepEqual(
      c.filas.map((f) => f.slug),
      cuadro.camaras[i].filas.slice(0, CANTIDAD_PORTADA).map((f) => f.slug),
    );
  }
});

test("vista previa de votaciones: las más recientes de las dos cámaras, al final de la portada", () => {
  const previa = vistaPrevia(PERIODO);
  const { votaciones } = votacionesDelPeriodo(PERIODO);
  assert.deepEqual(
    previa.votaciones.map((v) => v.id),
    votaciones.slice(0, CANTIDAD_ULTIMAS_PORTADA).map((v) => v.id),
  );
  assert.equal(previa.votaciones.length, CANTIDAD_ULTIMAS_PORTADA);
  assert.ok(previa.votaciones.every((v) => v.fechaIso >= votaciones[CANTIDAD_ULTIMAS_PORTADA].fechaIso));
  assert.deepEqual(
    vistasDeAnalisis()
      .filter((v) => v.portadaAlFinal)
      .map((v) => v.clave),
    ["votaciones"],
  );
});
