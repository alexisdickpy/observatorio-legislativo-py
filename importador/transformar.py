"""Transformaciones de los registros de la API a los archivos de datos/.

Regla de fidelidad: ningún valor oficial se modifica. Todo lo que calcula el proyecto
(fechas en ISO, totales recalculados, enlaces, slugs) va dentro de una clave `_propio`
del objeto al que se refiere. Lo que está fuera de `_propio` es tal cual lo publica la API.

El correo y el teléfono de los legisladores se guardan una sola vez, en su registro de
legisladores.json; se omiten en las copias del legislador que la API repite dentro de autores,
leyes y votaciones. La lista de votos individuales de cada votación se guarda aparte en votos.csv.
"""

import copy
from collections import Counter, defaultdict

from .fechas import a_iso

PROPIO = "_propio"
# Datos de contacto: solo en legisladores.json (decidido en #8).
CAMPOS_CONTACTO = {"emailParlamentario", "telefonoParlamentario"}

# Miembros con voto de cada cámara. Los senadores vitalicios tienen voz pero no voto.
MIEMBROS_CON_VOTO = {"CAMARA DE SENADORES": 45, "CAMARA DE DIPUTADOS": 80}

# Total publicado en cada votación y el código de sentido (idSentidoVotacion) que cuenta.
TOTALES_PUBLICADOS = {
    "totalSI": 272,
    "totalNO": 273,
    "totalAbstencion": 274,
    "totalAusente": 275,
    "totalNoVota": 276,
}

COLUMNAS_VOTOS = ["idVotacion", "idDetalleVotacion", "idLegislador", "idSentidoVotacion", "sentidoVotacion", "observacion"]


class Notas:
    """Acumula notas sobre problemas de la fuente, para datos/propios/notas.json."""

    def __init__(self):
        self.lista = []

    def agregar(self, tipo, entidad, id_registro, detalle, ruta=None, valor_original=None):
        nota = {"tipo": tipo, "entidad": entidad, "id": id_registro, "detalle": detalle}
        if ruta is not None:
            nota["ruta"] = ruta
        if valor_original is not None:
            nota["valorOriginal"] = valor_original
        self.lista.append(nota)

    def por_tipo(self):
        return Counter(n["tipo"] for n in self.lista)


def sin_contacto(obj):
    """Copia del objeto sin correos ni teléfonos, a cualquier profundidad (para las copias del
    legislador dentro de otras entidades)."""
    if isinstance(obj, dict):
        return {k: sin_contacto(v) for k, v in obj.items() if k not in CAMPOS_CONTACTO}
    if isinstance(obj, list):
        return [sin_contacto(x) for x in obj]
    return obj


def con_fechas_iso(obj, entidad, id_registro, notas, ruta=""):
    """Agrega `_propio.<campo>` con la fecha ISO de cada campo de fecha del objeto.

    Se aplica a cualquier profundidad. Una fecha mal formada queda como None en la
    versión ISO y se registra como nota; el texto original no se toca.
    """
    if isinstance(obj, list):
        return [con_fechas_iso(x, entidad, id_registro, notas, f"{ruta}[{i}]") for i, x in enumerate(obj)]
    if not isinstance(obj, dict):
        return obj
    nuevo = {}
    for clave, valor in obj.items():
        nuevo[clave] = con_fechas_iso(valor, entidad, id_registro, notas, f"{ruta}.{clave}" if ruta else clave)
    propias = {}
    for clave, valor in obj.items():
        if clave.startswith("fecha") and (valor is None or isinstance(valor, str)):
            iso, problema = a_iso(valor)
            propias[clave] = iso
            if problema:
                notas.agregar("fecha_mal_formada", entidad, id_registro, problema,
                              ruta=f"{ruta}.{clave}" if ruta else clave, valor_original=valor)
    if propias:
        nuevo.setdefault(PROPIO, {}).update(propias)
    return nuevo


def numero_ley(texto):
    """Número de ley para agrupar y para la URL: el texto oficial sin espacios alrededor."""
    return (texto or "").strip()


def transformar_ley(ley, periodo_legislativo, id_periodo_parlamentario, tramitaciones, adjuntos, notas):
    """Registro de leyes.json.

    `tramitaciones` y `adjuntos` son el primer elemento de `datos` de
    proyecto/{id}/tramitaciones y proyecto/{id}/adjuntos, o None si la API no los publica.
    Del primero se toman los ministerios; la lista de tramitaciones va a tramitaciones.json
    (ver filas_tramitaciones) y los autores, a autores.json.
    """
    registro = sin_contacto(copy.deepcopy(ley))
    proyecto = registro["proyecto"]
    id_ley = registro["idLey"]
    if tramitaciones is None:
        notas.agregar("proyecto_sin_tramitaciones", "ley", id_ley,
                      f"La API no devolvió tramitaciones para el proyecto {proyecto['idProyecto']}.")
    else:
        proyecto["ministerios"] = list(tramitaciones.get("ministerios") or [])
    if adjuntos is None:
        notas.agregar("proyecto_sin_adjuntos", "ley", id_ley,
                      f"La API no devolvió adjuntos para el proyecto {proyecto['idProyecto']}.")
    else:
        proyecto["archivosAdjuntos"] = sorted(adjuntos.get("archivosAdjuntos") or [], key=lambda a: a["idAdjunto"])

    registro = con_fechas_iso(registro, "ley", id_ley, notas)
    registro.setdefault(PROPIO, {}).update({
        "numeroLey": numero_ley(ley.get("numeroLey")),
        "periodoLegislativo": periodo_legislativo,
        "idPeriodoParlamentario": id_periodo_parlamentario,
    })
    return registro


def periodo_parlamentario_de_votacion(votacion):
    sesion = (votacion.get("tramitacion") or {}).get("idSesion") or {}
    return (sesion.get("periodoParlamentarioDTO") or {}).get("idPeriodoParlamentario")


def camara_de_votacion(votacion):
    tramitacion = votacion.get("tramitacion") or {}
    return tramitacion.get("camaraTramite") or (tramitacion.get("idSesion") or {}).get("camaraSesion")


def transformar_votacion(votacion, periodo_legislativo, notas):
    """Devuelve (registro de votaciones.json, filas de votos.csv, legisladores embebidos por id)."""
    id_votacion = votacion["idVotacion"]
    votos = votacion.get("votaciones") or []
    registro = sin_contacto({k: copy.deepcopy(v) for k, v in votacion.items() if k != "votaciones"})
    registro = con_fechas_iso(registro, "votacion", id_votacion, notas)

    filas = []
    legisladores = {}
    por_codigo = Counter()
    por_sentido = Counter()
    vistos = Counter()
    for voto in votos:
        legislador = voto.get("legislador") or {}
        id_legislador = legislador.get("idLegislador")
        if id_legislador is None:
            notas.agregar("voto_sin_legislador", "votacion", id_votacion,
                          f"El voto {voto.get('idDetalleVotacion')} no identifica al legislador.")
        else:
            vistos[id_legislador] += 1
            legisladores.setdefault(id_legislador, copy.deepcopy(legislador))
        por_codigo[voto.get("idSentidoVotacion")] += 1
        por_sentido[voto.get("sentidoVotacion") or ""] += 1
        filas.append({
            "idVotacion": id_votacion,
            "idDetalleVotacion": voto.get("idDetalleVotacion"),
            "idLegislador": id_legislador,
            "idSentidoVotacion": voto.get("idSentidoVotacion"),
            "sentidoVotacion": voto.get("sentidoVotacion"),
            "observacion": voto.get("observacion"),
        })
    filas.sort(key=lambda f: (f["idDetalleVotacion"] is None, f["idDetalleVotacion"] or 0))

    for id_legislador, veces in sorted(vistos.items()):
        if veces > 1:
            notas.agregar("legislador_repetido_en_votacion", "votacion", id_votacion,
                          f"El legislador {id_legislador} figura {veces} veces.")

    discrepancias = {}
    for campo, codigo in TOTALES_PUBLICADOS.items():
        recalculado = por_codigo.get(codigo, 0)
        if votacion.get(campo) != recalculado:
            discrepancias[campo] = {"publicado": votacion.get(campo), "recalculado": recalculado}
    if discrepancias:
        notas.agregar("totales_no_coinciden", "votacion", id_votacion,
                      "Los totales publicados no coinciden con los votos individuales: "
                      + ", ".join(f"{c} {d['publicado']} publicado / {d['recalculado']} recalculado"
                                  for c, d in discrepancias.items()) + ".")

    camara = camara_de_votacion(votacion)
    miembros = MIEMBROS_CON_VOTO.get(camara)
    if miembros and len(votos) < miembros:
        notas.agregar("menos_votos_que_miembros", "votacion", id_votacion,
                      f"Tiene {len(votos)} votos individuales y la cámara tiene {miembros} miembros con voto.")

    registro.setdefault(PROPIO, {}).update({
        "periodoLegislativo": periodo_legislativo,
        "cantidadVotos": len(votos),
        "totalesRecalculados": dict(sorted(por_sentido.items())),
        "totalesCoinciden": not discrepancias,
    })
    return registro, filas, legisladores


def transformar_legislador(legislador, vigente, slug, fuente_registro):
    registro = copy.deepcopy(legislador)
    registro = con_fechas_iso(registro, "legislador", registro.get("idLegislador"), Notas())
    registro.setdefault(PROPIO, {}).update({
        "vigente": vigente,
        "slug": slug,
        "fuenteRegistro": fuente_registro,
    })
    return registro


def filas_tramitaciones(id_proyecto, tramitaciones, notas):
    """Registros de tramitaciones.json para un proyecto, ordenados por idTramitacion."""
    filas = []
    for tramitacion in sorted(tramitaciones or [], key=lambda t: t["idTramitacion"]):
        filas.append({
            "idProyecto": id_proyecto,
            "tramitacion": con_fechas_iso(sin_contacto(tramitacion), "proyecto", id_proyecto, notas,
                                          f"tramitaciones[{tramitacion['idTramitacion']}]"),
        })
    return filas


def filas_autores(id_proyecto, autores, periodo_legislativo, slugs):
    """Registros de autores.json para un proyecto, en el orden en que los publica la API."""
    filas = []
    for orden, autor in enumerate(autores or [], 1):
        id_legislador = autor.get("idLegislador")
        filas.append({
            "idProyecto": id_proyecto,
            "legislador": sin_contacto(autor),
            PROPIO: {
                "orden": orden,
                "delPeriodo": autor.get("periodoLegislativo") == periodo_legislativo,
                "slug": slugs.get(id_legislador),
            },
        })
    return filas


def filas_expedientes(id_legislador, respuesta, inicio, fin, slug, notas):
    """Registros de expedientes.json de un legislador: los expedientes de los que figura como autor
    (legislador/{id}/expedientes) con fecha de ingreso dentro del período, con los valores oficiales sin cambios."""
    filas = []
    for legislador in respuesta or []:
        for proyecto in legislador.get("proyectos") or []:
            iso, problema = a_iso(proyecto.get("fechaIngresoExpediente"))
            if iso is None:
                notas.agregar("fecha_ingreso_invalida", "expediente", proyecto.get("idProyecto"),
                              f"Del legislador {id_legislador}: la fecha de ingreso no es válida "
                              f"({problema or 'vacía'}); el expediente queda fuera de expedientes.json.",
                              ruta="fechaIngresoExpediente", valor_original=proyecto.get("fechaIngresoExpediente"))
                continue
            if not inicio <= iso <= fin:
                continue
            filas.append({"idLegislador": id_legislador, **proyecto, PROPIO: {"fechaIngreso": iso, "slug": slug}})
    return filas


# Campos oficiales de cada comisión que se guardan en comisiones.json: sin los textos largos de
# información y competencia (cambian con el tiempo y no se usan) ni la lista de miembros.
CAMPOS_COMISION = ("idComision", "nombreComision", "numeroComision", "tipoComision", "camaraComision",
                   "esComisionActiva", "appURL")
# De cada miembro, solo su identificación: el resto de sus datos ya está en legisladores.json.
CAMPOS_MIEMBRO = ("idLegislador", "apellidos", "nombres")


def filas_comisiones(comision, periodo_parlamentario, respuesta, slugs):
    """Registros de comisiones.json de una comisión en un período parlamentario: uno por miembro
    (comision/{id}/miembros/{período}), en el orden que publica la API, con los valores oficiales sin cambios."""
    filas = []
    for detalle in respuesta or []:
        for orden, miembro in enumerate(detalle.get("miembros") or [], 1):
            filas.append({
                **{c: comision.get(c) for c in CAMPOS_COMISION},
                "idPeriodoParlamentario": periodo_parlamentario["idPeriodoParlamentario"],
                **{c: miembro.get(c) for c in CAMPOS_MIEMBRO},
                PROPIO: {"periodoParlamentario": periodo_parlamentario["periodoParlamentario"], "orden": orden,
                         "slug": slugs.get(miembro.get("idLegislador"))},
            })
    return filas


def fila_proyecto_reciente(proyecto, tramitaciones, fecha_ingreso):
    """Registro de proyectos-recientes.json: los campos oficiales del proyecto, sus autores sin datos de
    contacto y sus ministerios, tal como los publica la API."""
    detalle = (tramitaciones or [{}])[0]
    autores = [{c: a.get(c) for c in CAMPOS_MIEMBRO} for a in detalle.get("autores") or []]
    return {
        **proyecto,
        "autores": autores,
        "ministerios": detalle.get("ministerios") or [],
        PROPIO: {"fechaIngreso": fecha_ingreso,
                 "autores": ", ".join(f"{a.get('nombres') or ''} {a.get('apellidos') or ''}".strip() for a in autores)},
    }


def verificar_numeros_ley(leyes_periodo, historico, inicio, fin, notas):
    """Comprueba que los números de ley del período no se repiten en otras legislaturas.

    `historico` es el listado completo /ley. Una ley del histórico con el mismo número
    pero sancionada fuera de [inicio, fin] es un conflicto: el número no serviría como
    identificador estable de la URL. También informa leyes del histórico sancionadas
    dentro del período que no aparecen en ley/periodo.
    """
    ids_periodo = {l["idLey"] for l in leyes_periodo}
    numeros_periodo = {numero_ley(l.get("numeroLey")) for l in leyes_periodo}
    por_numero = defaultdict(list)
    for ley in historico:
        por_numero[numero_ley(ley.get("numeroLey"))].append(ley)

    conflictos = []
    for numero in sorted(numeros_periodo, key=lambda n: (len(n), n)):
        if numero not in por_numero:
            notas.agregar("numero_ley_ausente_en_historico", "ley", numero,
                          "El número de ley no figura en el listado histórico /ley.")
        for otra in por_numero.get(numero, []):
            if otra["idLey"] in ids_periodo:
                continue
            iso, _ = a_iso(otra.get("fechaSancion"))
            if iso is None or not inicio <= iso <= fin:
                conflictos.append({"numeroLey": numero, "idLey": otra["idLey"], "fechaSancion": otra.get("fechaSancion")})
                notas.agregar("numero_ley_repetido_en_otro_periodo", "ley", otra["idLey"],
                              f"La ley {numero} también figura con sanción fuera del período.",
                              valor_original=otra.get("fechaSancion"))

    faltantes = []
    for ley in historico:
        iso, _ = a_iso(ley.get("fechaSancion"))
        if iso and inicio <= iso <= fin and ley["idLey"] not in ids_periodo:
            faltantes.append(ley["idLey"])
            notas.agregar("ley_del_periodo_fuera_de_listado", "ley", ley["idLey"],
                          "Sancionada dentro del período según /ley, pero no aparece en ley/periodo.",
                          valor_original=ley.get("fechaSancion"))

    return {
        "registrosHistorico": len(historico),
        "numerosDelPeriodo": len(numeros_periodo),
        "conflictos": len(conflictos),
        "leyesDelPeriodoFueraDeListado": len(faltantes),
    }
