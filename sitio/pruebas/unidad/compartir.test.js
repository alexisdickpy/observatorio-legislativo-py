// Pruebas de la página propia de cada votación y lo que se comparte (lib/compartir.js, rutas de #45).
import assert from "node:assert/strict";
import { test } from "node:test";

import { compartirVotacion, datosDeVotacion, FORMATOS, referenciaDe } from "../../src/lib/compartir.js";
import { estado } from "../../src/lib/datos.js";
import { detalleDeVotacion } from "../../src/lib/ficha.js";
import * as rutas from "../../src/lib/rutas.js";
import { votacionesDelPeriodo } from "../../src/lib/votaciones.js";

const PERIODO = "2023-2028";
const { votaciones } = votacionesDelPeriodo(PERIODO);
const conLey = votaciones.find((v) => v.leyes.length);
const sinLey = votaciones.find((v) => !v.leyes.length);

test("una página por votación, con el número oficial en la dirección", () => {
  assert.equal(rutas.votacion(109395), "/votacion/109395/");
  assert.equal(rutas.imagenVotacion(109395, "vertical"), "/votacion/109395/compartir-vertical.png");
  assert.equal(new Set(votaciones.map((v) => v.pagina)).size, votaciones.length);
  for (const v of votaciones) assert.equal(v.pagina, rutas.votacion(v.id));
});

test("referencia: el número de ley si llegó a serlo; si no, el expediente oficial", () => {
  assert.equal(referenciaDe(conLey), `Ley ${conLey.leyes[0].numero}`);
  assert.equal(referenciaDe(sinLey), `Expediente ${sinLey.proyecto.expediente}`);
});

test("textos neutrales con los valores oficiales y enlaces para compartir sin scripts", () => {
  for (const v of [conLey, sinLey]) {
    const c = compartirVotacion(v);
    for (const t of [c.titulo, c.texto, c.descripcion]) assert.ok(!/: /.test(t), t);
    assert.ok(c.texto.includes(v.resultado) && c.texto.includes(v.camara) && c.texto.includes(v.fecha), c.texto);
    for (const t of v.totales) assert.ok(c.texto.includes(`${t.categoria} ${t.cantidad}`), c.texto);
    assert.ok(c.descripcion.length <= 301);
    assert.equal(c.url, rutas.absoluta(v.pagina));
    assert.ok(c.enlaces.whatsapp.startsWith("https://wa.me/?text=") && c.enlaces.whatsapp.includes(encodeURIComponent(c.url)));
    assert.ok(c.enlaces.x.startsWith("https://x.com/intent/post?") && c.enlaces.x.includes(encodeURIComponent(c.url)));
    assert.equal(c.texto.length < 250, true, "El texto entra en un mensaje de X junto con el enlace");
  }
});

test("dos imágenes por votación, con la cita de la fuente y la fecha de actualización", () => {
  const c = compartirVotacion(conLey);
  assert.deepEqual(Object.keys(c.imagenes), Object.keys(FORMATOS));
  assert.equal(c.vistaPrevia.url, rutas.absoluta(rutas.imagenVotacion(conLey.id, "horizontal")));
  assert.deepEqual([c.vistaPrevia.ancho, c.vistaPrevia.alto], [1200, 630]);
  assert.ok(c.dibujo.pie.startsWith(estado().fuente.cita));
  assert.ok(c.dibujo.pie.includes("Actualizado el"));
  assert.equal(c.dibujo.resultado, conLey.resultado);
  assert.deepEqual(c.dibujo.totales.map((t) => t.cantidad), conLey.totales.map((t) => t.cantidad));
  const siglas = c.dibujo.partidos.flatMap((g) => g.siglas).sort();
  assert.deepEqual(siglas, conLey.partidos.map((p) => p.sigla).sort());
});

test("el detalle de la página es el mismo de la ficha de la ley", () => {
  const d = detalleDeVotacion(PERIODO, conLey.id);
  assert.equal(d.id, conLey.id);
  assert.equal(d.pagina, conLey.pagina);
  assert.equal(d.registrados, conLey.registrados);
  const datos = datosDeVotacion(conLey, compartirVotacion(conLey));
  assert.equal(datos.about.url, rutas.absoluta(rutas.ley(conLey.leyes[0].numero)));
  assert.equal(datos.isBasedOn, estado().fuente.url);
});
