// Expedientes de los que un legislador figura como autor en un período (alcance acordado en #27). Sin HTML.
//
// Criterios:
// - Fuente: expedientes.json (legislador/{id}/expedientes), con fecha de ingreso dentro del período.
// - Totales por tipo oficial (tipoProyecto), sin fusionar tipos, en orden alfabético: el orden no
//   depende de la cantidad.
// - Solo para los proyectos de ley ("PROYECTO DE LEY"), la cantidad y el porcentaje de cada estado
//   oficial (estadoProyecto, el de la última actualización) sobre el total de sus proyectos de ley, y la
//   lista de esos proyectos, del más reciente al más antiguo, con enlace al expediente en SILpy.
// - Un expediente con varios autores cuenta para cada uno: la API no distingue autor principal.
// - Ninguna lista ordena a los legisladores por cantidad de expedientes.

import { fuente } from "./datos.js";
import { proporcion, valor } from "./ficha.js";
import { slug } from "./texto.js";

export const PROYECTO_DE_LEY = "PROYECTO DE LEY";
const SIN_DATO = "sin-dato";
const porNombre = (a, b) => (a ?? "").localeCompare(b ?? "", "es");

const porPeriodo = new Map();
function delPeriodo(periodo) {
  if (porPeriodo.has(periodo)) return porPeriodo.get(periodo);
  const porLegislador = new Map();
  for (const e of fuente(periodo, "expedientes.json")) {
    if (!porLegislador.has(e.idLegislador)) porLegislador.set(e.idLegislador, []);
    porLegislador.get(e.idLegislador).push(e);
  }
  porPeriodo.set(periodo, porLegislador);
  return porLegislador;
}

/** Expedientes de un legislador en un período: totales por tipo y, de sus proyectos de ley, estados y lista. */
export function expedientesDe(idLegislador, periodo) {
  const todos = delPeriodo(periodo).get(idLegislador) ?? [];
  const porTipo = new Map();
  for (const e of todos) {
    const tipo = valor(e.tipoProyecto);
    porTipo.set(tipo, (porTipo.get(tipo) ?? 0) + 1);
  }
  const leyes = todos.filter((e) => e.tipoProyecto === PROYECTO_DE_LEY);
  const porEstado = new Map();
  for (const e of leyes) {
    const estado = valor(e.estadoProyecto);
    porEstado.set(estado, (porEstado.get(estado) ?? 0) + 1);
  }
  return {
    total: todos.length,
    porTipo: [...porTipo].map(([tipo, cantidad]) => ({ tipo, cantidad })).sort((a, b) => porNombre(a.tipo, b.tipo)),
    proyectosDeLey: {
      total: leyes.length,
      porEstado: [...porEstado]
        .map(([estado, cantidad]) => ({ estado, filtro: estado ? slug(estado) : SIN_DATO, ...proporcion(cantidad, leyes.length) }))
        .sort((a, b) => porNombre(a.estado, b.estado)),
      lista: leyes
        .map((e) => ({
          id: e.idProyecto,
          fecha: valor(e.fechaIngresoExpediente),
          fechaIso: e._propio?.fechaIngreso ?? null,
          titulo: valor(e.acapite),
          estado: valor(e.estadoProyecto),
          filtro: valor(e.estadoProyecto) ? slug(e.estadoProyecto) : SIN_DATO,
          etapa: valor(e.descripcionEtapa),
          expediente: valor(e.expedienteCamara),
          url: valor(e.appURL),
        }))
        .sort((a, b) => (b.fechaIso ?? "").localeCompare(a.fechaIso ?? "") || b.id - a.id),
    },
  };
}
