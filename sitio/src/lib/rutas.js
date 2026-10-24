// Único lugar donde se definen las URLs del sitio. Los componentes y páginas piden la
// dirección a este módulo y nunca la escriben a mano (ver docs/decisiones/0001-arquitectura.md).
// Si una URL publicada cambia, agregar una redirección permanente en public/_redirects.

/** Dirección pública del sitio. Es el único lugar que cambia al mudarlo a otro dominio (docs/seo.md). */
export const sitio = "https://congreso.alexisdick.com";
/** Dirección completa de una ruta del sitio, para etiquetas de buscadores y redes sociales. */
export const absoluta = (ruta) => new URL(ruta, sitio).href;

export const inicio = () => "/";
export const leyes = () => "/leyes/";
/** Catálogo de leyes filtrado por un tema de la clasificación propia (#36). */
export const leyesPorTema = (tema) => `${leyes()}?${parametrosCatalogo.tema}=${encodeURIComponent(tema)}`;
export const ley = (numeroLey) => `/leyes/${encodeURIComponent(numeroLey)}/`;
/** Ancla (id) de cada votación dentro de la ficha de su ley. */
export const anclaVotacion = (idVotacion) => `votacion-${idVotacion}`;
export const votacionEnLey = (numeroLey, idVotacion) => `${ley(numeroLey)}#${anclaVotacion(idVotacion)}`;
export const legisladores = () => "/legisladores/";
/** Ficha de una persona, con el slug de datos/propios/personas.json. */
export const legislador = (slug) => `/legisladores/${encodeURIComponent(slug)}/`;
export const buscar = () => "/buscar/";
export const datosAbiertos = () => "/datos/";
export const privacidad = () => "/privacidad/";
export const sitemap = () => "/sitemap.xml";
/** Archivos internos del buscador (Pagefind), que los rastreadores no necesitan leer. */
export const archivosBuscador = () => "/pagefind/";
/** Imagen general de la vista previa al compartir (scripts/imagen-compartir.js). */
export const imagenCompartir = () => "/compartir.png";
/** Metodología; con sección, el ancla de esa parte (anclasMetodologia). */
export const metodologia = (seccion) => (seccion ? `/metodologia/#${seccion}` : "/metodologia/");
/** Secciones de la metodología a las que enlazan las fichas. */
export const anclasMetodologia = {
  categorias: "categorias-de-voto",
  votosLegislador: "votos-de-cada-legislador",
  ausencias: "ausencias-en-votaciones-nominales",
  noVotaAbstencion: "no-vota-y-abstenciones",
  mayoria: "votos-distintos-a-la-mayoria",
  cuadroVotosDistintos: "cuadro-de-votos-distintos",
  cuadroAusencias: "cuadro-de-ausencias",
  afiliacion: "partido-y-bancada",
  partidoUnificado: "partido-unificado",
  coincidencia: "coincidencia-de-votos",
  posicionPartidos: "posicion-de-cada-partido",
  masAjustadas: "votaciones-mas-ajustadas",
  observaciones: "observaciones-sobre-los-datos",
  temas: "temas-de-las-leyes",
};

/** Repositorio público del proyecto: código, datos y licencias. */
const repositorio = "https://github.com/alexisdickpy/observatorio-legislativo-py";
export const codigoFuente = () => repositorio;
export const licenciaCodigo = () => `${repositorio}/blob/main/LICENSE`;
export const licenciaDatos = () => `${repositorio}/blob/main/LICENSE-DATOS.md`;
export const metodologiaTecnica = () => `${repositorio}/blob/main/docs/metodologia.md`;

/** Archivo de datos/ servido en /datos/… con la misma ruta que en el repositorio. */
export const archivoDatos = (ruta) => `/datos/${ruta}`;
/** Archivo calculado por este proyecto en la compilación (lib/calculados.js), no guardado en datos/. */
export const archivoCalculado = (periodo, nombre, extension) => `/datos/calculados/${periodo}/${nombre}.${extension}`;

/** Vista comparativa de votaciones nominales por legislador (ausencias, NO VOTA, abstenciones y votos distintos a la mayoría). */
export const votacionesNominales = () => "/legisladores/votaciones-nominales/";
/** Parámetro de la dirección de la vista comparativa (?orden=…). */
export const parametroOrdenComparativa = "orden";
/** Vista comparativa ordenada por una cifra (lib/ordenComparativa.js, ORDENES). */
export const votacionesNominalesOrdenadas = (orden) => `${votacionesNominales()}?${parametroOrdenComparativa}=${encodeURIComponent(orden)}`;

/** Rankings de más «rebeldes» y más «ausentes» (#57); con sección, el ancla de esa lista (anclasRankings). */
export const rankings = (seccion) => (seccion ? `/rankings/#${seccion}` : "/rankings/");
/** Anclas (id) de cada lista de la página de rankings. */
export const anclasRankings = { rebeldes: "mas-rebeldes", ausentes: "mas-ausentes" };

/**
 * Direcciones publicadas que cambiaron, cada una con su redirección permanente en public/_redirects (la
 * compilación comprueba que estén). El cuadro de más «rebeldes» (#54) pasó a la página de rankings (#57).
 */
export const redireccionesPermanentes = () => [{ desde: "/legisladores/votos-distintos-al-partido/", hacia: rankings() }];

/** Votaciones con la posición de cada partido (#44); con año, la página de ese año. */
export const votaciones = (anio) => (anio ? `/votaciones/${encodeURIComponent(anio)}/` : "/votaciones/");
/** Parámetros de la dirección de la página de un año de votaciones (?camara=…&estado=…&resultado=…&tema=…). */
export const parametrosVotaciones = { camara: "camara", estado: "estado", resultado: "resultado", tema: "tema" };

/** Coincidencia de votos entre partidos y entre bancadas; con grupo, la dirección que lo muestra (?grupo=…). */
export const coincidencia = (grupo) => (grupo ? `/coincidencia-de-votos/?grupo=${encodeURIComponent(grupo)}` : "/coincidencia-de-votos/");
/** Parámetro de la dirección de la coincidencia de votos (?grupo=…). */
export const parametroGrupoCoincidencia = "grupo";

/** Parámetros de la dirección del catálogo de leyes (?q=…&anio=…&camara=…&tema=…&orden=…). */
export const parametrosCatalogo = { texto: "q", anio: "anio", camara: "camara", tema: "tema", orden: "orden" };

/** Foto de un legislador reducida para su ficha (scripts/reducir-fotos.js). La original está en archivoDatos. */
export const fotoLegislador = (periodo, idLegislador) => `/fotos/${periodo}/${idLegislador}.jpg`;

/** Parámetros de la dirección del listado de legisladores (?q=…&camara=…&partido=……). */
export const parametrosLegisladores = {
  texto: "q",
  camara: "camara",
  partido: "partido",
  bancada: "bancada",
  departamento: "departamento",
};

/** Parámetro de la dirección del historial de votos de una ficha de legislador (?estado=…). */
export const parametroEstadoVotos = "estado";

/** Parámetro de la dirección de la búsqueda (?q=…). */
export const parametroBusqueda = "q";

/** Votación en SILpy, para las que no están en datos/ (otra legislatura o enlace no resuelto). */
export const votacionSilpy = (idVotacion) => `https://silpy.congreso.gov.py/votacion/${idVotacion}`;
