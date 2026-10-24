// Pruebas de títulos, descripciones y datos estructurados (lib/seo.js) con los datos reales de datos/.
import assert from "node:assert/strict";
import { test } from "node:test";

import { leyes } from "../../src/lib/catalogo.js";
import { ficha, legisladores } from "../../src/lib/legisladores.js";
import * as rutas from "../../src/lib/rutas.js";
import { votacionesDelPeriodo } from "../../src/lib/votaciones.js";
import { votosPorTema } from "../../src/lib/votosPorTema.js";
import {
  datosAbiertos,
  datosDeLegislador,
  datosDeLey,
  datosDelSitio,
  descripcionDeLegislador,
  descripcionDeLey,
  direccionesDelSitemap,
  temaDeLey,
  tituloDeLey,
} from "../../src/lib/seo.js";

test("el tema es el texto entre comillas cuando hay un preámbulo", () => {
  assert.equal(temaDeLey("Proyecto de Ley “QUE DECLARA EL DÍA DEL ALMACENERO”, presentado por…"), "QUE DECLARA EL DÍA DEL ALMACENERO");
  assert.equal(temaDeLey('Mensaje del Poder Ejecutivo N° 824 "QUE APRUEBA EL ACUERDO"'), "QUE APRUEBA EL ACUERDO");
});

test("el tema es el título desde el inicio cuando empieza con QUE, aunque cite otra ley entre comillas", () => {
  const t = "QUE MODIFICA EL ARTÍCULO 1º DE LA LEY Nº 7028, “QUE DECLARA DE INTERÉS SOCIAL”";
  assert.ok(temaDeLey(t).startsWith("QUE MODIFICA EL ARTÍCULO"));
});

test("el tema se recorta en una palabra completa y conserva el texto oficial", () => {
  const largo = "QUE ESTABLECE UN REGIMEN DE INDEMNIZACION DE LOS CONSCRIPTOS QUE PRESTARON EL SERVICIO MILITAR";
  const tema = temaDeLey(largo);
  assert.ok(tema.length <= 61 && tema.endsWith("…"));
  assert.ok(largo.startsWith(tema.slice(0, -1)));
  assert.equal(temaDeLey(null), "");
});

test("títulos y descripciones de leyes únicos y sin cambiar el texto oficial", () => {
  const titulos = new Set();
  const descripciones = new Set();
  for (const ley of leyes()) {
    const titulo = tituloDeLey(ley);
    assert.ok(titulo.startsWith(`Ley ${ley.numero}`));
    const tema = titulo.split(" — ")[1]?.replace(/…$/, "");
    if (tema) assert.ok(ley.titulos[0].replace(/\s+/g, " ").includes(tema), `El tema de ${ley.numero} no es texto oficial`);
    titulos.add(titulo);
    descripciones.add(descripcionDeLey(ley));
    assert.ok(descripcionDeLey(ley).length <= 301);
  }
  assert.equal(titulos.size, leyes().length);
  assert.equal(descripciones.size, leyes().length);
});

test("descripciones de legisladores únicas", () => {
  const descripciones = legisladores().map((p) => descripcionDeLegislador(ficha(p), "Sin dato"));
  assert.equal(new Set(descripciones).size, legisladores().length);
});

test("datos estructurados de una ley", () => {
  const ley = leyes().find((l) => l.registros[0].urlLey && l.fechaOrden);
  const d = datosDeLey(ley);
  assert.equal(d["@type"], "Legislation");
  assert.equal(d.name, ley.titulos[0]);
  assert.equal(d.legislationIdentifier, `Ley N° ${ley.registros[0].numeroOficial}`);
  assert.match(d.legislationDate, /^\d{4}-\d{2}-\d{2}/);
  assert.equal(d.url, rutas.absoluta(ley.url));
  assert.ok(d.sameAs.includes(ley.registros[0].urlLey));
});

test("datos estructurados de un legislador, con su foto", () => {
  const persona = legisladores().find((p) => ficha(p).bloques[0].foto);
  const f = ficha(persona);
  const d = datosDeLegislador(f, persona.url);
  assert.equal(d["@type"], "Person");
  assert.equal(d.name, f.nombre);
  assert.equal(d.image, rutas.absoluta(f.bloques[0].foto));
  assert.ok(d.memberOf.some((o) => o.name === f.bloques[0].camara));
});

test("datos del sitio y del conjunto de datos", () => {
  assert.equal(datosDelSitio()["@type"], "WebSite");
  const d = datosAbiertos("Descripción de prueba suficientemente larga para el conjunto de datos.");
  assert.equal(d["@type"], "Dataset");
  assert.equal(d.license, "https://creativecommons.org/licenses/by/4.0/");
  assert.equal(d.spatialCoverage["@type"], "Place"); // Google no acepta Country aquí
  assert.ok(d.distribution.length > 0);
  for (const a of d.distribution) assert.ok(a.contentUrl.startsWith(rutas.sitio));
});

test("el sitemap tiene cada ley y cada legislador una vez, sin la búsqueda", () => {
  const urls = direccionesDelSitemap();
  assert.equal(new Set(urls).size, urls.length);
  const { anios, votaciones } = votacionesDelPeriodo("2023-2028");
  const temas = votosPorTema("2023-2028");
  assert.equal(urls.length, leyes().length + legisladores().length + 11 + anios.length + temas.length + votaciones.length);
  for (const v of votaciones) assert.ok(urls.includes(rutas.absoluta(rutas.votacion(v.id))), v.id);
  for (const t of temas) assert.ok(urls.includes(rutas.absoluta(t.url)), t.url);
  assert.ok(urls.includes(rutas.absoluta(rutas.votosPorTema())));
  assert.ok(urls.includes(rutas.absoluta(rutas.votaciones())));
  for (const a of anios) assert.ok(urls.includes(rutas.absoluta(a.url)), a.url);
  assert.ok(urls.includes(rutas.absoluta(rutas.votacionesNominales())));
  assert.ok(urls.includes(rutas.absoluta(rutas.rankings())));
  assert.ok(urls.includes(rutas.absoluta(rutas.coincidencia())));
  assert.ok(!urls.includes(rutas.absoluta(rutas.buscar())));
  for (const u of urls) assert.ok(u.startsWith(`${rutas.sitio}/`) && u.endsWith("/"), u);
});
