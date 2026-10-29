"""Cliente de la API: modo incremental y validación de respuestas, sin consultar la red."""

import json
import tempfile
import unittest
from pathlib import Path

from importador.api import Cliente, ErrorAPI, ListadoCambiado


def respuesta(datos, codigo=200):
    return json.dumps({"codigoEstado": codigo, "mensaje": "", "datos": datos}).encode("utf-8")


class ClienteSimulado(Cliente):
    """Responde desde un diccionario {(ruta, página): datos} y anota cada descarga."""

    def __init__(self, crudo, servidor, **kwargs):
        super().__init__(crudo, pausa=0, **kwargs)
        self.servidor = servidor
        self.descargas = []

    def _descargar(self, ruta, params):
        clave = (ruta, (params or {}).get("offset"))
        self.descargas.append(clave)
        self.consultas += 1
        if clave not in self.servidor:
            return respuesta(None, 404)
        valor = self.servidor[clave]
        return valor if isinstance(valor, bytes) else respuesta(valor)


def votaciones(desde, hasta):
    return [{"idVotacion": i} for i in range(desde, hasta)]


class Incremental(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.crudo = Path(self.tmp.name)
        # Listado de 7 votaciones en páginas de 3: [1-3] [4-6] [7].
        self.servidor = {
            ("votacion", 1): votaciones(1, 4),
            ("votacion", 2): votaciones(4, 7),
            ("votacion", 3): votaciones(7, 8),
            ("proyecto/5/tramitaciones", None): [{"idProyecto": 5}],
        }
        completo = ClienteSimulado(self.crudo, self.servidor)
        list(completo.paginar("votacion", 3, reutilizable=True, clave="idVotacion"))
        completo.datos("proyecto/5/tramitaciones", reutilizable=True)

    def tearDown(self):
        self.tmp.cleanup()

    def ids(self, cliente):
        return [v["idVotacion"] for v in cliente.paginar("votacion", 3, reutilizable=True, clave="idVotacion")]

    def test_completo_descarga_todo_de_nuevo(self):
        cliente = ClienteSimulado(self.crudo, self.servidor)
        self.assertEqual(self.ids(cliente), list(range(1, 8)))
        cliente.datos("proyecto/5/tramitaciones", reutilizable=True)
        self.assertEqual(len(cliente.descargas), 4)
        self.assertEqual(cliente.reutilizadas, 0)

    def test_incremental_descarga_desde_la_ultima_pagina_completa(self):
        self.servidor[("votacion", 3)] = votaciones(7, 10)
        self.servidor[("votacion", 4)] = votaciones(10, 11)
        cliente = ClienteSimulado(self.crudo, self.servidor, incremental=True)
        self.assertEqual(self.ids(cliente), list(range(1, 11)))
        # La página 1 se reutiliza; la 2 se vuelve a pedir como testigo; la 3 y la 4 son nuevas.
        self.assertEqual(cliente.descargas, [("votacion", 2), ("votacion", 3), ("votacion", 4)])
        self.assertEqual(cliente.reutilizadas, 1)

    def test_incremental_reutiliza_el_detalle_de_proyectos_conocidos(self):
        cliente = ClienteSimulado(self.crudo, self.servidor, incremental=True)
        self.assertEqual(cliente.datos("proyecto/5/tramitaciones", reutilizable=True), [{"idProyecto": 5}])
        self.assertEqual(cliente.datos("proyecto/6/tramitaciones", reutilizable=True), [])
        self.assertEqual(cliente.descargas, [("proyecto/6/tramitaciones", None)])
        # Lo no reutilizable se descarga siempre.
        cliente.datos("periodo")
        self.assertEqual(cliente.descargas[-1], ("periodo", None))

    def test_guardada_se_reutiliza_en_cualquier_modo(self):
        self.servidor[("legislador/1/expedientes", None)] = [{"proyectos": []}]
        ClienteSimulado(self.crudo, self.servidor).datos("legislador/1/expedientes")
        cliente = ClienteSimulado(self.crudo, self.servidor)
        self.assertEqual(cliente.datos("legislador/1/expedientes", guardada=True), [{"proyectos": []}])
        self.assertEqual(cliente.datos("legislador/2/expedientes", guardada=True), [])
        # Solo se descarga la que no estaba guardada.
        self.assertEqual(cliente.descargas, [("legislador/2/expedientes", None)])

    def test_incremental_detecta_un_listado_que_cambio_por_el_medio(self):
        # Se borró la votación 2: todo se corre un lugar y la página testigo ya no coincide.
        self.servidor[("votacion", 1)] = [{"idVotacion": i} for i in (1, 3, 4)]
        self.servidor[("votacion", 2)] = votaciones(5, 8)
        self.servidor[("votacion", 3)] = []
        cliente = ClienteSimulado(self.crudo, self.servidor, incremental=True)
        with self.assertRaises(ListadoCambiado):
            self.ids(cliente)
        cliente.pasar_a_completo()
        self.assertEqual(self.ids(cliente), [1, 3, 4, 5, 6, 7])

    def test_respuesta_rota_no_queda_guardada(self):
        self.servidor[("periodo", None)] = b"<html>Error</html>"
        cliente = ClienteSimulado(self.crudo, self.servidor)
        with self.assertRaises(ErrorAPI):
            cliente.datos("periodo")
        self.assertFalse((self.crudo / "periodo.json").exists())

    def test_codigo_inesperado(self):
        self.servidor[("periodo", None)] = json.dumps({"codigoEstado": 500, "datos": None}).encode()
        with self.assertRaises(ErrorAPI):
            ClienteSimulado(self.crudo, self.servidor).datos("periodo")


if __name__ == "__main__":
    unittest.main()
