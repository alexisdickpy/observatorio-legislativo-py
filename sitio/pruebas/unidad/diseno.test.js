// Pruebas de lo que agregó el diseño definitivo (#80): hemiciclo, composición, colores de partido,
// nombres legibles y estadísticas.
import assert from "node:assert/strict";
import { test } from "node:test";
import { leyes } from "../../src/lib/catalogo.js";
import { estadisticas } from "../../src/lib/estadisticas.js";
import { ALTO, ANCHO, asientos } from "../../src/lib/hemiciclo.js";
import { clasePartido } from "../../src/lib/partidos.js";
import { composicion, votacionDestacada } from "../../src/lib/portada.js";
import { legible } from "../../src/lib/texto.js";
import { votacionesDelPeriodo } from "../../src/lib/votaciones.js";

const PERIODO = "2023-2028";

test("hemiciclo: un punto por legislador, todos dentro del dibujo y sin solaparse", () => {
  for (const n of [1, 3, 45, 47, 80, 125]) {
    const { r, puntos } = asientos(n);
    assert.equal(puntos.length, n);
    for (const p of puntos) {
      assert.ok(p.x - r >= 0 && p.x + r <= ANCHO && p.y - r >= 0 && p.y + r <= ALTO, `${n}: ${p.x},${p.y} r=${r}`);
    }
    for (let i = 0; i < puntos.length; i++) {
      for (let j = i + 1; j < puntos.length; j++) {
        assert.ok(Math.hypot(puntos[i].x - puntos[j].x, puntos[i].y - puntos[j].y) >= 2 * r, `${n}: se solapan ${i} y ${j}`);
      }
    }
  }
});

test("composición: 45 senadores sin los vitalicios y 80 diputados", () => {
  const [senado, diputados] = composicion(PERIODO);
  assert.equal(senado.total, 45);
  assert.equal(senado.asientos.length, 45);
  assert.equal(diputados.total, 80);
  assert.equal(diputados.asientos.length, 80);
  assert.equal(senado.partidos.reduce((a, p) => a + p.cantidad, 0), 45);
});

test("colores: cada partido conocido tiene su clase y lo demás queda neutro", () => {
  assert.equal(clasePartido("Asociación Nacional Republicana ANR"), "partido-anr");
  assert.equal(clasePartido("CRUZADA NACIONAL"), "partido-cn");
  assert.equal(clasePartido("Partido Cruzada Nacional"), "partido-cn");
  assert.equal(clasePartido("INDEPENDIENTE"), "partido-otro");
  assert.equal(clasePartido("Movimiento Conciencia Democrática Nacional (Yo Creo)"), "partido-yo-creo");
  assert.equal(clasePartido(null), "partido-otro");
});

test("nombres legibles: solo cambia los textos todo en mayúsculas y no toca las letras", () => {
  assert.equal(legible("CRUZADA NACIONAL"), "Cruzada Nacional");
  assert.equal(legible('PARTIDO LIBERAL RADICAL AUTENTICO (PLRA) "B"'), 'Partido Liberal Radical Autentico (PLRA) "B"');
  assert.equal(legible("BANCADA DE LA ASOCIACIÓN NACIONAL REPUBLICANA ANR - B"), "Bancada de la Asociación Nacional Republicana ANR - B");
  assert.equal(legible("Partido Cruzada Nacional"), "Partido Cruzada Nacional");
  assert.equal(legible(null), null);
});

test("la votación de la portada es siempre la más reciente, con un punto por voto", () => {
  const ultima = votacionesDelPeriodo(PERIODO).votaciones[0];
  const v = votacionDestacada(PERIODO);
  assert.equal(v.pagina, ultima.pagina);
  assert.equal(v.resultado, ultima.resultado);
  assert.equal(v.asientos.length, ultima.registrados);
});

test("estadísticas: los recuentos coinciden con los totales", () => {
  const e = estadisticas(PERIODO);
  assert.equal(e.leyes, leyes().length);
  assert.equal(e.leyesPorAnio.reduce((a, x) => a + x.cantidad, 0), e.leyes);
  assert.equal(e.iniciativas.reduce((a, x) => a + x.cantidad, 0), e.leyes);
  assert.equal(e.resultados.reduce((a, x) => a + x.cantidad, 0), e.votaciones);
  assert.equal(e.votacionesPorAnio.reduce((a, x) => a + x.total, 0), e.votaciones);
  assert.ok(e.autores.length > 0 && e.autores.every((x) => x.url));
});
