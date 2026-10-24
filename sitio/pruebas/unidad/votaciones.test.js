// Pruebas de la página de votaciones con la posición de cada partido (lib/votaciones.js, posiciones de
// lib/ficha.js, filtro de lib/filtroVotaciones.js y siglas de lib/partidos.js).
import assert from "node:assert/strict";
import { test } from "node:test";

import { fuente, partidosConocidos } from "../../src/lib/datos.js";
import { CLASE_SIN_POSICION, indice, porSentido, posicionesDePartidos } from "../../src/lib/ficha.js";
import { escribirFiltrosVotaciones, filtrarVotaciones, leerFiltrosVotaciones } from "../../src/lib/filtroVotaciones.js";
import { esDeProyectoDeLey } from "../../src/lib/legisladores.js";
import { siglaDe } from "../../src/lib/partidos.js";
import * as rutas from "../../src/lib/rutas.js";
import {
  CANTIDAD_AJUSTADAS,
  autoresPorPartido,
  diferenciaSiNo,
  masAjustadas,
  votacionesDelAnio,
  votacionesDelPeriodo,
} from "../../src/lib/votaciones.js";

const PERIODO = "2023-2028";
const voto = (partido, sentido) => ({ partido, sentido });

test("posición de cada partido: mayoría de los votos emitidos, empate, sin votos emitidos y sin partido", () => {
  const votos = [
    voto("A", "SI"), voto("A", "SI"), voto("A", "NO"), voto("A", "AUSENTE"),
    voto("B", "SI"), voto("B", "NO"), voto("B", "NO VOTA"),
    voto("C", "AUSENTE"), voto("C", "NO VOTA"),
    voto("D", "MOCIÓN 2"),
    voto(null, "SI"), voto("", "NO"),
  ];
  const p = posicionesDePartidos(votos);
  assert.deepEqual(
    p.map((x) => [x.partido, x.miembros, x.votantes, x.posicion, x.cantidad, x.texto]),
    [
      ["A", 4, 3, "SI", 2, "SI"],
      ["B", 3, 2, null, null, "empate"],
      ["C", 2, 0, undefined, null, "sin votos emitidos"],
      ["D", 1, 1, "MOCIÓN 2", 1, "MOCIÓN 2"],
    ],
  );
  assert.deepEqual(p.map((x) => x.clase), ["voto-si", CLASE_SIN_POSICION, CLASE_SIN_POSICION, "voto-mocion-2"]);
});

test("por sentido: categorías en el orden de las columnas, después empates y sin votos emitidos", () => {
  const p = posicionesDePartidos([
    voto("A", "NO"), voto("B", "SI"), voto("C", "ABSTENCIÓN/BLANCO"), voto("D", "SI"), voto("D", "NO"), voto("E", "AUSENTE"), voto("F", "SI"),
  ]);
  assert.deepEqual(
    porSentido(p).map((g) => [g.titulo, g.partidos.map((x) => x.partido)]),
    [
      ["SI", ["B", "F"]],
      ["NO", ["A"]],
      ["ABSTENCIÓN/BLANCO", ["C"]],
      ["Empate", ["D"]],
      ["Sin votos emitidos", ["E"]],
    ],
  );
  assert.deepEqual(porSentido([]), []);
});

test("siglas: una por texto oficial, la misma dentro de cada partido unificado, y el texto si falta", () => {
  const porUnificado = new Map();
  for (const e of partidosConocidos()) {
    assert.ok(e.sigla?.trim() && e.sigla.length <= 8, `Sigla de ${e.partidoPolitico}`);
    assert.equal(siglaDe(e.partidoPolitico), e.sigla);
    assert.equal(porUnificado.get(e.partidoUnificado) ?? e.sigla, e.sigla, e.partidoUnificado);
    porUnificado.set(e.partidoUnificado, e.sigla);
  }
  assert.equal(new Set(porUnificado.values()).size, porUnificado.size, "Dos partidos con la misma sigla");
  assert.equal(siglaDe("Partido Nuevo"), "Partido Nuevo");
  assert.equal(siglaDe(" "), null);
});

test("diferencia entre SI y NO, sin votaciones que no tienen ninguno de los dos", () => {
  assert.equal(diferenciaSiNo({ totalSI: 20, totalNO: 23 }), 3);
  assert.equal(diferenciaSiNo({ totalSI: 10, totalNO: 10 }), 0);
  assert.equal(diferenciaSiNo({ totalSI: 0, totalNO: 4 }), 4);
  assert.equal(diferenciaSiNo({ totalSI: 0, totalNO: 0, totalAbstencion: 30 }), null);
});

test("período 2023-2028: cada votación sobre proyectos de ley una sola vez, en su año y en orden", () => {
  const i = indice(PERIODO);
  const { votaciones, anios, porCamara } = votacionesDelPeriodo(PERIODO);
  const deLey = [...i.votaciones.values()].filter(esDeProyectoDeLey);
  assert.equal(votaciones.length, deLey.length);
  assert.equal(new Set(votaciones.map((v) => v.id)).size, votaciones.length);
  assert.deepEqual(
    porCamara.map((c) => [c.camara, c.total]),
    [["CAMARA DE SENADORES", 211], ["CAMARA DE DIPUTADOS", 793]],
  );
  assert.deepEqual(anios.map((a) => a.anio), ["2026", "2025", "2024", "2023"]);
  assert.equal(anios.reduce((n, a) => n + a.total, 0), votaciones.length);
  for (const a of anios) {
    const r = votacionesDelAnio(PERIODO, a.anio);
    assert.equal(r.votaciones.length, a.total);
    assert.ok(r.votaciones.every((v) => v.fechaIso.startsWith(a.anio)), a.anio);
    assert.equal(a.url, rutas.votaciones(a.anio));
    for (const campo of ["camara", "estado", "resultado"]) {
      assert.equal(r.opciones[campo].reduce((n, o) => n + o.total, 0), a.total, `${a.anio} ${campo}`);
    }
  }
  for (let n = 1; n < votaciones.length; n++) {
    assert.ok(votaciones[n - 1].fechaIso >= votaciones[n].fechaIso, `Orden en ${votaciones[n].id}`);
  }
});

test("totales de cada votación iguales a los de votaciones.json, con el denominador de la lista oficial", () => {
  const oficiales = new Map(fuente(PERIODO, "votaciones.json").map((v) => [v.idVotacion, v]));
  const campos = { SI: "totalSI", NO: "totalNO", "ABSTENCIÓN/BLANCO": "totalAbstencion", "NO VOTA": "totalNoVota", AUSENTE: "totalAusente" };
  const lista = new Map();
  for (const x of fuente(PERIODO, "votos.csv")) lista.set(Number(x.idVotacion), (lista.get(Number(x.idVotacion)) ?? 0) + 1);
  for (const v of votacionesDelPeriodo(PERIODO).votaciones) {
    const o = oficiales.get(v.id);
    for (const t of v.totales) {
      if (campos[t.categoria]) assert.equal(t.cantidad, o[campos[t.categoria]], `${v.id} ${t.categoria}`);
      assert.equal(t.total, lista.get(v.id), `${v.id} denominador`);
    }
    // Ninguna categoría oficial con votos queda fuera.
    for (const [categoria, campo] of Object.entries(campos)) {
      if (o[campo] > 0) assert.ok(v.totales.some((t) => t.categoria === categoria), `${v.id} sin ${categoria}`);
    }
    assert.equal(v.diferencia, diferenciaSiNo(o));
  }
});

test("posición de cada partido igual a un recuento aparte en votos.csv", () => {
  const partidoDe = new Map(fuente(PERIODO, "legisladores.json").map((l) => [l.idLegislador, l.partidoPolitico]));
  const recuento = new Map();
  for (const x of fuente(PERIODO, "votos.csv")) {
    const partido = partidoDe.get(Number(x.idLegislador));
    if (!partido) continue;
    const id = Number(x.idVotacion);
    if (!recuento.has(id)) recuento.set(id, new Map());
    const grupo = recuento.get(id).get(partido) ?? { miembros: 0, emitidos: {} };
    grupo.miembros++;
    if (!["AUSENTE", "NO VOTA"].includes(x.sentidoVotacion)) grupo.emitidos[x.sentidoVotacion] = (grupo.emitidos[x.sentidoVotacion] ?? 0) + 1;
    recuento.get(id).set(partido, grupo);
  }
  let empates = 0;
  let sinVotos = 0;
  for (const v of votacionesDelPeriodo(PERIODO).votaciones) {
    const esperado = recuento.get(v.id);
    assert.equal(v.partidos.length, esperado.size, `${v.id} cantidad de partidos`);
    for (const p of v.partidos) {
      const g = esperado.get(p.partido);
      const cuentas = Object.entries(g.emitidos).sort((a, b) => b[1] - a[1]);
      const votantes = cuentas.reduce((n, [, c]) => n + c, 0);
      let posicion;
      if (votantes > 0) posicion = cuentas.length > 1 && cuentas[0][1] === cuentas[1][1] ? null : cuentas[0][0];
      assert.equal(p.miembros, g.miembros, `${v.id} ${p.partido} miembros`);
      assert.equal(p.votantes, votantes, `${v.id} ${p.partido} votantes`);
      assert.equal(p.posicion, posicion, `${v.id} ${p.partido} posición`);
      if (posicion) assert.equal(p.cantidad, g.emitidos[posicion]);
      if (posicion === null) empates++;
      if (posicion === undefined) sinVotos++;
    }
  }
  // Los dos casos especiales aparecen en los datos reales.
  assert.ok(empates > 0 && sinVotos > 0, `empates ${empates}, sin votos ${sinVotos}`);
});

test("más ajustadas: por cámara, de menor a mayor diferencia y, a igualdad, la más reciente", () => {
  const { votaciones } = votacionesDelPeriodo(PERIODO);
  for (const c of masAjustadas(PERIODO)) {
    assert.equal(c.votaciones.length, CANTIDAD_AJUSTADAS);
    const candidatas = votaciones.filter((v) => v.camara === c.camara && v.diferencia !== null);
    const maxima = c.votaciones.at(-1).diferencia;
    // Ninguna votación que quedó fuera tiene menor diferencia que la última elegida.
    assert.ok(candidatas.filter((v) => !c.votaciones.includes(v)).every((v) => v.diferencia >= maxima), c.camara);
    for (let n = 1; n < c.votaciones.length; n++) {
      const [a, b] = [c.votaciones[n - 1], c.votaciones[n]];
      assert.ok(a.diferencia < b.diferencia || (a.diferencia === b.diferencia && a.fechaIso >= b.fechaIso), `${c.camara} ${b.id}`);
    }
    assert.ok(c.votaciones.every((v) => v.camara === c.camara));
  }
  assert.equal(masAjustadas(PERIODO, 3)[0].votaciones.length, 3);
});

test("filtro: lee y escribe la dirección, ignora valores desconocidos y combina los campos, también el tema (con varios valores)", () => {
  const nombres = rutas.parametrosVotaciones;
  const opciones = { camara: ["camara-de-senadores", "camara-de-diputados"], estado: ["publicado"], resultado: ["aprobado", "rechazado"], tema: ["salud", "pendiente"] };
  const leidos = leerFiltrosVotaciones(new URLSearchParams("camara=camara-de-senadores&estado=otro&resultado=rechazado"), nombres, opciones);
  assert.deepEqual(leidos, { camara: "camara-de-senadores", estado: "", resultado: "rechazado", tema: "" });
  assert.equal(
    escribirFiltrosVotaciones(new URLSearchParams("x=1&estado=publicado"), nombres, leidos).toString(),
    "x=1&camara=camara-de-senadores&resultado=rechazado",
  );
  const entradas = [
    { id: 1, camara: "camara-de-senadores", estado: "publicado", resultado: "aprobado", tema: ["salud", "educacion"] },
    { id: 2, camara: "camara-de-senadores", estado: "archivado", resultado: "rechazado", tema: ["pendiente"] },
    { id: 3, camara: "camara-de-diputados", estado: "publicado", resultado: "rechazado", tema: ["salud"] },
  ];
  const ids = (f) => filtrarVotaciones(entradas, { camara: "", estado: "", resultado: "", tema: "", ...f }).map((e) => e.id);
  assert.deepEqual(ids({}), [1, 2, 3]);
  assert.deepEqual(ids({ camara: "camara-de-senadores" }), [1, 2]);
  assert.deepEqual(ids({ estado: "publicado", resultado: "rechazado" }), [3]);
  assert.deepEqual(ids({ camara: "camara-de-diputados", estado: "archivado" }), []);
  assert.deepEqual(ids({ tema: "salud" }), [1, 3]);
  assert.deepEqual(ids({ tema: "educacion", camara: "camara-de-senadores" }), [1]);
  assert.deepEqual(ids({ tema: "pendiente" }), [2]);
});

test("tema: cada votación lleva los temas de su proyecto o pendiente, y las opciones los cuentan", () => {
  const { votaciones } = votacionesDelPeriodo(PERIODO);
  assert.ok(votaciones.every((v) => v.temas.filtro.length > 0));
  const anio = votacionesDelPeriodo(PERIODO).anios[0].anio;
  const delAnio = votacionesDelAnio(PERIODO, anio);
  for (const o of delAnio.opciones.tema) {
    assert.equal(o.total, delAnio.votaciones.filter((v) => v.temas.filtro.includes(o.valor)).length, o.valor);
  }
});

test("valores de filtro: los mismos textos oficiales tienen el mismo valor y cada votación sin ley enlaza a SILpy", () => {
  const { votaciones } = votacionesDelPeriodo(PERIODO);
  const valores = new Map();
  for (const v of votaciones) {
    assert.equal(valores.get(v.resultado) ?? v.resultadoFiltro, v.resultadoFiltro, v.resultado);
    valores.set(v.resultado, v.resultadoFiltro);
    if (v.leyes.length) assert.equal(v.url, rutas.votacionEnLey(v.leyes[0].numero, v.id));
    else assert.match(v.url, /^https:\/\/silpy\.congreso\.gov\.py\/votacion\/\d+$/);
  }
  assert.equal(new Set(valores.values()).size, valores.size, "Dos resultados con el mismo valor de filtro");
});

test("autores por partido: cada legislador una vez, por partido unificado, con su sigla y de más a menos", () => {
  const r = autoresPorPartido([
    { partido: "Partido Liberal Radical Auténtico PLRA", idLegislador: 1 },
    { partido: "Asociación Nacional Republicana ANR", idLegislador: 2 },
    { partido: "Asociación Nacional Republicana ANR", idLegislador: 3 },
    { partido: "Asociación Nacional Republicana ANR", idLegislador: 3 },
    { partido: "CRUZADA NACIONAL", idLegislador: 4 },
    { partido: "Partido Cruzada Nacional", idLegislador: 5 },
    { partido: "", idLegislador: 6 },
  ]);
  assert.deepEqual(
    r.map((a) => [a.sigla, a.cantidad]),
    [["ANR", 2], ["CN", 2], ["PLRA", 1], ["Sin partido registrado", 1]],
  );
  assert.equal(r[1].nombre, "CRUZADA NACIONAL / Partido Cruzada Nacional");
  assert.deepEqual(autoresPorPartido([]), []);
  // Los proyectos sin autores en la fuente y de iniciativa no parlamentaria muestran su iniciativa.
  const { votaciones } = votacionesDelPeriodo(PERIODO);
  assert.ok(votaciones.some((v) => v.autores.length) && votaciones.some((v) => !v.autores.length && v.iniciativa === "PODER EJECUTIVO"));
  assert.ok(votaciones.every((v) => v.iniciativa !== "PARLAMENTARIA"));
});
