// Pruebas del listado y las fichas de legisladores con casos reales de datos/.
// Los legisladores en ejercicio suman votos con cada ley nueva: para ellos se comprueban votos ya
// cerrados o un recuento hecho aparte; las cantidades fijas son de quienes ya no ejercen.
import { legible } from "../../src/lib/texto.js";
import assert from "node:assert/strict";
import { test } from "node:test";

import { estado, fuente, periodos, personas } from "../../src/lib/datos.js";
import { escribirFiltros, filtrar, leerFiltros } from "../../src/lib/filtroLegisladores.js";
import { escribirEstado, filtrarPorEstado, leerEstado, textoResultado } from "../../src/lib/filtroVotos.js";
import { csv } from "../../src/lib/calculados.js";
import {
  COLUMNAS_TABLA,
  comparativa,
  esDeProyectoDeLey,
  esVotoEmitido,
  ficha,
  legisladores,
  listado,
  mayoriaDe,
  opcionesDelListado,
  tablaComparativa,
} from "../../src/lib/legisladores.js";
import { interpretarCsv } from "../../src/lib/datos.js";
import { leerOrden, ordenar } from "../../src/lib/ordenComparativa.js";
import { parametroEstadoVotos, parametrosLegisladores as nombres } from "../../src/lib/rutas.js";

const PERIODO = "2023-2028";
const de = (slug) => ficha(legisladores().find((p) => p.slug === slug)).bloques[0];
const todas = () => listado(PERIODO);
const entradas = () => [...todas().enEjercicio, ...todas().noEjercen].map((l) => l.filtro);
const buscar = (cambios) =>
  filtrar(entradas(), { texto: "", camara: "", partido: "", bancada: "", departamento: "", ...cambios }).map(
    (e) => e.slug,
  );

test("una ficha por persona de personas.json; en ejercicio, la cantidad de estado.json", () => {
  assert.equal(legisladores().length, personas().length);
  assert.equal(new Set(legisladores().map((p) => p.slug)).size, legisladores().length);
  const { enEjercicio, noEjercen } = todas();
  assert.equal(enEjercicio.length, estado().periodos[PERIODO].cantidades.legisladoresVigentes);
  assert.equal(enEjercicio.length + noEjercen.length, fuente(PERIODO, "legisladores.json").length);
  assert.ok(noEjercen.every((l) => !l.vigente));
  assert.ok(periodos().find((p) => p.id === PERIODO).vigente);
});

test("listado: primero la Cámara de Senadores y, dentro de cada cámara, por apellido", () => {
  const { enEjercicio } = todas();
  const camaras = enEjercicio.map((l) => l.camara);
  const primerDiputado = camaras.indexOf("CAMARA DE DIPUTADOS");
  assert.ok(primerDiputado > 0);
  assert.ok(camaras.slice(0, primerDiputado).every((c) => c === "CAMARA DE SENADORES"));
  assert.ok(camaras.slice(primerDiputado).every((c) => c === "CAMARA DE DIPUTADOS"));
  const apellidos = enEjercicio.slice(0, primerDiputado).map((l) => l.apellidos.normalize("NFD"));
  for (let i = 1; i < apellidos.length; i++) {
    assert.ok(apellidos[i - 1].localeCompare(apellidos[i], "es", { sensitivity: "base" }) <= 0, apellidos[i]);
  }
});

test("valores oficiales sin cambios, con el correo y el teléfono que publica la API", () => {
  const oficial = fuente(PERIODO, "legisladores.json").find((l) => l.idLegislador === 101405);
  const r = todas().enEjercicio.find((l) => l.id === 101405);
  assert.equal(r.nombre, legible(`${oficial.nombres} ${oficial.apellidos}`));
  assert.equal(r.camara, "CAMARA DE DIPUTADOS");
  assert.equal(r.departamento, "ALTO PARANÁ");
  assert.equal(r.partido, oficial.partidoPolitico);
  assert.equal(r.bancada, oficial.bancada);
  assert.equal(r.urlSilpy, "https://silpy.congreso.gov.py/legislador/101405");
  const oficialONulo = (v) => (v && String(v).trim() ? v : null);
  assert.equal(r.correo, oficialONulo(oficial.emailParlamentario));
  assert.equal(r.telefono, oficialONulo(oficial.telefonoParlamentario));
});

test("filtros: cámara, partido, bancada, departamento y nombre sin acentos", () => {
  const { camaras, partidos, departamentos } = opcionesDelListado(PERIODO);
  assert.deepEqual(
    camaras.map((c) => c.etiqueta),
    ["CAMARA DE SENADORES", "CAMARA DE DIPUTADOS"],
  );
  assert.ok(partidos.some((p) => p.etiqueta === "Movimiento Conciencia Democrática Nacional (Yo Creo)"));
  assert.ok(departamentos.some((d) => d.etiqueta === "NACIONAL"));
  const senado = buscar({ camara: "camara-de-senadores" });
  assert.equal(senado.length, fuente(PERIODO, "legisladores.json").filter((l) => l.camaraParlamentario === "CAMARA DE SENADORES").length);
  assert.deepEqual(buscar({ departamento: "nacional" }), senado);
  assert.ok(buscar({ departamento: "alto-parana" }).includes("maria-rocio-abed-de-zacarias"));
  assert.deepEqual(buscar({ texto: "ovelar benitez" }), ["silvio-adalberto-ovelar-benitez"]);
  assert.deepEqual(buscar({ texto: "OVELAR BENÍTEZ" }), ["silvio-adalberto-ovelar-benitez"]);
  assert.ok(buscar({ partido: "movimiento-conciencia-democratica-nacional" }).length > 0);
  assert.deepEqual(buscar({ camara: "camara-de-diputados", texto: "ovelar benitez" }), []);
});

test("filtros: dos textos oficiales con el mismo slug no se fusionan", () => {
  for (const lista of Object.values(opcionesDelListado(PERIODO))) {
    assert.equal(new Set(lista.map((o) => o.valor)).size, lista.length);
  }
  const { bancadas } = opcionesDelListado(PERIODO);
  const pen = bancadas.filter((b) => b.etiqueta.startsWith("PARTIDO ENCUENTRO NACIONAL"));
  assert.deepEqual(
    pen.map((b) => b.valor),
    ["partido-encuentro-nacional-pen", "partido-encuentro-nacional-pen-2"],
  );
  for (const b of pen) {
    const elegidos = todas().enEjercicio.concat(todas().noEjercen).filter((l) => l.filtro.bancada === b.valor);
    assert.ok(elegidos.length > 0 && elegidos.every((l) => `${l.bancada}` === b.etiqueta), b.etiqueta);
  }
});

test("filtros en la dirección: se leen y se escriben sin los vacíos", () => {
  const f = leerFiltros(new URLSearchParams("q=abed&camara=camara-de-diputados"), nombres);
  assert.deepEqual(f, { texto: "abed", camara: "camara-de-diputados", partido: "", bancada: "", departamento: "" });
  assert.equal(escribirFiltros(f, nombres).toString(), "q=abed&camara=camara-de-diputados");
});

test("votos: el resumen coincide con un recuento hecho aparte en votos.csv", () => {
  const votaciones = new Map(fuente(PERIODO, "votaciones.json").map((v) => [v.idVotacion, v]));
  for (const slug of ["silvio-adalberto-ovelar-benitez", "maria-rocio-abed-de-zacarias"]) {
    const b = de(slug);
    const propios = fuente(PERIODO, "votos.csv").filter(
      (v) =>
        Number(v.idLegislador) === b.id &&
        votaciones.get(Number(v.idVotacion)).proyecto.tipoProyecto === "PROYECTO DE LEY",
    );
    assert.equal(b.votos.total, propios.length);
    for (const t of b.votos.totales) {
      assert.equal(t.cantidad, propios.filter((v) => v.sentidoVotacion === t.categoria).length, `${slug} ${t.categoria}`);
      assert.equal(t.total, propios.length);
    }
    assert.equal(b.votos.historial.length, propios.length);
    const fechas = b.votos.historial.map((h) => h.fechaIso);
    assert.deepEqual(fechas, [...fechas].sort().reverse());
    // Un resumen por estado oficial del proyecto, que suman el total.
    assert.equal(b.votos.porEstado.reduce((n, e) => n + e.total, 0), b.votos.total);
    for (const e of b.votos.porEstado) {
      const deEste = propios.filter((v) => votaciones.get(Number(v.idVotacion)).proyecto.estadoProyecto === e.estado);
      assert.equal(e.total, deEste.length, `${slug} ${e.estado}`);
      assert.equal(b.votos.historial.filter((h) => h.proyecto.estadoFiltro === e.filtro).length, deEste.length);
    }
  }
});

test("votos: todas las votaciones nominales sobre proyectos de ley y ninguna de otro tipo", () => {
  const votaciones = fuente(PERIODO, "votaciones.json");
  const deLey = new Set(votaciones.filter(esDeProyectoDeLey).map((v) => v.idVotacion));
  assert.ok(votaciones.filter((v) => v._propio.idLeyes.length).every((v) => deLey.has(v.idVotacion)));
  assert.ok(deLey.size > votaciones.filter((v) => v._propio.idLeyes.length).length);
  assert.ok(deLey.size < votaciones.length);
  const esperados = fuente(PERIODO, "votos.csv").filter((v) => deLey.has(Number(v.idVotacion))).length;
  const enFichas = legisladores()
    .flatMap((p) => ficha(p).bloques)
    .filter((b) => b.periodo === PERIODO)
    .reduce((n, b) => n + b.votos.historial.length, 0);
  assert.equal(enFichas, esperados);
  const ids = new Set(legisladores().flatMap((p) => ficha(p).bloques.flatMap((b) => b.votos.historial.map((h) => h.id))));
  assert.deepEqual([...ids].sort(), [...deLey].sort());
});

test("ausencias en votaciones nominales: recuento desde votos.csv sobre todas las votaciones de su lista", () => {
  const votaciones = new Map(fuente(PERIODO, "votaciones.json").map((v) => [v.idVotacion, v]));
  const votos = fuente(PERIODO, "votos.csv");
  const casos = [
    "silvio-adalberto-ovelar-benitez",
    "maria-rocio-abed-de-zacarias",
    "kattya-mabel-gonzalez-villanueva",
    ...legisladores()
      .filter((p) => p.registros.some((r) => r.camara === "CAMARA DE DIPUTADOS"))
      .slice(0, 3)
      .map((p) => p.slug),
  ];
  for (const slug of casos) {
    const b = de(slug);
    const propios = votos.filter((v) => Number(v.idLegislador) === b.id);
    const ausente = propios.filter((v) => v.sentidoVotacion === "AUSENTE");
    assert.equal(b.ausencias.total, propios.length, slug);
    assert.equal(b.ausencias.cantidad, ausente.length, slug);
    assert.ok(b.ausencias.total >= b.votos.total, slug);
    assert.deepEqual(b.ausencias.lista.map((x) => x.id).sort(), ausente.map((v) => Number(v.idVotacion)).sort(), slug);
    const fechas = b.ausencias.lista.map((x) => x.fechaIso);
    assert.deepEqual(fechas, [...fechas].sort().reverse());
    for (const x of b.ausencias.lista) {
      const v = votaciones.get(x.id);
      assert.equal(x.url, v.appURL);
      assert.equal(x.expediente, v.proyecto.expedienteCamara);
      assert.equal(x.sesion.numero, v.tramitacion.idSesion.numeroSesion);
      assert.equal(x.sesion.tipo, v.tramitacion.idSesion.tipoSesion);
      assert.ok(x.fecha);
    }
  }
  // Incluye votaciones sobre expedientes que no son proyectos de ley.
  const b = de("silvio-adalberto-ovelar-benitez");
  assert.ok(b.ausencias.total > b.votos.total);
});

test("ausencias: el senador vitalicio no figura en ninguna votación", () => {
  const b = de("juan-carlos-wasmosy-monti");
  assert.equal(b.ausencias.total, 0);
  assert.equal(b.ausencias.lista.length, 0);
});

test("historial: un proyecto sin ley sancionada enlaza a su expediente oficial, con su estado", () => {
  const b = de("silvio-adalberto-ovelar-benitez");
  const sinLey = b.votos.historial.filter((h) => !h.leyes.length);
  assert.ok(sinLey.length > 0);
  const votaciones = new Map(fuente(PERIODO, "votaciones.json").map((v) => [v.idVotacion, v]));
  for (const h of sinLey) {
    const oficial = votaciones.get(h.id).proyecto;
    assert.equal(h.proyecto.url, oficial.appURL);
    assert.ok(h.proyecto.url.startsWith("https://silpy.congreso.gov.py/expediente/"));
    assert.equal(h.proyecto.expediente, oficial.expedienteCamara);
    assert.equal(h.proyecto.estado, oficial.estadoProyecto);
    assert.ok(h.etapa);
  }
  assert.ok(sinLey.some((h) => h.proyecto.estado === "ARCHIVADO"));
  assert.deepEqual(
    b.votos.porEstado.map((e) => [e.estado, e.filtro]).sort(),
    [["ARCHIVADO", "archivado"], ["EN TRAMITE", "en-tramite"], ["PUBLICADO", "publicado"]],
  );
});

test("filtro de votos por estado: dirección, filas y texto del resultado", () => {
  const opciones = ["publicado", "archivado"];
  assert.equal(leerEstado(new URLSearchParams("estado=archivado"), parametroEstadoVotos, opciones), "archivado");
  assert.equal(leerEstado(new URLSearchParams("estado=otro"), parametroEstadoVotos, opciones), "");
  assert.equal(escribirEstado(new URLSearchParams("x=1"), parametroEstadoVotos, "publicado").toString(), "x=1&estado=publicado");
  assert.equal(escribirEstado(new URLSearchParams("estado=publicado"), parametroEstadoVotos, "").toString(), "");
  const filas = [{ estado: "publicado" }, { estado: "archivado" }, { estado: "publicado" }];
  assert.equal(filtrarPorEstado(filas, "publicado").length, 2);
  assert.equal(filtrarPorEstado(filas, "").length, 3);
  assert.equal(textoResultado(3, 3), "Se muestran las 3 votaciones.");
  assert.equal(textoResultado(2, 3), "Se muestran 2 de 3 votaciones.");
  assert.equal(textoResultado(0, 3), "Ninguna votación cumple este filtro.");
});

test("historial: cada voto enlaza a la votación dentro de la ficha de su ley", () => {
  const h = de("silvio-adalberto-ovelar-benitez").votos.historial.find((x) => x.id === 104218);
  assert.equal(h.fecha, "13/07/2023");
  assert.equal(h.sentido, "SI");
  assert.equal(h.etapa, "Tercer trámite constitucional");
  assert.deepEqual(h.leyes.map((l) => l.url), ["/leyes/7140/#votacion-104218"]);
});

test("quien ya no ejerce: ficha completa y cantidades cerradas", () => {
  const b = de("kattya-mabel-gonzalez-villanueva");
  assert.equal(b.vigente, false);
  assert.equal(b.periodoVigente, true);
  assert.equal(b.votos.total, 55);
  const ausente = (r) => r.totales.find((t) => t.categoria === "AUSENTE").texto;
  assert.equal(ausente(b.votos), "16 de 55 (29,1%)");
  assert.equal(ausente(b.votos.porEstado.find((e) => e.estado === "PUBLICADO")), "12 de 37 (32,4%)");
  // Ausencias en votaciones nominales, sobre todas sus votaciones nominales y no solo las de proyectos de ley.
  assert.equal(b.ausencias.texto, "23 de 96 (24%)");
  assert.equal(b.ausencias.lista.length, 23);
  // NO VOTA y abstenciones, con el mismo denominador que las ausencias.
  assert.equal(b.noVota.texto, "6 de 96 (6,3%)");
  assert.equal(b.abstencion.texto, "7 de 96 (7,3%)");
  assert.equal(b.votos.porEstado.find((e) => e.estado === "ARCHIVADO").total, 18);
  assert.deepEqual(b.autoria.map((l) => l.numero), ["7256", "7239", "7190"]);
  assert.ok(todas().noEjercen.some((l) => l.slug === "kattya-mabel-gonzalez-villanueva"));
});

test("senador vitalicio: sin votos ni leyes, con su tipo oficial", () => {
  const b = de("juan-carlos-wasmosy-monti");
  assert.equal(b.tipo, "VITALICIO");
  assert.equal(b.votos.total, 0);
  assert.equal(b.autoria.length, 0);
});

test("autoría: solo leyes del período cuyo proyecto lo registra como autor", () => {
  const b = de("silvio-adalberto-ovelar-benitez");
  const numeros = b.autoria.map((l) => l.numero);
  assert.ok(numeros.includes("7158"));
  assert.equal(new Set(numeros).size, numeros.length);
  const fechas = b.autoria.map((l) => l.fechaIso);
  assert.deepEqual(fechas, [...fechas].sort().reverse());
});

test("foto: la copia propia cuando existe; sin foto si el Congreso no la publica", () => {
  assert.equal(de("silvio-adalberto-ovelar-benitez").foto, "/fotos/2023-2028/101339.jpg");
  const sinFoto = fuente(PERIODO, "legisladores.json").filter((l) => l.fotoURL.includes("noimage"));
  for (const l of sinFoto) assert.equal(de(l._propio.slug).foto, null);
});

test("NO VOTA y abstenciones: recuento desde votos.csv, mismo denominador que las ausencias", () => {
  const votos = fuente(PERIODO, "votos.csv");
  const casos = [
    "silvio-adalberto-ovelar-benitez",
    "maria-rocio-abed-de-zacarias",
    "kattya-mabel-gonzalez-villanueva",
    "juan-eudes-afara-maciel",
    ...legisladores()
      .filter((p) => p.registros.some((r) => r.camara === "CAMARA DE DIPUTADOS"))
      .slice(0, 3)
      .map((p) => p.slug),
  ];
  for (const slug of casos) {
    const b = de(slug);
    const propios = votos.filter((v) => Number(v.idLegislador) === b.id);
    const cuenta = (categoria) => propios.filter((v) => v.sentidoVotacion === categoria).length;
    assert.equal(b.noVota.cantidad, cuenta("NO VOTA"), slug);
    assert.equal(b.abstencion.cantidad, cuenta("ABSTENCIÓN/BLANCO"), slug);
    assert.equal(b.noVota.total, b.ausencias.total, slug);
    assert.equal(b.abstencion.total, b.ausencias.total, slug);
  }
});

test("vista comparativa: una tabla por cámara, cifras separadas y totales iguales a votos.csv", () => {
  const { camaras } = comparativa(PERIODO);
  assert.deepEqual(camaras.map((c) => c.camara), ["CAMARA DE SENADORES", "CAMARA DE DIPUTADOS"]);
  const filas = camaras.flatMap((c) => c.filas);
  // Sin el senador vitalicio, que no figura en ninguna votación; con quienes ya no ejercen.
  assert.ok(!filas.some((f) => f.slug === "juan-carlos-wasmosy-monti"));
  assert.ok(filas.some((f) => f.slug === "kattya-mabel-gonzalez-villanueva" && !f.vigente));
  assert.ok(filas.every((f) => f.ausencias.total > 0 && f.noVota.total === f.ausencias.total));
  for (const c of camaras) assert.ok(c.filas.every((f) => f.camara === c.camara));
  // Los totales de toda la vista coinciden con un recuento de votos.csv por categoría.
  const votos = fuente(PERIODO, "votos.csv");
  const ids = new Set(filas.map((f) => f.id));
  const cuenta = (categoria) => votos.filter((v) => v.sentidoVotacion === categoria && ids.has(Number(v.idLegislador))).length;
  const suma = (campo) => filas.reduce((n, f) => n + f[campo].cantidad, 0);
  assert.equal(suma("noVota"), cuenta("NO VOTA"));
  assert.equal(suma("abstencion"), cuenta("ABSTENCIÓN/BLANCO"));
  assert.equal(suma("ausencias"), cuenta("AUSENTE"));
  // En este período NO VOTA aparece solo en el Senado (lo dice la metodología).
  assert.equal(camaras[1].filas.reduce((n, f) => n + f.noVota.cantidad, 0), 0);
});

test("vista comparativa: orden por nombre o por cifra, de mayor a menor, sin perder filas", () => {
  const filas = comparativa(PERIODO).camaras[0].filas;
  const entradas = filas.map((f, posicion) => ({
    slug: f.slug,
    posicion,
    ausencias: f.ausencias.porcentaje,
    noVota: f.noVota.porcentaje,
    abstencion: f.abstencion.porcentaje,
    mayoriaBancada: f.mayoriaBancada.total ? f.mayoriaBancada.porcentaje : -1,
    mayoriaPartido: f.mayoriaPartido.total ? f.mayoriaPartido.porcentaje : -1,
  }));
  assert.deepEqual(ordenar(entradas, "").map((e) => e.slug), filas.map((f) => f.slug));
  for (const [valor, campo] of [
    ["ausencias", "ausencias"],
    ["no-vota", "noVota"],
    ["abstencion", "abstencion"],
    ["bancada", "mayoriaBancada"],
    ["partido", "mayoriaPartido"],
  ]) {
    const orden = ordenar(entradas, valor);
    assert.equal(orden.length, entradas.length);
    for (let n = 1; n < orden.length; n++) {
      const [a, b] = [orden[n - 1], orden[n]];
      assert.ok(a[campo] > b[campo] || (a[campo] === b[campo] && a.posicion < b.posicion), valor);
    }
  }
  assert.equal(leerOrden(new URLSearchParams("orden=no-vota"), "orden"), "no-vota");
  assert.equal(leerOrden(new URLSearchParams("orden=peor"), "orden"), "");
});

test("tabla descargable: mismas cifras que la vista, columnas fijas y CSV legible", () => {
  const tabla = tablaComparativa(PERIODO);
  const filas = comparativa(PERIODO).camaras.flatMap((c) => c.filas);
  assert.equal(tabla.length, filas.length);
  const k = tabla.find((t) => t.slug === "kattya-mabel-gonzalez-villanueva");
  assert.deepEqual(
    [k.votacionesEnSuLista, k.ausente, k.porcentajeAusente, k.noVota, k.porcentajeNoVota, k.abstencionBlanco, k.porcentajeAbstencionBlanco],
    [96, 23, 24, 6, 6.3, 7, 7.3],
  );
  const f = filas.find((x) => x.slug === k.slug);
  assert.deepEqual(
    [k.bancada, k.votacionesComparablesBancada, k.distintasBancada, k.partido, k.votacionesComparablesPartido, k.distintasPartido],
    [
      f.mayoriaBancada.grupo,
      f.mayoriaBancada.total,
      f.mayoriaBancada.total ? f.mayoriaBancada.cantidad : null,
      f.mayoriaPartido.grupo,
      f.mayoriaPartido.total,
      f.mayoriaPartido.total ? f.mayoriaPartido.cantidad : null,
    ],
  );
  // Sin votaciones comparables, cantidad y porcentaje vacíos.
  const unico = tabla.find((t) => t.idLegislador === 101362);
  assert.deepEqual([unico.votacionesComparablesPartido, unico.distintasPartido, unico.porcentajeDistintasPartido], [0, null, null]);
  const texto = csv(COLUMNAS_TABLA, tabla);
  assert.ok(texto.startsWith("﻿"));
  const leidas = interpretarCsv(texto);
  assert.deepEqual(Object.keys(leidas[0]), COLUMNAS_TABLA);
  assert.equal(leidas.length, tabla.length);
  assert.equal(leidas.find((l) => l.slug === k.slug).nombre, k.nombre);
});

test("mayoría de un grupo: categoría más votada entre los votos emitidos, empate sin mayoría", () => {
  assert.deepEqual(mayoriaDe(["SI", "SI", "NO"]), { mayoria: "SI", votantes: 3 });
  assert.deepEqual(mayoriaDe(["SI", "NO", "ABSTENCIÓN/BLANCO", "NO"]), { mayoria: "NO", votantes: 4 });
  // AUSENTE y NO VOTA no son votos emitidos: no forman mayoría ni cuentan como votantes.
  assert.deepEqual(mayoriaDe(["AUSENTE", "AUSENTE", "AUSENTE", "SI"]), { mayoria: "SI", votantes: 1 });
  assert.deepEqual(mayoriaDe(["NO VOTA", "NO VOTA", "NO", "SI", "SI"]), { mayoria: "SI", votantes: 3 });
  // Empate en el primer lugar, aunque haya una tercera categoría con menos votos.
  assert.deepEqual(mayoriaDe(["SI", "NO"]), { mayoria: null, votantes: 2 });
  assert.deepEqual(mayoriaDe(["SI", "SI", "NO", "NO", "ABSTENCIÓN/BLANCO"]), { mayoria: null, votantes: 5 });
  assert.deepEqual(mayoriaDe(["SI", "NO", "ABSTENCIÓN/BLANCO"]), { mayoria: null, votantes: 3 });
  // Las mociones son votos emitidos.
  assert.deepEqual(mayoriaDe(["MOCIÓN 1", "MOCIÓN 2", "MOCIÓN 2", "AUSENTE"]), { mayoria: "MOCIÓN 2", votantes: 3 });
  assert.deepEqual(mayoriaDe(["AUSENTE", "NO VOTA"]), { mayoria: null, votantes: 0 });
  assert.deepEqual(mayoriaDe([]), { mayoria: null, votantes: 0 });
  assert.ok(esVotoEmitido("ABSTENCIÓN/BLANCO") && esVotoEmitido("MOCIÓN 3"));
  assert.ok(!esVotoEmitido("AUSENTE") && !esVotoEmitido("NO VOTA") && !esVotoEmitido(""));
});

// Recuento a mano de 13 casos (11 votaciones, 3 bancadas) a partir de votos.csv y legisladores.json:
// votos emitidos de la bancada, mayoría (null = empate) y quiénes votaron distinto.
const ANR_A = 'BANCADA DE LA ASOCIACIÓN NACIONAL REPUBLICANA ANR - A "HONOR COLORADO"';
const PLRA_A_DIP = "BANCADA DEL PARTIDO LIBERAL RADICAL AUTÉNTICO PLRA - A";
const PLRA_A_SEN = 'PARTIDO LIBERAL RADICAL AUTENTICO (PLRA) "A"';
const A_MANO = [
  [ANR_A, 104222, { NO: 25, "ABSTENCIÓN/BLANCO": 1 }, "NO", [101397]],
  [ANR_A, 104235, { SI: 23, "ABSTENCIÓN/BLANCO": 1 }, "SI", [101454]],
  [ANR_A, 104236, { NO: 24, SI: 4 }, "NO", [101403, 101392, 101397, 101434]],
  [ANR_A, 104237, { SI: 30 }, "SI", []],
  [ANR_A, 104375, { NO: 16, SI: 2, "ABSTENCIÓN/BLANCO": 3 }, "NO", [101464, 101392, 101459, 101480, 101413]],
  [PLRA_A_DIP, 104224, { NO: 5, SI: 1 }, "NO", [101449]],
  [PLRA_A_DIP, 104235, { "ABSTENCIÓN/BLANCO": 1, SI: 2 }, "SI", [101471]],
  [PLRA_A_DIP, 104236, { "ABSTENCIÓN/BLANCO": 1, NO: 1 }, null, []],
  [PLRA_A_DIP, 104252, { "ABSTENCIÓN/BLANCO": 1, SI: 3 }, "SI", [101471]],
  [PLRA_A_SEN, 104240, { NO: 1, SI: 1, "ABSTENCIÓN/BLANCO": 1 }, null, []],
  [PLRA_A_SEN, 104243, { NO: 2, SI: 1 }, "NO", [101368]],
  [PLRA_A_SEN, 104246, { SI: 2, NO: 1 }, "SI", [101355]],
  [PLRA_A_SEN, 104266, { SI: 2, NO: 1 }, "SI", [101368]],
];

test("votos distintos a la mayoría de su bancada: 13 casos calculados a mano en 11 votaciones de 3 bancadas", () => {
  const votos = fuente(PERIODO, "votos.csv");
  const oficiales = new Map(fuente(PERIODO, "legisladores.json").map((l) => [l.idLegislador, l]));
  const slugDe = new Map([...todas().enEjercicio, ...todas().noEjercen].map((r) => [r.id, r.slug]));
  assert.equal(new Set(A_MANO.map((c) => c[1])).size, 11);
  for (const [bancada, idVotacion, conteo, mayoria, distintos] of A_MANO) {
    const caso = `${bancada} en ${idVotacion}`;
    const miembros = votos.filter(
      (v) =>
        Number(v.idVotacion) === idVotacion &&
        oficiales.get(Number(v.idLegislador))?.bancada === bancada &&
        esVotoEmitido(v.sentidoVotacion),
    );
    // Los datos siguen siendo los del recuento a mano.
    const cuenta = {};
    for (const v of miembros) cuenta[v.sentidoVotacion] = (cuenta[v.sentidoVotacion] ?? 0) + 1;
    assert.deepEqual(cuenta, conteo, caso);
    for (const v of miembros) {
      const id = Number(v.idLegislador);
      const fila = de(slugDe.get(id)).mayoria.lista.find((x) => x.id === idVotacion);
      if (mayoria === null) {
        // Empate: la votación no cuenta para la bancada; si figura en la lista es por el partido.
        if (fila) assert.equal(fila.bancada.estado, "empate", `${caso}, ${id}`);
      } else if (distintos.includes(id)) {
        assert.ok(fila, `${caso}, falta ${id}`);
        assert.deepEqual(
          [fila.sentido, fila.bancada.estado, fila.bancada.mayoria],
          [v.sentidoVotacion, "distinto", mayoria],
          `${caso}, ${id}`,
        );
      } else if (fila) {
        assert.deepEqual([fila.bancada.estado, fila.bancada.mayoria], ["igual", mayoria], `${caso}, ${id}`);
      }
    }
  }
});

test("votos distintos a la mayoría: cifras coherentes con la lista, empates y único votante aparte", () => {
  const filas = comparativa(PERIODO).camaras.flatMap((c) => c.filas);
  for (const f of filas) {
    const m = de(f.slug).mayoria;
    for (const grupo of ["bancada", "partido"]) {
      const c = m[grupo];
      const enLista = m.lista.filter((x) => x[grupo].estado === "distinto").length;
      assert.equal(c.cantidad, enLista, `${f.slug} ${grupo}`);
      assert.ok(c.total + c.empates + c.unico <= m.emitidos, `${f.slug} ${grupo}`);
      if (!c.grupo) assert.equal(c.total + c.empates + c.unico, 0, `${f.slug} ${grupo}`);
    }
    assert.ok(m.lista.every((x) => esVotoEmitido(x.sentido)), f.slug);
  }
  // Sin bancada registrada: sin cifra de bancada, con cifra de partido.
  const sinBancada = de("juan-carlos-baruja-fernandez").mayoria;
  assert.equal(sinBancada.bancada.grupo, null);
  assert.ok(sinBancada.partido.total > 0);
  // Único legislador de su partido en el Senado: nunca hay votación comparable por partido.
  const unico = filas.find((f) => f.id === 101362);
  assert.equal(unico.mayoriaPartido.total, 0);
  assert.ok(unico.mayoriaPartido.unico > 0);
});
