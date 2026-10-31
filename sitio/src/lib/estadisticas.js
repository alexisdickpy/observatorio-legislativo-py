// Estadísticas generales del período (#80). Sin HTML. Todo sale de la copia de los datos abiertos, con
// recuentos propios: no usa datos patrimoniales ni de uso del sitio, ni suma senadores y diputados.

import { decisionesSinNominal } from "./decisiones.js";
import { valor } from "./ficha.js";
import { fuente } from "./datos.js";
import { listado } from "./legisladores.js";
import { clasePartido, partidoUnificado, siglaDe } from "./partidos.js";
import { composicion } from "./portada.js";
import { votacionesDelPeriodo } from "./votaciones.js";
import { textos } from "./contenido.js";
const tx = textos.estadisticas.textos;
const txc = textos.general.comunes;

/** Legisladores en la lista de más leyes de su autoría. */
export const CANTIDAD_AUTORES = 10;
/** Resultados oficiales distintos que se nombran; el resto va como «otros». */
const CANTIDAD_RESULTADOS = 8;

const deMayorAMenor = (a, b) => b.cantidad - a.cantidad || a.texto.localeCompare(b.texto, "es");

/** Cuántas veces aparece cada texto, de más a menos. */
function contar(textos) {
  const cuenta = new Map();
  for (const t of textos) cuenta.set(t, (cuenta.get(t) ?? 0) + 1);
  return [...cuenta.entries()].map(([texto, cantidad]) => ({ texto, cantidad })).sort(deMayorAMenor);
}

/** Estadísticas de un período. */
export function estadisticas(periodo) {
  // Una ley por número: el Congreso publica a veces más de un registro con el mismo número.
  const leyes = [...new Map(fuente(periodo, "leyes.json").map((l) => [l.numeroLey, l])).values()];
  const autores = fuente(periodo, "autores.json");
  const { votaciones, anios } = votacionesDelPeriodo(periodo);
  const { enEjercicio } = listado(periodo);

  const proyectosDeLeyes = new Set(leyes.map((l) => l.proyecto?.idProyecto));
  const autoresDeLeyes = autores.filter((a) => proyectosDeLeyes.has(a.idProyecto) && a.legislador);

  // Cada ley cuenta una sola vez por partido, aunque tenga varios autores de ese partido.
  const porPartido = new Map();
  for (const a of autoresDeLeyes) {
    const texto = valor(a.legislador.partidoPolitico);
    if (!texto) continue;
    const id = partidoUnificado(texto).id;
    if (!porPartido.has(id)) porPartido.set(id, { sigla: siglaDe(texto), clase: clasePartido(texto), leyes: new Set() });
    porPartido.get(id).leyes.add(a.idProyecto);
  }

  // Autores del período con ficha, cada ley una vez.
  const porAutor = new Map();
  for (const a of autoresDeLeyes) {
    const slug = a._propio?.slug;
    if (!slug || !a._propio?.delPeriodo) continue;
    if (!porAutor.has(slug)) porAutor.set(slug, new Set());
    porAutor.get(slug).add(a.idProyecto);
  }
  const fichas = new Map([...enEjercicio, ...listado(periodo).noEjercen].map((f) => [f.slug, f]));

  const resultados = contar(votaciones.map((v) => v.resultado ?? txc.sinDato));

  return {
    leyes: leyes.length,
    votaciones: votaciones.length,
    decisiones: decisionesSinNominal(periodo),
    leyesPorAnio: contar(leyes.map((l) => (l._propio?.fechaSancion ?? "").slice(0, 4) || txc.sinDato)).sort((a, b) => a.texto.localeCompare(b.texto)),
    iniciativas: contar(leyes.map((l) => valor(l.proyecto?.iniciativa) ?? txc.sinDato)),
    leyesPorPartido: [...porPartido.values()].map((p) => ({ texto: p.sigla, clase: p.clase, cantidad: p.leyes.size })).sort(deMayorAMenor),
    autores: [...porAutor.entries()]
      .map(([slug, proyectos]) => ({ texto: fichas.get(slug)?.nombre ?? slug, url: fichas.get(slug)?.url, partido: fichas.get(slug)?.partido, clase: clasePartido(fichas.get(slug)?.partido), cantidad: proyectos.size }))
      .sort(deMayorAMenor)
      .slice(0, CANTIDAD_AUTORES),
    votacionesPorAnio: [...anios].reverse(),
    resultados: [
      ...resultados.slice(0, CANTIDAD_RESULTADOS),
      ...(resultados.length > CANTIDAD_RESULTADOS ? [{ texto: tx.otrosResultados, cantidad: resultados.slice(CANTIDAD_RESULTADOS).reduce((a, r) => a + r.cantidad, 0) }] : []),
    ],
    camaras: composicion(periodo).map((c) => ({
      ...c,
      tipos: contar(enEjercicio.filter((f) => f.camara === c.camara && f.tipo !== "VITALICIO").map((f) => f.tipo ?? txc.sinDato)),
      vitalicios: enEjercicio.filter((f) => f.camara === c.camara && f.tipo === "VITALICIO").length,
    })),
  };
}
