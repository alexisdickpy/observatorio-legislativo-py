"""Avisos del bot de Telegram (#66).

Se ejecuta en la sincronización diaria, después de importar. Compara los datos con lo ya procesado
(datos/propios/avisos-telegram.json) y envía a cada persona los avisos que eligió en el bot (bot/worker.js):

- leyes: un mensaje por número de ley nuevo, con el resultado de sus votaciones nominales si las hay, o un
  solo mensaje si hay más de LIMITE_LEYES;
- votaciones: un mensaje con las votaciones nominales nuevas de proyectos de ley, solo si hay;
- proyectos: un mensaje con los proyectos de ley nuevos de cualquier iniciativa y sus autores, solo si hay;
- resumen: con --resumen (el flujo lo pasa los lunes), las leyes y las votaciones que no estuvieron
  en un resumen anterior, sin las votaciones de ese mismo día. Si no hay ninguna, no envía nada.

La primera ejecución marca todo lo existente como procesado y no envía nada. Si la lista de suscriptores no
se puede obtener, o un mensaje no llega a nadie, ese aviso se reintenta en la próxima ejecución. Un fallo de
los avisos nunca interrumpe la sincronización. Los números de chat no se guardan ni se muestran aquí.

Sin TELEGRAM_TOKEN, BOT_URL y BOT_CLAVE, o con --prueba, solo muestra los mensajes y no toca el registro.
La dirección del sitio se toma de sitio/src/lib/rutas.js; las rutas /leyes/{número}/, /votacion/{id}/ y
/legisladores/votaciones-nominales/ repiten las de ese archivo, y una prueba comprueba que coincidan.

Uso, desde la raíz del repositorio:
    python -m importador.avisos              # envía, si están los secretos
    python -m importador.avisos --prueba     # muestra los mensajes sin enviarlos ni registrar
    python -m importador.avisos --resumen    # además, envía el resumen semanal
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

from .escribir import escribir_si_cambia, json_bytes, leer_json

RAIZ = Path(__file__).resolve().parents[1]
LIMITE_LEYES = 5  # más números de ley nuevos que esto en una ejecución: un solo mensaje
MAXIMO_VOTACIONES_LEY = 6  # en el aviso de una ley, las últimas; el resto está en su ficha
LIMITE_TELEGRAM = 4000  # Telegram admite 4096 caracteres por mensaje
LARGO_TITULO = 300  # en las listas, los títulos oficiales se acortan; el enlace lleva al texto completo
CITA = "Origen de los datos: Datos Abiertos Poder Legislativo"
API_TELEGRAM = "https://api.telegram.org"
PROYECTO_DE_LEY = "PROYECTO DE LEY"
PAUSA_ENVIO = 0.05  # Telegram admite unos 30 mensajes por segundo
ASUNCION = timezone(timedelta(hours=-3))


def sitio(raiz=RAIZ):
    """Dirección pública del sitio, leída de sitio/src/lib/rutas.js."""
    texto = (raiz / "sitio" / "src" / "lib" / "rutas.js").read_text(encoding="utf-8")
    encontrado = re.search(r'export const sitio = "([^"]+)"', texto)
    if not encontrado:
        raise ValueError("No se encontró la dirección del sitio en sitio/src/lib/rutas.js")
    return encontrado.group(1).rstrip("/")


def tablas(salida, nombre):
    """Registros de una tabla en todos los períodos de periodos.json."""
    filas = []
    for periodo in (leer_json(salida / "periodos.json") or {"periodos": []})["periodos"]:
        filas.extend(leer_json(salida / "fuente" / periodo["id"] / f"{nombre}.json") or [])
    return filas


def fecha_legible(iso):
    return f"{iso[8:10]}/{iso[5:7]}/{iso[:4]}" if iso else "sin dato"


def cita(actualizacion):
    """Cita obligatoria de la fuente, con la fecha de actualización de los datos (aaaa-mm-dd)."""
    return f"{CITA}. Actualizados el {fecha_legible(actualizacion)}."


def acortar(texto, largo=LARGO_TITULO):
    texto = " ".join((texto or "Sin título publicado").split())
    return texto if len(texto) <= largo else texto[:largo - 1].rstrip() + "…"


def url_ley(base, ley):
    return f"{base}/leyes/{urllib.parse.quote(ley['_propio']['numeroLey'])}/"


def resultado_votacion(v, base):
    tramite = v.get("tramitacion") or {}
    totales = f"Sí {v.get('totalSI', 0)}, No {v.get('totalNO', 0)}, Abstención {v.get('totalAbstencion', 0)}"
    return (f"{tramite.get('camaraTramite') or 'Cámara sin dato'}, {tramite.get('fechaTramite') or 'fecha sin dato'}\n"
            f"Resultado oficial {tramite.get('resultadoTramite') or 'sin dato'}. {totales}\n"
            f"{base}/votacion/{v['idVotacion']}/")


def fecha_votacion(v):
    return (v.get("tramitacion") or {}).get("_propio", {}).get("fechaTramite") or ""


def mensaje_ley(registros, votaciones, base, actualizacion):
    """Mensaje de un número de ley, que puede tener varios registros si reúne proyectos acumulados."""
    ley = registros[0]
    titulos = "\n".join((l.get("proyecto") or {}).get("acapite") or "Sin título publicado" for l in registros)
    partes = [f"Nueva ley sancionada\n\nLey {ley['_propio']['numeroLey']}\n{titulos}",
              f"Sancionada el {fecha_legible(ley['_propio'].get('fechaSancion'))}\n{url_ley(base, ley)}"]
    ids = [i for l in registros for i in l["_propio"].get("idVotaciones") or []]
    suyas = sorted((votaciones[i] for i in ids if i in votaciones), key=lambda v: (fecha_votacion(v), v["idVotacion"]))
    if suyas:
        mostradas = suyas[-MAXIMO_VOTACIONES_LEY:]
        otras = len(suyas) - len(mostradas)
        partes.append(f"Votaciones nominales ({len(suyas)})\n\n" + "\n\n".join(resultado_votacion(v, base) for v in mostradas)
                      + (f"\n\nY {otras} anteriores en la ficha de la ley." if otras else ""))
    return "\n\n".join(partes + [cita(actualizacion)])


def mensaje_varias_leyes(numeros, base, actualizacion):
    cantidad = len(numeros)
    numeros = ", ".join(numeros)
    return (f"{cantidad} leyes sancionadas nuevas en los datos del Congreso\n\n"
            f"Leyes {numeros}\n\n{base}/leyes/\n\n{cita(actualizacion)}")


def en_mensajes(encabezado, bloques, actualizacion):
    """Reparte los bloques en mensajes dentro del límite de Telegram, con encabezado y cita en cada uno."""
    pie = "\n\n" + cita(actualizacion)
    mensajes, actual = [], encabezado
    for bloque in bloques:
        if len(actual) + len(bloque) + 2 + len(pie) > LIMITE_TELEGRAM and actual != encabezado:
            mensajes.append(actual + pie)
            actual = encabezado
        actual += "\n\n" + bloque
    mensajes.append(actual + pie)
    return mensajes


def bloque_votacion(v, base):
    return f"{acortar((v.get('proyecto') or {}).get('acapite'))}\n{resultado_votacion(v, base)}"


def bloque_proyecto(p):
    """Un proyecto de ley de proyectos-recientes.json. Sin autores, indica la iniciativa y los ministerios."""
    autores = (p.get("_propio") or {}).get("autores")
    if autores:
        origen = f"Presentado por {autores}"
    else:
        ministerios = ", ".join(p.get("ministerios") or [])
        origen = f"Iniciativa {p.get('iniciativa') or 'sin dato'}" + (f". {ministerios}" if ministerios else "")
    return (f"{acortar(p.get('acapite'))}\n"
            f"{origen}\n"
            f"Ingresó el {p.get('fechaIngresoExpediente') or 'sin dato'}. Expediente {p.get('expedienteCamara') or 'sin dato'}\n"
            f"{p.get('appURL') or ''}".rstrip())


def novedades(salida):
    """Lo que cada tipo de aviso sigue, por identificador: leyes, votaciones y proyectos de ley."""
    leyes = sorted(tablas(salida, "leyes"), key=lambda l: (l["_propio"].get("fechaSancion") or "", l["_propio"]["numeroLey"], l["idLey"]))
    votaciones = sorted((v for v in tablas(salida, "votaciones") if (v.get("proyecto") or {}).get("tipoProyecto") == PROYECTO_DE_LEY),
                        key=lambda v: ((v.get("tramitacion") or {}).get("_propio", {}).get("fechaTramite") or "", v["idVotacion"]))
    proyectos = {p["idProyecto"]: p for p in sorted(tablas(salida, "proyectos-recientes"),
                                                    key=lambda p: ((p.get("_propio") or {}).get("fechaIngreso") or "", p["idProyecto"]))}
    return {"leyes": {l["idLey"]: l for l in leyes},
            "votaciones": {v["idVotacion"]: v for v in votaciones},
            "proyectos": proyectos}


def mensajes_de(tipo, pendientes, votaciones, base, actualizacion):
    """Lista de (identificadores, texto) de un tipo de aviso."""
    if tipo == "leyes":
        por_numero = {}
        for l in pendientes.values():
            por_numero.setdefault(l["_propio"]["numeroLey"], []).append(l)
        if len(por_numero) > LIMITE_LEYES:
            return [(list(pendientes), mensaje_varias_leyes(list(por_numero), base, actualizacion))]
        return [([l["idLey"] for l in registros], mensaje_ley(registros, votaciones, base, actualizacion))
                for registros in por_numero.values()]
    if tipo == "votaciones":
        encabezado = f"Votaciones nominales nuevas de proyectos de ley ({len(pendientes)})"
        bloques = [bloque_votacion(v, base) for v in pendientes.values()]
    else:
        encabezado = f"Proyectos de ley nuevos presentados ({len(pendientes)})"
        bloques = [bloque_proyecto(p) for p in pendientes.values()]
    # Todos los identificadores van con el último mensaje: si uno falla, el tipo entero se reintenta.
    textos = en_mensajes(encabezado, bloques, actualizacion)
    return [([], t) for t in textos[:-1]] + [(list(pendientes), textos[-1])]


def para_el_resumen(registro, ids, hoy):
    """Entradas del registro que van en este resumen: las que no estuvieron en otro, sin las votaciones de hoy.

    La semana se cuenta por cuándo apareció cada cosa en los datos, para no perder lo que se publica con demora.
    """
    elegidas = []
    for a in registro["avisados"]:
        elemento = ids.get(a["tipo"], {}).get(a["id"])
        if a["tipo"] in ("leyes", "votaciones") and not a.get("resumido") and elemento:
            if not (a["tipo"] == "votaciones" and fecha_votacion(elemento) >= hoy.isoformat()):
                elegidas.append(a)
    return elegidas


def mensaje_resumen(elegidas, ids, base, actualizacion, hoy):
    """Mensajes del resumen semanal, o ninguno si no hay nada que contar."""
    leyes = {}
    for a in elegidas:
        if a["tipo"] == "leyes":
            ley = ids["leyes"][a["id"]]
            leyes.setdefault(ley["_propio"]["numeroLey"], ley)
    votaciones = [ids["votaciones"][a["id"]] for a in elegidas if a["tipo"] == "votaciones"]
    if not leyes and not votaciones:
        return []
    bloques = []
    if leyes:
        bloques.append(f"Leyes nuevas ({len(leyes)})\n" + "\n".join(
            f"Ley {n}. {acortar((l.get('proyecto') or {}).get('acapite'), 150)} {url_ley(base, l)}" for n, l in leyes.items()))
    if votaciones:
        por_resultado = Counter((v.get("tramitacion") or {}).get("resultadoTramite") or "Sin dato" for v in votaciones)
        bloques.append(f"Votaciones nominales de proyectos de ley ({len(votaciones)})\n"
                       + "\n".join(f"{r}, {n}" for r, n in sorted(por_resultado.items()))
                       + f"\n{base}/legisladores/votaciones-nominales/")
    return en_mensajes(f"Resumen de la semana anterior, al {fecha_legible(hoy.isoformat())}. Incluye lo que apareció "
                       "en los datos desde el resumen anterior, aunque su fecha oficial sea más vieja.", bloques, actualizacion)


def avisar(salida, enviar, base, ahora=None, salida_texto=print, resumen=False):
    """Envía lo pendiente con `enviar(tipo, texto)`, que devuelve None o el motivo del error.

    Con `enviar` None solo muestra los mensajes y no modifica el registro. Devuelve {enviados, errores, primera}.
    """
    ahora = ahora or datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    hoy = datetime.fromisoformat(ahora.replace("Z", "+00:00")).astimezone(ASUNCION).date()
    ruta = salida / "propios" / "avisos-telegram.json"
    registro = leer_json(ruta)
    ids = novedades(salida)
    actualizacion = ((leer_json(salida / "estado.json") or {}).get("ultimaComprobacion") or ahora)[:10]
    resultado = {"enviados": 0, "errores": [], "primera": registro is None}

    if registro is None:
        salida_texto("Primera ejecución: " + ", ".join(f"{t} {len(v)}" for t, v in ids.items())
                     + ". Se marcan como procesados, sin enviar mensajes"
                     + (" (modo de prueba, no se registra)." if enviar is None else "."))
        if enviar is not None:
            escribir_si_cambia(ruta, json_bytes({"iniciales": {t: sorted(v) for t, v in ids.items()},
                                                 "avisados": [], "ultimoResumen": None}))
        return resultado

    def mandar(tipo, texto):
        if enviar is None:
            salida_texto(f"--- Mensaje de {tipo} (modo de prueba, sin enviar) ---\n{texto}")
            return True
        error = enviar(tipo, texto)
        if error:
            resultado["errores"].append(error)
            salida_texto(f"AVISO: no se pudo enviar un aviso de {tipo} ({error}). Se reintentará en la próxima ejecución.")
            return False
        resultado["enviados"] += 1
        return True

    nuevos = []
    for tipo, elementos in ids.items():
        vistos = set(registro["iniciales"].get(tipo, [])) | {a["id"] for a in registro["avisados"] if a["tipo"] == tipo}
        pendientes = {i: e for i, e in elementos.items() if i not in vistos}
        if not pendientes:
            continue
        for identificadores, texto in mensajes_de(tipo, pendientes, ids["votaciones"], base, actualizacion):
            if not mandar(tipo, texto):
                break
            nuevos.extend({"tipo": tipo, "id": i, "fecha": ahora} for i in identificadores)

    registro["avisados"] = registro["avisados"] + nuevos
    if resumen:
        elegidas = para_el_resumen(registro, ids, hoy)
        mensajes = mensaje_resumen(elegidas, ids, base, actualizacion, hoy)
        if mensajes and all([mandar("resumen", t) for t in mensajes]):
            for a in elegidas:
                a["resumido"] = True
            registro["ultimoResumen"] = hoy.isoformat()

    if enviar is not None:
        escribir_si_cambia(ruta, json_bytes(registro))
    salida_texto(f"Avisos de Telegram. Mensajes distintos enviados {resultado['enviados']}, con error {len(resultado['errores'])}.")
    return resultado


class Envio:
    """Envía cada mensaje a quienes eligieron ese aviso. Falla al crearse si no hay lista de suscriptores."""

    def __init__(self, token, url_bot, clave, salida_texto=print):
        self.token, self.url_bot, self.clave, self.salida_texto = token, url_bot.rstrip("/"), clave, salida_texto
        pedido = urllib.request.Request(f"{self.url_bot}/suscriptores", headers=self._cabeceras())
        with urllib.request.urlopen(pedido, timeout=60) as r:
            self.suscriptores = json.loads(r.read())["suscriptores"]
        salida_texto(f"Suscriptores del bot {len(self.suscriptores)}.")

    def _cabeceras(self):
        # Sin el agente por defecto de Python, que Cloudflare puede rechazar.
        return {"authorization": f"Bearer {self.clave}", "user-agent": "observatorio-legislativo-py/avisos"}

    def _a_chat(self, chat, texto):
        """None si salió bien; 'baja' si la persona bloqueó el bot; si no, el motivo."""
        datos = urllib.parse.urlencode({"chat_id": chat, "text": texto, "disable_web_page_preview": "true"}).encode()
        for intento in range(2):
            try:
                with urllib.request.urlopen(f"{API_TELEGRAM}/bot{self.token}/sendMessage", data=datos, timeout=30):
                    return None
            except urllib.error.HTTPError as e:
                if e.code == 403:
                    return "baja"
                if e.code == 429 and intento == 0:
                    time.sleep(min(int(e.headers.get("Retry-After") or 5), 60))
                    continue
                return f"HTTP {e.code}"  # sin la URL, que lleva el token
            except (urllib.error.URLError, OSError) as e:
                return type(e).__name__
        return "HTTP 429"

    def _dar_de_baja(self, chat):
        pedido = urllib.request.Request(f"{self.url_bot}/baja", data=json.dumps({"chat": chat}).encode(), method="POST",
                                        headers={**self._cabeceras(), "content-type": "application/json"})
        try:
            urllib.request.urlopen(pedido, timeout=30).close()
        except (urllib.error.URLError, OSError) as e:
            self.salida_texto(f"AVISO: no se pudo dar de baja un chat que bloqueó el bot ({type(e).__name__}).")

    def __call__(self, tipo, texto):
        destinos = [s["chat"] for s in self.suscriptores if tipo in s["avisos"]]
        fallidos, ultimo = 0, None
        for chat in destinos:
            error = self._a_chat(chat, texto)
            if error == "baja":
                self._dar_de_baja(chat)
            elif error:
                fallidos, ultimo = fallidos + 1, error
            time.sleep(PAUSA_ENVIO)
        if fallidos:
            self.salida_texto(f"AVISO: {fallidos} de {len(destinos)} envíos de {tipo} fallaron ({ultimo}).")
        return ultimo if destinos and fallidos == len(destinos) else None


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--prueba", action="store_true", help="mostrar los mensajes sin enviarlos ni registrar")
    parser.add_argument("--resumen", action="store_true", help="enviar también el resumen semanal")
    parser.add_argument("--salida", default=RAIZ / "datos", type=Path, help="carpeta de datos (por defecto datos/)")
    args = parser.parse_args(argv)
    token, url_bot, clave = (os.environ.get(n) for n in ("TELEGRAM_TOKEN", "BOT_URL", "BOT_CLAVE"))
    try:
        enviar = None
        if args.prueba:
            print("Modo de prueba. No se envía nada ni se modifica el registro.")
        elif not (token and url_bot and clave):
            print("Faltan TELEGRAM_TOKEN, BOT_URL o BOT_CLAVE. Modo de prueba, no se envía nada ni se modifica el registro.")
        else:
            enviar = Envio(token, url_bot, clave)
        avisar(args.salida, enviar, sitio(), resumen=args.resumen)
    except Exception as e:  # un fallo de los avisos nunca interrumpe la sincronización
        print(f"AVISO: los avisos de Telegram fallaron ({type(e).__name__}). Se reintentará en la próxima ejecución.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
