// Textos, enlaces e imágenes para compartir una votación nominal desde su página propia (alcance
// acordado en #45). Sin HTML.
//
// Criterios (ver docs/metodologia.md y docs/seo.md):
// - Textos neutrales con los valores oficiales tal como los publica el Congreso (cámara, fecha, etapa,
//   resultado y totales), sin calificar el resultado.
// - Referencia del proyecto: el número de ley si llegó a ser ley; si no, el expediente oficial.
// - Tema: el texto entre comillas del título oficial (seo.temaDeLey), recortado. El título completo se
//   muestra sin cambios en la página.
// - Posición de cada partido: la de la página de votaciones (ficha.posicionesDePartidos), agrupada por
//   sentido (ficha.porSentido), con la sigla propia.
// - Cada imagen lleva la cita obligatoria de la fuente y la fecha de la última comprobación de los datos.

import { actualizacion, cita } from "./catalogo.js";
import { claseDeCategoria, porSentido } from "./ficha.js";
import * as rutas from "./rutas.js";
import { nombreSitio, temaDeLey } from "./seo.js";
import { recortar } from "./texto.js";

/** Medidas de cada imagen: la horizontal para la vista previa del enlace y la vertical para estados e historias. */
export const FORMATOS = {
  horizontal: { ancho: 1200, alto: 630 },
  vertical: { ancho: 1080, alto: 1920 },
};

const SIN_DATO = "Sin dato";
/** Largo máximo del tema en las imágenes y en el texto para compartir. */
const LARGO_TEMA = 140;
const LARGO_TEMA_TEXTO = 90;
const LARGO_DESCRIPCION = 300;

/** "Ley 7123" (o varias, si la votación quedó en más de una ley) o "Expediente S-2603294". */
export function referenciaDe(v) {
  return v.leyes.length ? v.leyes.map((l) => `Ley ${l.numero}`).join(" y ") : `Expediente ${v.proyecto.expediente ?? SIN_DATO}`;
}

/** Título oficial del proyecto de una votación: el de la ley, si llegó a serlo. */
const tituloOficial = (v) => v.leyes[0]?.titulo ?? v.proyecto.titulo;

/**
 * Todo lo que necesita la página de una votación de lib/votaciones.js para compartirse: título,
 * descripción, texto y enlaces para compartir, las dos imágenes y lo que dibuja cada una.
 */
export function compartirVotacion(v) {
  const referencia = referenciaDe(v);
  const fecha = v.fecha ?? SIN_DATO;
  const camara = v.camara ?? SIN_DATO;
  const resultado = v.resultado ?? SIN_DATO;
  const tema = temaDeLey(tituloOficial(v), LARGO_TEMA) || null;
  const totales = v.totales.map((t) => `${t.categoria} ${t.cantidad}`).join(" · ");
  const url = rutas.absoluta(v.pagina);
  // Con el número oficial de la votación: un mismo proyecto puede votarse varias veces el mismo día.
  const titulo = `${referencia}, votación ${v.id} del ${fecha}`;
  const texto = `${referencia}${tema ? ` «${recortar(tema, LARGO_TEMA_TEXTO)}»` : ""}. Votación en la ${camara} del ${fecha}. Resultado ${resultado} (${totales}).`;
  const alt = `${titulo} en la ${camara}. Resultado ${resultado}. ${totales}.`;
  const imagenes = Object.fromEntries(
    Object.entries(FORMATOS).map(([formato, medidas]) => [formato, { url: rutas.imagenVotacion(v.id, formato), ...medidas }]),
  );
  return {
    titulo,
    descripcion: recortar(
      `Votación nominal ${v.id} en la ${camara} del ${fecha} (${v.etapa ?? SIN_DATO}) sobre ${referencia}. Resultado ${resultado}. ${totales}.` +
        `${tema ? ` Proyecto «${tema}».` : ""}`,
      LARGO_DESCRIPCION,
    ),
    url,
    texto,
    enlaces: { whatsapp: rutas.compartirWhatsapp(texto, url), x: rutas.compartirX(texto, url) },
    imagenes,
    // Para la etiqueta de la vista previa (layouts/Base.astro, prop imagen).
    vistaPrevia: { url: rutas.absoluta(imagenes.horizontal.url), ancho: imagenes.horizontal.ancho, alto: imagenes.horizontal.alto, alt, grande: true },
    dibujo: {
      encabezado: [camara, fecha, v.etapa ?? SIN_DATO].join(" · "),
      referencia,
      tema,
      resultado,
      segmentos: v.barra.segmentos.map((s) => ({ categoria: s.categoria, clase: s.clase, ancho: s.ancho })),
      totales: v.totales.map((t) => ({ categoria: t.categoria, cantidad: t.cantidad, clase: claseDeCategoria(t.categoria) })),
      partidos: porSentido(v.partidos).map((g) => ({ titulo: g.titulo, clase: g.clase, siglas: g.partidos.map((p) => p.sigla) })),
      registrados: v.registrados,
      marca: nombreSitio,
      sitio: new URL(rutas.absoluta(rutas.inicio())).host,
      pie: `${cita().cita} · Actualizado el ${actualizacion().texto}`,
    },
  };
}

/** Datos estructurados de schema.org de la página de una votación: una página sobre un proyecto de ley. */
export function datosDeVotacion(v, c) {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: c.titulo,
    description: c.descripcion,
    url: c.url,
    inLanguage: "es",
    primaryImageOfPage: { "@type": "ImageObject", url: c.vistaPrevia.url, width: c.vistaPrevia.ancho, height: c.vistaPrevia.alto },
    about: {
      "@type": "Legislation",
      name: tituloOficial(v) ?? c.titulo,
      legislationIdentifier: referenciaDe(v),
      legislationJurisdiction: { "@type": "Country", name: "Paraguay" },
      ...(v.leyes.length && { url: rutas.absoluta(rutas.ley(v.leyes[0].numero)) }),
    },
    isBasedOn: cita().url,
  };
}
