// Genera src/mapa/departamentos.json, la copia propia y simplificada del contorno de los departamentos
// del Paraguay (#65). No corre en la compilación: se ejecuta a mano solo si cambia el contorno.
//
// Fuente: Natural Earth, «Admin 1 – States, Provinces» a escala 1:10m, versión 5.1.2 (dominio público).
//   https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_1_states_provinces.geojson
// Uso: node scripts/mapa-departamentos.js <archivo .geojson descargado>
//
// Proyección equirectangular centrada en el Paraguay y simplificación de Douglas-Peucker. Cada zona
// lleva su código ISO 3166-2, el nombre de Natural Earth y un punto para su etiqueta.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ANCHO = 600;
const TOLERANCIA = 0.6; // en unidades del dibujo
const destino = resolve(dirname(fileURLToPath(import.meta.url)), "..", "src", "mapa", "departamentos.json");

const geojson = JSON.parse(readFileSync(process.argv[2], "utf8"));
const zonas = geojson.features.filter((f) => f.properties.adm0_a3 === "PRY");
if (zonas.length !== 18) throw new Error(`Se esperaban 18 zonas y hay ${zonas.length}`);

const poligonos = (g) => (g.type === "MultiPolygon" ? g.coordinates : [g.coordinates]);
const puntos = zonas.flatMap((f) => poligonos(f.geometry).flat(2));
const lons = puntos.map((p) => p[0]);
const lats = puntos.map((p) => p[1]);
const [minLon, maxLon, minLat, maxLat] = [Math.min(...lons), Math.max(...lons), Math.min(...lats), Math.max(...lats)];
const coseno = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
const escala = ANCHO / ((maxLon - minLon) * coseno);
const ALTO = Math.ceil((maxLat - minLat) * escala);
const proyectar = ([lon, lat]) => [(lon - minLon) * coseno * escala, (maxLat - lat) * escala];

function distancia(p, a, b) {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const largo = dx * dx + dy * dy;
  const t = largo ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / largo)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

function simplificar(linea) {
  if (linea.length < 3) return linea;
  let [maxima, indice] = [0, 0];
  for (let i = 1; i < linea.length - 1; i++) {
    const d = distancia(linea[i], linea[0], linea.at(-1));
    if (d > maxima) [maxima, indice] = [d, i];
  }
  if (maxima <= TOLERANCIA) return [linea[0], linea.at(-1)];
  return [...simplificar(linea.slice(0, indice + 1)).slice(0, -1), ...simplificar(linea.slice(indice))];
}

const numero = (n) => String(Math.round(n * 10) / 10);
const ruta = (anillos) =>
  anillos
    .map((a) => simplificar(a.map(proyectar)))
    .filter((a) => a.length >= 4)
    .map((a) => `M${a.slice(0, -1).map((p) => `${numero(p[0])} ${numero(p[1])}`).join("L")}Z`)
    .join("");

// Punto de la etiqueta: el centroide del anillo exterior más grande.
function centroide(anillos) {
  const exterior = anillos.map((a) => a.map(proyectar)).sort((a, b) => area(b) - area(a))[0];
  let [x, y, A] = [0, 0, 0];
  for (let i = 0; i < exterior.length - 1; i++) {
    const [p, q] = [exterior[i], exterior[i + 1]];
    const c = p[0] * q[1] - q[0] * p[1];
    [x, y, A] = [x + (p[0] + q[0]) * c, y + (p[1] + q[1]) * c, A + c];
  }
  return [Math.round(x / (3 * A)), Math.round(y / (3 * A))];
}
const area = (a) => Math.abs(a.reduce((s, p, i) => s + (i ? a[i - 1][0] * p[1] - p[0] * a[i - 1][1] : 0), 0));

const salida = {
  fuente: "Natural Earth, Admin 1 – States, Provinces, escala 1:10m, versión 5.1.2",
  urlFuente: "https://www.naturalearthdata.com/",
  licencia: "Dominio público",
  ancho: ANCHO,
  alto: ALTO,
  zonas: zonas
    .map((f) => {
      const anillos = poligonos(f.geometry).flat();
      return {
        codigo: f.properties.iso_3166_2,
        nombre: f.properties.name,
        ruta: ruta(anillos),
        etiqueta: centroide(poligonos(f.geometry).map((p) => p[0])),
      };
    })
    .sort((a, b) => a.codigo.localeCompare(b.codigo)),
};
writeFileSync(destino, `${JSON.stringify(salida, null, 2)}\n`);
console.log(`Mapa escrito en ${destino} (${salida.zonas.length} zonas, ${ANCHO}×${ALTO})`);
