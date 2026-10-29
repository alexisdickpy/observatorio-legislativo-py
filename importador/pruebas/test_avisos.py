"""Pruebas de los avisos de leyes nuevas en Telegram (#66), sin conexión."""

import json
import re
import tempfile
import unittest
from pathlib import Path

from importador.avisos import CITA, RAIZ, avisar, mensaje_ley, sitio
from importador.escribir import json_bytes

BASE = "https://ejemplo.test"
PERIODOS = {"periodos": [{"id": "2023-2028"}]}


def ley(id_ley, numero, fecha="2026-08-25", acapite="DE PRUEBA."):
    return {"idLey": id_ley, "proyecto": {"acapite": acapite},
            "_propio": {"numeroLey": numero, "fechaSancion": fecha}}


def silencio(*_):
    pass


class Avisos(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.salida = Path(self.tmp.name)
        (self.salida / "periodos.json").write_bytes(json_bytes(PERIODOS))
        self.poner_leyes([ley(1, "7000"), ley(2, "7001")])
        self.enviados = []

    def tearDown(self):
        self.tmp.cleanup()

    def poner_leyes(self, leyes):
        carpeta = self.salida / "fuente" / "2023-2028"
        carpeta.mkdir(parents=True, exist_ok=True)
        (carpeta / "leyes.json").write_bytes(json_bytes(leyes))

    def enviar(self, texto):
        self.enviados.append(texto)

    def registro(self):
        return json.loads((self.salida / "propios" / "avisos-telegram.json").read_text(encoding="utf-8"))["avisadas"]

    def correr(self, enviar=None, **kw):
        return avisar(self.salida, enviar or self.enviar, BASE, ahora="2026-10-30T07:00:00Z", salida_texto=silencio, **kw)

    def test_primera_ejecucion_marca_todo_sin_enviar(self):
        r = self.correr()
        self.assertTrue(r["primera"])
        self.assertEqual(self.enviados, [])
        self.assertEqual([a["idLey"] for a in self.registro()], [1, 2])
        self.correr()
        self.assertEqual(self.enviados, [])

    def test_un_aviso_por_ley_nueva_sin_duplicados(self):
        self.correr()
        self.poner_leyes([ley(1, "7000"), ley(2, "7001"), ley(3, "7002", acapite="QUE CREA ALGO.")])
        r = self.correr()
        self.assertEqual(r["enviados"], 1)
        self.assertEqual(len(self.enviados), 1)
        self.assertIn("Ley 7002", self.enviados[0])
        self.assertIn("QUE CREA ALGO.", self.enviados[0])
        self.assertIn("Sancionada el 25/08/2026", self.enviados[0])
        self.assertIn(f"{BASE}/leyes/7002/", self.enviados[0])
        self.assertTrue(self.enviados[0].endswith(f"{CITA}. Actualizados el 30/10/2026."))
        self.correr()
        self.assertEqual(len(self.enviados), 1)
        self.assertEqual(self.registro()[-1], {"idLey": 3, "numeroLey": "7002", "fecha": "2026-10-30T07:00:00Z", "enviado": True})

    def test_resumen_unico_al_superar_el_limite(self):
        self.correr()
        self.poner_leyes([ley(i, str(7000 + i)) for i in range(1, 10)])
        r = self.correr(limite=5)
        self.assertEqual(r["pendientes"], 7)
        self.assertEqual(len(self.enviados), 1)
        self.assertTrue(self.enviados[0].startswith("7 leyes sancionadas nuevas"))
        self.assertIn(f"{BASE}/leyes/\n", self.enviados[0])
        self.assertEqual(len(self.registro()), 9)

    def test_fallo_del_envio_no_registra_y_se_reintenta(self):
        self.correr()
        self.poner_leyes([ley(1, "7000"), ley(2, "7001"), ley(3, "7002")])
        r = self.correr(enviar=lambda texto: "HTTPError 401")
        self.assertEqual(r["errores"], ["HTTPError 401"])
        self.assertEqual(len(self.registro()), 2)
        self.correr()
        self.assertEqual(len(self.enviados), 1)

    def test_modo_de_prueba_no_toca_el_registro(self):
        textos = []
        avisar(self.salida, None, BASE, salida_texto=textos.append)
        self.assertFalse((self.salida / "propios" / "avisos-telegram.json").exists())
        self.correr()
        self.poner_leyes([ley(1, "7000"), ley(2, "7001"), ley(3, "7002")])
        antes = self.registro()
        textos = []
        avisar(self.salida, None, BASE, salida_texto=textos.append)
        self.assertTrue(any("Ley 7002" in t for t in textos))
        self.assertEqual(self.registro(), antes)

    def test_rutas_iguales_a_las_del_sitio(self):
        rutas = (RAIZ / "sitio" / "src" / "lib" / "rutas.js").read_text(encoding="utf-8")
        self.assertIn('export const leyes = () => "/leyes/";', rutas)
        self.assertIn("export const ley = (numeroLey) => `/leyes/${encodeURIComponent(numeroLey)}/`;", rutas)
        self.assertTrue(re.match(r"https://", sitio()))
        self.assertIn(f"{sitio()}/leyes/7714/", mensaje_ley(ley(1, "7714"), sitio(), "2026-10-30"))


if __name__ == "__main__":
    unittest.main()
