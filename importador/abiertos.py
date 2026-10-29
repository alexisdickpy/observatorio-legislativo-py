"""Formatos derivados para descarga: una versión CSV de cada tabla JSON y el diccionario de datos.

Se generan a partir de los JSON ya escritos en datos/, así que no agregan ni cambian ningún valor:
- cada registro es una fila; los objetos anidados se aplanan con nombres de columna con puntos
  (`proyecto.acapite`, `_propio.fechaSancion`);
- las listas de valores se unen con SEPARADOR; las listas de objetos (archivos adjuntos) quedan
  solo en el JSON;
- las columnas propias conservan `_propio` en el nombre y van después de las oficiales.

El diccionario (datos/diccionario.json) se escribe a mano; de él se genera datos/diccionario.md,
con la cita, la licencia y la fecha de actualización de datos/estado.json.

Uso, para regenerarlos sin consultar la API:
    python -m importador.abiertos
"""

import re
import sys
from pathlib import Path

from .escribir import csv_bytes, escribir_si_cambia, leer_json
from .transformar import COLUMNAS_VOTOS

RAIZ = Path(__file__).resolve().parents[1]
PROPIO = "_propio"
SEPARADOR = " | "
# Tablas JSON de fuente/{período}/ que también se publican en CSV, con su columna identificadora.
TABLAS = {
    "leyes": "idLey",
    "tramitaciones": "idProyecto",
    "votaciones": "idVotacion",
    "legisladores": "idLegislador",
    "autores": "idProyecto",
    "expedientes": "idLegislador",
    "comisiones": "idComision",
}


def aplanar(registro, prefijo="", fila=None):
    """Convierte un registro JSON en una fila {columna: valor}. Omite las listas de objetos."""
    fila = {} if fila is None else fila
    for clave, valor in registro.items():
        columna = f"{prefijo}{clave}"
        if isinstance(valor, dict):
            aplanar(valor, columna + ".", fila)
        elif isinstance(valor, list):
            if any(isinstance(x, (dict, list)) for x in valor):
                continue
            fila[columna] = SEPARADOR.join(celda(x) for x in valor)
        else:
            fila[columna] = celda(valor)
    return fila


def celda(valor):
    if valor is None:
        return ""
    if isinstance(valor, bool):
        return "true" if valor else "false"
    return str(valor)


def es_propia(columna):
    return PROPIO in columna.split(".")


def ordenar_columnas(columnas, identificador):
    """El identificador primero, después las oficiales y al final las propias, cada grupo alfabético."""
    return sorted(columnas, key=lambda c: (c != identificador, es_propia(c), c))


def tabla_csv(registros, identificador):
    filas = [aplanar(r) for r in registros]
    columnas = ordenar_columnas({c for f in filas for c in f}, identificador)
    return csv_bytes(columnas, filas), columnas


def campos_documentados(diccionario, tabla):
    """Expresiones regulares de los campos del diccionario; `*` reemplaza una parte variable del nombre."""
    return [re.compile("^" + re.escape(c["campo"]).replace(r"\*", "[^.]+") + "$")
            for c in diccionario["tablas"][tabla]["campos"]]


def sin_documentar(diccionario, tabla, columnas):
    patrones = campos_documentados(diccionario, tabla)
    return [c for c in columnas if not any(p.match(c) for p in patrones)]


def leer_diccionario(salida):
    return leer_json(Path(salida) / "diccionario.json") or leer_json(RAIZ / "datos" / "diccionario.json")


def generar(salida):
    """Escribe los CSV de cada período y diccionario.md. Devuelve (archivos modificados, avisos)."""
    salida = Path(salida)
    diccionario = leer_diccionario(salida)
    estado = leer_json(salida / "estado.json") or {}
    cambiados, avisos = [], []
    for periodo in (leer_json(salida / "periodos.json") or {"periodos": []})["periodos"]:
        carpeta = salida / "fuente" / periodo["id"]
        for tabla, identificador in TABLAS.items():
            registros = leer_json(carpeta / f"{tabla}.json")
            if registros is None:
                continue
            contenido, columnas = tabla_csv(registros, identificador)
            if escribir_si_cambia(carpeta / f"{tabla}.csv", contenido):
                cambiados.append(carpeta / f"{tabla}.csv")
            for columna in sin_documentar(diccionario, tabla, columnas):
                avisos.append(f"Campo sin describir en datos/diccionario.json: {tabla} → {columna}")
    for columna in sin_documentar(diccionario, "votos", COLUMNAS_VOTOS):
        avisos.append(f"Campo sin describir en datos/diccionario.json: votos → {columna}")
    if escribir_si_cambia(salida / "diccionario.md", diccionario_md(diccionario, estado).encode("utf-8")):
        cambiados.append(salida / "diccionario.md")
    return cambiados, sorted(set(avisos))


def diccionario_md(diccionario, estado):
    fuente = estado.get("fuente", {})
    lineas = [
        "# Diccionario de datos",
        "",
        "<!-- Generado por el importador a partir de diccionario.json. No editar a mano. -->",
        "",
        f"**{fuente.get('cita', 'Origen de los datos: Datos Abiertos Poder Legislativo')}.** "
        "Licencia [CC BY 4.0](../LICENSE-DATOS.md). Se muestran tal como los publica el Congreso, con sus posibles errores; ante una duda, compárelos con la fuente oficial.",
        "",
    ]
    periodos = estado.get("periodos", {})
    if periodos:
        lineas += ["| Período | Datos actualizados por última vez |", "|---|---|"]
        lineas += [f"| {nombre} | {p.get('ultimaModificacion', '')} |" for nombre, p in sorted(periodos.items())]
        lineas += ["", "La última comprobación de la fuente (aunque no haya cambios) figura en [`estado.json`](estado.json).", ""]
    lineas += [diccionario["introduccion"].strip(), ""]
    for tabla, t in diccionario["tablas"].items():
        cantidad = sum(p.get("cantidades", {}).get(tabla, 0) for p in periodos.values())
        lineas += [f"## {tabla}", "", t["descripcion"].strip(), ""]
        archivos = [f"`{a}`" for a in t["archivos"]]
        lista = archivos[0] if len(archivos) == 1 else ", ".join(archivos[:-1]) + " y " + archivos[-1]
        lineas.append(f"Se publica en {lista}" + (f", con {cantidad} registros en total." if cantidad else "."))
        lineas += ["", "| Campo | Origen | Tipo | Descripción |", "|---|---|---|---|"]
        for c in t["campos"]:
            descripcion = c["descripcion"].replace("|", "\\|")
            if c.get("soloJSON"):
                descripcion += " *Solo en el JSON.*"
            lineas.append(f"| `{c['campo']}` | {c['origen']} | {c['tipo']} | {descripcion} |")
        lineas.append("")
    return "\n".join(lineas)


def main(argv=None):
    salida = Path(argv[0]) if argv else RAIZ / "datos"
    cambiados, avisos = generar(salida)
    for aviso in avisos:
        print(f"AVISO: {aviso}")
    print("Archivos modificados:" if cambiados else "Archivos modificados: ninguno")
    for ruta in cambiados:
        print(f"  {ruta.relative_to(salida).as_posix()}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
