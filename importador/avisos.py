"""Avisos de leyes nuevas en el canal público de Telegram (#66).

Se ejecuta en la sincronización diaria, después de importar. Compara las leyes de
datos/fuente/{período}/leyes.json con las ya avisadas (datos/propios/avisos-telegram.json) y publica
un mensaje por cada ley nueva, con su número, título oficial, fecha de sanción y enlace a su ficha.

- Primera ejecución (sin registro): marca todas las leyes existentes como avisadas y no envía nada.
- Si hay más leyes nuevas que LIMITE, envía un solo mensaje resumen con enlace al catálogo.
- Una ley se marca como avisada solo si su mensaje se envió. Si el envío falla, se informa en la salida,
  se vuelve a intentar en la próxima ejecución y la sincronización no se interrumpe.
- Sin TELEGRAM_TOKEN y TELEGRAM_CANAL (o con --prueba) no envía nada: muestra los mensajes y no toca el
  registro.

No guarda ningún dato de quienes siguen el canal. La dirección del sitio se toma de
sitio/src/lib/rutas.js, el único lugar donde está definida; las rutas /leyes/ y /leyes/{número}/ repiten
las de ese archivo (rutas.leyes y rutas.ley), y una prueba comprueba que coincidan.

Uso, desde la raíz del repositorio:
    python -m importador.avisos            # envía, si están los secretos
    python -m importador.avisos --prueba   # muestra los mensajes sin enviarlos ni registrar
"""

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from .escribir import json_bytes, escribir_si_cambia, leer_json

RAIZ = Path(__file__).resolve().parents[1]
LIMITE = 5  # más leyes nuevas que esto en una ejecución: un solo mensaje resumen
CITA = "Origen de los datos: Datos Abiertos Poder Legislativo"
API_TELEGRAM = "https://api.telegram.org"


def sitio(raiz=RAIZ):
    """Dirección pública del sitio, leída de sitio/src/lib/rutas.js."""
    texto = (raiz / "sitio" / "src" / "lib" / "rutas.js").read_text(encoding="utf-8")
    encontrado = re.search(r'export const sitio = "([^"]+)"', texto)
    if not encontrado:
        raise ValueError("No se encontró la dirección del sitio en sitio/src/lib/rutas.js")
    return encontrado.group(1).rstrip("/")


def leyes_publicadas(salida):
    """Leyes de todos los períodos de periodos.json, en orden de sanción y de número."""
    leyes = []
    for periodo in (leer_json(salida / "periodos.json") or {"periodos": []})["periodos"]:
        leyes.extend(leer_json(salida / "fuente" / periodo["id"] / "leyes.json") or [])
    return sorted(leyes, key=lambda l: (l["_propio"].get("fechaSancion") or "", l["_propio"]["numeroLey"], l["idLey"]))


def fecha_legible(iso):
    return f"{iso[8:10]}/{iso[5:7]}/{iso[:4]}" if iso else "sin dato"


def cita(actualizacion):
    """Cita obligatoria de la fuente, con la fecha de actualización de los datos (aaaa-mm-dd)."""
    return f"{CITA}. Actualizados el {fecha_legible(actualizacion)}."


def mensaje_ley(ley, base, actualizacion):
    numero = ley["_propio"]["numeroLey"]
    titulo = (ley.get("proyecto") or {}).get("acapite") or "Sin título publicado"
    return (f"Nueva ley sancionada\n\n"
            f"Ley {numero}\n{titulo}\n\n"
            f"Sancionada el {fecha_legible(ley['_propio'].get('fechaSancion'))}\n"
            f"{base}/leyes/{urllib.parse.quote(numero)}/\n\n{cita(actualizacion)}")


def mensaje_resumen(leyes, base, actualizacion):
    numeros = ", ".join(l["_propio"]["numeroLey"] for l in leyes)
    return (f"{len(leyes)} leyes sancionadas nuevas en los datos del Congreso\n\n"
            f"Leyes {numeros}\n\n{base}/leyes/\n\n{cita(actualizacion)}")


def enviar_telegram(token, canal, texto):
    """Publica un mensaje en el canal. Devuelve None si salió bien o el motivo del error."""
    datos = urllib.parse.urlencode({"chat_id": canal, "text": texto, "disable_web_page_preview": "true"}).encode()
    try:
        with urllib.request.urlopen(f"{API_TELEGRAM}/bot{token}/sendMessage", data=datos, timeout=30) as r:
            respuesta = json.loads(r.read())
    except (urllib.error.URLError, OSError, ValueError) as e:
        # No se incluye la URL en el motivo: lleva el token.
        return type(e).__name__ + (f" {e.code}" if isinstance(e, urllib.error.HTTPError) else "")
    return None if respuesta.get("ok") else f"Telegram respondió {respuesta.get('description', 'sin detalle')}"


def avisar(salida, enviar, base, ahora=None, salida_texto=print, limite=LIMITE):
    """Envía los avisos pendientes con `enviar(texto)` (None = no enviar, solo mostrar).

    Devuelve un resumen {pendientes, enviados, errores, primera}. Con `enviar` None no modifica el registro.
    """
    ahora = ahora or datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    ruta = salida / "propios" / "avisos-telegram.json"
    registro = leer_json(ruta)
    leyes = leyes_publicadas(salida)
    actualizacion = ((leer_json(salida / "estado.json") or {}).get("ultimaComprobacion") or ahora)[:10]
    resultado = {"pendientes": 0, "enviados": 0, "errores": [], "primera": registro is None}

    if registro is None:
        salida_texto(f"Primera ejecución: {len(leyes)} leyes existentes se marcan como avisadas, sin enviar mensajes"
                     + (" (modo de prueba: no se registra)." if enviar is None else "."))
        if enviar is not None:
            escribir_si_cambia(ruta, json_bytes({"avisadas": [
                {"idLey": l["idLey"], "numeroLey": l["_propio"]["numeroLey"], "fecha": ahora, "enviado": False}
                for l in leyes]}))
        return resultado

    avisadas = {a["idLey"] for a in registro["avisadas"]}
    pendientes = [l for l in leyes if l["idLey"] not in avisadas]
    resultado["pendientes"] = len(pendientes)
    if not pendientes:
        salida_texto("Avisos de Telegram: no hay leyes nuevas.")
        return resultado

    if len(pendientes) > limite:
        grupos = [(pendientes, mensaje_resumen(pendientes, base, actualizacion))]
    else:
        grupos = [([l], mensaje_ley(l, base, actualizacion)) for l in pendientes]

    nuevas = []
    for leyes_del_mensaje, texto in grupos:
        if enviar is None:
            salida_texto("--- Mensaje (modo de prueba, sin enviar) ---\n" + texto)
            continue
        error = enviar(texto)
        if error:
            resultado["errores"].append(error)
            salida_texto(f"AVISO: no se pudo enviar el aviso de la ley {', '.join(l['_propio']['numeroLey'] for l in leyes_del_mensaje)}: {error}. Se reintentará en la próxima ejecución.")
            continue
        resultado["enviados"] += 1
        nuevas.extend({"idLey": l["idLey"], "numeroLey": l["_propio"]["numeroLey"], "fecha": ahora, "enviado": True}
                      for l in leyes_del_mensaje)

    if nuevas:
        escribir_si_cambia(ruta, json_bytes({"avisadas": registro["avisadas"] + nuevas}))
    salida_texto(f"Avisos de Telegram. Leyes nuevas {len(pendientes)}, mensajes enviados {resultado['enviados']}, "
                 f"mensajes con error {len(resultado['errores'])}.")
    return resultado


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--prueba", action="store_true", help="mostrar los mensajes sin enviarlos ni registrar")
    parser.add_argument("--salida", default=RAIZ / "datos", type=Path, help="carpeta de datos (por defecto datos/)")
    args = parser.parse_args(argv)
    token, canal = os.environ.get("TELEGRAM_TOKEN"), os.environ.get("TELEGRAM_CANAL")
    enviar = None
    if args.prueba:
        print("Modo de prueba: no se envía nada ni se modifica el registro.")
    elif not (token and canal):
        print("Faltan TELEGRAM_TOKEN o TELEGRAM_CANAL: modo de prueba, no se envía nada ni se modifica el registro.")
    else:
        enviar = lambda texto: enviar_telegram(token, canal, texto)  # noqa: E731
    try:
        avisar(args.salida, enviar, sitio())
    except Exception as e:  # un fallo de los avisos nunca interrumpe la sincronización
        print(f"AVISO: los avisos de Telegram fallaron ({type(e).__name__}: {e}).", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
