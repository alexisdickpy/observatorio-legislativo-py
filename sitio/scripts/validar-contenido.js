// Detiene la compilación si un texto editado rompe algo que el sitio necesita. Cloudflare no publica una
// compilación fallida, y el sitio anterior sigue en línea (docs/edicion-de-textos.md).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const CONTENIDO = join(aqui, "..", "src", "contenido");
const PROPIOS = join(aqui, "..", "..", "datos", "propios");
// La licencia CC BY 4.0 de los datos obliga a citar la fuente: la redacción se puede cambiar, el nombre no.
const FUENTE_OBLIGATORIA = "Datos Abiertos Poder Legislativo";

const errores = [];

function leer(ruta) {
  try {
    return JSON.parse(readFileSync(ruta, "utf-8"));
  } catch (e) {
    errores.push(`${ruta} no es un JSON válido: ${e.message}`);
    return null;
  }
}

/** Todos los textos de un valor, con el lugar de cada uno. */
function* textosDe(valor, lugar) {
  if (typeof valor === "string") yield [lugar, valor];
  else if (valor && typeof valor === "object") {
    for (const [k, v] of Object.entries(valor)) yield* textosDe(v, `${lugar}.${k}`);
  }
}

for (const nombre of readdirSync(CONTENIDO).filter((a) => a.endsWith(".json"))) {
  const contenido = leer(join(CONTENIDO, nombre));
  for (const [lugar, texto] of textosDe(contenido, nombre)) {
    // El editor de texto con formato puede proteger las llaves con una barra, y la parte no se completaría.
    if (/\\[{}]/.test(texto)) errores.push(`${lugar}: una parte automática quedó con una barra invertida («${texto.slice(0, 60)}»).`);
  }
}

const general = leer(join(CONTENIDO, "general.json"));
if (general) {
  if (!general.sitio?.nombre?.trim()) errores.push("general.json: falta el nombre del sitio.");
  if (!general.sitio?.cita?.includes(FUENTE_OBLIGATORIA)) errores.push(`general.json: la cita de la fuente debe incluir «${FUENTE_OBLIGATORIA}».`);
}

const rutaPartidos = join(PROPIOS, "partidos.json");
if (existsSync(rutaPartidos)) {
  const nombres = new Map();
  for (const p of leer(rutaPartidos)?.partidos ?? []) {
    const nombre = `${p.nombreUnificado}|${p.nombreConocido ?? ""}`;
    if (nombres.has(p.partidoUnificado) && nombres.get(p.partidoUnificado) !== nombre) {
      errores.push(`datos/propios/partidos.json: los textos de ${p.partidoUnificado} deben tener el mismo nombre unificado y el mismo nombre conocido.`);
    }
    nombres.set(p.partidoUnificado, nombre);
  }
}

if (errores.length) {
  console.error(`Los textos editados tienen ${errores.length} problema(s):\n- ${errores.join("\n- ")}`);
  process.exit(1);
}
console.log("Textos editables comprobados.");
