// Genera las imágenes para compartir cada votación nominal (#45): public/votacion/{id}/compartir-horizontal.png
// (1200 × 630, vista previa del enlace) y compartir-vertical.png (1080 × 1920, estados e historias).
// Lo que muestra cada una sale de lib/compartir.js; los colores, de src/estilos/tokens.css. Diseño
// provisional hasta la Fase 4 (#14).
//
// La tipografía es Inter, del paquete @expo-google-fonts/inter, para que las imágenes salgan iguales en
// cualquier computadora y en el servidor de compilación. Las imágenes se dibujan en un proceso aparte
// que solo ve esa tipografía (variable FONTCONFIG_FILE, que se lee al iniciar el proceso).
//
// public/votacion/ no se sube al repositorio. Para no redibujar todo en cada compilación, se guarda
// una huella del dibujo de cada votación (node_modules/.cache/) y solo se dibujan las que cambiaron.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { availableParallelism, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fuentes = resolve(raiz, "node_modules", "@expo-google-fonts", "inter");
const configuracion = join(tmpdir(), "observatorio-legislativo-fuentes", "fonts.conf");

if (process.env.FONTCONFIG_FILE !== configuracion) {
  const carpeta = (ruta) => `<dir>${ruta.replace(/\\/g, "/")}</dir>`;
  mkdirSync(dirname(configuracion), { recursive: true });
  writeFileSync(
    configuracion,
    `<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "fonts.dtd">\n<fontconfig>${carpeta(join(fuentes, "400Regular"))}${carpeta(join(fuentes, "700Bold"))}` +
      `<cachedir>${join(dirname(configuracion), "cache").replace(/\\/g, "/")}</cachedir></fontconfig>\n`,
  );
  const hijo = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
    stdio: "inherit",
    // Un hilo de libuv por procesador, para dibujar varias imágenes a la vez.
    env: { ...process.env, FONTCONFIG_FILE: configuracion, UV_THREADPOOL_SIZE: String(Math.max(4, availableParallelism())) },
  });
  process.exit(hijo.status ?? 1);
}

const { default: sharp } = await import("sharp");
const { periodos } = await import("../src/lib/datos.js");
const { votacionesDelPeriodo } = await import("../src/lib/votaciones.js");
const { compartirVotacion, FORMATOS } = await import("../src/lib/compartir.js");

const tokens = readFileSync(resolve(raiz, "src", "estilos", "tokens.css"), "utf-8");
// La primera definición de cada token es la del modo claro.
const token = (nombre) => tokens.match(new RegExp(`--${nombre}:\\s*([^;]+);`))?.[1].trim();
const color = {
  fondo: token("color-fondo"),
  texto: token("color-texto"),
  suave: token("color-texto-suave"),
  borde: token("color-borde"),
  acento: token("color-acento"),
  sobreAcento: token("color-sobre-acento"),
};
/** Color de una clase de categoría de voto (voto-si → --color-voto-si); sin posición, el del borde. */
const colorDe = (clase) => token(`color-${clase}`) ?? color.borde;
const FUENTE = "Inter";

const escapar = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Ancho aproximado de un texto en Inter, en píxeles. Basta para cortar líneas con margen. */
function ancho(texto, tamano, negrita = false) {
  let em = 0;
  for (const c of texto) {
    if (c === " ") em += 0.28;
    else if (/[il.,;:'·|!()\[\]]/.test(c)) em += 0.3;
    else if (/[mwMW]/.test(c)) em += 0.86;
    else if (/[A-ZÁÉÍÓÚÑÜ]/.test(c)) em += 0.7;
    else if (/[0-9]/.test(c)) em += 0.62;
    else em += 0.56;
  }
  return em * tamano * (negrita ? 1.05 : 1);
}

/** Corta un texto en líneas de hasta `maximo` píxeles; si sobran, la última termina en "…". */
function lineas(texto, tamano, maximo, cantidad, negrita = false) {
  const resultado = [];
  let actual = "";
  for (const palabra of String(texto).split(/\s+/).filter(Boolean)) {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (ancho(prueba, tamano, negrita) <= maximo || !actual) actual = prueba;
    else {
      resultado.push(actual);
      actual = palabra;
    }
  }
  if (actual) resultado.push(actual);
  if (resultado.length <= cantidad) return resultado;
  const cortadas = resultado.slice(0, cantidad);
  let ultima = cortadas[cantidad - 1];
  while (ultima.includes(" ") && ancho(`${ultima}…`, tamano, negrita) > maximo) ultima = ultima.slice(0, ultima.lastIndexOf(" "));
  cortadas[cantidad - 1] = `${ultima}…`;
  return cortadas;
}

const texto = (x, y, contenido, tamano, relleno, extra = "") =>
  `<text x="${x}" y="${y}" font-family="${FUENTE}" font-size="${tamano}" fill="${relleno}"${extra}>${contenido}</text>`;

/** Medidas de cada formato: márgenes, tamaños de letra y cuántas líneas entran de cada cosa. */
const DISENO = {
  horizontal: {
    margen: 60, banda: 64, marca: 26, inicio: 112, encabezado: 22, lineasEncabezado: 1, sitioEnPie: false, centrar: false, referencia: 40, tema: 28, lineasTema: 2,
    resultado: 28, barra: 30, leyenda: 22, subtitulo: 18, partido: 22, lineasPartido: 1, maximoGrupos: 4, pie: 18,
  },
  vertical: {
    margen: 80, banda: 132, marca: 44, inicio: 200, encabezado: 34, lineasEncabezado: 2, sitioEnPie: true, centrar: true, referencia: 72, tema: 48, lineasTema: 6,
    resultado: 46, barra: 64, leyenda: 38, subtitulo: 32, partido: 38, lineasPartido: 3, maximoGrupos: 6, pie: 28,
  },
};

function dibujar(d, formato) {
  const { ancho: W, alto: H } = FORMATOS[formato];
  const p = DISENO[formato];
  const util = W - 2 * p.margen;
  const x = p.margen;
  const partes = [];
  // Banda superior con el nombre y la dirección del sitio.
  partes.push(`<rect width="${W}" height="${p.banda}" fill="${color.acento}"/>`);
  const yMarca = p.banda / 2 + p.marca * 0.36;
  partes.push(texto(x, yMarca, escapar(d.marca), p.marca, color.sobreAcento, ' font-weight="700"'));
  if (!p.sitioEnPie) partes.push(texto(W - x, yMarca, escapar(d.sitio), p.marca * 0.8, color.sobreAcento, ' text-anchor="end"'));

  // Contenido; en el formato vertical se centra después en el espacio libre.
  const cuerpo = [];
  partes.push(cuerpo);
  let y = p.inicio;
  lineas(d.encabezado, p.encabezado, util, p.lineasEncabezado).forEach((linea, n) => {
    if (n > 0) y += p.encabezado * 1.3;
    cuerpo.push(texto(x, y, escapar(linea), p.encabezado, color.suave));
  });
  y += p.referencia * 1.25;
  cuerpo.push(texto(x, y, escapar(lineas(d.referencia, p.referencia, util, 1, true)[0]), p.referencia, color.texto, ' font-weight="700"'));
  if (d.tema) {
    for (const linea of lineas(d.tema, p.tema, util, p.lineasTema)) {
      y += p.tema * 1.3;
      cuerpo.push(texto(x, y, escapar(linea), p.tema, color.texto));
    }
  }
  y += p.resultado * 1.9;
  cuerpo.push(texto(x, y, `Resultado oficial <tspan font-weight="700">${escapar(d.resultado)}</tspan>`, p.resultado, color.texto));

  // Barra con el total de cada categoría sobre los legisladores registrados.
  y += p.resultado * 0.8;
  let xs = x;
  const segmentos = d.segmentos.map((s, n) => {
    const w = n === d.segmentos.length - 1 ? x + util - xs : (util * s.ancho) / 100;
    const r = `<rect x="${xs.toFixed(1)}" y="${y}" width="${Math.max(w, 0).toFixed(1)}" height="${p.barra}" fill="${colorDe(s.clase)}"/>`;
    xs += w;
    return r;
  });
  cuerpo.push(`<clipPath id="barra"><rect x="${x}" y="${y}" width="${util}" height="${p.barra}" rx="${p.barra / 5}"/></clipPath>`);
  cuerpo.push(`<g clip-path="url(#barra)"><rect x="${x}" y="${y}" width="${util}" height="${p.barra}" fill="${color.borde}"/>${segmentos.join("")}</g>`);
  y += p.barra;

  // Leyenda: un cuadro de color y el total oficial de cada categoría, en tantas filas como haga falta.
  const cuadro = p.leyenda * 0.75;
  let xl = x;
  y += p.leyenda * 1.7;
  for (const t of d.totales) {
    const etiqueta = `${t.categoria} ${t.cantidad}`;
    const w = cuadro + p.leyenda * 0.4 + ancho(etiqueta, p.leyenda, true) + p.leyenda * 1.1;
    if (xl > x && xl + w > x + util) {
      xl = x;
      y += p.leyenda * 1.5;
    }
    cuerpo.push(`<rect x="${xl}" y="${y - cuadro}" width="${cuadro}" height="${cuadro}" rx="2" fill="${colorDe(t.clase)}"/>`);
    cuerpo.push(texto(xl + cuadro + p.leyenda * 0.4, y, `<tspan font-weight="700">${escapar(t.categoria)}</tspan> ${t.cantidad}`, p.leyenda, color.texto));
    xl += w;
  }
  y += p.leyenda * 0.6;
  cuerpo.push(texto(x, y + p.leyenda, escapar(`de ${d.registrados} legisladores registrados`), p.subtitulo, color.suave));
  y += p.leyenda;

  // Posición de cada partido, agrupada por sentido.
  if (d.partidos.length) {
    y += p.subtitulo * 2.4;
    cuerpo.push(texto(x, y, "Categoría con más votos en cada partido", p.subtitulo, color.suave));
    const grupos = d.partidos.slice(0, p.maximoGrupos);
    for (const g of grupos) {
      const titulo = `${g.titulo}  `;
      const sangria = cuadro + p.partido * 0.4 + ancho(titulo, p.partido, true);
      const filas = lineas(g.siglas.join(", "), p.partido, util - sangria, p.lineasPartido);
      y += p.partido * 1.55;
      cuerpo.push(`<rect x="${x}" y="${y - cuadro}" width="${cuadro}" height="${cuadro}" rx="2" fill="${colorDe(g.clase)}"/>`);
      cuerpo.push(texto(x + cuadro + p.partido * 0.4, y, `<tspan font-weight="700">${escapar(g.titulo)}</tspan>`, p.partido, color.texto));
      filas.forEach((fila, n) => {
        if (n > 0) y += p.partido * 1.3;
        cuerpo.push(texto(x + sangria, y, escapar(fila), p.partido, color.texto));
      });
    }
  }

  // Pie con la cita obligatoria, la fecha de actualización y, en el vertical, la dirección del sitio.
  const pie = [...lineas(d.pie, p.pie, util, 2), ...(p.sitioEnPie ? [d.sitio] : [])];
  const yPie = H - p.margen * 0.45 - (pie.length - 1) * p.pie * 1.35;
  partes.push(`<rect x="${x}" y="${yPie - p.pie * 1.8}" width="${util}" height="1" fill="${color.borde}"/>`);
  pie.forEach((linea, n) => partes.push(texto(x, yPie + n * p.pie * 1.35, escapar(linea), p.pie, color.suave)));

  const libre = H - p.margen * 0.45 - (pie.length - 1) * p.pie * 1.35 - p.pie * 1.8 - p.banda;
  const desplazamiento = p.centrar ? Math.max(0, (libre - (y - p.inicio)) / 2 - (p.inicio - p.banda) + p.encabezado / 2) : 0;
  partes[partes.indexOf(cuerpo)] = `<g transform="translate(0 ${desplazamiento.toFixed(0)})">${cuerpo.join("")}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${color.fondo}"/>${partes.join("")}</svg>`;
}

const destino = resolve(raiz, "public", "votacion");
const archivoHuellas = resolve(raiz, "node_modules", ".cache", "observatorio", "imagenes-votaciones.json");
let huellas = {};
try {
  huellas = JSON.parse(readFileSync(archivoHuellas, "utf-8"));
} catch {
  huellas = {};
}

const periodo = periodos().find((p) => p.vigente).id;
const votaciones = votacionesDelPeriodo(periodo).votaciones;
const nuevas = {};
const pendientes = [];
for (const v of votaciones) {
  const { dibujo, imagenes } = compartirVotacion(v);
  for (const formato of Object.keys(FORMATOS)) {
    const svg = dibujar(dibujo, formato);
    const huella = createHash("sha256").update(svg).digest("hex");
    const archivo = join(raiz, "public", decodeURIComponent(imagenes[formato].url));
    nuevas[`${v.id}-${formato}`] = huella;
    if (huellas[`${v.id}-${formato}`] !== huella || !existsSync(archivo)) pendientes.push({ svg, archivo });
  }
}
// Varias a la vez. Paleta de 256 colores sin tramado: pesa la mitad y se ve igual (colores planos).
const simultaneas = Math.max(4, availableParallelism());
for (let n = 0; n < pendientes.length; n += simultaneas) {
  await Promise.all(
    pendientes.slice(n, n + simultaneas).map(({ svg, archivo }) => {
      mkdirSync(dirname(archivo), { recursive: true });
      return sharp(Buffer.from(svg)).png({ palette: true, effort: 1, dither: 0, compressionLevel: 6 }).toFile(archivo);
    }),
  );
}
const dibujadas = pendientes.length;
// Fuera las carpetas de votaciones que ya no están en los datos.
const vigentes = new Set(votaciones.map((v) => String(v.id)));
for (const carpeta of existsSync(destino) ? readdirSync(destino) : []) {
  if (!vigentes.has(carpeta)) rmSync(join(destino, carpeta), { recursive: true, force: true });
}
mkdirSync(dirname(archivoHuellas), { recursive: true });
writeFileSync(archivoHuellas, JSON.stringify(nuevas));
console.log(`Imágenes de votaciones: ${dibujadas} dibujadas, ${Object.keys(nuevas).length - dibujadas} sin cambios -> ${destino}`);
