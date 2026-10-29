"""Pruebas de la clasificación temática (#36): reglas, conservación de lo revisado y coherencia con datos/."""

import json
import tempfile
import unittest
from pathlib import Path

from importador.escribir import json_bytes
from importador.temas import RUTA_CLASIFICACION, RUTA_CSV, aplicar_reglas, clasificar, proyectos_del_periodo, texto_de_reglas

DATOS = Path(__file__).resolve().parents[2] / "datos"
TEMAS = json.loads((DATOS / "propios" / "temas.json").read_text(encoding="utf-8"))["temas"]


def temas_de(acapite):
    return [a["tema"] for a in aplicar_reglas(acapite, TEMAS)]


class Reglas(unittest.TestCase):
    def test_sin_tildes_ni_mayusculas_y_prefijo_de_palabra(self):
        self.assertEqual(temas_de("QUE CREA LA DIRECCIÓN NACIONAL DE INGRESOS TRIBUTARIOS"), ["presupuesto", "estado"])
        # "tren" es comienzo de palabra en "TREN", pero no dentro de "ENTRENAMIENTO".
        self.assertEqual(temas_de("De la reforma del Tren de Cercanías"), ["obras"])
        self.assertNotIn("obras", temas_de("Que regula el entrenamiento de perros de asistencia"))

    def test_mas_de_un_tema(self):
        self.assertEqual(temas_de("QUE REGULA EL EJERCICIO PROFESIONAL DEL FARMACÉUTICO EN EL PARAGUAY"), ["trabajo", "salud"])

    def test_exclusivos_dejan_fuera_a_los_demas(self):
        self.assertEqual(temas_de("QUE CONCEDE PENSIÓN GRACIABLE AL SEÑOR X, MÚSICO Y COMPOSITOR PARAGUAYO"), ["pensiones-graciables"])
        self.assertEqual(
            temas_de("QUE DESAFECTA DEL DOMINIO PÚBLICO MUNICIPAL Y AUTORIZA A TRANSFERIR A TÍTULO GRATUITO A FAVOR "
                     "DEL MINISTERIO DE SALUD PÚBLICA Y BIENESTAR SOCIAL"),
            ["inmuebles"])

    def test_deporte_aparte_de_cultura(self):
        self.assertEqual(temas_de("De prevención, control y erradicación de la violencia en el deporte"), ["deporte", "seguridad"])
        self.assertEqual(temas_de("Que establece el 26 de junio como Día Nacional del Taekwon-do paraguayo"), ["cultura", "deporte"])
        self.assertEqual(temas_de("Que crea el Instituto Superior Nacional de Música"), ["educacion", "cultura"])

    def test_excepto(self):
        self.assertEqual(
            temas_de("QUE DECLARA EN SITUACIÓN DE EMERGENCIA TODOS LOS ESTABLECIMIENTOS PENITENCIARIOS Y CENTROS "
                     "EDUCATIVOS DEL TERRITORIO DE LA REPÚBLICA"),
            ["seguridad"])

    def test_sin_presentado_por_ni_encabezado_de_mensaje(self):
        self.assertEqual(texto_de_reglas("Que crea la Universidad X, presentado por los Diputados Salud y Ruta"),
                         " que crea la universidad x ")
        self.assertEqual(
            temas_de("Mensaje del Poder Ejecutivo Nº 368, Ministerio de Obras Públicas y Comunicaciones, por el cual "
                     "remite el Proyecto de Ley «Que declara patrimonio histórico nacional las plazas»"),
            ["cultura"])

    def test_sin_regla_queda_vacio(self):
        self.assertEqual(aplicar_reglas("De abordaje nacional de la disfemia", TEMAS), [])

    def test_regla_registra_la_palabra_clave(self):
        self.assertEqual(aplicar_reglas("Que crea la Universidad Rural", TEMAS),
                         [{"tema": "educacion", "origen": "regla", "palabraClave": "universidad"}])


class Clasificar(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.salida = Path(self.tmp.name)
        (self.salida / "propios").mkdir()
        (self.salida / "propios" / "temas.json").write_bytes(json_bytes({"temas": TEMAS}))
        (self.salida / "periodos.json").write_bytes(json_bytes({"periodos": [{"id": "2023-2028"}]}))
        carpeta = self.salida / "fuente" / "2023-2028"
        carpeta.mkdir(parents=True)
        leyes = [{"idLey": 1, "proyecto": {"idProyecto": 10, "acapite": "Que crea la Universidad Rural"}}]
        votaciones = [
            {"idVotacion": 5, "proyecto": {"idProyecto": 20, "tipoProyecto": "PROYECTO DE LEY", "acapite": "De la disfemia"}},
            {"idVotacion": 6, "proyecto": {"idProyecto": 30, "tipoProyecto": "PEDIDO DE INFORMES", "acapite": "Salud"}},
            {"idVotacion": 7, "proyecto": {"idProyecto": 10, "tipoProyecto": "PROYECTO DE LEY", "acapite": "otro"}},
        ]
        (carpeta / "leyes.json").write_bytes(json_bytes(leyes))
        (carpeta / "votaciones.json").write_bytes(json_bytes(votaciones))

    def tearDown(self):
        self.tmp.cleanup()

    def leer(self):
        return {e["idProyecto"]: e for e in json.loads((self.salida / RUTA_CLASIFICACION).read_text(encoding="utf-8"))["proyectos"]}

    def test_proyectos_con_ley_y_proyectos_de_ley_votados(self):
        self.assertEqual(proyectos_del_periodo(self.salida / "fuente" / "2023-2028"),
                         {10: "Que crea la Universidad Rural", 20: "De la disfemia"})

    def test_pendiente_y_reglas(self):
        _, avisos = clasificar(self.salida)
        e = self.leer()
        self.assertEqual(sorted(e), [10, 20])
        self.assertEqual([t["tema"] for t in e[10]["temas"]], ["educacion"])
        self.assertFalse(e[10]["pendiente"])
        self.assertEqual(e[20]["temas"], [])
        self.assertTrue(e[20]["pendiente"])
        self.assertEqual(len(avisos), 1)
        self.assertTrue((self.salida / RUTA_CSV).read_bytes().startswith(b"\xef\xbb\xbf"))

    def test_conserva_lo_revisado_y_es_estable(self):
        revisada = {"idProyecto": 20, "periodoLegislativo": "2023-2028", "pendiente": False, "revisado": True,
                    "temas": [{"tema": "salud", "origen": "revision"}]}
        (self.salida / RUTA_CLASIFICACION).write_bytes(json_bytes({"proyectos": [revisada]}))
        clasificar(self.salida)
        self.assertEqual(self.leer()[20], revisada)
        self.assertEqual(clasificar(self.salida), ([], []))

    def test_tema_revisado_desconocido_es_un_error(self):
        revisada = {"idProyecto": 20, "periodoLegislativo": "2023-2028", "pendiente": False, "revisado": True,
                    "temas": [{"tema": "inventado", "origen": "revision"}]}
        (self.salida / RUTA_CLASIFICACION).write_bytes(json_bytes({"proyectos": [revisada]}))
        with self.assertRaises(ValueError):
            clasificar(self.salida)


class CopiaDeDatos(unittest.TestCase):
    """La clasificación guardada en datos/ cubre todos los proyectos y está al día."""

    def test_cada_proyecto_tiene_tema_o_pendiente(self):
        entradas = json.loads((DATOS / RUTA_CLASIFICACION).read_text(encoding="utf-8"))["proyectos"]
        ids_temas = {t["id"] for t in TEMAS}
        for e in entradas:
            self.assertTrue(e["temas"] or e["pendiente"], e["idProyecto"])
            self.assertEqual(e["pendiente"], not e["temas"], e["idProyecto"])
            self.assertTrue({t["tema"] for t in e["temas"]} <= ids_temas, e["idProyecto"])
        proyectos = proyectos_del_periodo(DATOS / "fuente" / "2023-2028")
        self.assertEqual({e["idProyecto"] for e in entradas if e["periodoLegislativo"] == "2023-2028"}, set(proyectos))

    def test_temas_con_nombre_definicion_y_palabras_clave(self):
        ids = [t["id"] for t in TEMAS]
        self.assertEqual(len(ids), len(set(ids)))
        for t in TEMAS:
            self.assertTrue(t["nombre"] and t["definicion"] and t["palabrasClave"], t["id"])
            self.assertRegex(t["id"], r"^[a-z]+(-[a-z]+)*$")


if __name__ == "__main__":
    unittest.main()
