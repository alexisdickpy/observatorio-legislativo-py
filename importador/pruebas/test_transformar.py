"""Pruebas de normalización con ejemplos reales de la API (docs/auditoria/ejemplos/).

Uso (desde la raíz del repositorio):
    python -m unittest discover -s importador/pruebas -t .
"""

import copy
import json
import unittest
from pathlib import Path

from importador.escribir import csv_bytes, json_bytes
from importador.fechas import a_iso
from importador.personas import asignar, slug
from importador.transformar import (
    Notas,
    con_fechas_iso,
    filas_autores,
    filas_expedientes,
    filas_tramitaciones,
    sin_contacto,
    transformar_ley,
    transformar_votacion,
    verificar_numeros_ley,
)

EJEMPLOS = Path(__file__).resolve().parents[2] / "docs" / "auditoria" / "ejemplos"


def ejemplo(nombre):
    return json.loads((EJEMPLOS / f"{nombre}.json").read_text(encoding="utf-8"))


class Fechas(unittest.TestCase):
    def test_fecha_valida(self):
        self.assertEqual(a_iso("06/07/2026"), ("2026-07-06", None))

    def test_vacia_no_es_error(self):
        self.assertEqual(a_iso(""), (None, None))
        self.assertEqual(a_iso(None), (None, None))

    def test_anio_imposible_de_leyes_antiguas(self):
        # Casos reales del histórico: leyes 4678 y 5543.
        for texto in ("29/11/0012", "26/11/0215"):
            iso, problema = a_iso(texto)
            self.assertIsNone(iso)
            self.assertIn("año", problema)

    def test_fecha_inexistente(self):
        iso, problema = a_iso("31/02/2024")
        self.assertIsNone(iso)
        self.assertIn("inexistente", problema)

    def test_formato_desconocido(self):
        self.assertIsNone(a_iso("2024-01-31")[0])
        self.assertIsNotNone(a_iso("2024-01-31")[1])

    def test_fecha_mal_formada_se_conserva_y_se_anota(self):
        notas = Notas()
        registro = con_fechas_iso({"idLey": 1, "fechaSancion": "29/11/0012"}, "ley", 1, notas)
        self.assertEqual(registro["fechaSancion"], "29/11/0012")
        self.assertIsNone(registro["_propio"]["fechaSancion"])
        self.assertEqual(notas.lista[0]["tipo"], "fecha_mal_formada")
        self.assertEqual(notas.lista[0]["valorOriginal"], "29/11/0012")


class Ley(unittest.TestCase):
    def setUp(self):
        self.ley = ejemplo("ley_periodo")
        self.tramitaciones = ejemplo("proyecto_tramitaciones")
        self.adjuntos = {"archivosAdjuntos": ejemplo("proyecto_adjuntos")}

    def test_valores_oficiales_intactos(self):
        original = copy.deepcopy(self.ley)
        registro = transformar_ley(self.ley, "2023-2028", 100267, self.tramitaciones, self.adjuntos, Notas())
        self.assertEqual(self.ley, original, "la entrada no debe modificarse")
        for campo, valor in original.items():
            if campo != "proyecto":
                self.assertEqual(registro[campo], valor)
        for campo, valor in original["proyecto"].items():
            self.assertEqual(registro["proyecto"][campo], valor)

    def test_identificador_y_enlace_a_silpy(self):
        registro = transformar_ley(self.ley, "2023-2028", 100267, self.tramitaciones, self.adjuntos, Notas())
        self.assertEqual(registro["idLey"], 146644)
        self.assertEqual(registro["appURL"], "https://silpy.congreso.gov.py/ley/146644")
        self.assertTrue(registro["proyecto"]["appURL"].startswith("https://silpy.congreso.gov.py/expediente/"))

    def test_campos_propios_separados(self):
        registro = transformar_ley(self.ley, "2023-2028", 100267, self.tramitaciones, self.adjuntos, Notas())
        propio = registro["_propio"]
        self.assertEqual(propio["fechaSancion"], "2026-07-06")
        self.assertEqual(propio["numeroLey"], "7689")
        self.assertEqual(propio["periodoLegislativo"], "2023-2028")
        self.assertEqual(registro["proyecto"]["_propio"]["fechaIngresoExpediente"], "2025-11-27")
        self.assertEqual(registro["proyecto"]["ministerios"], self.tramitaciones["ministerios"])
        self.assertNotIn("tramitaciones", registro["proyecto"])

    def test_numero_de_ley_con_espacios(self):
        # Caso real del histórico: " 6128".
        self.ley["numeroLey"] = " 6128"
        registro = transformar_ley(self.ley, "2023-2028", 100267, None, None, Notas())
        self.assertEqual(registro["numeroLey"], " 6128")
        self.assertEqual(registro["_propio"]["numeroLey"], "6128")

    def test_proyecto_sin_detalle_se_anota(self):
        notas = Notas()
        registro = transformar_ley(self.ley, "2023-2028", 100267, None, None, notas)
        self.assertNotIn("archivosAdjuntos", registro["proyecto"])
        self.assertEqual(notas.por_tipo(), {"proyecto_sin_tramitaciones": 1, "proyecto_sin_adjuntos": 1})

    def test_tramitaciones_ordenadas_con_fecha_iso(self):
        filas = filas_tramitaciones(150168, list(reversed(self.tramitaciones["tramitaciones"])), Notas())
        ids = [f["tramitacion"]["idTramitacion"] for f in filas]
        self.assertEqual(ids, sorted(ids))
        self.assertEqual(filas[0]["idProyecto"], 150168)
        self.assertRegex(filas[0]["tramitacion"]["_propio"]["fechaTramite"], r"^\d{4}-\d{2}-\d{2}$")


class Votacion(unittest.TestCase):
    def setUp(self):
        self.votacion = ejemplo("votacion")  # recortada a 3 votos individuales

    def test_totales_oficiales_se_conservan_y_se_recalculan_aparte(self):
        notas = Notas()
        registro, filas, _ = transformar_votacion(self.votacion, "2023-2028", notas)
        self.assertEqual(registro["totalSI"], 57)
        self.assertEqual(registro["totalAusente"], 23)
        self.assertEqual(registro["_propio"]["totalesRecalculados"], {"AUSENTE": 1, "SI": 2})
        self.assertFalse(registro["_propio"]["totalesCoinciden"])
        self.assertIn("totales_no_coinciden", notas.por_tipo())
        self.assertIn("menos_votos_que_miembros", notas.por_tipo())

    def test_votos_en_filas_sin_lista_anidada(self):
        registro, filas, legisladores = transformar_votacion(self.votacion, "2023-2028", Notas())
        self.assertNotIn("votaciones", registro)
        self.assertEqual(len(filas), 3)
        self.assertEqual(filas[0]["idVotacion"], 108906)
        self.assertEqual(filas[0]["sentidoVotacion"], "SI")
        self.assertEqual(filas[0]["idSentidoVotacion"], 272)
        self.assertEqual(set(legisladores), {f["idLegislador"] for f in filas})

    def test_totales_coinciden_cuando_los_votos_cuadran(self):
        self.votacion.update(totalSI=2, totalNO=0, totalAbstencion=0, totalAusente=1, totalNoVota=0)
        registro, _, _ = transformar_votacion(self.votacion, "2023-2028", Notas())
        self.assertTrue(registro["_propio"]["totalesCoinciden"])

    def test_mocion_no_es_descuadre(self):
        # Caso real (votación 104665): 58 votos "MOCIÓN 1", que no tienen total publicado.
        for voto in self.votacion["votaciones"]:
            voto.update(sentidoVotacion="MOCIÓN 1", idSentidoVotacion=281)
        self.votacion.update(totalSI=0, totalNO=0, totalAbstencion=0, totalAusente=0, totalNoVota=0)
        registro, _, _ = transformar_votacion(self.votacion, "2023-2028", Notas())
        self.assertTrue(registro["_propio"]["totalesCoinciden"])

    def test_fechas_de_sesion_en_iso(self):
        registro, _, _ = transformar_votacion(self.votacion, "2023-2028", Notas())
        sesion = registro["tramitacion"]["idSesion"]
        self.assertEqual(sesion["fechaSesion"], "06/07/2026")
        self.assertEqual(sesion["_propio"]["fechaSesion"], "2026-07-06")


class Privacidad(unittest.TestCase):
    def test_sin_correo_ni_telefono(self):
        autor = {"idLegislador": 1, "nombres": "Ana", "emailParlamentario": "a@b.py", "telefonoParlamentario": "1"}
        self.assertEqual(sin_contacto({"autores": [autor]}), {"autores": [{"idLegislador": 1, "nombres": "Ana"}]})

    def test_autores_sin_contacto_y_en_orden(self):
        autores = [
            {"idLegislador": 2, "nombres": "B", "periodoLegislativo": "2023-2028", "emailParlamentario": "x"},
            {"idLegislador": 1, "nombres": "A", "periodoLegislativo": "2018-2023", "telefonoParlamentario": "y"},
        ]
        filas = filas_autores(10, autores, "2023-2028", {2: "b"})
        self.assertEqual([f["_propio"]["orden"] for f in filas], [1, 2])
        self.assertEqual([f["_propio"]["delPeriodo"] for f in filas], [True, False])
        self.assertEqual([f["_propio"]["slug"] for f in filas], ["b", None])
        self.assertNotIn("emailParlamentario", json.dumps(filas))
        self.assertNotIn("telefonoParlamentario", json.dumps(filas))


class Expedientes(unittest.TestCase):
    def test_solo_los_del_periodo_con_valores_oficiales(self):
        respuesta = [ejemplo("legislador_expedientes")]
        oficial = respuesta[0]["proyectos"][1]
        notas = Notas()
        filas = filas_expedientes(101344, respuesta, "2023-07-01", "2028-06-30", "b", notas)
        # El primero ingresó en 2022, antes del período.
        self.assertEqual(len(filas), 1)
        self.assertEqual({k: v for k, v in filas[0].items() if k not in ("idLegislador", "_propio")}, oficial)
        self.assertEqual(filas[0]["idLegislador"], 101344)
        self.assertEqual(filas[0]["_propio"], {"fechaIngreso": "2023-07-13", "slug": "b"})
        self.assertNotIn("emailParlamentario", json.dumps(filas))
        self.assertEqual(notas.lista, [])

    def test_fecha_invalida_queda_fuera_con_nota(self):
        notas = Notas()
        filas = filas_expedientes(1, [{"proyectos": [{"idProyecto": 9, "fechaIngresoExpediente": "31/02/2024"}]}],
                                  "2023-07-01", "2028-06-30", None, notas)
        self.assertEqual(filas, [])
        self.assertEqual([(n["tipo"], n["id"], n["valorOriginal"]) for n in notas.lista],
                         [("fecha_ingreso_invalida", 9, "31/02/2024")])

    def test_sin_expedientes(self):
        self.assertEqual(filas_expedientes(1, [], "2023-07-01", "2028-06-30", None, Notas()), [])


class Personas(unittest.TestCase):
    def test_slug_sin_tildes(self):
        self.assertEqual(slug("María Rocío Abed de Zacarías"), "maria-rocio-abed-de-zacarias")
        self.assertEqual(slug("ADRIÁN DARÍO (BILLY) VAESKEN"), "adrian-dario-billy-vaesken")
        self.assertEqual(slug("Ñandutí Ñu"), "nanduti-nu")

    def test_homonimos_reciben_slugs_distintos(self):
        legisladores = [
            {"idLegislador": 2, "nombres": "Juan", "apellidos": "Pérez"},
            {"idLegislador": 1, "nombres": "Juan", "apellidos": "Perez"},
        ]
        _, slugs, _ = asignar([], legisladores, "2023-2028")
        self.assertEqual(slugs, {1: "juan-perez", 2: "juan-perez-2"})

    def test_slug_existente_no_cambia(self):
        existentes = [{"slug": "juan-perez", "nombre": "Juan Perez",
                       "legisladores": [{"periodoLegislativo": "2023-2028", "idLegislador": 1}]}]
        corregido = [{"idLegislador": 1, "nombres": "Juan Carlos", "apellidos": "Pérez Gómez"}]
        personas, slugs, nuevos = asignar(existentes, corregido, "2023-2028")
        self.assertEqual(slugs[1], "juan-perez")
        self.assertEqual(nuevos, [])
        self.assertEqual(personas, existentes)


class NumerosDeLey(unittest.TestCase):
    def ley(self, id_ley, numero, fecha):
        return {"idLey": id_ley, "numeroLey": numero, "fechaSancion": fecha}

    def test_mismo_numero_en_otro_periodo_es_conflicto(self):
        periodo = [self.ley(1, "7000", "01/08/2023")]
        historico = periodo + [self.ley(2, "7000", "01/08/2010")]
        notas = Notas()
        resultado = verificar_numeros_ley(periodo, historico, "2023-07-01", "2028-06-30", notas)
        self.assertEqual(resultado["conflictos"], 1)
        self.assertEqual(notas.lista[0]["tipo"], "numero_ley_repetido_en_otro_periodo")

    def test_proyectos_acumulados_no_son_conflicto(self):
        periodo = [self.ley(1, "7322", "01/08/2024"), self.ley(2, "7322", "01/08/2024")]
        resultado = verificar_numeros_ley(periodo, list(periodo), "2023-07-01", "2028-06-30", Notas())
        self.assertEqual(resultado["conflictos"], 0)
        self.assertEqual(resultado["numerosDelPeriodo"], 1)

    def test_ley_del_periodo_fuera_del_listado(self):
        periodo = [self.ley(1, "7000", "01/08/2023")]
        historico = periodo + [self.ley(3, "7001", "02/08/2023")]
        resultado = verificar_numeros_ley(periodo, historico, "2023-07-01", "2028-06-30", Notas())
        self.assertEqual(resultado["leyesDelPeriodoFueraDeListado"], 1)


class Serializacion(unittest.TestCase):
    def test_json_determinista_sin_importar_el_orden_de_claves(self):
        self.assertEqual(json_bytes({"b": 1, "a": "ñ"}), json_bytes({"a": "ñ", "b": 1}))
        self.assertTrue(json_bytes({"a": 1}).endswith(b"}\n"))
        self.assertIn("ñ".encode("utf-8"), json_bytes({"a": "ñ"}))

    def test_csv_con_bom_y_saltos_de_linea_unix(self):
        contenido = csv_bytes(["a", "b"], [{"a": 1, "b": None}, {"a": 2, "b": "x\ny"}])
        self.assertEqual(contenido, b'\xef\xbb\xbfa,b\n1,\n2,"x\ny"\n')


if __name__ == "__main__":
    unittest.main()
