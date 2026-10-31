// Comisiones de las que un legislador figura como miembro en cada período parlamentario (alcance acordado
// en #30). Sin HTML.
//
// Criterios:
// - Fuente: comisiones.json (comision/{id}/miembros/{período parlamentario}), de las dos cámaras y de
//   todos los tipos: permanentes, bicamerales, especiales, nacionales y frentes parlamentarios.
// - Por período parlamentario, del más reciente al más antiguo. Dentro de cada uno, por tipo (en el
//   orden de TIPOS) y por nombre oficial.
// - El tipo se muestra sin el agregado "(A)" de la API y sin espacios de más; el texto oficial queda en
//   los datos.
// - La API no publica el cargo de cada miembro dentro de la comisión ni las firmas de los dictámenes:
//   no hay presidentes, secretarios ni indicadores de trabajo en comisiones.
// - La entrada "COMISIONES ESPECIALES" de Diputados no dice a qué comisión especial corresponde: se
//   muestra con una nota.

import { fuente } from "./datos.js";
import { valor } from "./ficha.js";
import { textos } from "./contenido.js";
const tx = textos.legisladores.textosComisiones;

const TIPOS = ["PERMANENTE", "BICAMERAL", "ESPECIAL", "NACIONAL", "FRENTE PARLAMENTARIO"];
export const COMISIONES_ESPECIALES = "COMISIONES ESPECIALES";
export const NOTA_COMISIONES_ESPECIALES =
  tx.elCongresoPublicaEstaEntrada;

/** Tipo oficial sin "(A)" ni espacios de más, en mayúsculas: "ESPECIAL  (A)" → "ESPECIAL". */
export const tipoBase = (tipo) =>
  (valor(tipo) ?? "").replace(/\(A\)/g, "").replace(/\s+/g, " ").trim() || null;

/** Tipo para mostrar: "FRENTE PARLAMENTARIO" → "Frente parlamentario". */
export function tipoLegible(tipo) {
  const base = tipoBase(tipo);
  return base ? base.charAt(0) + base.slice(1).toLowerCase() : null;
}

const posicionTipo = (tipo) => {
  const i = TIPOS.indexOf(tipoBase(tipo));
  return i === -1 ? TIPOS.length : i;
};

const porPeriodo = new Map();
function delPeriodo(periodo) {
  if (porPeriodo.has(periodo)) return porPeriodo.get(periodo);
  const porLegislador = new Map();
  for (const c of fuente(periodo, "comisiones.json")) {
    if (!porLegislador.has(c.idLegislador)) porLegislador.set(c.idLegislador, []);
    porLegislador.get(c.idLegislador).push(c);
  }
  porPeriodo.set(periodo, porLegislador);
  return porLegislador;
}

/** Comisiones de un legislador en un período legislativo, agrupadas por período parlamentario. */
export function comisionesDe(idLegislador, periodo) {
  const grupos = new Map();
  for (const c of delPeriodo(periodo).get(idLegislador) ?? []) {
    const id = c.idPeriodoParlamentario;
    if (!grupos.has(id)) grupos.set(id, { id, nombre: valor(c._propio?.periodoParlamentario), comisiones: [] });
    grupos.get(id).comisiones.push({
      id: c.idComision,
      nombre: valor(c.nombreComision),
      tipo: tipoLegible(c.tipoComision),
      camara: valor(c.camaraComision),
      activa: valor(c.esComisionActiva),
      url: valor(c.appURL),
      nota: c.nombreComision === COMISIONES_ESPECIALES ? NOTA_COMISIONES_ESPECIALES : null,
      orden: posicionTipo(c.tipoComision),
    });
  }
  const periodos = [...grupos.values()].sort((a, b) => b.id - a.id);
  for (const p of periodos) {
    p.comisiones.sort((a, b) => a.orden - b.orden || (a.nombre ?? "").localeCompare(b.nombre ?? "", "es") || a.id - b.id);
  }
  return { periodos, total: periodos.reduce((s, p) => s + p.comisiones.length, 0) };
}
