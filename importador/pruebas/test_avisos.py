"""Pruebas de los avisos del bot de Telegram (#66), sin conexión."""

import json
import tempfile
import unittest
from pathlib import Path

from importador.avisos import CITA, LIMITE_LEYES, LIMITE_TELEGRAM, RAIZ, avisar, en_mensajes, sitio
from importador.escribir import json_bytes

BASE = "https://ejemplo.test"
MARTES = "2026-10-27T12:00:00Z"
LUNES = "2026-11-02T12:00:00Z"


def ley(i, acapite="DE PRUEBA."):
    return {"idLey": i, "proyecto": {"acapite": acapite},
            "_propio": {"numeroLey": str(7000 + i), "fechaSancion": "2026-08-25"}}


def votacion(i, tipo="PROYECTO DE LEY"):
    return {"idVotacion": i, "totalSI": 30, "totalNO": 5, "totalAbstencion": 1,
            "proyecto": {"tipoProyecto": tipo, "acapite": f"Proyecto {i}"},
            "tramitacion": {"camaraTramite": "CAMARA DE SENADORES", "fechaTramite": "14/10/2026",
                            "resultadoTramite": "APROBADO", "_propio": {"fechaTramite": "2026-10-14"}}}


def expediente(proyecto, legislador, tipo="PROYECTO DE LEY"):
    return {"idProyecto": proyecto, "idLegislador": legislador, "tipoProyecto": tipo, "acapite": f"Expediente {proyecto}",
            "fechaIngresoExpediente": "20/10/2026", "expedienteCamara": f"S-{proyecto}",
            "appURL": f"https://silpy.test/expediente/{proyecto}", "_propio": {"fechaIngreso": "2026-10-20"}}


class Avisos(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.salida = Path(self.tmp.name)
        (self.salida / "periodos.json").write_bytes(json_bytes({"periodos": [{"id": "2023-2028"}]}))
        self.poner(leyes=[ley(1)], votaciones=[votacion(1)], expedientes=[expediente(1, 10)],
                   legisladores=[{"idLegislador": 10, "nombres": "Ana", "apellidos": "Pérez"},
                                 {"idLegislador": 11, "nombres": "Luis", "apellidos": "Gómez"}])
        self.enviados = []

    def tearDown(self):
        self.tmp.cleanup()

    def poner(self, **tablas):
        carpeta = self.salida / "fuente" / "2023-2028"
        carpeta.mkdir(parents=True, exist_ok=True)
        for nombre, filas in tablas.items():
            (carpeta / f"{nombre}.json").write_bytes(json_bytes(filas))

    def enviar(self, tipo, texto):
        self.enviados.append((tipo, texto))

    def registro(self):
        return json.loads((self.salida / "propios" / "avisos-telegram.json").read_text(encoding="utf-8"))

    def correr(self, enviar=None, ahora=MARTES, **kw):
        return avisar(self.salida, enviar or self.enviar, BASE, ahora=ahora, salida_texto=lambda *_: None, **kw)

    def textos(self, tipo):
        return [t for x, t in self.enviados if x == tipo]

    def test_primera_ejecucion_marca_todo_sin_enviar(self):
        self.assertTrue(self.correr(ahora=LUNES)["primera"])
        self.assertEqual(self.enviados, [])
        self.assertEqual(self.registro()["iniciales"], {"leyes": [1], "votaciones": [1], "proyectos": [1]})
        self.correr()
        self.assertEqual(self.enviados, [])

    def test_un_aviso_por_ley_nueva_sin_duplicados(self):
        self.correr()
        self.poner(leyes=[ley(1), ley(2, "QUE CREA ALGO.")])
        self.correr()
        texto, = self.textos("leyes")
        self.assertIn("Ley 7002", texto)
        self.assertIn("QUE CREA ALGO.", texto)
        self.assertIn("Sancionada el 25/08/2026", texto)
        self.assertIn(f"{BASE}/leyes/7002/", texto)
        self.assertTrue(texto.endswith(f"{CITA}. Actualizados el 27/10/2026."))
        self.correr()
        self.assertEqual(len(self.textos("leyes")), 1)

    def test_un_solo_mensaje_al_superar_el_limite_de_leyes(self):
        self.correr()
        self.poner(leyes=[ley(i) for i in range(1, LIMITE_LEYES + 3)])
        self.correr()
        texto, = self.textos("leyes")
        self.assertTrue(texto.startswith(f"{LIMITE_LEYES + 1} leyes sancionadas nuevas"))
        self.assertIn(f"{BASE}/leyes/\n", texto)

    def test_votaciones_solo_de_proyectos_de_ley_en_un_mensaje(self):
        self.correr()
        self.poner(votaciones=[votacion(1), votacion(2), votacion(3), votacion(4, "PEDIDO DE INFORMES (Art. 192 CN)")])
        self.correr()
        texto, = self.textos("votaciones")
        self.assertIn("(2)", texto)
        self.assertIn("Proyecto 2", texto)
        self.assertIn("Resultado oficial APROBADO. Sí 30, No 5, Abstención 1", texto)
        self.assertIn(f"{BASE}/votacion/3/", texto)
        self.assertNotIn("Proyecto 4", texto)

    def test_proyectos_de_ley_nuevos_con_todos_sus_autores(self):
        self.correr()
        self.poner(expedientes=[expediente(1, 10), expediente(2, 10), expediente(2, 11), expediente(3, 10, "PEDIDO DE INFORMES")])
        self.correr()
        texto, = self.textos("proyectos")
        self.assertIn("Expediente 2", texto)
        self.assertIn("Presentado por Ana Pérez, Luis Gómez", texto)
        self.assertIn("https://silpy.test/expediente/2", texto)
        self.assertNotIn("Expediente 3", texto)
        self.assertNotIn("Expediente 1\n", texto)

    def test_resumen_los_lunes_una_sola_vez(self):
        self.correr()
        self.poner(leyes=[ley(1), ley(2)], votaciones=[votacion(1), votacion(2)])
        self.correr(ahora="2026-10-29T12:00:00Z")
        self.assertEqual(self.textos("resumen"), [])
        self.correr(ahora=LUNES)
        texto, = self.textos("resumen")
        self.assertIn("Ley 7002", texto)
        self.assertIn("Votaciones nominales de proyectos de ley (1)", texto)
        self.assertIn("APROBADO, 1", texto)
        self.correr(ahora=LUNES)
        self.assertEqual(len(self.textos("resumen")), 1)

    def test_resumen_sin_novedades_lo_dice_y_no_incluye_lo_viejo(self):
        self.correr()
        self.poner(leyes=[ley(1), ley(2)])
        self.correr(ahora="2026-10-01T12:00:00Z")
        self.correr(ahora=LUNES)
        self.assertIn("No aparecieron leyes", self.textos("resumen")[0])

    def test_fallo_del_envio_no_registra_y_se_reintenta(self):
        self.correr()
        self.poner(leyes=[ley(1), ley(2)])
        r = self.correr(enviar=lambda tipo, texto: "HTTP 500")
        self.assertEqual(r["errores"], ["HTTP 500"])
        self.assertEqual(self.registro()["avisados"], [])
        self.correr()
        self.assertEqual(len(self.textos("leyes")), 1)

    def test_lista_larga_se_reparte_y_reintenta_entera(self):
        bloques = [f"Bloque {i} " + "x" * 300 for i in range(40)]
        mensajes = en_mensajes("Encabezado", bloques, "2026-10-27")
        self.assertGreater(len(mensajes), 1)
        self.assertTrue(all(len(m) <= LIMITE_TELEGRAM for m in mensajes))
        self.assertTrue(all(m.startswith("Encabezado") and CITA in m for m in mensajes))
        self.correr()
        self.poner(votaciones=[votacion(i) for i in range(1, 60)])
        llamadas = []
        def falla_al_segundo(tipo, texto):
            llamadas.append(texto)
            return "HTTP 500" if len(llamadas) == 2 else None
        self.correr(enviar=falla_al_segundo)
        self.assertEqual(self.registro()["avisados"], [])
        self.correr()
        self.assertEqual(len(self.registro()["avisados"]), 58)

    def test_modo_de_prueba_no_toca_el_registro(self):
        textos = []
        avisar(self.salida, None, BASE, salida_texto=textos.append)
        self.assertFalse((self.salida / "propios" / "avisos-telegram.json").exists())
        self.correr()
        self.poner(leyes=[ley(1), ley(2)])
        antes = self.registro()
        textos = []
        avisar(self.salida, None, BASE, salida_texto=textos.append)
        self.assertTrue(any("Ley 7002" in t for t in textos))
        self.assertEqual(self.registro(), antes)

    def test_rutas_iguales_a_las_del_sitio(self):
        rutas = (RAIZ / "sitio" / "src" / "lib" / "rutas.js").read_text(encoding="utf-8")
        self.assertIn('export const leyes = () => "/leyes/";', rutas)
        self.assertIn("export const ley = (numeroLey) => `/leyes/${encodeURIComponent(numeroLey)}/`;", rutas)
        self.assertIn('export const carpetaVotaciones = () => "/votacion/";', rutas)
        self.assertIn('export const votacionesNominales = () => "/legisladores/votaciones-nominales/";', rutas)
        self.assertTrue(sitio().startswith("https://"))


if __name__ == "__main__":
    unittest.main()
