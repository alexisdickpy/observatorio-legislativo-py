"""Clasificación temática de los proyectos de ley de cada período (#36).

Es un dato propio, separado de los valores oficiales:
- datos/propios/temas.json (se edita a mano) define cada tema, su definición y sus palabras clave;
- datos/propios/clasificacion-temas.json (y su .csv) tiene los temas de cada proyecto de ley con
  ley sancionada o con votación nominal en el período, con la regla o la revisión que asignó cada uno.

Criterios (ver docs/metodologia.md):
- Las reglas buscan las palabras clave en el acápite oficial del proyecto, sin mayúsculas ni tildes y
  sin el encabezado «Mensaje del Poder Ejecutivo… por el cual remite» ni la parte final «presentado
  por…». Cada palabra clave es el comienzo de una palabra
  (`tributari` encuentra «tributaria» y «tributario»).
- Un proyecto puede tener más de un tema. Los temas con `exclusivo` (pensiones graciables, inmuebles)
  dejan fuera a los demás, porque el beneficiario o el destino del inmueble no es el tema de la ley.
- Cada tema puede tener `excepto`, frases que no cuentan para ese tema.
- Sin ninguna regla, el proyecto queda pendiente de clasificación; nunca se fuerza un tema.
- Las entradas revisadas a mano (`revisado: true`) no se recalculan.

Uso, para regenerarla sin consultar la API:
    python -m importador.temas
"""

import re
import sys
import unicodedata
from pathlib import Path

from .escribir import csv_bytes, escribir_si_cambia, json_bytes, leer_json

RAIZ = Path(__file__).resolve().parents[1]
RUTA_TEMAS = Path("propios") / "temas.json"
RUTA_CLASIFICACION = Path("propios") / "clasificacion-temas.json"
RUTA_CSV = Path("propios") / "clasificacion-temas.csv"
COLUMNAS_CSV = ["idProyecto", "periodoLegislativo", "temas", "pendiente", "revisado"]
SEPARADOR = " | "
PROYECTO_DE_LEY = "PROYECTO DE LEY"
PRESENTADO_POR = re.compile(r"\bpresentad[oa]s? por\b.*$")
# Encabezado de los proyectos del Poder Ejecutivo ("Mensaje N° 642, Ministerio de…, por el cual remite…"):
# el ministerio que envía el proyecto no es su tema.
MENSAJE = re.compile(r"^mensaje\b.*?\bremite\b")


def normalizar(texto):
    """Minúsculas, sin tildes y con un espacio entre palabras (igual que lib/texto.js del sitio)."""
    sin_tildes = "".join(c for c in unicodedata.normalize("NFD", str(texto or "")) if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", sin_tildes.lower()).strip()


def texto_de_reglas(acapite):
    """El acápite normalizado, sin el encabezado «Mensaje… remite» ni la parte «presentado por…», entre espacios."""
    texto = MENSAJE.sub("", PRESENTADO_POR.sub("", normalizar(acapite)))
    return f" {texto.strip()} "


def aplicar_reglas(acapite, temas):
    """Temas que asignan las reglas: [{"tema", "origen": "regla", "palabraClave"}], en el orden de temas.json."""
    texto = texto_de_reglas(acapite)
    asignados = []
    for tema in temas:
        texto_tema = texto
        for frase in tema.get("excepto", []):
            texto_tema = texto_tema.replace(f" {normalizar(frase)} ", " ")
        clave = next((c for c in tema["palabrasClave"] if f" {normalizar(c)}" in texto_tema), None)
        if clave:
            asignados.append({"tema": tema["id"], "origen": "regla", "palabraClave": clave})
    exclusivos = {t["id"] for t in temas if t.get("exclusivo")}
    if any(a["tema"] in exclusivos for a in asignados):
        asignados = [a for a in asignados if a["tema"] in exclusivos]
    return asignados


def es_de_proyecto_de_ley(votacion):
    """Igual que esDeProyectoDeLey del sitio: proyecto de ley oficial o votación enlazada a una ley."""
    return (votacion.get("proyecto") or {}).get("tipoProyecto") == PROYECTO_DE_LEY or bool(
        (votacion.get("_propio") or {}).get("idLeyes"))


def proyectos_del_periodo(carpeta):
    """{idProyecto: acápite oficial} de los proyectos con ley y de los proyectos de ley con votación nominal."""
    proyectos = {}
    for ley in leer_json(carpeta / "leyes.json") or []:
        p = ley.get("proyecto") or {}
        proyectos.setdefault(p["idProyecto"], p.get("acapite") or "")
    for votacion in leer_json(carpeta / "votaciones.json") or []:
        p = votacion.get("proyecto") or {}
        if p.get("idProyecto") is not None and es_de_proyecto_de_ley(votacion):
            proyectos.setdefault(p["idProyecto"], p.get("acapite") or "")
    return proyectos


def clasificar_periodo(periodo, proyectos, temas, anteriores):
    """Entradas del período: las revisadas se conservan; las demás salen de las reglas."""
    ids_temas = {t["id"] for t in temas}
    revisadas = {e["idProyecto"]: e for e in anteriores if e.get("periodoLegislativo") == periodo and e.get("revisado")}
    entradas, avisos = [], []
    for id_proyecto, acapite in sorted(proyectos.items()):
        if id_proyecto in revisadas:
            entrada = revisadas[id_proyecto]
            desconocidos = [t["tema"] for t in entrada["temas"] if t["tema"] not in ids_temas]
            if desconocidos:
                raise ValueError(f"El proyecto {id_proyecto} tiene temas que no están en temas.json: {', '.join(desconocidos)}")
        else:
            asignados = aplicar_reglas(acapite, temas)
            entrada = {"idProyecto": id_proyecto, "periodoLegislativo": periodo,
                       "pendiente": not asignados, "revisado": False, "temas": asignados}
            if not asignados:
                avisos.append(f"Proyecto {id_proyecto} ({periodo}) pendiente de clasificación temática")
        entradas.append(entrada)
    for id_proyecto in sorted(set(revisadas) - set(proyectos)):
        avisos.append(f"Se quitó la clasificación revisada del proyecto {id_proyecto}, que ya no figura en {periodo}")
    return entradas, avisos


def filas_csv(entradas):
    return [{"idProyecto": e["idProyecto"], "periodoLegislativo": e["periodoLegislativo"],
             "temas": SEPARADOR.join(t["tema"] for t in e["temas"]),
             "pendiente": "true" if e["pendiente"] else "false",
             "revisado": "true" if e["revisado"] else "false"} for e in entradas]


def clasificar(salida):
    """Escribe la clasificación de todos los períodos. Devuelve (archivos modificados, avisos)."""
    salida = Path(salida)
    temas = (leer_json(salida / RUTA_TEMAS) or leer_json(RAIZ / "datos" / RUTA_TEMAS))["temas"]
    anteriores = (leer_json(salida / RUTA_CLASIFICACION) or {"proyectos": []})["proyectos"]
    entradas, avisos = [], []
    for periodo in (leer_json(salida / "periodos.json") or {"periodos": []})["periodos"]:
        carpeta = salida / "fuente" / periodo["id"]
        if not (carpeta / "leyes.json").exists():
            entradas += [e for e in anteriores if e.get("periodoLegislativo") == periodo["id"]]
            continue
        del_periodo, avisos_periodo = clasificar_periodo(periodo["id"], proyectos_del_periodo(carpeta), temas, anteriores)
        entradas += del_periodo
        avisos += avisos_periodo
    entradas.sort(key=lambda e: (e["periodoLegislativo"], e["idProyecto"]))
    cambiados = []
    if escribir_si_cambia(salida / RUTA_CLASIFICACION, json_bytes({"proyectos": entradas})):
        cambiados.append(salida / RUTA_CLASIFICACION)
    if escribir_si_cambia(salida / RUTA_CSV, csv_bytes(COLUMNAS_CSV, filas_csv(entradas))):
        cambiados.append(salida / RUTA_CSV)
    return cambiados, avisos


def main(argv=None):
    salida = Path(argv[0]) if argv else RAIZ / "datos"
    cambiados, avisos = clasificar(salida)
    for aviso in avisos:
        print(f"AVISO: {aviso}")
    print("Archivos modificados:" if cambiados else "Archivos modificados: ninguno")
    for ruta in cambiados:
        print(f"  {ruta.relative_to(salida).as_posix()}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
