"""Importa un período legislativo desde la API del Congreso a datos/.

Uso (desde la raíz del repositorio):
    python -m importador                     # período vigente según datos/periodos.json
    python -m importador --periodo 2023-2028
    python -m importador --sin-red           # repite la importación con los crudos guardados
    python -m importador --modo incremental  # sincronización diaria: solo lo nuevo
    python -m importador --actualizar-expedientes  # vuelve a descargar los expedientes de cada legislador

La descarga completa hace unas 1.500 consultas y tarda unos 50 minutos. La incremental
reutiliza las respuestas guardadas de lo que no cambia y hace unas 20 consultas.
Los expedientes de cada legislador (una consulta por legislador) se descargan solo con
--actualizar-expedientes o si no hay copia guardada; si no, se reutiliza la guardada.
"""

import argparse
import json
import sys
import time
import traceback
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from . import abiertos, fotos, temas
from .api import BASE, Cliente, ErrorAPI, ListadoCambiado
from .escribir import csv_bytes, escribir_si_cambia, json_bytes, leer_json
from .fechas import a_iso
from .personas import asignar
from .transformar import (
    COLUMNAS_VOTOS,
    PROPIO,
    Notas,
    filas_autores,
    fila_proyecto_reciente,
    filas_comisiones,
    filas_expedientes,
    filas_tramitaciones,
    numero_ley,
    periodo_parlamentario_de_votacion,
    transformar_legislador,
    transformar_ley,
    transformar_votacion,
    verificar_numeros_ley,
)

RAIZ = Path(__file__).resolve().parents[1]
FUENTE = {
    "nombre": "Datos Abiertos Poder Legislativo",
    "url": BASE,
    "licencia": "CC BY 4.0",
    "cita": "Origen de los datos: Datos Abiertos Poder Legislativo",
}
# Si alguna cantidad baja más que esto respecto de la importación anterior, se asume que la
# API devolvió datos incompletos y no se escribe nada.
DISMINUCION_MAXIMA = 0.05
# Tipo de proyecto de las votaciones cuyos autores se guardan aunque el proyecto no sea ley.
PROYECTO_DE_LEY = "PROYECTO DE LEY"
PARLAMENTARIA = "PARLAMENTARIA"
# Ejecuciones que se conservan en datos/sincronizaciones.json (las anteriores quedan en el historial de Git).
REGISTROS_MAXIMOS = 90


class DatosIncompletos(ErrorAPI):
    """La API respondió, pero con muchos menos registros que la vez anterior."""


DIAS_PROYECTOS_RECIENTES = 90  # ventana de proyectos-recientes.json; no se cuenta en la protección de cantidades


def elegir_periodo(periodos, id_periodo):
    if id_periodo:
        elegidos = [p for p in periodos if p["id"] == id_periodo]
    else:
        elegidos = [p for p in periodos if p.get("vigente")]
    if len(elegidos) != 1:
        raise ValueError(f"No se encontró un único período {'«' + id_periodo + '»' if id_periodo else 'vigente'} en periodos.json")
    return elegidos[0]


def actualizar_periodos_parlamentarios(periodo, cliente, avisos):
    """Completa la lista de períodos parlamentarios anuales con los que informa la API."""
    del_api = [p for p in cliente.datos("periodo") if p.get("periodoLegislativo") == periodo["id"]]
    if not del_api:
        raise ErrorAPI(f"La API no devolvió períodos parlamentarios para {periodo['id']}")
    conocidos = {p["idPeriodoParlamentario"] for p in periodo["periodosParlamentarios"]}
    for p in del_api:
        if p["idPeriodoParlamentario"] not in conocidos:
            periodo["periodosParlamentarios"].append({
                "idPeriodoParlamentario": p["idPeriodoParlamentario"],
                "periodoParlamentario": p["periodoParlamentario"],
                "fechaInicio": a_iso(p.get("fechaInicio"))[0],
                "fechaFin": a_iso(p.get("fechaTermino"))[0],
            })
            avisos.append(f"Nuevo período parlamentario agregado a periodos.json: {p['periodoParlamentario']}")
    ids_api = {p["idPeriodoParlamentario"] for p in del_api}
    for id_parl in sorted(conocidos - ids_api):
        avisos.append(f"El período parlamentario {id_parl} de periodos.json ya no figura en la API")
    periodo["periodosParlamentarios"].sort(key=lambda p: p["idPeriodoParlamentario"])
    return [p["idPeriodoParlamentario"] for p in periodo["periodosParlamentarios"]]


def clave_nota(n):
    return (n.get("periodoLegislativo") or "", n["entidad"], n["tipo"], str(n["id"]).zfill(12),
            n.get("ruta") or "", n["detalle"])


def verificar_cantidades(anteriores, cantidades, permitir_disminucion):
    """Lanza DatosIncompletos si alguna cantidad cayó más de DISMINUCION_MAXIMA. Devuelve las bajas."""
    bajas = [f"{clave}: {anteriores[clave]} → {valor}" for clave, valor in cantidades.items()
             if anteriores.get(clave) and valor < anteriores[clave] * (1 - DISMINUCION_MAXIMA)]
    if bajas and not permitir_disminucion:
        raise DatosIncompletos(
            f"Muchos menos registros que en la importación anterior ({'; '.join(bajas)}). "
            "Si la baja es real, repetir con --permitir-disminucion.")
    return bajas


def comparar(anteriores, nuevos, clave):
    """Identificadores agregados, modificados y eliminados entre dos listas de registros."""
    def canonico(registro):
        return json.dumps(registro, ensure_ascii=False, sort_keys=True)
    previos = {r[clave]: canonico(r) for r in anteriores or []}
    actuales = {r[clave]: canonico(r) for r in nuevos}
    return {
        "agregados": sorted(set(actuales) - set(previos)),
        "modificados": sorted(k for k in set(actuales) & set(previos) if actuales[k] != previos[k]),
        "eliminados": sorted(set(previos) - set(actuales)),
    }


def registrar(salida, entrada):
    """Agrega una ejecución al principio de datos/sincronizaciones.json."""
    ruta = Path(salida) / "sincronizaciones.json"
    anteriores = (leer_json(ruta) or {"sincronizaciones": []})["sincronizaciones"]
    escribir_si_cambia(ruta, json_bytes({"sincronizaciones": ([entrada] + anteriores)[:REGISTROS_MAXIMOS]}))


def importar(cliente, salida, id_periodo=None, ahora=None, progreso=print, permitir_disminucion=False,
             actualizar_expedientes=False):
    salida = Path(salida)
    ahora = ahora or datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    avisos = []
    notas = Notas()

    documento_periodos = leer_json(salida / "periodos.json")
    if documento_periodos is None:
        raise ValueError(f"No existe {salida / 'periodos.json'}")
    periodo = elegir_periodo(documento_periodos["periodos"], id_periodo)
    nombre = periodo["id"]
    inicio, fin = periodo["fechaInicio"], periodo["fechaFin"]
    progreso(f"Período legislativo {nombre} ({inicio} a {fin})")

    ids_parlamentarios = actualizar_periodos_parlamentarios(periodo, cliente, avisos)

    # --- Leyes del período --------------------------------------------------
    leyes_api = []
    vistas = set()
    for id_parl in ids_parlamentarios:
        for ley in cliente.datos(f"ley/periodo/{id_parl}"):
            if ley["idLey"] in vistas:
                avisos.append(f"La ley {ley['idLey']} figura en más de un período parlamentario")
                continue
            vistas.add(ley["idLey"])
            leyes_api.append((ley, id_parl))
    progreso(f"Leyes del período: {len(leyes_api)}")
    if not leyes_api:
        raise ErrorAPI("La API no devolvió ninguna ley del período")

    historico = list(cliente.paginar("ley", 500))
    progreso(f"Listado histórico de leyes: {len(historico)}")
    verificacion_numeros = verificar_numeros_ley([l for l, _ in leyes_api], historico, inicio, fin, notas)

    # --- Detalle de cada proyecto con ley ------------------------------------
    proyectos = sorted({l["proyecto"]["idProyecto"] for l, _ in leyes_api})
    detalle = {}
    for i, id_proyecto in enumerate(proyectos, 1):
        tramitaciones = cliente.datos(f"proyecto/{id_proyecto}/tramitaciones", reutilizable=True)
        adjuntos = cliente.datos(f"proyecto/{id_proyecto}/adjuntos", reutilizable=True)
        detalle[id_proyecto] = (tramitaciones[0] if tramitaciones else None, adjuntos[0] if adjuntos else None)
        if i % 100 == 0 or i == len(proyectos):
            progreso(f"  detalle de proyectos: {i}/{len(proyectos)}")

    # --- Legisladores ---------------------------------------------------------
    por_id = {}
    for legislador in cliente.datos("legislador", {"idCamara": "A"}):
        if legislador.get("periodoLegislativo") == nombre:
            por_id[legislador["idLegislador"]] = (legislador, "legislador?idCamara=A")
    ids_vigentes = set()
    if periodo.get("vigente"):
        for camara in ("S", "D"):
            for legislador in cliente.datos(f"legislador/camara/{camara}"):
                ids_vigentes.add(legislador["idLegislador"])
                if legislador["idLegislador"] not in por_id:
                    por_id[legislador["idLegislador"]] = (legislador, f"legislador/camara/{camara}")
                    avisos.append(f"Legislador vigente {legislador['idLegislador']} ausente del listado histórico")
    progreso(f"Legisladores del período: {len(por_id)} ({len(ids_vigentes)} vigentes)")

    # --- Votaciones (se procesan página por página) -----------------------------
    ids_parlamentarios_set = set(ids_parlamentarios)
    proyectos_con_ley = set(proyectos)
    votaciones, filas_votos, embebidos = [], [], {}
    fuera_del_periodo = defaultdict(list)
    total_votaciones_api = 0
    for votacion in cliente.paginar("votacion", 100, reutilizable=True, clave="idVotacion"):
        total_votaciones_api += 1
        if periodo_parlamentario_de_votacion(votacion) in ids_parlamentarios_set:
            registro, filas, legisladores = transformar_votacion(votacion, nombre, notas)
            votaciones.append(registro)
            filas_votos.extend(filas)
            for id_legislador, legislador in legisladores.items():
                embebidos.setdefault(id_legislador, legislador)
        else:
            id_proyecto = (votacion.get("proyecto") or {}).get("idProyecto")
            if id_proyecto in proyectos_con_ley:
                fuera_del_periodo[id_proyecto].append(votacion["idVotacion"])
    progreso(f"Votaciones: {len(votaciones)} del período, de {total_votaciones_api} en la API")
    if not votaciones:
        raise ErrorAPI("La API no devolvió ninguna votación del período")

    # --- Autores de los proyectos de ley votados que no llegaron a ser ley ---------------
    # Solo se guardan sus autores (autores.json); tramitaciones.json sigue siendo de los proyectos con ley.
    de_ley = [v["proyecto"] for v in votaciones if (v.get("proyecto") or {}).get("tipoProyecto") == PROYECTO_DE_LEY]
    proyectos_sin_ley = sorted({p["idProyecto"] for p in de_ley if p["idProyecto"] not in proyectos_con_ley})
    # Los que deberían tener autores legisladores; si la API no los publica, queda una nota.
    parlamentarios_votados = {p["idProyecto"] for p in de_ley if p.get("iniciativa") == PARLAMENTARIA}
    for i, id_proyecto in enumerate(proyectos_sin_ley, 1):
        tramitaciones = cliente.datos(f"proyecto/{id_proyecto}/tramitaciones", reutilizable=True)
        detalle[id_proyecto] = (tramitaciones[0] if tramitaciones else None, None)
        if i % 100 == 0 or i == len(proyectos_sin_ley):
            progreso(f"  autores de proyectos de ley sin ley: {i}/{len(proyectos_sin_ley)}")

    for id_legislador in sorted(set(embebidos) - set(por_id)):
        por_id[id_legislador] = (embebidos[id_legislador], "votacion")
        notas.agregar("legislador_solo_en_votaciones", "legislador", id_legislador,
                      "Vota en el período pero no figura en los listados de legisladores; "
                      "sus datos se toman del registro incluido en la votación.")

    # --- Personas y legisladores -----------------------------------------------
    ruta_personas = salida / "propios" / "personas.json"
    personas, slugs, slugs_nuevos = asignar(
        (leer_json(ruta_personas) or {"personas": []})["personas"],
        [l for l, _ in por_id.values()], nombre)
    legisladores = [
        transformar_legislador(l, id_legislador in ids_vigentes, slugs[id_legislador], fuente)
        for id_legislador, (l, fuente) in sorted(por_id.items())
    ]

    # --- Leyes y enlace con las votaciones -----------------------------------------
    votaciones.sort(key=lambda v: v["idVotacion"])
    votaciones_por_proyecto = defaultdict(list)
    for v in votaciones:
        id_proyecto = (v.get("proyecto") or {}).get("idProyecto")
        votaciones_por_proyecto[id_proyecto].append(v)

    leyes = []
    leyes_por_votacion = defaultdict(set)
    no_resueltas = set()
    for ley, id_parl in sorted(leyes_api, key=lambda x: x[0]["idLey"]):
        id_proyecto = ley["proyecto"]["idProyecto"]
        tramitaciones, adjuntos = detalle[id_proyecto]
        registro = transformar_ley(ley, nombre, id_parl, tramitaciones, adjuntos, notas)
        ids_tramitacion = {t["idTramitacion"] for t in (tramitaciones or {}).get("tramitaciones") or []}
        resueltas, sin_resolver = [], []
        for v in votaciones_por_proyecto.get(id_proyecto, []):
            id_tramitacion = (v.get("tramitacion") or {}).get("idTramitacion")
            if id_tramitacion in ids_tramitacion:
                resueltas.append(v["idVotacion"])
                leyes_por_votacion[v["idVotacion"]].add(ley["idLey"])
            else:
                sin_resolver.append(v["idVotacion"])
                no_resueltas.add(v["idVotacion"])
                notas.agregar("enlace_no_resuelto", "votacion", v["idVotacion"],
                              f"Es del proyecto {id_proyecto} (ley {numero_ley(ley.get('numeroLey'))}), pero su trámite "
                              f"{id_tramitacion} no figura entre las tramitaciones publicadas del proyecto.")
        registro[PROPIO].update({
            "idVotaciones": sorted(resueltas),
            "idVotacionesNoResueltas": sorted(sin_resolver),
            "idVotacionesOtrosPeriodos": sorted(fuera_del_periodo.get(id_proyecto, [])),
        })
        leyes.append(registro)

    for v in votaciones:
        id_leyes = sorted(leyes_por_votacion.get(v["idVotacion"], ()))
        if id_leyes:
            estado_enlace = "resuelto"
        elif v["idVotacion"] in no_resueltas:
            estado_enlace = "no_resuelto"
        else:
            estado_enlace = "sin_ley"
        v[PROPIO].update({"idLeyes": id_leyes, "enlaceLey": estado_enlace})

    # --- Tramitaciones y autores de cada proyecto ------------------------------------
    tramitaciones_salida, autores = [], []
    for id_proyecto in sorted(detalle):
        tramitaciones = detalle[id_proyecto][0]
        if tramitaciones:
            if id_proyecto in proyectos_con_ley:
                tramitaciones_salida.extend(filas_tramitaciones(id_proyecto, tramitaciones.get("tramitaciones"), notas))
            autores.extend(filas_autores(id_proyecto, tramitaciones.get("autores"), nombre, slugs))
        if id_proyecto in parlamentarios_votados and not (tramitaciones or {}).get("autores"):
            notas.agregar("proyecto_sin_autores", "proyecto", id_proyecto,
                          "La API no publica los autores de este proyecto de ley de iniciativa parlamentaria"
                          + (" (no devolvió sus tramitaciones)." if tramitaciones is None else "."))

    # --- Expedientes de los que cada legislador figura como autor (#27) ----------------------
    expedientes = []
    for i, id_legislador in enumerate(sorted(por_id), 1):
        respuesta = cliente.datos(f"legislador/{id_legislador}/expedientes", guardada=not actualizar_expedientes)
        expedientes.extend(filas_expedientes(id_legislador, respuesta, inicio, fin, slugs.get(id_legislador), notas))
        if i % 20 == 0 or i == len(por_id):
            progreso(f"  expedientes de legisladores: {i}/{len(por_id)}")
    expedientes.sort(key=lambda e: (e["idLegislador"], e["idProyecto"]))

    # --- Miembros de cada comisión por período parlamentario (#30) ----------------------------
    # Los períodos parlamentarios ya terminados no cambian: se reutiliza la copia guardada. Los demás
    # se reutilizan en la incremental y se descargan de nuevo en la completa.
    comisiones = []
    hoy = ahora[:10]
    for camara in ("S", "D"):
        listado = cliente.datos("comision", {"idCamara": camara})
        if not listado:
            raise ErrorAPI(f"La API no devolvió las comisiones de la cámara {camara}")
        for comision in listado:
            for parlamentario in periodo["periodosParlamentarios"]:
                terminado = bool(parlamentario.get("fechaFin")) and parlamentario["fechaFin"] < hoy
                respuesta = cliente.datos(f"comision/{comision['idComision']}/miembros/{parlamentario['idPeriodoParlamentario']}",
                                          reutilizable=not terminado, guardada=terminado)
                comisiones.extend(filas_comisiones(comision, parlamentario, respuesta, slugs))
        progreso(f"  comisiones de la cámara {camara}: {len(listado)}")
    comisiones.sort(key=lambda c: (c["idPeriodoParlamentario"], c["idComision"], c[PROPIO]["orden"]))

    # --- Proyectos de ley ingresados hace poco, de cualquier iniciativa, para los avisos del bot (#66) ---
    # El listado va del más nuevo al más viejo por identificador, con fechas desordenadas (hay expedientes
    # nuevos con fecha vieja): se corta tras una serie larga de fechas viejas. Los autores de cada proyecto
    # se reutilizan de la copia guardada.
    hoy_fecha = date.fromisoformat(ahora[:10])
    desde_recientes = (hoy_fecha - timedelta(days=DIAS_PROYECTOS_RECIENTES)).isoformat()
    corte_recientes = (hoy_fecha - timedelta(days=DIAS_PROYECTOS_RECIENTES + 30)).isoformat()
    proyectos_recientes = []
    listado_con_datos = False
    viejos_seguidos = 0
    for proyecto in cliente.paginar("proyecto", 500):
        listado_con_datos = True
        fecha_ingreso = a_iso(proyecto.get("fechaIngresoExpediente"))[0]
        viejos_seguidos = viejos_seguidos + 1 if fecha_ingreso and fecha_ingreso < corte_recientes else 0
        if viejos_seguidos >= 200:
            break
        if (proyecto.get("tipoProyecto") != "PROYECTO DE LEY" or not fecha_ingreso
                or fecha_ingreso < max(desde_recientes, inicio)):
            continue
        tramitaciones = cliente.datos(f"proyecto/{proyecto['idProyecto']}/tramitaciones", guardada=True)
        proyectos_recientes.append(fila_proyecto_reciente(proyecto, tramitaciones, fecha_ingreso))
    if not listado_con_datos:
        raise ErrorAPI("La API no devolvió el listado de proyectos")
    proyectos_recientes.sort(key=lambda p: p["idProyecto"])
    progreso(f"Proyectos de ley de los últimos {DIAS_PROYECTOS_RECIENTES} días: {len(proyectos_recientes)}")

    # --- Notas: se reemplazan las del importador para este período y se conservan las demás
    ruta_notas = salida / "propios" / "notas.json"
    anteriores = (leer_json(ruta_notas) or {"notas": []})["notas"]
    conservadas = [n for n in anteriores if not (n.get("origen") == "importador" and n.get("periodoLegislativo") == nombre)]
    nuevas = [dict(n, origen="importador", periodoLegislativo=nombre) for n in notas.lista]
    todas_las_notas = sorted(conservadas + nuevas, key=clave_nota)

    # --- Protección contra datos incompletos ---------------------------------------------
    cantidades = {
        "leyes": len(leyes),
        "numerosDeLey": len({l[PROPIO]["numeroLey"] for l in leyes}),
        "tramitaciones": len(tramitaciones_salida),
        "votaciones": len(votaciones),
        "votos": len(filas_votos),
        "legisladores": len(legisladores),
        "legisladoresVigentes": len(ids_vigentes),
        "autores": len(autores),
        "expedientes": len(expedientes),
        "comisiones": len(comisiones),
    }
    ruta_estado = salida / "estado.json"
    estado = leer_json(ruta_estado) or {}
    anteriores = estado.get("periodos", {}).get(nombre, {}).get("cantidades", {})
    for baja in verificar_cantidades(anteriores, cantidades, permitir_disminucion):
        avisos.append(f"Disminución aceptada con --permitir-disminucion: {baja}")

    # --- Escritura ---------------------------------------------------------------------
    filas_votos.sort(key=lambda f: (f["idVotacion"], f["idDetalleVotacion"] is None, f["idDetalleVotacion"] or 0))
    carpeta = salida / "fuente" / nombre
    cambios = {
        "leyes": comparar(leer_json(carpeta / "leyes.json"), leyes, "idLey"),
        "votaciones": comparar(leer_json(carpeta / "votaciones.json"), votaciones, "idVotacion"),
        "legisladores": comparar(leer_json(carpeta / "legisladores.json"), legisladores, "idLegislador"),
    }
    archivos = {
        carpeta / "leyes.json": json_bytes(leyes),
        carpeta / "tramitaciones.json": json_bytes(tramitaciones_salida),
        carpeta / "votaciones.json": json_bytes(votaciones),
        carpeta / "votos.csv": csv_bytes(COLUMNAS_VOTOS, filas_votos),
        carpeta / "legisladores.json": json_bytes(legisladores),
        carpeta / "autores.json": json_bytes(autores),
        carpeta / "expedientes.json": json_bytes(expedientes),
        carpeta / "comisiones.json": json_bytes(comisiones),
        carpeta / "proyectos-recientes.json": json_bytes(proyectos_recientes),
        ruta_personas: json_bytes({"personas": personas}),
        ruta_notas: json_bytes({"notas": todas_las_notas}),
        salida / "periodos.json": json_bytes(documento_periodos),
    }
    cambiados = [ruta for ruta, contenido in archivos.items() if escribir_si_cambia(ruta, contenido)]

    estado_periodo = estado.setdefault("periodos", {}).setdefault(nombre, {})
    # Sin red no se consultó la fuente: no cuenta como comprobación.
    if not getattr(cliente, "sin_red", False) or "ultimaComprobacion" not in estado_periodo:
        estado_periodo["ultimaComprobacion"] = ahora
    if cambiados or "ultimaModificacion" not in estado_periodo:
        estado_periodo["ultimaModificacion"] = ahora
    estado_periodo["cantidades"] = cantidades
    estado["ultimaComprobacion"] = max(p["ultimaComprobacion"] for p in estado["periodos"].values())
    estado["ultimaModificacion"] = max(p["ultimaModificacion"] for p in estado["periodos"].values())
    estado["fuente"] = FUENTE
    escribir_si_cambia(ruta_estado, json_bytes(estado))

    # Formatos derivados para descarga (CSV y diccionario), a partir de los JSON recién escritos.
    derivados, avisos_derivados = abiertos.generar(salida)
    cambiados += derivados
    avisos += avisos_derivados

    # Clasificación temática propia de los proyectos de ley (#36): los nuevos toman tema por las reglas.
    clasificados, avisos_temas = temas.clasificar(salida)
    cambiados += clasificados
    avisos += avisos_temas

    # Copia propia de las fotos oficiales. Sin red no se descargan.
    descargar = None if getattr(cliente, "sin_red", False) else getattr(cliente, "archivo", None)
    if descargar:
        fotos_cambiadas, avisos_fotos = fotos.sincronizar(
            legisladores, salida / "fotos" / nombre, descargar, completo=not getattr(cliente, "incremental", False))
        progreso(f"Fotos: {len(fotos_cambiadas)} nuevas, cambiadas o borradas")
        cambiados += fotos_cambiadas
        avisos += avisos_fotos

    cambiados = [str(r.relative_to(salida)).replace("\\", "/") for r in cambiados]
    por_id = {l["idLey"]: l for l in leyes}
    # Base para los avisos de "nueva ley sancionada" (Fase 3).
    leyes_nuevas = [{"idLey": i, "numeroLey": por_id[i][PROPIO]["numeroLey"],
                     "fechaSancion": por_id[i][PROPIO]["fechaSancion"]}
                    for i in cambios["leyes"]["agregados"]]
    # Sin red no se consultó la fuente: no es una sincronización.
    if not getattr(cliente, "sin_red", False):
        registrar(salida, {
            "fecha": ahora,
            "periodo": nombre,
            "modo": "incremental" if getattr(cliente, "incremental", False) else "completo",
            "expedientesActualizados": actualizar_expedientes,
            "resultado": "correcta",
            "consultas": cliente.consultas,
            "cantidades": cantidades,
            "cambios": {entidad: {k: len(ids) for k, ids in c.items()} for entidad, c in cambios.items()},
            "leyesNuevas": leyes_nuevas,
            "archivosModificados": cambiados,
        })

    return {
        "periodo": nombre,
        "cantidades": cantidades,
        "enlaces": {
            "leyesConVotacion": sum(1 for l in leyes if l[PROPIO]["idVotaciones"]),
            "votacionesEnlazadasALey": sum(1 for v in votaciones if v[PROPIO]["enlaceLey"] == "resuelto"),
            "votacionesNoResueltas": len(no_resueltas),
        },
        "verificacionNumeros": verificacion_numeros,
        "notasPorTipo": dict(sorted(notas.por_tipo().items())),
        "slugsNuevos": len(slugs_nuevos),
        "avisos": avisos,
        "cambios": cambios,
        "leyesNuevas": leyes_nuevas,
        "cambiados": cambiados,
        "consultas": cliente.consultas,
        "reutilizadas": getattr(cliente, "reutilizadas", 0),
    }


def imprimir_resumen(r, segundos):
    print("\n=== Resumen de la importación ===")
    print(f"Período: {r['periodo']}")
    for clave, valor in r["cantidades"].items():
        print(f"  {clave}: {valor}")
    print("Enlaces ley-votación:")
    for clave, valor in r["enlaces"].items():
        print(f"  {clave}: {valor}")
    v = r["verificacionNumeros"]
    print(f"Números de ley: {v['numerosDelPeriodo']} del período, comparados con {v['registrosHistorico']} "
          f"registros históricos; repetidos en otros períodos: {v['conflictos']}; "
          f"leyes del período fuera de ley/periodo: {v['leyesDelPeriodoFueraDeListado']}")
    print("Notas sobre la fuente (datos/propios/notas.json):" if r["notasPorTipo"] else "Notas sobre la fuente: ninguna")
    for tipo, n in r["notasPorTipo"].items():
        print(f"  {tipo}: {n}")
    print(f"Personas nuevas con slug: {r['slugsNuevos']}")
    print("Cambios respecto de la copia anterior:")
    for entidad, c in r["cambios"].items():
        print(f"  {entidad}: {len(c['agregados'])} agregados, {len(c['modificados'])} modificados, "
              f"{len(c['eliminados'])} eliminados")
    for ley in r["leyesNuevas"]:
        print(f"  ley nueva: {ley['numeroLey']} (idLey {ley['idLey']}, sanción {ley['fechaSancion']})")
    for aviso in r["avisos"]:
        print(f"AVISO: {aviso}")
    print("Archivos modificados:" if r["cambiados"] else "Archivos modificados: ninguno (la fuente no cambió)")
    for ruta in r["cambiados"]:
        print(f"  {ruta}")
    print(f"Consultas a la API: {r['consultas']} · respuestas guardadas reutilizadas: {r['reutilizadas']} "
          f"· duración: {segundos:.0f} s")


def main(argv=None):
    parser = argparse.ArgumentParser(prog="python -m importador", description=__doc__.splitlines()[0])
    parser.add_argument("--periodo", help="período legislativo de datos/periodos.json (por defecto, el vigente)")
    parser.add_argument("--modo", choices=("completo", "incremental"), default="completo",
                        help="completo: descarga todo; incremental: reutiliza las respuestas guardadas del detalle "
                             "de los proyectos ya conocidos y de las votaciones anteriores (por defecto, completo)")
    parser.add_argument("--permitir-disminucion", action="store_true",
                        help=f"aceptar que alguna cantidad baje más de un {DISMINUCION_MAXIMA:.0%} "
                             "respecto de la importación anterior")
    parser.add_argument("--actualizar-expedientes", action="store_true",
                        help="volver a descargar los expedientes de cada legislador (por defecto se reutiliza "
                             "la copia guardada, si existe)")
    parser.add_argument("--salida", default=RAIZ / "datos", type=Path, help="carpeta de datos (por defecto datos/)")
    parser.add_argument("--crudo", default=RAIZ / "tmp" / "importador" / "crudo", type=Path,
                        help="carpeta de respuestas crudas de la API (por defecto tmp/importador/crudo/)")
    parser.add_argument("--sin-red", action="store_true", help="no consultar la API: leer las respuestas de --crudo")
    args = parser.parse_args(argv)

    inicio = time.monotonic()
    cliente = Cliente(args.crudo, sin_red=args.sin_red, incremental=args.modo == "incremental")
    try:
        try:
            resultado = importar(cliente, args.salida, args.periodo, permitir_disminucion=args.permitir_disminucion,
                                 actualizar_expedientes=args.actualizar_expedientes)
        except ListadoCambiado as e:
            print(f"AVISO: {e}. Se repite la importación en modo completo.", file=sys.stderr)
            cliente.pasar_a_completo()
            resultado = importar(cliente, args.salida, args.periodo, permitir_disminucion=args.permitir_disminucion,
                                 actualizar_expedientes=args.actualizar_expedientes)
    except Exception as e:  # cualquier falla queda anotada en el registro de sincronizaciones
        if not isinstance(e, (ErrorAPI, ValueError)):
            traceback.print_exc()
        print(f"ERROR: {e}", file=sys.stderr)
        print("No se modificó ningún archivo de datos.", file=sys.stderr)
        if not args.sin_red:
            registrar(args.salida, {
                "fecha": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
                "periodo": args.periodo,
                "modo": "incremental" if cliente.incremental else "completo",
                "resultado": "error",
                "consultas": cliente.consultas,
                "error": f"{type(e).__name__}: {e}",
            })
            print("El error quedó anotado en datos/sincronizaciones.json.", file=sys.stderr)
        return 1
    imprimir_resumen(resultado, time.monotonic() - inicio)
    return 0
