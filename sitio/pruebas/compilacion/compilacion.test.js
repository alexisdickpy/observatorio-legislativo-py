// Comprueba el sitio compilado (ejecutar después de npm run build).
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { leyes } from "../../src/lib/catalogo.js";
import { archivosDeDatos, estado, periodos } from "../../src/lib/datos.js";
import { detalleDeRegistro } from "../../src/lib/ficha.js";
import { archivosCalculados } from "../../src/lib/calculados.js";
import { coincidencia, textoDeCoincidencia } from "../../src/lib/coincidencia.js";
import { comparativa, ficha, legisladores, listado } from "../../src/lib/legisladores.js";
import { observacionesDeLosDatos } from "../../src/lib/metodologia.js";
import { menuPrincipal, vistasDeAnalisis } from "../../src/lib/navegacion.js";
import { vistaPrevia } from "../../src/lib/portada.js";
import * as rutas from "../../src/lib/rutas.js";
import { masAjustadas, votacionesDelAnio, votacionesDelPeriodo } from "../../src/lib/votaciones.js";
import { MINIMO_VOTACIONES_AUSENCIAS, masAusentes } from "../../src/lib/rankings.js";
import { votosDistintosAlPartido } from "../../src/lib/votosDistintos.js";
import { votosPorTema } from "../../src/lib/votosPorTema.js";
import { compartirVotacion } from "../../src/lib/compartir.js";

const dist = resolve(process.cwd(), "dist");
const pagina = (url) => join(dist, decodeURIComponent(url), "index.html");
const leer = (url) => readFileSync(pagina(url), "utf-8");
/** HTML con los espacios y saltos de línea seguidos reducidos a uno (compressHTML está desactivado). */
const texto = (url) => leer(url).replace(/\s+/g, " ");

test("una ficha por número de ley", () => {
  for (const ley of leyes()) assert.ok(existsSync(pagina(ley.url)), `Falta la ficha ${ley.url}`);
});

test("cada ficha muestra autores, enlaces oficiales y todas sus votaciones", () => {
  for (const ley of leyes()) {
    const html = leer(ley.url);
    assert.ok(html.includes("Iniciativa y autores"), `Faltan los autores en ${ley.url}`);
    for (const registro of ley.registros) {
      if (registro.urlLey) assert.ok(html.includes(`href="${registro.urlLey}"`), `Falta el enlace a la ley en ${ley.url}`);
      if (registro.urlExpediente) assert.ok(html.includes(`href="${registro.urlExpediente}"`));
      const { votaciones } = detalleDeRegistro(registro);
      if (votaciones.cantidad === 0) assert.ok(html.includes("no tiene votaciones nominales registradas"));
      else assert.ok(html.includes("no necesariamente eran los vigentes"), `Falta el aviso de afiliación en ${ley.url}`);
      for (const v of votaciones.indice) {
        assert.ok(html.includes(`id="${v.ancla}"`) && html.includes(`href="#${v.ancla}"`), `Falta ${v.ancla} en ${ley.url}`);
      }
      for (const o of votaciones.otrosPeriodos) assert.ok(html.includes(`href="${o.url}"`));
    }
  }
});

test("tamaño razonable de las fichas", () => {
  for (const ley of leyes()) {
    const bytes = statSync(pagina(ley.url)).size;
    assert.ok(bytes < 1_000_000, `${ley.url} pesa ${bytes} bytes`);
  }
});

test("páginas fijas", () => {
  for (const url of [rutas.inicio(), rutas.leyes(), rutas.legisladores(), rutas.coincidencia(), rutas.votaciones(), rutas.buscar(), rutas.datosAbiertos(), rutas.metodologia(), rutas.privacidad()]) {
    assert.ok(existsSync(pagina(url)), `Falta ${url}`);
  }
});

test("el catálogo lista todas las leyes", () => {
  const html = leer(rutas.leyes());
  for (const ley of leyes()) assert.ok(html.includes(`data-numero="${ley.numero}"`), `Falta ${ley.numero}`);
});

test("cada página tiene la cita de la fuente y la fecha de actualización", () => {
  const cita = estado().fuente.cita;
  const unLegislador = rutas.legislador(legisladores()[0].slug);
  for (const url of [rutas.inicio(), rutas.leyes(), rutas.ley(leyes()[0].numero), rutas.legisladores(), unLegislador, rutas.datosAbiertos()]) {
    const html = leer(url);
    assert.ok(html.includes(cita), `Falta la cita en ${url}`);
    assert.ok(html.includes(`datetime="${estado().ultimaComprobacion}"`), `Falta la fecha en ${url}`);
  }
});

test("índice de búsqueda generado", () => {
  assert.ok(existsSync(join(dist, "pagefind", "pagefind.js")));
});

test("datos/ servido en /datos/ con las mismas rutas", () => {
  const html = leer(rutas.datosAbiertos());
  for (const { ruta } of archivosDeDatos()) {
    assert.ok(existsSync(join(dist, "datos", ruta)), `Falta ${ruta}`);
    assert.ok(html.includes(`href="${rutas.archivoDatos(ruta)}"`), `La página de descargas no enlaza ${ruta}`);
  }
});

test("una ficha por legislador, con su historial enlazado a las fichas de ley", () => {
  for (const persona of legisladores()) {
    const html = leer(persona.url);
    assert.ok(html.includes("no necesariamente eran los vigentes"), `Falta el aviso de afiliación en ${persona.url}`);
    for (const b of ficha(persona).bloques) {
      if (b.urlSilpy) assert.ok(html.includes(`href="${b.urlSilpy}"`));
      if (b.correo) assert.ok(html.includes(`href="mailto:${b.correo}"`), `Falta el correo en ${persona.url}`);
      if (b.foto) assert.ok(existsSync(join(dist, b.foto)), `Falta la foto ${b.foto}`);
      for (const l of b.autoria) assert.ok(html.includes(`href="${l.url}"`), `Falta la ley ${l.numero} en ${persona.url}`);
      for (const h of b.votos.historial) {
        for (const l of h.leyes) assert.ok(html.includes(`href="${l.url}"`), `Falta ${l.url} en ${persona.url}`);
        if (!h.leyes.length) assert.ok(html.includes(`href="${h.proyecto.url}"`), `Falta ${h.proyecto.url} en ${persona.url}`);
      }
      const filas = html.match(/<tr data-estado=/g)?.length ?? 0;
      assert.equal(filas, b.votos.historial.length, `Filas del historial en ${persona.url}`);
      if (b.votos.porEstado.length > 1) {
        assert.ok(html.includes("data-filtro-votos"), `Falta el filtro por estado en ${persona.url}`);
        for (const e of b.votos.porEstado) assert.ok(html.includes(`data-resumen-estado="${e.filtro}"`), `${persona.url} ${e.filtro}`);
      }
    }
    const bytes = statSync(pagina(persona.url)).size;
    assert.ok(bytes < 500_000, `${persona.url} pesa ${bytes} bytes`);
  }
});

test("ausencias en votaciones nominales en cada ficha, con su denominador y su lista", () => {
  const enlace = `href="${rutas.metodologia(rutas.anclasMetodologia.ausencias)}"`;
  for (const persona of legisladores()) {
    const html = leer(persona.url);
    const bloques = ficha(persona).bloques;
    assert.ok(html.includes("Ausencias en votaciones nominales"), persona.url);
    for (const b of bloques.filter((x) => x.ausencias.total > 0)) {
      assert.ok(html.includes(b.ausencias.texto), `Falta ${b.ausencias.texto} en ${persona.url}`);
      assert.ok(html.includes(enlace), `Falta el enlace a la metodología en ${persona.url}`);
      for (const x of b.ausencias.lista) assert.ok(html.includes(`href="${x.url}"`), `Falta ${x.url} en ${persona.url}`);
    }
    const filas = html.match(/<tr data-ausencia>/g)?.length ?? 0;
    assert.equal(filas, bloques.reduce((n, b) => n + b.ausencias.lista.length, 0), `Filas de ausencias en ${persona.url}`);
  }
});

test("NO VOTA y abstenciones en cada ficha, con su denominador y el enlace a la vista comparativa", () => {
  const metodologia = `href="${rutas.metodologia(rutas.anclasMetodologia.noVotaAbstencion)}"`;
  const vista = `href="${rutas.votacionesNominales()}"`;
  for (const persona of legisladores()) {
    const html = texto(persona.url);
    for (const b of ficha(persona).bloques.filter((x) => x.ausencias.total > 0)) {
      assert.ok(html.includes("NO VOTA y abstenciones en votaciones nominales"), persona.url);
      assert.ok(html.includes(b.noVota.texto) && html.includes(b.abstencion.texto), persona.url);
      assert.ok(html.includes(metodologia) && html.includes(vista), persona.url);
    }
  }
});

test("votos distintos a la mayoría en cada ficha, con sus denominadores y su lista", () => {
  const metodologia = `href="${rutas.metodologia(rutas.anclasMetodologia.mayoria)}"`;
  for (const persona of legisladores()) {
    const html = leer(persona.url);
    const bloques = ficha(persona).bloques;
    for (const b of bloques.filter((x) => x.mayoria.emitidos > 0)) {
      assert.ok(html.includes("Votos distintos a la mayoría de su bancada y de su partido"), persona.url);
      assert.ok(html.includes(metodologia), `Falta el enlace a la metodología en ${persona.url}`);
      for (const c of [b.mayoria.bancada, b.mayoria.partido]) {
        if (c.total) assert.ok(html.includes(c.texto), `Falta ${c.texto} en ${persona.url}`);
      }
    }
    const filas = html.match(/<tr data-distinto>/g)?.length ?? 0;
    assert.equal(filas, bloques.reduce((n, b) => n + b.mayoria.lista.length, 0), `Filas de votos distintos en ${persona.url}`);
  }
});

test("vista comparativa: una fila por legislador con sus cinco cifras, fórmulas y títulos neutrales", () => {
  const periodo = periodos().find((p) => p.vigente).id;
  const html = texto(rutas.votacionesNominales());
  assert.ok(html.includes("Cifra de cada categoría = votaciones en que figura con esa categoría"));
  assert.ok(html.includes("Votos distintos = votaciones en que su voto difiere de la mayoría del grupo"));
  assert.ok(html.includes(`href="${rutas.metodologia(rutas.anclasMetodologia.mayoria)}"`));
  assert.ok(html.includes(`href="${rutas.metodologia(rutas.anclasMetodologia.noVotaAbstencion)}"`));
  const filas = comparativa(periodo).camaras.flatMap((c) => c.filas);
  assert.equal(html.match(/<tr data-comparativa /g)?.length ?? 0, filas.length);
  for (const f of filas) {
    const fila = html.match(new RegExp(`<tr data-comparativa data-slug="${f.slug}"[^]*?</tr>`))?.[0] ?? "";
    assert.ok(fila.includes(`href="${f.url}"`), f.slug);
    for (const c of [f.ausencias, f.noVota, f.abstencion]) assert.ok(fila.includes(c.texto), `${f.slug} ${c.texto}`);
    for (const c of [f.mayoriaBancada, f.mayoriaPartido]) if (c.total) assert.ok(fila.includes(c.texto), `${f.slug} ${c.texto}`);
  }
  const visible = html.replace(/<(script|style)[\s\S]*?<\/\1>/g, " ").replace(/<[^>]+>/g, " ");
  const calificativo = visible.match(/.{0,30}\b(mejor|peor|ranking|puesto|campe[oó]n|faltador|vago)\b.{0,20}/i);
  assert.ok(!calificativo, `«${calificativo?.[0]}»`);
  assert.ok(texto(rutas.legisladores()).includes(`href="${rutas.votacionesNominales()}"`));
});

test("coincidencia de votos: un bloque por grupo, cifras con su denominador, fórmula y títulos neutrales", () => {
  const periodo = periodos().find((p) => p.vigente).id;
  const r = coincidencia(periodo);
  const html = texto(rutas.coincidencia());
  assert.ok(html.includes("Coincidencia = votaciones en que los dos grupos tuvieron la misma posición"));
  assert.ok(html.includes(`href="${rutas.metodologia(rutas.anclasMetodologia.coincidencia)}"`));
  assert.ok(leer(rutas.metodologia()).includes(`id="${rutas.anclasMetodologia.coincidencia}"`));
  for (const cuadro of r.cuadros) {
    for (const f of cuadro.filas) for (const c of f.celdas) if (c) assert.ok(html.includes(c.fraccion), `${cuadro.camara} ${f.id}`);
  }
  assert.equal(html.match(/<tr data-cuadro-fila=/g)?.length ?? 0, r.cuadros.reduce((n, c) => n + c.filas.length, 0));
  const grupos = [...r.partidos, ...r.bancadas.flatMap((b) => b.grupos)];
  assert.equal(html.match(/ data-grupo="/g)?.length ?? 0, grupos.length);
  assert.equal(html.match(/<option value="/g)?.length ?? 0, grupos.length);
  for (const g of grupos) {
    const bloque = html.match(new RegExp(`<section class="grupo-coincidencia[^"]*" id="${g.valor}"[^]*?</table>`))?.[0] ?? "";
    assert.ok(bloque, `Falta el bloque ${g.valor}`);
    assert.equal(bloque.match(/<tr data-coincidencia/g)?.length ?? 0, g.filas.length, g.valor);
    for (const f of g.filas) {
      for (const c of f.celdas ?? [f]) assert.ok(bloque.includes(escapar(textoDeCoincidencia(c))), `${g.valor} / ${f.nombre}`);
    }
  }
  const visible = html.replace(/<(script|style)[\s\S]*?<\/\1>/g, " ").replace(/<[^>]+>/g, " ");
  const calificativo = visible.match(/.{0,30}\b(mejor|peor|ranking|puesto|campe[oó]n|aliado|enemigo|traici[oó]n|leal)\b.{0,20}/i);
  assert.ok(!calificativo, `«${calificativo?.[0]}»`);
  assert.ok(texto(rutas.legisladores()).includes(`href="${rutas.coincidencia()}"`));
  assert.ok(texto(rutas.votacionesNominales()).includes(`href="${rutas.coincidencia()}"`));
});

/** Si una lista de un ranking tiene al legislador con su enlace, su foto (si la tiene), su partido y su cifra. */
function itemRanking(html, f, cifra = "mayoriaPartido") {
  const atributo = cifra === "ausencias" ? "data-ausencias" : "data-votos-distintos";
  const item = html.match(new RegExp(`<li ${atributo}="${f.slug}"[^]*?</li>`))?.[0] ?? "";
  return (
    item.includes(`href="${f.url}"`) &&
    (!f.foto || item.includes(`src="${f.foto}"`)) &&
    item.includes(escapar(f.mayoriaPartido.grupo ?? "Sin partido registrado")) &&
    item.includes(f[cifra].porcentajeTexto) &&
    item.includes(`${f[cifra].fraccion} votaciones`)
  );
}
const itemVotosDistintos = (html, f) => itemRanking(html, f);

test("rankings, más «rebeldes»: cifras con su denominador, enlaces, fotos, mínimo y sin otros calificativos", () => {
  const periodo = periodos().find((p) => p.vigente).id;
  const { camaras, minimo } = votosDistintosAlPartido(periodo);
  const completa = texto(rutas.rankings());
  assert.match(completa, /<h1[^>]*>Rankings<\/h1>/);
  assert.ok(completa.includes(`href="#${rutas.anclasRankings.rebeldes}"`) && completa.includes(`href="#${rutas.anclasRankings.ausentes}"`));
  // Solo la parte de más «rebeldes».
  const html = completa.match(new RegExp(`<section id="${rutas.anclasRankings.rebeldes}"[^]*?(?=<section id="${rutas.anclasRankings.ausentes}")`))?.[0] ?? "";
  assert.match(html, /<h2[^>]*>Más «rebeldes»<\/h2>/);
  assert.ok(html.includes("Legisladores que más veces votaron distinto a la mayoría de su partido."));
  assert.ok(html.includes("Votos distintos = votaciones en que su voto difiere de la mayoría de su partido"));
  assert.ok(html.includes(`al menos ${minimo} votaciones comparables`));
  assert.ok(html.includes(`href="${rutas.metodologia(rutas.anclasMetodologia.cuadroVotosDistintos)}"`));
  assert.ok(leer(rutas.metodologia()).includes(`id="${rutas.anclasMetodologia.cuadroVotosDistintos}"`));
  assert.ok(html.includes(`href="${rutas.votacionesNominalesOrdenadas("partido")}"`));
  assert.equal(html.match(/<section data-camara-votos-distintos/g)?.length ?? 0, camaras.length);
  assert.equal(html.match(/<li data-votos-distintos=/g)?.length ?? 0, camaras.reduce((n, c) => n + c.filas.length, 0));
  assert.ok(camaras.some((c) => c.filas.some((f) => f.foto)), "Ningún legislador del cuadro tiene foto");
  for (const c of camaras) {
    for (const f of c.filas) assert.ok(itemVotosDistintos(html, f), f.slug);
    for (const f of c.sinComparables) {
      const item = html.match(new RegExp(`<li data-sin-comparables="${f.slug}"[^]*?</li>`))?.[0] ?? "";
      assert.ok(item.includes(`href="${f.url}"`), `Falta ${f.slug} entre quienes no tienen votaciones comparables`);
    }
  }
  // El orden de las filas en la página es el del cuadro.
  const orden = [...html.matchAll(/<li data-votos-distintos="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(orden, camaras.flatMap((c) => c.filas.map((f) => f.slug)));
  // «rebeldes» y «ausentes» solo entre comillas, como apodos en los títulos.
  const visible = completa.replace(/<header[\s\S]*?<\/header>/, " ").replace(/<(script|style)[\s\S]*?<\/\1>/g, " ").replace(/<[^>]+>/g, " ").replaceAll("«rebeldes»", " ").replaceAll("«ausentes»", " ");
  const calificativo = visible.match(/.{0,30}\b(mejor|peor|ranking|puesto|campe[oó]n|rebelde|d[ií]scolo|traici[oó]n|leal|vago|falt[oó]n)\b.{0,20}/i);
  assert.ok(!calificativo, `«${calificativo?.[0]}»`);
  const ausentes = visible.match(/.{0,30}\bausentes\b.{0,20}/);
  assert.ok(!ausentes, `«${ausentes?.[0]}»`);
  assert.ok(texto(rutas.votacionesNominales()).includes(`href="${rutas.rankings()}"`));
  assert.ok(completa.includes(`href="${rutas.votacionesNominales()}"`), "Rankings no enlaza la tabla completa");
});

test("rankings, más «ausentes»: cifras con su denominador, enlaces, fotos, mínimo y notas sobre el motivo", () => {
  const periodo = periodos().find((p) => p.vigente).id;
  const { camaras, minimo } = masAusentes(periodo);
  assert.equal(minimo, MINIMO_VOTACIONES_AUSENCIAS);
  const html = texto(rutas.rankings()).match(new RegExp(`<section id="${rutas.anclasRankings.ausentes}"[^]*$`))?.[0] ?? "";
  assert.match(html, /<h2[^>]*>Más «ausentes»<\/h2>/);
  assert.ok(html.includes("Legisladores con más ausencias en votaciones nominales."));
  assert.ok(html.includes("Ausencias = votaciones nominales en que figura como AUSENTE"));
  assert.ok(html.includes(`al menos ${minimo} votaciones nominales`));
  assert.ok(html.includes("La fuente no dice por qué un legislador figura como AUSENTE."));
  assert.ok(html.includes("Figurar como AUSENTE en una votación no es lo mismo que no ir a la sesión."));
  assert.ok(html.includes(`href="${rutas.metodologia(rutas.anclasMetodologia.cuadroAusencias)}"`));
  assert.ok(leer(rutas.metodologia()).includes(`id="${rutas.anclasMetodologia.cuadroAusencias}"`));
  assert.ok(html.includes(`href="${rutas.votacionesNominalesOrdenadas("ausencias")}"`));
  assert.equal(html.match(/<section data-camara-ausencias/g)?.length ?? 0, camaras.length);
  assert.equal(html.match(/<li data-ausencias=/g)?.length ?? 0, camaras.reduce((n, c) => n + c.filas.length, 0));
  assert.ok(camaras.some((c) => c.filas.some((f) => f.foto)), "Ningún legislador de la lista tiene foto");
  for (const c of camaras) {
    for (const f of c.filas) assert.ok(itemRanking(html, f, "ausencias"), f.slug);
    if (c.bajoMinimo) assert.ok(html.includes(`en menos de ${minimo} votaciones nominales`), c.camara);
  }
  const orden = [...html.matchAll(/<li data-ausencias="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(orden, camaras.flatMap((c) => c.filas.map((f) => f.slug)));
  // La lista de ausentes no va en la portada.
  assert.ok(!leer(rutas.inicio()).includes("data-ausencias="), "La portada muestra la lista de más «ausentes»");
});

test("las direcciones que cambiaron redirigen con una redirección permanente", () => {
  const lineas = readFileSync(join(dist, "_redirects"), "utf-8").split(/\r?\n/).map((l) => l.trim().split(/\s+/));
  for (const { desde, hacia } of rutas.redireccionesPermanentes()) {
    for (const origen of [desde, desde.replace(/\/$/, "")]) {
      assert.ok(lineas.some(([a, b, c]) => a === origen && b === hacia && c === "301"), `Falta la redirección de ${origen} a ${hacia}`);
    }
    assert.ok(!existsSync(pagina(desde)), `${desde} sigue publicada`);
    assert.ok(existsSync(pagina(hacia)), `${hacia} no existe`);
  }
  assert.deepEqual(rutas.redireccionesPermanentes().map((r) => r.desde), ["/legisladores/votos-distintos-al-partido/"]);
});

/** Página principal de votaciones y la de cada año. */
const paginasDeTemas = () => [rutas.votosPorTema(), ...votosPorTema(periodos().find((p) => p.vigente).id).map((t) => t.url)];
/** Páginas propias de algunas votaciones (#45): las de la portada. */
const algunasVotaciones = () => votacionesDelPeriodo(periodos().find((p) => p.vigente).id).votaciones.slice(0, 20).map((v) => v.pagina);
const paginasDeVotaciones = () => [rutas.votaciones(), ...votacionesDelPeriodo(periodos().find((p) => p.vigente).id).anios.map((a) => a.url)];

/** Escapa un texto como lo escribe Astro en un atributo o en el contenido. */
const escapar = (t) => String(t).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/** Elemento de la lista de votaciones de una votación, o "". */
const itemVotacion = (html, id) => html.match(new RegExp(`<li data-votacion="${id}"[^]*?</ul><p class="chico"><a [^>]*>Ver votación</a></p></li>`))?.[0] ?? "";

/** Si el elemento tiene el proyecto enlazado con su título oficial completo, los totales con su denominador y una etiqueta por partido con su sigla y posición. */
function votacionCompleta(item, v) {
  const enlaces = [...(v.leyes.length ? v.leyes.map((l) => l.url) : [v.proyecto.url]), v.pagina];
  const titulos = (v.leyes.length ? v.leyes.map((l) => l.titulo) : [v.proyecto.titulo]).filter(Boolean);
  const comoTexto = (t) => escapar(t).replaceAll("'", "&#39;");
  return (
    titulos.every((t) => item.includes(`<span class="titulo texto-suave"> ${comoTexto(t)}</span>`)) &&
    v.autores.every((a) => item.includes(`<span title="${comoTexto(a.nombre)}"><b>${comoTexto(a.sigla)}</b> ${a.cantidad}</span>`)) &&
    (v.autores.length || !v.iniciativa || item.includes(`Iniciativa del <span>${v.iniciativa}</span>`)) &&
    enlaces.every((u) => !u || item.includes(`href="${u}"`)) &&
    item.includes(`(de ${v.registrados} legisladores registrados)`) &&
    v.totales.every((t) => item.includes(`${t.categoria} ${t.cantidad}`)) &&
    (item.match(/<li title=/g)?.length ?? 0) === v.partidos.length &&
    v.partidos.every((p) => item.includes(`<b>${escapar(p.sigla)}</b> ${p.texto}</li>`))
  );
}

test("votaciones: una página por año con cada votación, sus totales, la posición de cada partido y los filtros", () => {
  const periodo = periodos().find((p) => p.vigente).id;
  const { votaciones, anios } = votacionesDelPeriodo(periodo);
  let vistas = 0;
  for (const a of anios) {
    const html = leer(a.url);
    const r = votacionesDelAnio(periodo, a.anio);
    assert.equal(html.match(/<li data-votacion=/g)?.length ?? 0, r.votaciones.length, a.url);
    const orden = [...html.matchAll(/<li data-votacion="(\d+)"/g)].map((m) => Number(m[1]));
    assert.deepEqual(orden, r.votaciones.map((v) => v.id), `Orden en ${a.url}`);
    for (const v of r.votaciones) {
      const item = itemVotacion(html, v.id);
      assert.ok(item.includes(`data-camara="${v.camaraFiltro}" data-estado="${v.proyecto.estadoFiltro}" data-resultado="${v.resultadoFiltro}"`), `${a.url} ${v.id} filtros`);
      assert.ok(votacionCompleta(item, v), `${a.url} ${v.id}`);
    }
    vistas += r.votaciones.length;
    assert.ok(html.includes("data-filtro-votaciones"), `Falta el filtro en ${a.url}`);
    for (const campo of ["camara", "estado", "resultado"]) {
      for (const o of r.opciones[campo]) assert.ok(html.includes(`<option value="${o.valor}"`), `${a.url} ${campo} ${o.valor}`);
    }
    for (const otro of anios) {
      const enlace = otro.anio === a.anio ? new RegExp(`aria-current="page"[^>]*>${a.anio}<`).test(html) : html.includes(`href="${otro.url}"`);
      assert.ok(enlace, `${a.url} → ${otro.anio}`);
    }
    assert.ok(html.includes(`href="${rutas.metodologia(rutas.anclasMetodologia.posicionPartidos)}"`), a.url);
    assert.ok(html.includes("no necesariamente el de la fecha"), `Falta el aviso de afiliación en ${a.url}`);
    const bytes = statSync(pagina(a.url)).size;
    assert.ok(bytes < 900_000, `${a.url} pesa ${bytes} bytes`);
  }
  assert.equal(vistas, votaciones.length, "Cada votación figura una sola vez entre los años");
});

test("votaciones: página principal con los años, las más ajustadas, fórmulas y títulos neutrales", () => {
  const periodo = periodos().find((p) => p.vigente).id;
  const html = texto(rutas.votaciones());
  assert.match(html, /<h1[^>]*>Votaciones y posición de cada partido<\/h1>/);
  assert.ok(html.includes("Posición de un partido = la categoría con más votos entre los votos emitidos"));
  for (const a of votacionesDelPeriodo(periodo).anios) assert.ok(html.includes(`href="${a.url}"`), a.url);
  for (const ancla of [rutas.anclasMetodologia.posicionPartidos, rutas.anclasMetodologia.masAjustadas]) {
    assert.ok(html.includes(`href="${rutas.metodologia(ancla)}"`), ancla);
    assert.ok(leer(rutas.metodologia()).includes(`id="${ancla}"`), `Falta #${ancla} en la metodología`);
  }
  const ajustadas = masAjustadas(periodo);
  assert.equal(html.match(/<section data-camara-ajustadas/g)?.length ?? 0, ajustadas.length);
  const orden = [...html.matchAll(/<li data-votacion="(\d+)"/g)].map((m) => Number(m[1]));
  assert.deepEqual(orden, ajustadas.flatMap((c) => c.votaciones.map((v) => v.id)));
  for (const c of ajustadas) {
    for (const v of c.votaciones) {
      // Sin reducir los espacios, que los títulos oficiales conservan tal cual.
      const item = itemVotacion(leer(rutas.votaciones()), v.id);
      assert.ok(votacionCompleta(item, v), `${c.camara} ${v.id}`);
      assert.ok(item.includes(`Diferencia entre SI y NO <strong>${v.diferencia}</strong>`), `${c.camara} ${v.id} diferencia`);
    }
  }
  const visible = html.replace(/<(script|style)[\s\S]*?<\/\1>/g, " ").replace(/<span class="titulo[^>]*>[^<]*<\/span>/g, " ").replace(/<[^>]+>/g, " ");
  const calificativo = visible.match(/.{0,30}\b(mejor|peor|ranking|puesto|campe[oó]n|polémic[ao]|escándalo|reñid[ao])\b.{0,20}/i);
  assert.ok(!calificativo, `«${calificativo?.[0]}»`);
});

test("votaciones: los estilos de las listas, las barras y las etiquetas se cargan en sus páginas", () => {
  // Los componentes con estilos globales solo los agregan a las páginas que los usan.
  const estilos = (url) => {
    const html = leer(url);
    const enLinea = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
    const enlazados = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => readFileSync(join(dist, m[1]), "utf-8"));
    return [...enLinea, ...enlazados].join("\n");
  };
  for (const url of [...paginasDeVotaciones(), rutas.inicio()]) {
    const css = estilos(url);
    for (const selector of [".lista-votaciones", ".barra-votos", ".voto-si", ".posicion-partidos"]) {
      assert.ok(css.includes(selector), `Falta ${selector} en ${url}`);
    }
  }
  for (const url of [rutas.rankings(), rutas.inicio()]) assert.ok(estilos(url).includes(".lista-ranking"), `Faltan los estilos de la lista de rankings en ${url}`);
  const ley = votacionesDelPeriodo(periodos().find((p) => p.vigente).id).votaciones.find((v) => v.leyes.length).leyes[0];
  assert.ok(estilos(rutas.ley(ley.numero)).includes(".posicion-sentido"), "Faltan los estilos de la posición por sentido en la ficha de ley");
});

test("ficha de ley: la posición de cada partido agrupada por sentido en cada votación", () => {
  for (const ley of leyes()) {
    const html = leer(ley.url);
    for (const registro of ley.registros) {
      for (const v of detalleDeRegistro(registro).votaciones.indice) {
        const bloque = html.match(new RegExp(`<section class="votacion" id="${v.ancla}"[^]*?</section>`))?.[0] ?? "";
        if (!v.posicionesPorSentido.length) continue;
        assert.ok(bloque.includes("Posición de cada partido"), `${ley.url} ${v.ancla}`);
        for (const g of v.posicionesPorSentido) {
          const li = bloque.match(new RegExp(`<li data-sentido="${escapar(g.titulo)}">[^]*?</li>`))?.[0] ?? "";
          assert.ok(li, `${ley.url} ${v.ancla} ${g.titulo}`);
          for (const p of g.partidos) assert.ok(li.includes(`<abbr title="${escapar(p.partido)}">${escapar(p.sigla)}</abbr>`), `${ley.url} ${v.ancla} ${p.sigla}`);
        }
        // El desglose de siempre sigue en su lugar.
        assert.ok(bloque.includes("Por partido, en números") && bloque.includes("Ver por bancada"), `${ley.url} ${v.ancla} desglose`);
      }
    }
  }
});

test("tabla calculada servida y enlazada desde datos abiertos", () => {
  const html = leer(rutas.datosAbiertos());
  for (const a of archivosCalculados()) {
    const ruta = join(dist, decodeURIComponent(a.url));
    assert.ok(existsSync(ruta), `Falta ${a.url}`);
    assert.equal(readFileSync(ruta, "utf-8"), a.contenido);
    assert.ok(html.includes(`href="${a.url}"`), `La página de descargas no enlaza ${a.url}`);
  }
});

test("ningún texto propio presenta AUSENTE como asistencia, faltas o inasistencias", () => {
  // Se revisan los textos del sitio, sin los valores oficiales (títulos de proyectos y leyes, que
  // pueden tratar de asistencia social y se muestran sin cambios). La firma dice «con asistencia de
  // IA», el único uso permitido de la palabra.
  const prohibidas = /inasistencia|asistencia(?! de IA)|\bfalta|\bfaltó|días ausente/i;
  const urls = [rutas.inicio(), rutas.metodologia(), rutas.legisladores(), rutas.votacionesNominales(), rutas.coincidencia(), rutas.rankings(), ...paginasDeVotaciones(), ...algunasVotaciones(), ...legisladores().map((p) => p.url)];
  for (const url of urls) {
    const visible = leer(url)
      .replace(/<(script|style)[\s\S]*?<\/\1>/g, " ")
      .replace(/<table[\s\S]*?<\/table>/g, " ")
      .replace(/<span class="titulo[^>]*>[^<]*<\/span>/g, " ")
      .replace(/<[^>]+>/g, " ");
    const encontrado = visible.match(new RegExp(`.{0,30}(${prohibidas.source}).{0,20}`, "i"));
    assert.ok(!encontrado, `En ${url}, «${encontrado?.[0]}»`);
  }
});

test("cada enlace del historial lleva a una votación que existe en la ficha de la ley", () => {
  const anclas = new Map();
  for (const persona of legisladores()) {
    for (const h of ficha(persona).bloques.flatMap((b) => b.votos.historial)) {
      for (const l of h.leyes) {
        if (!anclas.has(l.numero)) anclas.set(l.numero, leer(rutas.ley(l.numero)));
        assert.ok(anclas.get(l.numero).includes(`id="${rutas.anclaVotacion(h.id)}"`), l.url);
      }
    }
  }
});

test("el listado incluye a todos los legisladores del período y las fichas de ley los enlazan", () => {
  const html = leer(rutas.legisladores());
  const { enEjercicio, noEjercen } = listado("2023-2028");
  for (const l of [...enEjercicio, ...noEjercen]) assert.ok(html.includes(`href="${l.url}"`), `Falta ${l.url}`);
  const ley = leer(rutas.ley("7140"));
  assert.ok(ley.includes(`href="${rutas.legislador("silvio-adalberto-ovelar-benitez")}"`));
});

test("fotos: la original en /datos/fotos/ y la reducida en /fotos/", () => {
  for (const persona of legisladores()) {
    for (const b of ficha(persona).bloques.filter((x) => x.foto)) {
      const original = join(dist, "datos", "fotos", b.periodo, `${b.id}.jpg`);
      assert.ok(existsSync(original), `Falta ${original}`);
      assert.ok(statSync(join(dist, b.foto)).size < 40_000, `${b.foto} no está reducida`);
    }
  }
});

/** Todas las páginas HTML del sitio compilado, como URL. */
function todasLasPaginas(carpeta = dist, base = "/") {
  const urls = [];
  for (const e of readdirSync(carpeta, { withFileTypes: true })) {
    if (e.isDirectory() && !["fotos", "pagefind", "_astro"].includes(e.name)) {
      urls.push(...todasLasPaginas(join(carpeta, e.name), `${base}${e.name}/`));
    } else if (e.name === "index.html") urls.push(base);
  }
  return urls;
}

test("todas las páginas tienen el pie común: aviso, enlaces, licencias y firma", () => {
  const urls = todasLasPaginas();
  assert.ok(urls.length > leyes().length + legisladores().length);
  for (const url of urls) {
    const html = texto(url);
    for (const buscado of [
      "sin vínculo con el Congreso",
      "con sus posibles errores. Este sitio no corrige los valores oficiales.",
      "Desarrollado por Alexis Dick con asistencia de IA.",
      `href="${rutas.metodologia()}"`,
      `href="${rutas.privacidad()}"`,
      `href="${rutas.codigoFuente()}"`,
      `href="${rutas.licenciaDatos()}"`,
      `href="${rutas.licenciaCodigo()}"`,
    ]) {
      assert.ok(html.includes(buscado), `Falta «${buscado}» en ${url}`);
    }
    assert.ok(!html.includes("prevalece"), `Queda el aviso anterior en ${url}`);
  }
});

test("la metodología tiene las secciones que enlazan las fichas y todas las observaciones sobre los datos", () => {
  const html = leer(rutas.metodologia());
  for (const ancla of Object.values(rutas.anclasMetodologia)) assert.ok(html.includes(`id="${ancla}"`), `Falta #${ancla}`);
  assert.ok(texto(rutas.metodologia()).includes("ausencias en votaciones nominales"));
  const { grupos } = observacionesDeLosDatos();
  for (const g of grupos) {
    assert.ok(html.includes(`id="${g.ancla}"`), `Falta el grupo ${g.tipo}`);
    for (const c of g.casos) {
      if (c.sitio) assert.ok(html.includes(`href="${c.sitio.url}"`), `Falta ${c.sitio.url}`);
      if (c.oficial) assert.ok(html.includes(`href="${c.oficial.url}"`), `Falta ${c.oficial.url}`);
    }
  }
});

test("la privacidad dice que no se recogen datos personales ni se usan cookies", () => {
  const html = texto(rutas.privacidad());
  assert.ok(html.includes("no recoge datos personales"));
  assert.ok(html.includes("sin cookies") || html.includes("no usan cookies"));
  // Nombra todo lo que mide Cloudflare Web Analytics.
  for (const medida of ["dirección IP", "el sitio desde el que se llegó", "el navegador", "el tiempo de carga"]) {
    assert.ok(html.includes(medida), `Falta «${medida}» en la privacidad`);
  }
  assert.ok(html.includes("No tiene vínculo con el Congreso Nacional ni cuenta con su"));
});

test("las fichas enlazan a la metodología", () => {
  const afiliacion = `href="${rutas.metodologia(rutas.anclasMetodologia.afiliacion)}"`;
  const resumen = `href="${rutas.metodologia(rutas.anclasMetodologia.votosLegislador)}"`;
  for (const persona of legisladores()) {
    const html = leer(persona.url);
    assert.ok(html.includes(afiliacion), `Falta el enlace a la metodología en ${persona.url}`);
    if (ficha(persona).bloques.some((b) => b.votos.total > 0)) assert.ok(html.includes(resumen), persona.url);
  }
  for (const ley of leyes()) {
    const conVotaciones = ley.registros.some((r) => detalleDeRegistro(r).votaciones.cantidad > 0);
    if (conVotaciones) assert.ok(leer(ley.url).includes(afiliacion), `Falta el enlace a la metodología en ${ley.url}`);
  }
});

// --- Buscadores y vista previa al compartir (#10) ---

/** Valor de la primera coincidencia, con las entidades HTML que usa Astro ya convertidas. */
const etiqueta = (html, patron) =>
  html.match(patron)?.[1]?.replaceAll("&#39;", "'").replaceAll("&quot;", '"').replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");
const metaPropiedad = (html, propiedad) => etiqueta(html, new RegExp(`<meta property="${propiedad}" content="([^"]*)"`));
const datosEstructurados = (url) => JSON.parse(etiqueta(leer(url), /<script type="application\/ld\+json">(.*?)<\/script>/s));
const archivoDe = (direccion) => join(dist, decodeURIComponent(new URL(direccion).pathname));

test("cada página tiene título y descripción únicos, URL canónica e imagen para compartir", () => {
  const titulos = new Map();
  const descripciones = new Map();
  for (const url of todasLasPaginas()) {
    const html = leer(url);
    const titulo = etiqueta(html, /<title>([^<]*)<\/title>/);
    const descripcion = etiqueta(html, /<meta name="description" content="([^"]*)"/);
    assert.ok(titulo && descripcion, `Faltan título o descripción en ${url}`);
    assert.ok(!titulos.has(titulo), `Título repetido en ${url} y ${titulos.get(titulo)}`);
    assert.ok(!descripciones.has(descripcion), `Descripción repetida en ${url} y ${descripciones.get(descripcion)}`);
    titulos.set(titulo, url);
    descripciones.set(descripcion, url);
    assert.equal(etiqueta(html, /<link rel="canonical" href="([^"]*)"/), rutas.absoluta(url));
    assert.equal(metaPropiedad(html, "og:title"), titulo);
    assert.equal(metaPropiedad(html, "og:url"), rutas.absoluta(url));
    const imagen = metaPropiedad(html, "og:image");
    assert.ok(imagen?.startsWith(rutas.sitio) && existsSync(archivoDe(imagen)), `Imagen inexistente en ${url}`);
  }
});

test("la foto oficial como vista previa de cada legislador que la tiene", () => {
  for (const persona of legisladores()) {
    const foto = ficha(persona).bloques[0].foto;
    const esperada = rutas.absoluta(foto ?? rutas.imagenCompartir());
    assert.equal(metaPropiedad(leer(persona.url), "og:image"), esperada, persona.url);
  }
});

test("datos estructurados válidos en leyes, legisladores, datos abiertos e inicio", () => {
  for (const ley of leyes()) assert.equal(datosEstructurados(ley.url)["@type"], "Legislation", ley.url);
  for (const persona of legisladores()) assert.equal(datosEstructurados(persona.url)["@type"], "Person", persona.url);
  const conjunto = datosEstructurados(rutas.datosAbiertos());
  assert.equal(conjunto["@type"], "Dataset");
  for (const a of conjunto.distribution) assert.ok(existsSync(archivoDe(a.contentUrl)), a.contentUrl);
  assert.equal(datosEstructurados(rutas.inicio())["@type"], "WebSite");
});

test("sitemap.xml con todas las páginas indexables y robots.txt que lo anuncia", () => {
  const sitemap = readFileSync(join(dist, "sitemap.xml"), "utf-8");
  const enSitemap = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const paginas = todasLasPaginas().filter((u) => u !== rutas.buscar()).map(rutas.absoluta);
  assert.deepEqual([...enSitemap].sort(), [...paginas].sort());
  const robots = readFileSync(join(dist, "robots.txt"), "utf-8");
  assert.ok(robots.includes(`Sitemap: ${rutas.absoluta(rutas.sitemap())}`));
  assert.ok(robots.includes(`Disallow: ${rutas.archivosBuscador()}`));
  assert.ok(!/Disallow: \/\s*$/m.test(robots), "robots.txt no debe bloquear todo el sitio");
});

test("página 404 propia, fuera de los buscadores", () => {
  const html = readFileSync(join(dist, "404.html"), "utf-8");
  assert.ok(html.includes('<meta name="robots" content="noindex">'));
  assert.ok(!html.includes('rel="canonical"'));
});

test("sin herramientas de seguimiento con cookies", () => {
  for (const url of todasLasPaginas()) {
    const html = leer(url);
    for (const rastreador of ["googletagmanager", "google-analytics", "gtag(", "facebook.net", "hotjar"]) {
      assert.ok(!html.includes(rastreador), `${rastreador} en ${url}`);
    }
  }
});

test("los textos propios de las páginas generales no usan dos puntos", () => {
  // Solo páginas sin valores oficiales; la cita obligatoria se mantiene textual.
  const { cita } = estado().fuente;
  // En las páginas de votaciones, los títulos oficiales de proyectos y leyes van en <span class="titulo">.
  const urls = [rutas.inicio(), rutas.metodologia(), rutas.privacidad(), rutas.datosAbiertos(), rutas.buscar(), rutas.votacionesNominales(), rutas.coincidencia(), rutas.rankings(), ...paginasDeVotaciones(), ...paginasDeTemas()];
  for (const url of urls) {
    const visible = leer(url)
      .replace(/<(script|style)[\s\S]*?<\/\1>/g, " ")
      .replace(/<span class="titulo[^>]*>[^<]*<\/span>/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replaceAll(cita, " ")
      .replace(/\s+/g, " ");
    const encontrado = visible.match(/.{0,40}[\p{L})*]: .{0,20}/u);
    assert.ok(!encontrado, `Dos puntos en ${url}, en «${encontrado?.[0]}»`);
  }
});

test("el menú y la portada enlazan a cada vista de análisis", () => {
  const menu = (url) => leer(url).match(/<nav aria-label="Principal"[\s\S]*?<\/nav>/)?.[0] ?? "";
  const unaLey = rutas.ley(leyes()[0].numero);
  const unLegislador = rutas.legislador(legisladores()[0].slug);
  for (const url of [rutas.inicio(), rutas.leyes(), unaLey, rutas.legisladores(), unLegislador, rutas.votacionesNominales(), rutas.coincidencia(), rutas.rankings(), ...paginasDeVotaciones(), ...paginasDeTemas(), rutas.buscar(), rutas.datosAbiertos(), rutas.metodologia()]) {
    const nav = menu(url);
    for (const e of menuPrincipal()) assert.ok(nav.includes(`href="${e.url}"`), `El menú de ${url} no enlaza ${e.url}`);
    assert.ok((nav.match(/aria-current="page"/g) ?? []).length <= 1, `Más de una entrada actual en ${url}`);
  }
  for (const url of [rutas.rankings(), rutas.votacionesNominales()]) {
    assert.ok(menu(url).includes(`href="${rutas.rankings()}" aria-current="page"`), `${url} no marca «Rankings» en el menú`);
  }
  assert.ok(!menu(rutas.inicio()).includes(rutas.votacionesNominales()), "La tabla comparativa sigue en el menú");
  for (const url of [...paginasDeVotaciones(), ...algunasVotaciones()]) {
    assert.ok(menu(url).includes(`href="${rutas.votaciones()}" aria-current="page"`), `${url} no marca «Votaciones» en el menú`);
  }
  for (const url of paginasDeTemas()) {
    assert.ok(menu(url).includes(`href="${rutas.votosPorTema()}" aria-current="page"`), `${url} no marca «Temas» en el menú`);
  }
  const portada = leer(rutas.inicio()).replace(/<header[\s\S]*?<\/header>/, " ");
  for (const v of vistasDeAnalisis()) {
    const enPortada = v.portada !== false;
    assert.equal(portada.includes(`data-analisis="${v.clave}"`), enPortada, `Vista previa de ${v.clave}`);
    if (enPortada) assert.ok(portada.includes(`href="${v.url}"`), `La portada no enlaza ${v.url}`);
  }
  const previa = vistaPrevia(periodos().find((p) => p.vigente).id);
  const html = texto(rutas.inicio());
  for (const c of previa.coincidencia) {
    assert.ok(html.includes(c.mayor.porcentajeTexto) && html.includes(c.menor.porcentajeTexto), `Falta la coincidencia de ${c.camara}`);
    assert.ok(c.graficos[0].barras.length > 0, `Sin barras en ${c.camara}`);
    for (const g of c.graficos) for (const b of g.barras) assert.ok(html.includes(b.fraccion), `Falta la barra de ${b.nombre} con ${g.referencia} en ${c.camara}`);
  }
  // Un gráfico por partido y cámara; al abrir se ve solo el del primer partido.
  const graficos = [...html.matchAll(/<div data-grafico-partido="([^"]+)"( hidden)?/g)];
  assert.equal(graficos.length, previa.partidos.length * previa.coincidencia.length);
  for (const [, id, oculto] of graficos) assert.equal(Boolean(oculto), id !== String(previa.partidos[0].id), `Gráfico ${id}`);
  assert.ok(html.includes('id="selector-partido-portada"'), "Falta el selector de partido en la portada");
  assert.ok(html.includes('class="barras-coincidencia'), "Falta el gráfico de coincidencia en la portada");
  for (const c of previa.votosDistintos) for (const f of c.filas) assert.ok(itemVotosDistintos(html, f), `Falta ${f.slug} en la portada`);
  const enPortada = [...html.matchAll(/<li data-votacion="(\d+)"/g)].map((m) => Number(m[1]));
  assert.deepEqual(enPortada, previa.votaciones.map((v) => v.id), "Últimas votaciones de la portada");
  // La tarjeta de votaciones va después de las demás.
  const posiciones = vistasDeAnalisis().filter((v) => v.portada !== false).map((v) => [v.clave, html.indexOf(`data-analisis="${v.clave}"`)]);
  const votaciones = posiciones.find(([clave]) => clave === "votaciones")[1];
  assert.ok(posiciones.every(([clave, n]) => clave === "votaciones" || n < votaciones), "La tarjeta de votaciones no está al final");
  assert.equal(html.match(/<li data-votos-distintos=/g)?.length ?? 0, previa.votosDistintos.reduce((n, c) => n + c.filas.length, 0));
});

test("votos por tema: índice, una página por tema con el reparto de cada grupo, avisos y lista de votaciones", () => {
  const periodo = periodos().find((p) => p.vigente).id;
  const lista = votosPorTema(periodo);
  const indice = leer(rutas.votosPorTema());
  for (const t of lista) assert.ok(indice.includes(`href="${t.url}"`), `El índice no enlaza ${t.url}`);
  assert.ok(indice.includes(`href="${rutas.archivoCalculado(periodo, "votos-por-tema", "csv")}"`), "Falta la descarga en el índice");
  const portada = leer(rutas.inicio());
  for (const t of lista) assert.ok(portada.includes(`href="${t.url}"`), `La portada no enlaza ${t.url}`);
  for (const t of lista) {
    const html = texto(t.url);
    assert.ok(html.includes(`href="${rutas.metodologia(rutas.anclasMetodologia.votosPorTema)}"`), t.url);
    assert.ok(html.includes("objeción del Poder Ejecutivo") && html.includes("no necesariamente los de la fecha"), `Faltan los avisos en ${t.url}`);
    for (const c of t.camaras) {
      assert.ok(new RegExp(`<h2[^>]*>${c.camara}</h2>`).test(html), `${t.url} ${c.camara}`);
      for (const f of [...c.partidos, ...c.bancadas]) {
        c.categorias.forEach((cat, n) => {
          if (f.celdas[n].cantidad > 0) assert.ok(html.includes(`<b>${cat}</b> ${f.celdas[n].texto}`), `${t.url} ${c.camara} ${f.texto} ${cat}`);
        });
      }
      for (const v of c.votaciones) assert.ok(html.includes(v.etapa ?? "Sin dato"), `${t.url} etapa de ${v.id}`);
      assert.equal(html.split(`<ol class="votaciones-tema chico">`).length - 1, t.camaras.length, `${t.url} listas de votaciones`);
    }
    const bytes = statSync(pagina(t.url)).size;
    assert.ok(bytes < 900_000, `${t.url} pesa ${bytes} bytes`);
  }
});

test("una página por votación con su imagen para compartir, botones sin servicios de terceros y enlaces desde las listas", () => {
  const periodo = periodos().find((p) => p.vigente).id;
  const { votaciones, anios } = votacionesDelPeriodo(periodo);
  const cita = estado().fuente.cita;
  let mayor = 0;
  for (const v of votaciones) {
    const html = leer(v.pagina);
    const c = compartirVotacion(v);
    assert.ok(html.includes(`<meta property="og:image" content="${c.vistaPrevia.url}"`), `Falta la imagen de vista previa en ${v.pagina}`);
    assert.ok(html.includes('<meta name="twitter:card" content="summary_large_image"'), v.pagina);
    for (const formato of ["horizontal", "vertical"]) {
      const imagen = join(dist, rutas.imagenVotacion(v.id, formato));
      assert.ok(existsSync(imagen) && statSync(imagen).size < 300_000, `Falta o pesa demasiado ${imagen}`);
    }
    assert.ok(html.includes(`href="${escapar(c.enlaces.whatsapp)}"`) && html.includes(`href="${escapar(c.enlaces.x)}"`), `Faltan los botones en ${v.pagina}`);
    assert.ok(html.includes(`href="${rutas.imagenVotacion(v.id, "vertical")}" download`), v.pagina);
    assert.ok(html.includes(`id="${rutas.anclaVotacion(v.id)}"`) && html.includes(cita), v.pagina);
    assert.ok(html.includes(`href="${escapar(v.url)}"`) || v.leyes.length, `Falta el enlace a SILpy en ${v.pagina}`);
    for (const l of v.leyes) assert.ok(html.includes(`href="${rutas.ley(l.numero)}"`), v.pagina);
    assert.ok(!html.includes("Compartir esta votación"), `${v.pagina} se enlaza a sí misma`);
    mayor = Math.max(mayor, statSync(pagina(v.pagina)).size);
  }
  assert.ok(mayor < 300_000, `La página de votación más pesada pesa ${mayor} bytes`);
  // Cada lista de un año y cada ficha de ley enlazan a la página de cada una de sus votaciones.
  for (const a of anios) {
    const html = leer(a.url);
    for (const v of votaciones.filter((x) => x.anio === a.anio)) assert.ok(html.includes(`href="${v.pagina}"`), `${a.url} no enlaza ${v.pagina}`);
  }
  for (const ley of leyes()) {
    const html = leer(ley.url);
    for (const r of ley.registros) for (const v of detalleDeRegistro(r).votaciones.indice) assert.ok(html.includes(`href="${v.pagina}"`), `${ley.url} no enlaza ${v.pagina}`);
  }
  // Ningún archivo del sitio supera el límite de Cloudflare Pages (25 MiB) y el total de archivos queda lejos de 20.000.
  let archivos = 0;
  const recorrer = (carpeta) => {
    for (const e of readdirSync(carpeta, { withFileTypes: true })) {
      if (e.isDirectory()) recorrer(join(carpeta, e.name));
      else {
        archivos++;
        assert.ok(statSync(join(carpeta, e.name)).size < 25 * 1024 * 1024, e.name);
      }
    }
  };
  recorrer(dist);
  assert.ok(archivos < 15_000, `El sitio tiene ${archivos} archivos`);
});
