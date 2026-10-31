// Completa las partes automáticas de un texto editable: «{periodo}» se reemplaza por su valor. Sin
// dependencias, porque también lo usan los scripts del navegador. Una parte que el código no conoce
// detiene la compilación, y así un texto mal editado no se publica (el sitio anterior sigue en línea).

const PARTE = /\{([A-Za-z][A-Za-z0-9_]*)\}/g;

/** Texto con sus partes automáticas completadas. */
export function fill(texto, valores = {}) {
  if (typeof texto !== "string") throw new Error(`Falta un texto editable (sitio/src/contenido/). Valores: ${Object.keys(valores).join(", ")}`);
  return texto.replace(PARTE, (original, nombre) => {
    if (!(nombre in valores)) throw new Error(`El texto «${texto}» usa la parte automática {${nombre}}, que no existe aquí. Las disponibles son: ${Object.keys(valores).join(", ") || "ninguna"}.`);
    return String(valores[nombre]);
  });
}
