// Ayuda de las pruebas: los textos se leen de src/contenido/, para que cambiar una redacción no las rompa.
export { textos } from "../src/lib/contenido.js";

const escapar = (t) => t.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/** Parte fija más larga de un texto editable, sin sus partes automáticas ni sus marcas, tal como queda en el HTML. */
export const fijo = (texto) =>
  escapar(
    texto
      .split(/\{[^}]*\}|\*\*|`|\]\([^)]*\)|\[|\n+|^- |"|'/m)
      .map((parte) => parte.trim())
      .sort((a, b) => b.length - a.length)[0],
  );
