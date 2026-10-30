"""Prueba de punta a punta del importador con una API simulada armada con ejemplos reales."""

import copy
import json
import tempfile
import unittest
from pathlib import Path

from importador.api import ErrorAPI
from importador.escribir import json_bytes
from importador.importar import DatosIncompletos, importar
from importador.pruebas.test_transformar import ejemplo

PERIODOS = {"periodos": [{"id": "2023-2028", "fechaInicio": "2023-07-01", "fechaFin": "2028-06-30",
                          "vigente": True, "periodosParlamentarios": []}]}


class ApiSimulada:
    def __init__(self, sin_leyes=False):
        self.consultas = 0
        ley = ejemplo("ley_periodo")
        votacion = ejemplo("votacion")
        tramitaciones = ejemplo("proyecto_tramitaciones")
        # La votación de ejemplo corresponde a este trámite del proyecto 150168.
        tramitaciones["tramitaciones"].append(copy.deepcopy(votacion["tramitacion"]))
        vigente = ejemplo("legislador_vigente")
        votantes = [v["legislador"] for v in votacion["votaciones"]]
        self.rutas = {
            "periodo": ejemplo("periodo"),
            "ley/periodo/100267": [] if sin_leyes else [ley],
            "proyecto/150168/tramitaciones": [tramitaciones],
            "proyecto/150168/adjuntos": [{"archivosAdjuntos": ejemplo("proyecto_adjuntos")}],
            "legislador?idCamara=A": [vigente] + votantes[:2],  # el tercer votante falta a propósito
            "legislador/camara/S": [vigente],
            "legislador/camara/D": votantes[:2],
            "ley": [ley],
            "votacion": [votacion],
            f"legislador/{vigente['idLegislador']}/expedientes": [ejemplo("legislador_expedientes")],
        }
        comision = ejemplo("comision_miembros")
        comision["miembros"][0]["idLegislador"] = vigente["idLegislador"]
        self.rutas["comision?idCamara=S"] = [{k: v for k, v in comision.items() if k != "miembros"}]
        self.rutas["comision?idCamara=D"] = [{**self.rutas["comision?idCamara=S"][0], "idComision": 32}]
        self.rutas["comision/5/miembros/100267"] = [comision]
        base = {"tipoProyecto": "PROYECTO DE LEY", "iniciativa": "PODER EJECUTIVO", "acapite": "Mensaje"}
        self.rutas["proyecto"] = [{**base, "idProyecto": 903, "fechaIngresoExpediente": "20/10/2026"},
                                  {**base, "idProyecto": 902, "fechaIngresoExpediente": "21/10/2026", "tipoProyecto": "PEDIDO DE INFORMES"},
                                  {**base, "idProyecto": 901, "fechaIngresoExpediente": "01/01/2026"},
                                  {**base, "idProyecto": 900, "fechaIngresoExpediente": "01/01/2020"}]
        self.rutas["proyecto/903/tramitaciones"] = [{"autores": [{"idLegislador": 1, "nombres": "Ana", "apellidos": "Paz", "emailParlamentario": "a@b.c"}],
                                                     "ministerios": ["MINISTERIO"]}]
        tramite = {"camaraTramite": "CAMARA DE SENADORES", "fechaTramite": "22/10/2026", "numeroSesion": "1"}
        self.rutas["proyecto"].insert(0, {**base, "idProyecto": 904, "fechaIngresoExpediente": "01/06/2024", "estadoProyecto": "EN TRAMITE"})
        self.rutas["proyecto/904/tramitaciones"] = [{"autores": [{"idLegislador": 1, "nombres": "Ana", "apellidos": "Paz", "emailParlamentario": "a@b.c"}], "tramitaciones": [
            {**tramite, "idTramitacion": 1, "descripcionSubEtapa": "Discusión Plenario", "resultadoTramite": "RECHAZADO"},
            {**tramite, "idTramitacion": 2, "descripcionSubEtapa": "Discusión Plenario (3T) - Modificaciones", "resultadoTramite": "APROBADAS LAS MODIFICACIONES"},
            {**tramite, "idTramitacion": 3, "descripcionSubEtapa": "Discusión Plenario", "resultadoTramite": "POSTERGADO"},
            {**tramite, "idTramitacion": 4, "descripcionSubEtapa": "Discusión Plenario", "resultadoTramite": "SE ENVÍA A COMISIÓN PARA NUEVO DICTAMEN: Salud"},
            {**tramite, "idTramitacion": 5, "descripcionSubEtapa": "Dictamen de Comisión", "resultadoTramite": "Presupuesto"}]}]
        self.guardadas = []

    def datos(self, ruta, params=None, reutilizable=False, guardada=False):
        if guardada:
            self.guardadas.append(ruta)
        if params:
            ruta += "?" + "&".join(f"{k}={v}" for k, v in params.items())
        return copy.deepcopy(self.rutas.get(ruta, []))

    def paginar(self, ruta, tam_pagina, reutilizable=False, clave=None):
        yield from self.datos(ruta)


def silencio(*_):
    pass


class Importar(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.salida = Path(self.tmp.name)
        (self.salida / "periodos.json").write_bytes(json_bytes(PERIODOS))

    def tearDown(self):
        self.tmp.cleanup()

    def correr(self, api=None, ahora="2026-10-22T12:00:00Z"):
        return importar(api or ApiSimulada(), self.salida, ahora=ahora, progreso=silencio)

    def leer(self, ruta):
        return json.loads((self.salida / ruta).read_text(encoding="utf-8"))

    def foto(self):
        return {p.relative_to(self.salida): p.read_bytes() for p in sorted(self.salida.rglob("*")) if p.is_file()}

    def test_segunda_ejecucion_no_cambia_nada_ni_duplica(self):
        self.correr()
        antes = self.foto()
        resultado = self.correr(ahora="2026-10-23T12:00:00Z")
        despues = self.foto()
        self.assertEqual(resultado["cambiados"], [])
        # Solo cambian la fecha de comprobación y el registro de sincronizaciones.
        meta = {Path("estado.json"), Path("sincronizaciones.json")}
        self.assertEqual({k: v for k, v in antes.items() if k not in meta},
                         {k: v for k, v in despues.items() if k not in meta})
        self.assertEqual(len(self.leer("fuente/2023-2028/leyes.json")), 1)
        estado = self.leer("estado.json")
        self.assertEqual(estado["ultimaComprobacion"], "2026-10-23T12:00:00Z")
        self.assertEqual(estado["ultimaModificacion"], "2026-10-22T12:00:00Z")
        registro = self.leer("sincronizaciones.json")["sincronizaciones"]
        self.assertEqual([r["fecha"] for r in registro], ["2026-10-23T12:00:00Z", "2026-10-22T12:00:00Z"])
        self.assertEqual(registro[0]["cambios"]["leyes"], {"agregados": 0, "modificados": 0, "eliminados": 0})
        self.assertEqual(registro[0]["leyesNuevas"], [])
        self.assertEqual(registro[0]["archivosModificados"], [])

    def test_registro_detecta_leyes_nuevas_y_modificadas(self):
        self.correr()
        api = ApiSimulada()
        nueva = copy.deepcopy(api.rutas["ley/periodo/100267"][0])
        nueva.update(idLey=999999, numeroLey="9999", fechaSancion="20/10/2026")
        api.rutas["ley/periodo/100267"].append(nueva)
        api.rutas["ley/periodo/100267"][0]["observacionDecreto"] = "Corregido por la fuente"
        resultado = self.correr(api, ahora="2026-10-23T12:00:00Z")
        self.assertEqual(resultado["cambios"]["leyes"], {"agregados": [999999], "modificados": [146644], "eliminados": []})
        ultima = self.leer("sincronizaciones.json")["sincronizaciones"][0]
        self.assertEqual(ultima["resultado"], "correcta")
        self.assertEqual(ultima["leyesNuevas"], [{"idLey": 999999, "numeroLey": "9999", "fechaSancion": "2026-10-20"}])
        self.assertIn("fuente/2023-2028/leyes.json", ultima["archivosModificados"])

    def test_muchos_menos_registros_no_escribe_nada(self):
        self.correr()
        estado = self.leer("estado.json")
        estado["periodos"]["2023-2028"]["cantidades"]["votos"] = 1000  # la vez anterior había muchos más
        (self.salida / "estado.json").write_bytes(json_bytes(estado))
        antes = self.foto()
        with self.assertRaises(DatosIncompletos):
            self.correr(ahora="2026-10-23T12:00:00Z")
        self.assertEqual(self.foto(), antes)

    def test_permitir_disminucion(self):
        self.correr()
        estado = self.leer("estado.json")
        estado["periodos"]["2023-2028"]["cantidades"]["votos"] = 1000
        (self.salida / "estado.json").write_bytes(json_bytes(estado))
        resultado = importar(ApiSimulada(), self.salida, ahora="2026-10-23T12:00:00Z", progreso=silencio,
                             permitir_disminucion=True)
        self.assertTrue(any("votos: 1000 → 3" in a for a in resultado["avisos"]))
        self.assertEqual(self.leer("estado.json")["periodos"]["2023-2028"]["cantidades"]["votos"], 3)

    def test_archivos_y_enlaces(self):
        resultado = self.correr()
        carpeta = "fuente/2023-2028/"
        for tabla in ("leyes", "tramitaciones", "votaciones", "legisladores", "autores", "expedientes",
                      "comisiones"):
            for extension in (".json", ".csv"):
                self.assertTrue((self.salida / carpeta / (tabla + extension)).exists(), tabla + extension)
        self.assertTrue((self.salida / carpeta / "votos.csv").exists())
        self.assertTrue((self.salida / "diccionario.md").exists())
        self.assertIn("fuente/2023-2028/leyes.csv", resultado["cambiados"])
        self.assertFalse([a for a in resultado["avisos"] if "sin describir" in a])
        ley = self.leer(carpeta + "leyes.json")[0]
        votacion = self.leer(carpeta + "votaciones.json")[0]
        self.assertEqual(ley["_propio"]["idVotaciones"], [108906])
        self.assertEqual(votacion["_propio"]["idLeyes"], [146644])
        self.assertEqual(votacion["_propio"]["enlaceLey"], "resuelto")
        self.assertEqual(resultado["cantidades"]["votos"], 3)
        expedientes = self.leer(carpeta + "expedientes.json")
        self.assertEqual([(e["idProyecto"], e["_propio"]["fechaIngreso"]) for e in expedientes], [(128408, "2023-07-13")])
        self.assertEqual(resultado["cantidades"]["expedientes"], 1)
        comisiones = self.leer(carpeta + "comisiones.json")
        self.assertEqual([(c["idComision"], c["idPeriodoParlamentario"], c["_propio"]["orden"], c["_propio"]["slug"] is not None)
                          for c in comisiones], [(5, 100267, 1, True), (5, 100267, 2, False)])
        self.assertNotIn("emailParlamentario", comisiones[0])
        self.assertEqual(resultado["cantidades"]["comisiones"], 2)

    def test_proyectos_recientes_de_cualquier_iniciativa(self):
        self.correr()
        proyectos = self.leer("fuente/2023-2028/proyectos-recientes.json")
        self.assertEqual([p["idProyecto"] for p in proyectos], [903])
        self.assertEqual(proyectos[0]["iniciativa"], "PODER EJECUTIVO")
        self.assertEqual(proyectos[0]["_propio"]["autores"], "Ana Paz")
        self.assertEqual(proyectos[0]["ministerios"], ["MINISTERIO"])
        self.assertNotIn("emailParlamentario", proyectos[0]["autores"][0])

    def test_decisiones_del_plenario(self):
        self.correr()
        documento = self.leer("fuente/2023-2028/decisiones-plenario.json")
        self.assertEqual(documento["seguidos"], [904])
        self.assertEqual([d["tramitacion"]["idTramitacion"] for d in documento["decisiones"]], [1, 2])
        self.assertEqual(documento["decisiones"][0]["tramitacion"]["_propio"]["fechaTramite"], "2026-10-22")
        self.assertNotIn("emailParlamentario", documento["decisiones"][0]["autores"][0])

    def test_proyecto_que_deja_de_estar_en_tramite_se_consulta_una_vez_mas(self):
        api = ApiSimulada()
        self.correr(api)
        fila = next(p for p in api.rutas["proyecto"] if p["idProyecto"] == 904)
        fila["estadoProyecto"] = "ARCHIVADO"
        api.rutas["proyecto/904/tramitaciones"][0]["tramitaciones"].append(
            {"idTramitacion": 6, "camaraTramite": "CAMARA DE SENADORES", "fechaTramite": "23/10/2026",
             "descripcionSubEtapa": "Discusión Plenario", "resultadoTramite": "RECHAZADO"})
        self.correr(api)
        documento = self.leer("fuente/2023-2028/decisiones-plenario.json")
        self.assertEqual(documento["seguidos"], [])
        self.assertEqual([d["tramitacion"]["idTramitacion"] for d in documento["decisiones"]], [1, 2, 6])

    def test_comisiones_de_periodos_terminados_guardadas(self):
        api = ApiSimulada()
        self.correr(api, ahora="2027-08-01T12:00:00Z")
        self.assertIn("comision/5/miembros/100267", api.guardadas)

    def test_sin_comisiones_es_un_error(self):
        api = ApiSimulada()
        del api.rutas["comision?idCamara=D"]
        with self.assertRaises(ErrorAPI):
            self.correr(api)

    def test_expedientes_guardados_salvo_que_se_pida_actualizar(self):
        api = ApiSimulada()
        self.correr(api)
        self.assertEqual(len([r for r in api.guardadas if r.endswith("/expedientes")]), 4)  # una consulta por legislador
        api = ApiSimulada()
        importar(api, self.salida, ahora="2026-10-23T12:00:00Z", progreso=silencio, actualizar_expedientes=True)
        self.assertFalse([r for r in api.guardadas if r.endswith("/expedientes")])
        self.assertTrue(self.leer("sincronizaciones.json")["sincronizaciones"][0]["expedientesActualizados"])

    def test_autores_de_proyectos_de_ley_sin_ley(self):
        api = ApiSimulada()
        votacion = api.rutas["votacion"][0]
        sin_ley = copy.deepcopy(votacion)
        sin_ley["idVotacion"] += 1
        sin_ley["proyecto"].update(idProyecto=777, iniciativa="PARLAMENTARIA")
        resolucion = copy.deepcopy(sin_ley)
        resolucion["idVotacion"] += 1
        resolucion["proyecto"].update(idProyecto=778, tipoProyecto="RESOLUCIONES UNICAMERALES")
        sin_autores = copy.deepcopy(sin_ley)
        sin_autores["idVotacion"] += 2
        sin_autores["proyecto"]["idProyecto"] = 779
        api.rutas["votacion"] += [sin_ley, resolucion, sin_autores]
        autor = {"idLegislador": votacion["votaciones"][0]["legislador"]["idLegislador"],
                 "periodoLegislativo": "2023-2028", "emailParlamentario": "copia@congreso.gov.py"}
        api.rutas["proyecto/777/tramitaciones"] = [{"autores": [autor], "tramitaciones": [votacion["tramitacion"]]}]
        api.rutas["proyecto/778/tramitaciones"] = [{"autores": [autor], "tramitaciones": []}]
        self.correr(api)
        carpeta = "fuente/2023-2028/"
        autores = [a for a in self.leer(carpeta + "autores.json") if a["idProyecto"] == 777]
        self.assertEqual([a["legislador"]["idLegislador"] for a in autores], [autor["idLegislador"]])
        self.assertTrue(autores[0]["_propio"]["delPeriodo"])
        self.assertNotIn("emailParlamentario", autores[0]["legislador"])
        # Solo proyectos de ley; las tramitaciones siguen siendo solo de los proyectos con ley.
        self.assertFalse([a for a in self.leer(carpeta + "autores.json") if a["idProyecto"] == 778])
        self.assertEqual({t["idProyecto"] for t in self.leer(carpeta + "tramitaciones.json")}, {150168})
        # Proyecto de ley de iniciativa parlamentaria sin autores publicados: queda anotado.
        notas = [n for n in self.leer("propios/notas.json")["notas"] if n["tipo"] == "proyecto_sin_autores"]
        self.assertEqual([(n["entidad"], n["id"]) for n in notas], [("proyecto", 779)])

    def test_periodos_parlamentarios_se_completan_desde_la_api(self):
        resultado = self.correr()
        periodo = self.leer("periodos.json")["periodos"][0]
        self.assertEqual([p["idPeriodoParlamentario"] for p in periodo["periodosParlamentarios"]],
                         [100237, 100257, 100267])
        self.assertEqual(periodo["periodosParlamentarios"][-1]["fechaInicio"], "2026-07-01")
        self.assertEqual(len(resultado["avisos"]), 3)

    def test_votante_ausente_de_los_listados_se_incluye_y_se_anota(self):
        self.correr()
        legisladores = self.leer("fuente/2023-2028/legisladores.json")
        self.assertEqual(len(legisladores), 4)
        solo_votacion = [l for l in legisladores if l["_propio"]["fuenteRegistro"] == "votacion"]
        self.assertEqual(len(solo_votacion), 1)
        tipos = [n["tipo"] for n in self.leer("propios/notas.json")["notas"]]
        self.assertIn("legislador_solo_en_votaciones", tipos)

    def test_notas_manuales_y_slugs_existentes_se_conservan(self):
        manual = {"tipo": "aclaracion", "entidad": "ley", "id": 1, "detalle": "Nota escrita a mano.", "origen": "manual"}
        persona = {"slug": "mario-abdo", "nombre": "Mario Abdo",
                   "legisladores": [{"periodoLegislativo": "2023-2028", "idLegislador": 101534}]}
        (self.salida / "propios").mkdir()
        (self.salida / "propios" / "notas.json").write_bytes(json_bytes({"notas": [manual]}))
        (self.salida / "propios" / "personas.json").write_bytes(json_bytes({"personas": [persona]}))
        self.correr()
        self.correr()
        self.assertIn(manual, self.leer("propios/notas.json")["notas"])
        personas = self.leer("propios/personas.json")["personas"]
        self.assertIn(persona, personas)
        legislador = [l for l in self.leer("fuente/2023-2028/legisladores.json") if l["idLegislador"] == 101534][0]
        self.assertEqual(legislador["_propio"]["slug"], "mario-abdo")

    def test_correo_y_telefono_solo_en_legisladores(self):
        api = ApiSimulada()
        vigente = api.rutas["legislador?idCamara=A"][0]
        vigente["emailParlamentario"] = "oficina@senado.gov.py"
        vigente["telefonoParlamentario"] = "000-0000"
        # El mismo legislador, repetido dentro de la votación, con sus datos de contacto.
        for voto in api.rutas["votacion"][0]["votaciones"]:
            voto["legislador"]["emailParlamentario"] = "copia@congreso.gov.py"
        self.correr(api)
        legisladores = {l["idLegislador"]: l for l in self.leer("fuente/2023-2028/legisladores.json")}
        self.assertEqual(legisladores[vigente["idLegislador"]]["emailParlamentario"], "oficina@senado.gov.py")
        self.assertEqual(legisladores[vigente["idLegislador"]]["telefonoParlamentario"], "000-0000")
        for ruta, contenido in self.foto().items():
            # El diccionario describe los campos; los valores solo están en legisladores.
            if ruta.name.startswith(("legisladores.", "diccionario.")):
                continue
            self.assertNotIn(b"emailParlamentario", contenido, ruta)
            self.assertNotIn(b"telefonoParlamentario", contenido, ruta)

    def test_api_sin_leyes_no_escribe_nada(self):
        antes = self.foto()
        with self.assertRaises(ErrorAPI):
            self.correr(ApiSimulada(sin_leyes=True))
        self.assertEqual(self.foto(), antes)


if __name__ == "__main__":
    unittest.main()
