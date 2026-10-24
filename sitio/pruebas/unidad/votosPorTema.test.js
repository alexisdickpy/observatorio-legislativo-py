// Pruebas de los votos de partidos y bancadas por tema (lib/votosPorTema.js, #37).
import assert from "node:assert/strict";
import { test } from "node:test";

import { csv } from "../../src/lib/calculados.js";
import { fuente, leerJson } from "../../src/lib/datos.js";
import { partidoUnificado } from "../../src/lib/partidos.js";
import * as rutas from "../../src/lib/rutas.js";
import { temas } from "../../src/lib/temas.js";
import { votacionesDelPeriodo } from "../../src/lib/votaciones.js";
import { COLUMNAS_VOTOS_POR_TEMA, repartoPorGrupo, tablaVotosPorTema, votosPorTema } from "../../src/lib/votosPorTema.js";

const PERIODO = "2023-2028";
const SENADO = "CAMARA DE SENADORES";
const DIPUTADOS = "CAMARA DE DIPUTADOS";
const voto = (grupo, sentido, texto = grupo) => ({ grupo, texto, sentido });

test("reparto por grupo: denominador con AUSENTE y NO VOTA, categorías sin fusionar, orden y votos sin grupo", () => {
  const categorias = ["SI", "NO", "ABSTENCIÓN/BLANCO", "MOCIÓN 1", "NO VOTA", "AUSENTE"];
  const filas = repartoPorGrupo(
    [
      voto("a", "SI", "Grupo A"), voto("a", "SI", "Grupo A"), voto("a", "NO", "Grupo A"), voto("a", "AUSENTE", "Grupo A"),
      voto("b", "MOCIÓN 1", "Grupo B"), voto("b", "NO VOTA", "Grupo B"),
      voto("c", "SI", "Grupo C"), voto("c", "ABSTENCIÓN/BLANCO", "Grupo C"),
      voto(null, "SI"), voto("", "NO"),
    ],
    categorias,
  );
  assert.deepEqual(
    filas.map((f) => [f.id, f.texto, f.votos, f.celdas.map((c) => c.cantidad)]),
    [
      ["a", "Grupo A", 4, [2, 1, 0, 0, 0, 1]],
      ["b", "Grupo B", 2, [0, 0, 0, 1, 1, 0]],
      ["c", "Grupo C", 2, [1, 0, 1, 0, 0, 0]],
    ],
  );
  assert.equal(filas[0].celdas[0].texto, "2 de 4 (50%)");
  assert.equal(filas[0].celdas.every((c) => c.total === 4), true, "Cada cantidad lleva el mismo denominador del grupo");
  // La barra solo lleva las categorías con votos.
  assert.deepEqual(filas[1].barra.segmentos.map((s) => [s.categoria, s.ancho]), [["MOCIÓN 1", 50], ["NO VOTA", 50]]);
});

/** Recuento aparte, directo de los archivos: votos de un partido unificado en las votaciones de un tema y una cámara. */
function recuento(tema, camara, partido) {
  const clasificacion = new Map(
    leerJson("propios/clasificacion-temas.json")
      .proyectos.filter((e) => e.periodoLegislativo === PERIODO)
      .map((e) => [e.idProyecto, e.temas.map((t) => t.tema)]),
  );
  const votaciones = new Map(
    fuente(PERIODO, "votaciones.json")
      .filter((v) => v.proyecto?.tipoProyecto === "PROYECTO DE LEY" || v._propio?.idLeyes?.length > 0)
      .filter((v) => v.tramitacion?.camaraTramite === camara && (clasificacion.get(v.proyecto?.idProyecto) ?? []).includes(tema))
      .map((v) => [v.idVotacion, v]),
  );
  const legisladores = new Map(fuente(PERIODO, "legisladores.json").map((l) => [l.idLegislador, l]));
  const cuenta = {};
  for (const x of fuente(PERIODO, "votos.csv")) {
    if (!votaciones.has(Number(x.idVotacion))) continue;
    const texto = legisladores.get(Number(x.idLegislador))?.partidoPolitico;
    if (!texto || partidoUnificado(texto).id !== partido) continue;
    cuenta[x.sentidoVotacion] = (cuenta[x.sentidoVotacion] ?? 0) + 1;
  }
  return { votaciones: votaciones.size, cuenta };
}

test("reparto de ANR y PLRA en Salud, Educación y Ambiente, igual a un recuento aparte de los archivos", () => {
  const lista = votosPorTema(PERIODO);
  for (const tema of ["salud", "educacion", "ambiente"]) {
    for (const camara of [SENADO, DIPUTADOS]) {
      const c = lista.find((t) => t.id === tema).camaras.find((x) => x.camara === camara);
      for (const partido of ["asociacion-nacional-republicana-anr", "partido-liberal-radical-autentico-plra"]) {
        const esperado = recuento(tema, camara, partido);
        assert.equal(c.votaciones.length, esperado.votaciones, `${tema} ${camara} votaciones`);
        const fila = c.partidos.find((f) => f.id === partido);
        const obtenido = Object.fromEntries(c.categorias.map((cat, n) => [cat, fila.celdas[n].cantidad]).filter(([, n]) => n > 0));
        assert.deepEqual(obtenido, esperado.cuenta, `${tema} ${camara} ${partido}`);
        assert.equal(fila.votos, Object.values(esperado.cuenta).reduce((n, x) => n + x, 0));
      }
    }
  }
});

test("cada tema reúne sus votaciones de /votaciones/, por cámara y sin sumar cámaras", () => {
  const { votaciones } = votacionesDelPeriodo(PERIODO);
  const lista = votosPorTema(PERIODO);
  assert.deepEqual(lista.map((t) => t.id).filter((id) => id !== "pendiente"), temas().map((t) => t.id));
  for (const t of lista) {
    assert.equal(t.url, rutas.votosPorTema(t.id));
    const delTema = votaciones.filter((v) => v.temas.filtro.includes(t.id));
    assert.equal(t.total, delTema.length, t.id);
    assert.equal(t.camaras.reduce((n, c) => n + c.votaciones.length, 0), t.total, t.id);
    assert.deepEqual(t.camaras.map((c) => c.camara).filter((c) => [SENADO, DIPUTADOS].includes(c)), [SENADO, DIPUTADOS].filter((c) => t.camaras.some((x) => x.camara === c)));
    for (const c of t.camaras) {
      assert.ok(c.votaciones.every((v) => delTema.find((x) => x.id === v.id).camara === c.camara), `${t.id} ${c.camara}`);
      // Todos los votos registrados están en algún partido, salvo los que no tienen partido.
      assert.ok(c.partidos.reduce((n, f) => n + f.votos, 0) <= c.votos);
      assert.ok(c.bancadas.reduce((n, f) => n + f.votos, 0) <= c.votos);
      for (const filas of [c.partidos, c.bancadas]) {
        for (let n = 1; n < filas.length; n++) assert.ok(filas[n - 1].votos >= filas[n].votos, `Orden en ${t.id} ${c.camara}`);
      }
      assert.deepEqual(c.leyenda.map((l) => l.categoria), c.categorias.filter((x, n) => c.partidos.some((f) => f.celdas[n].cantidad > 0) || c.bancadas.some((f) => f.celdas[n].cantidad > 0)));
    }
  }
});

test("tabla descargable: una fila por tema, cámara, grupo y categoría con votos", () => {
  const filas = tablaVotosPorTema(PERIODO);
  assert.ok(filas.length > 0);
  assert.ok(filas.every((f) => f.votos > 0 && f.votos <= f.votosRegistrados && ["partido", "bancada"].includes(f.tipoGrupo)));
  const salud = votosPorTema(PERIODO).find((t) => t.id === "salud").camaras[0];
  const anr = salud.partidos[0];
  const deAnr = filas.filter((f) => f.tema === "salud" && f.camara === salud.camara && f.tipoGrupo === "partido" && f.grupo === anr.id);
  assert.deepEqual(deAnr.map((f) => f.votos), anr.celdas.map((c) => c.cantidad).filter((n) => n > 0));
  assert.ok(deAnr.every((f) => f.votosRegistrados === anr.votos && f.votaciones === salud.votaciones.length && f.textoOficial === anr.texto));
  assert.equal(csv(COLUMNAS_VOTOS_POR_TEMA, filas).split("\n")[0], `﻿${COLUMNAS_VOTOS_POR_TEMA.join(",")}`);
});
