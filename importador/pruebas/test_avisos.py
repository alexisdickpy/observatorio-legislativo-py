"""Pruebas de los avisos del bot de Telegram (#66), sin conexión."""

import json
import tempfile
import unittest
from pathlib import Path

from importador.avisos import CITA, LIMITE_LEYES, LIMITE_TELEGRAM, RAIZ, avisar, barra_votos, en_mensajes, sitio
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


def proyecto(i, autores="", iniciativa="PARLAMENTARIA", ministerios=()):
    return {"idProyecto": i, "tipoProyecto": "PROYECTO DE LEY", "acapite": f"Expediente {i}", "iniciativa": iniciativa,
            "fechaIngresoExpediente": "20/10/2026", "expedienteCamara": f"S-{i}", "ministerios": list(ministerios),
            "appURL": f"https://silpy.test/expediente/{i}", "_propio": {"fechaIngreso": "2026-10-20", "autores": autores}}


def decision(i, fecha="2026-10-20", resultado="RECHAZADO"):
    return {"idProyecto": 500 + i, "acapite": f"Plenario {i}, presentado por Ana Pérez", "appURL": f"https://silpy.test/expediente/{500 + i}",
            "autores": [{"idLegislador": 1, "nombres": "Ana", "apellidos": "Pérez"}],
            "tramitacion": {"idTramitacion": i, "camaraTramite": "CAMARA DE SENADORES", "fechaTramite": "20/10/2026",
                            "resultadoTramite": resultado, "_propio": {"fechaTramite": fecha}}}


class Avisos(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.salida = Path(self.tmp.name)
        (self.salida / "periodos.json").write_bytes(json_bytes({"periodos": [{"id": "2023-2028"}]}))
        self.poner(leyes=[ley(1)], votaciones=[votacion(1)], **{"proyectos-recientes": [proyecto(1, "Ana Pérez")]})
        self.enviados = []

    def tearDown(self):
        self.tmp.cleanup()

    def poner_proyectos(self, *proyectos):
        self.poner(**{"proyectos-recientes": list(proyectos)})

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
        self.assertTrue(texto.endswith(f"{CITA}."))
        self.assertNotIn("Actualizados", texto)
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
        self.assertTrue(texto.startswith("Votaciones nominales nuevas de proyectos de ley\n"))
        self.assertIn("Proyecto 2", texto)
        self.assertIn("Resultado oficial: APROBADO. Sí 30, No 5, Abstención 1", texto)
        self.assertIn(f"{BASE}/votacion/3/", texto)
        self.assertNotIn("Proyecto 4", texto)

    def test_proyectos_nuevos_con_autores_o_iniciativa(self):
        self.correr()
        self.poner_proyectos(proyecto(1, "Ana Pérez"), proyecto(2, "Ana Pérez, Luis Gómez"),
                             proyecto(3, iniciativa="PODER EJECUTIVO", ministerios=["MINISTERIO DE SALUD"]),
                             proyecto(4, iniciativa="PODER JUDICIAL"))
        self.correr()
        texto, = self.textos("proyectos")
        self.assertIn("Presentado por Ana Pérez, Luis Gómez", texto)
        self.assertIn("https://silpy.test/expediente/2", texto)
        self.assertIn("Iniciativa PODER EJECUTIVO. MINISTERIO DE SALUD", texto)
        self.assertIn("Iniciativa PODER JUDICIAL", texto)
        self.assertNotIn("Expediente 1\n", texto)

    def poner_partidos(self):
        (self.salida / "propios").mkdir(exist_ok=True)
        (self.salida / "propios" / "partidos.json").write_bytes(json_bytes({"partidos": [
            {"partidoPolitico": "Partido A", "sigla": "ANR"}, {"partidoPolitico": "Partido B", "sigla": "PPQ"}]}))
        self.poner(legisladores=[{"idLegislador": 10, "partidoPolitico": "Partido A"},
                                 {"idLegislador": 11, "partidoPolitico": "Partido B"}])

    def test_proyecto_con_partido_de_cada_autor_sin_repetir_presentado_por(self):
        self.correr()
        self.poner_partidos()
        nuevo = proyecto(2, "Ana Pérez, Luis Gómez, Eva Díaz")
        nuevo["acapite"] = "QUE CREA ALGO, PRESENTADO POR LA DIPUTADA ANA PÉREZ"
        nuevo["autores"] = [{"idLegislador": 10, "nombres": "Ana", "apellidos": "Pérez"},
                            {"idLegislador": 11, "nombres": "Luis", "apellidos": "Gómez"},
                            {"idLegislador": 99, "nombres": "Eva", "apellidos": "Díaz"}]
        self.poner_proyectos(proyecto(1, "Ana Pérez"), nuevo)
        self.correr()
        texto, = self.textos("proyectos")
        self.assertTrue(texto.startswith("Proyectos de ley nuevos presentados\n"))
        self.assertIn("QUE CREA ALGO\n", texto)
        self.assertEqual(texto.lower().count("presentado por"), 1)
        self.assertIn("Presentado por 🔴 Ana Pérez (ANR), 🔷 Luis Gómez (PPQ), Eva Díaz", texto)

    def test_proyecto_sin_autores_conserva_el_titulo_entero(self):
        self.correr()
        nuevo = proyecto(2, iniciativa="PODER EJECUTIVO")
        nuevo["acapite"] = "QUE CREA ALGO, PRESENTADO POR EL PODER EJECUTIVO"
        self.poner_proyectos(proyecto(1, "Ana Pérez"), nuevo)
        self.correr()
        self.assertIn("QUE CREA ALGO, PRESENTADO POR EL PODER EJECUTIVO", self.textos("proyectos")[0])

    def test_votacion_con_analisis_por_partido(self):
        self.correr()
        self.poner_partidos()
        (self.salida / "fuente" / "2023-2028" / "votos.csv").write_text(
            "idVotacion,idLegislador,sentidoVotacion\n2,10,SI\n2,10,SI\n2,10,SI\n2,10,AUSENTE\n2,11,NO\n1,10,NO\n",
            encoding="utf-8")
        self.poner(votaciones=[votacion(1), votacion(2)])
        self.correr()
        texto, = self.textos("votaciones")
        self.assertIn("🟩 Sí  🟥 No  🟨 Abstención  ⬜ Sin voto", texto)
        self.assertLess(texto.index("Votación por partido\n"), texto.index("Análisis completo"))
        self.assertIn("🔴 ANR " + "🟩" * 8 + "⬜" * 2 + " 3 Sí, 1 sin voto", texto)
        self.assertIn("🔷 PPQ " + "🟥" * 10 + " 1 No", texto)

    def test_barra_muestra_toda_categoria_con_votos(self):
        barra = barra_votos(1, 14, 1, 10)
        self.assertEqual(len(barra), 10)
        self.assertEqual(barra, "🟩" + "🟥" * 4 + "🟨" + "⬜" * 4)

    def test_votacion_con_autores_y_enlaces_a_silpy(self):
        self.correr()
        self.poner_partidos()
        nueva = votacion(2)
        nueva["appURL"] = "https://silpy.test/votacion/2"
        nueva["proyecto"].update(idProyecto=50, appURL="https://silpy.test/expediente/50",
                                 acapite="Proyecto de Ley “QUE CREA ALGO”, presentado por los senadores Ana Pérez y Luis Gómez.")
        sin_autores = votacion(3)
        sin_autores["proyecto"].update(idProyecto=51, acapite="Mensaje, presentado por el Poder Ejecutivo")
        self.poner(votaciones=[votacion(1), nueva, sin_autores], autores=[
            {"idProyecto": 50, "legislador": {"nombres": "Ana", "apellidos": "Pérez", "partidoPolitico": "Partido A"}},
            {"idProyecto": 50, "legislador": {"nombres": "Luis", "apellidos": "Gómez", "partidoPolitico": "Otro partido"}}])
        self.correr()
        texto, = self.textos("votaciones")
        self.assertIn("Proyecto de Ley “QUE CREA ALGO”\n\nPresentado por 🔴 Ana Pérez (ANR), ⚪ Luis Gómez (Otro partido)\n\nCAMARA", texto)
        self.assertIn("Votación en SILpy: https://silpy.test/votacion/2", texto)
        self.assertIn("Proyecto en SILpy: https://silpy.test/expediente/50", texto)
        self.assertIn("Mensaje, presentado por el Poder Ejecutivo", texto)
        self.assertIn(f"Análisis completo: {BASE}/votacion/2/", texto)
        self.assertLess(texto.index("Proyecto en SILpy"), texto.index("Análisis completo"))

    def test_sin_novedades_no_se_envia_nada(self):
        self.correr()
        self.correr(ahora=LUNES)
        self.correr(ahora=LUNES, resumen=True)
        self.assertEqual(self.enviados, [])

    def test_ley_con_el_resultado_de_sus_votaciones(self):
        self.correr()
        nueva = ley(2)
        nueva["_propio"]["idVotaciones"] = [1, 99]
        self.poner(leyes=[ley(1), nueva])
        self.correr()
        texto, = self.textos("leyes")
        self.assertIn("Votaciones nominales (1)", texto)
        self.assertIn("Resultado oficial: APROBADO. Sí 30, No 5, Abstención 1", texto)
        self.assertIn(f"{BASE}/votacion/1/", texto)

    def test_ley_sin_votaciones_no_las_menciona(self):
        self.correr()
        self.poner(leyes=[ley(1), ley(2)])
        self.correr()
        self.assertNotIn("Votaciones nominales", self.textos("leyes")[0])

    def test_un_mensaje_por_numero_de_ley_con_varios_registros(self):
        self.correr()
        otra = ley(3, "OTRO PROYECTO.")
        otra["_propio"]["numeroLey"] = "7002"
        self.poner(leyes=[ley(1), ley(2, "UN PROYECTO."), otra])
        self.correr()
        texto, = self.textos("leyes")
        self.assertIn("UN PROYECTO.", texto)
        self.assertIn("OTRO PROYECTO.", texto)
        self.assertEqual(len(self.registro()["avisados"]), 2)

    def test_resumen_solo_cuando_se_pide_y_una_sola_vez(self):
        self.correr()
        self.poner(leyes=[ley(1), ley(2)], votaciones=[votacion(1), votacion(2)])
        self.correr(ahora="2026-10-29T12:00:00Z")
        self.correr(ahora=LUNES)
        self.assertEqual(self.textos("resumen"), [])
        self.correr(ahora=LUNES, resumen=True)
        texto, = self.textos("resumen")
        self.assertIn("Ley 7002", texto)
        self.assertIn("Votaciones nominales de proyectos de ley (1)", texto)
        self.assertIn("APROBADO, 1", texto)
        self.correr(ahora=LUNES, resumen=True)
        self.assertEqual(len(self.textos("resumen")), 1)

    def test_votacion_del_mismo_dia_queda_para_el_resumen_siguiente(self):
        self.correr()
        hoy = votacion(2)
        hoy["tramitacion"]["_propio"]["fechaTramite"] = "2026-11-02"
        self.poner(votaciones=[votacion(1), hoy])
        self.correr(ahora=LUNES, resumen=True)
        self.assertEqual(self.textos("resumen"), [])
        self.correr(ahora="2026-11-09T12:00:00Z", resumen=True)
        self.assertEqual(len(self.textos("resumen")), 1)

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
        mensajes = en_mensajes("Encabezado", bloques)
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

    def poner_decisiones(self, *decisiones):
        carpeta = self.salida / "fuente" / "2023-2028"
        (carpeta / "decisiones-plenario.json").write_bytes(json_bytes({"seguidos": [], "decisiones": list(decisiones)}))

    def test_decisiones_existentes_no_se_envian_al_agregar_el_tipo(self):
        self.correr()
        self.poner_decisiones(decision(1))
        self.correr()
        self.assertEqual(self.enviados, [])
        self.assertEqual(self.registro()["iniciales"]["plenario"], [1])

    def test_decision_nueva_se_envia_con_las_votaciones(self):
        self.correr()
        self.poner_decisiones(decision(1))
        self.correr()
        self.poner_decisiones(decision(1), decision(2))
        self.correr()
        self.assertEqual(len(self.enviados), 1)
        tipo, texto = self.enviados[0]
        self.assertEqual(tipo, "votaciones")
        self.assertIn("sin votación nominal publicada", texto)
        self.assertIn("Plenario 2\n", texto)
        self.assertIn("Resultado oficial: RECHAZADO", texto)
        self.assertIn("Ana Pérez", texto)
        self.assertIn("https://silpy.test/expediente/502", texto)
        self.assertNotIn("Plenario 1", texto)
        self.correr()
        self.assertEqual(len(self.enviados), 1)

    def test_decision_con_votacion_nominal_no_se_repite(self):
        self.correr()
        self.poner_decisiones(decision(1))
        self.correr()
        nominal = votacion(9)
        nominal["tramitacion"]["idTramitacion"] = 2
        self.poner(votaciones=[votacion(1), nominal])
        self.poner_decisiones(decision(1), decision(2))
        self.correr()
        self.assertEqual(len(self.enviados), 1)
        self.assertIn("Votaciones nominales nuevas", self.enviados[0][1])
        self.assertNotIn("sin votación nominal publicada", self.enviados[0][1])

    def test_decision_nueva_entra_en_el_resumen_una_vez(self):
        self.correr()
        self.poner_decisiones(decision(1))
        self.correr()
        self.poner_decisiones(decision(1), decision(2))
        self.correr()
        self.enviados.clear()
        self.correr(ahora=LUNES, resumen=True)
        self.assertEqual(len(self.enviados), 1)
        self.assertEqual(self.enviados[0][0], "resumen")
        self.assertIn("sin votación nominal publicada (1)", self.enviados[0][1])
        self.assertIn("RECHAZADO, 1", self.enviados[0][1])
        self.enviados.clear()
        self.correr(ahora="2026-11-09T12:00:00Z", resumen=True)
        self.assertEqual(self.enviados, [])

    def test_rutas_iguales_a_las_del_sitio(self):
        rutas = (RAIZ / "sitio" / "src" / "lib" / "rutas.js").read_text(encoding="utf-8")
        self.assertIn('export const leyes = () => "/leyes/";', rutas)
        self.assertIn("export const ley = (numeroLey) => `/leyes/${encodeURIComponent(numeroLey)}/`;", rutas)
        self.assertIn('export const carpetaVotaciones = () => "/votacion/";', rutas)
        self.assertIn('export const votacionesNominales = () => "/legisladores/votaciones-nominales/";', rutas)
        self.assertTrue(sitio().startswith("https://"))


if __name__ == "__main__":
    unittest.main()
