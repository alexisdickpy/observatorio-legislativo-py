// Prepara lo que leen los buscadores y las redes sociales: títulos, descripciones y datos
// estructurados de schema.org (JSON-LD). Sin HTML. Los valores oficiales se usan tal cual; solo se
// eligen y se recortan (ver docs/seo.md).

import { leyes } from "./catalogo.js";
import { estado, periodos } from "./datos.js";
import { descargas } from "./descargas.js";
import { legisladores } from "./legisladores.js";
import * as rutas from "./rutas.js";
import { recortar } from "./texto.js";
import { votacionesDelPeriodo } from "./votaciones.js";
import { votosPorTema } from "./votosPorTema.js";

export const nombreSitio = "Observatorio Legislativo";
const LARGO_TEMA = 60;
const LARGO_DESCRIPCION = 300;
const congreso = { "@type": "Organization", name: "Congreso Nacional del Paraguay" };
const paraguay = { "@type": "Country", name: "Paraguay" };
const licencia = "https://creativecommons.org/licenses/by/4.0/";
const TIPOS_MIME = { CSV: "text/csv", JSON: "application/json", MD: "text/markdown" };

/**
 * Tema de una ley para su título. Muchos títulos oficiales empiezan con un preámbulo («Proyecto de
 * Ley "…"», «Mensaje del Poder Ejecutivo N° …») y el tema va entre comillas; en ese caso se toma el
 * texto entre comillas. Si el título empieza directamente con el tema («QUE …»), se usa desde el inicio.
 */
export function temaDeLey(titulo, largo = LARGO_TEMA) {
  const t = String(titulo ?? "").replace(/\s+/g, " ").trim();
  const entreComillas = t.match(/[“"«]([^”"»]+)[”"»]/);
  const tema = !/^QUE\b/i.test(t) && entreComillas ? entreComillas[1].trim() : t;
  return recortar(tema, largo);
}

export function tituloDeLey(ley) {
  const tema = temaDeLey(ley.titulos[0]);
  return tema ? `Ley ${ley.numero} — ${tema}` : `Ley ${ley.numero}`;
}

export function descripcionDeLey(ley) {
  const sancion = ley.fechasSancion[0] ? `, sancionada el ${ley.fechasSancion[0]}` : "";
  return recortar(`Ley ${ley.numero} del Paraguay${sancion}. ${ley.titulos[0] ?? ""}`, LARGO_DESCRIPCION);
}

/** Descripción de la ficha de un legislador, con los datos del período más reciente (ficha().bloques[0]). */
export function descripcionDeLegislador(f, sinDato) {
  const b = f.bloques[0];
  return (
    `Ficha de ${f.nombre ?? sinDato} en la ${b.camara ?? sinDato}, período legislativo ${b.periodo} ` +
    `(${b.partido ?? sinDato}). Sus votos en ${b.votos.total} votaciones nominales sobre proyectos de ley y ` +
    `${b.autoria.length} leyes de su autoría.`
  );
}

/** Imagen de la vista previa al compartir. La foto oficial en las fichas de legisladores; si no, la general. */
export function imagenDe(foto, nombre) {
  if (foto) return { url: rutas.absoluta(foto), ancho: 320, alto: 320, alt: `Foto oficial de ${nombre}`, grande: false };
  return { url: rutas.absoluta(rutas.imagenCompartir()), ancho: 1200, alto: 630, alt: nombreSitio, grande: true };
}

export function datosDeLey(ley) {
  const r = ley.registros[0];
  const oficiales = ley.registros.map((x) => x.urlLey).filter(Boolean);
  return {
    "@context": "https://schema.org",
    "@type": "Legislation",
    name: ley.titulos[0] ?? `Ley ${ley.numero}`,
    legislationIdentifier: `Ley N° ${r.numeroOficial}`,
    ...(ley.fechaOrden && { legislationDate: ley.fechaOrden }),
    legislationJurisdiction: paraguay,
    legislationPassedBy: congreso,
    legislationType: "Ley",
    inLanguage: "es",
    url: rutas.absoluta(ley.url),
    ...(oficiales.length && { sameAs: oficiales }),
  };
}

export function datosDeLegislador(f, url) {
  const b = f.bloques[0];
  const miembroDe = [b.camara, b.partido, b.bancada].filter(Boolean).map((name) => ({ "@type": "Organization", name }));
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: f.nombre,
    url: rutas.absoluta(url),
    ...(b.foto && { image: rutas.absoluta(b.foto) }),
    ...(miembroDe.length && { memberOf: miembroDe }),
    ...(b.urlSilpy && { sameAs: [b.urlSilpy] }),
  };
}

export function datosDelSitio() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: nombreSitio,
    url: rutas.absoluta(rutas.inicio()),
    inLanguage: "es",
    potentialAction: {
      "@type": "SearchAction",
      target: `${rutas.absoluta(rutas.buscar())}?${rutas.parametroBusqueda}={consulta}`,
      "query-input": "required name=consulta",
    },
  };
}

export function datosAbiertos(descripcion) {
  const e = estado();
  const archivos = descargas().flatMap((g) => g.tablas.flatMap((t) => t.archivos));
  const inicioPeriodos = periodos().map((p) => p.fechaInicio).filter(Boolean).sort()[0];
  return {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: `Datos del ${congreso.name} (${nombreSitio})`,
    description: descripcion,
    url: rutas.absoluta(rutas.datosAbiertos()),
    license: licencia,
    isAccessibleForFree: true,
    inLanguage: "es",
    creator: { "@type": "Person", name: "Alexis Dick" },
    isBasedOn: e.fuente.url,
    citation: e.fuente.cita,
    dateModified: e.ultimaModificacion,
    // Google solo acepta Place (no Country) en la cobertura de un Dataset.
    spatialCoverage: { "@type": "Place", name: "Paraguay" },
    ...(inicioPeriodos && { temporalCoverage: `${inicioPeriodos}/..` }),
    keywords: ["leyes", "Congreso Nacional", "Paraguay", "votaciones nominales", "legisladores"],
    distribution: archivos.map((a) => ({
      "@type": "DataDownload",
      name: a.ruta,
      contentUrl: rutas.absoluta(a.url),
      encodingFormat: TIPOS_MIME[a.formato] ?? a.formato,
    })),
  };
}

/** Direcciones del sitemap: las páginas con contenido propio, sin la búsqueda (su resultado depende de lo que se escriba). */
export function direccionesDelSitemap() {
  return [
    rutas.inicio(),
    rutas.leyes(),
    ...leyes().map((l) => l.url),
    rutas.legisladores(),
    rutas.votacionesNominales(),
    rutas.coincidencia(),
    rutas.rankings(),
    rutas.votaciones(),
    ...votacionesDelPeriodo(periodos().find((p) => p.vigente).id).anios.map((a) => a.url),
    ...votacionesDelPeriodo(periodos().find((p) => p.vigente).id).votaciones.map((v) => v.pagina),
    rutas.votosPorTema(),
    ...votosPorTema(periodos().find((p) => p.vigente).id).map((t) => t.url),
    ...legisladores().map((p) => p.url),
    rutas.datosAbiertos(),
    rutas.metodologia(),
    rutas.privacidad(),
  ].map(rutas.absoluta);
}
