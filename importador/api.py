"""Cliente de la API de Datos Abiertos Legislativos (v2).

Cada respuesta se guarda cruda en una carpeta local (por defecto tmp/importador/crudo/,
que no se sube al repositorio). En modo sin red, el cliente lee de esa carpeta en lugar
de consultar la API: sirve para desarrollar y para repetir una importación exacta.

En modo incremental (sincronización diaria), las consultas marcadas como reutilizables
se leen de esa carpeta si ya están guardadas: el detalle de los proyectos ya conocidos y las
páginas completas del listado de votaciones. Todo lo demás se descarga de nuevo.

Las consultas marcadas como `guardada` se leen de esa carpeta en cualquier modo, si ya están:
los expedientes de cada legislador solo se descargan de nuevo el día de su actualización.

Los nombres de archivo siguen el mismo formato que la caché de la auditoría
(scripts/auditoria/api.py), así que esa caché también sirve como carpeta de crudos.
"""

import http.client
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BASE = "https://datosv2.congreso.gov.py/web/api"
USER_AGENT = "observatorio-legislativo-py/importador (+https://github.com/alexisdickpy/observatorio-legislativo-py)"
PAUSA = 0.3  # segundos entre consultas, para no sobrecargar el servidor


class ErrorAPI(RuntimeError):
    """La API no respondió o respondió algo inesperado."""


class ListadoCambiado(ErrorAPI):
    """En modo incremental, las páginas guardadas de un listado ya no coinciden con la API."""


def nombre_archivo(ruta, params=None):
    nombre = ruta.strip("/").replace("/", "_")
    if params:
        nombre += "__" + "_".join(f"{k}-{v}" for k, v in sorted(params.items()))
    return f"{nombre}.json"


class Cliente:
    def __init__(self, crudo, sin_red=False, incremental=False, pausa=PAUSA, reintentos=3):
        self.crudo = Path(crudo)
        self.sin_red = sin_red
        self.incremental = incremental
        self.pausa = pausa
        self.reintentos = reintentos
        self.consultas = 0
        self.reutilizadas = 0
        self._memoria = {}

    def pasar_a_completo(self):
        """Deja de reutilizar respuestas guardadas, también las ya leídas en esta ejecución."""
        self.incremental = False
        self._memoria = {}

    def obtener(self, ruta, params=None, reutilizable=False, guardada=False):
        """Devuelve el envoltorio completo ({codigoEstado, mensaje, datos}) de una ruta.

        Una respuesta 404 con cuerpo JSON ("Dato/s no encontrado/s") se devuelve como
        cualquier otra: `datos` vale None. Dentro de una misma ejecución, cada ruta se
        consulta una sola vez. Con `reutilizable` y modo incremental, si la respuesta ya
        está guardada se usa esa en lugar de consultar la API; con `guardada`, en cualquier modo.
        """
        archivo = self.crudo / nombre_archivo(ruta, params)
        if archivo in self._memoria:
            return self._memoria[archivo]
        if self.sin_red or ((guardada or self.incremental and reutilizable) and archivo.exists()):
            if not archivo.exists():
                raise ErrorAPI(f"Falta {archivo.name} en {self.crudo} (modo sin red)")
            respuesta = self._validar(ruta, archivo.read_bytes())
            if not self.sin_red:
                self.reutilizadas += 1
        else:
            cuerpo = self._descargar(ruta, params)
            respuesta = self._validar(ruta, cuerpo)
            # Se guarda después de validar: una respuesta rota no queda en la caché.
            self.crudo.mkdir(parents=True, exist_ok=True)
            archivo.write_bytes(cuerpo)
        self._memoria[archivo] = respuesta
        return respuesta

    def datos(self, ruta, params=None, reutilizable=False, guardada=False):
        """Atajo: solo la lista `datos` (vacía si la API respondió 404)."""
        return self.obtener(ruta, params, reutilizable, guardada).get("datos") or []

    def paginar(self, ruta, tam_pagina, reutilizable=False, clave=None):
        """Recorre un listado paginado. En esta API `offset` es el número de página (desde 1).

        Las páginas no se guardan en memoria entre llamadas: el listado de votaciones con
        sus votos pesa más de 100 MB.

        Con `reutilizable` y modo incremental, el listado debe estar ordenado por `clave`
        en forma creciente y solo crecer por el final (así se comporta /votacion). Se
        reutilizan las páginas completas ya guardadas y se descarga desde la última de
        ellas en adelante. Esa última página sirve de testigo: si sus identificadores no
        coinciden con los guardados, el listado cambió por el medio y se lanza
        ListadoCambiado.
        """
        pagina = 1
        if self.incremental and reutilizable and not self.sin_red:
            completas = 0
            while len(self._pagina_guardada(ruta, tam_pagina, completas + 1) or ()) == tam_pagina:
                completas += 1
            if completas:
                guardados = [x.get(clave) for x in self._pagina_guardada(ruta, tam_pagina, completas)]
                testigo = self._pagina(ruta, tam_pagina, completas)
                if [x.get(clave) for x in testigo] != guardados:
                    raise ListadoCambiado(f"La página {completas} de {ruta} cambió desde la última descarga")
                for anterior in range(1, completas):
                    self.reutilizadas += 1
                    yield from self._pagina_guardada(ruta, tam_pagina, anterior)
                yield from testigo
                if len(testigo) < tam_pagina:
                    return
                pagina = completas + 1
        while True:
            datos = self._pagina(ruta, tam_pagina, pagina)
            yield from datos
            if len(datos) < tam_pagina:
                return
            pagina += 1

    def _pagina(self, ruta, tam_pagina, pagina):
        params = {"limit": tam_pagina, "offset": pagina}
        respuesta = self.obtener(ruta, params)
        self._memoria.pop(self.crudo / nombre_archivo(ruta, params), None)
        return respuesta.get("datos") or []

    def _pagina_guardada(self, ruta, tam_pagina, pagina):
        archivo = self.crudo / nombre_archivo(ruta, {"limit": tam_pagina, "offset": pagina})
        if not archivo.exists():
            return None
        return self._validar(ruta, archivo.read_bytes()).get("datos") or []

    @staticmethod
    def _validar(ruta, cuerpo):
        try:
            respuesta = json.loads(cuerpo.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as e:
            raise ErrorAPI(f"{ruta}: la respuesta no es JSON válido ({e})") from None
        if not isinstance(respuesta, dict) or respuesta.get("codigoEstado") not in (200, 404):
            estado = respuesta.get("codigoEstado") if isinstance(respuesta, dict) else None
            raise ErrorAPI(f"{ruta}: codigoEstado inesperado {estado}")
        return respuesta

    def archivo(self, url):
        """Descarga un archivo que no es una respuesta de la API (una foto). No se guarda en la caché."""
        if self.sin_red:
            raise ErrorAPI(f"No se puede descargar {url} en modo sin red")
        return self._descargar_url(url, json_404=False)

    def _descargar(self, ruta, params):
        url = f"{BASE}/{ruta.strip('/')}"
        if params:
            url += "?" + urllib.parse.urlencode(params)
        return self._descargar_url(url, json_404=True)

    def _descargar_url(self, url, json_404):
        ultimo_error = None
        for intento in range(self.reintentos):
            try:
                peticion = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
                with urllib.request.urlopen(peticion, timeout=300) as r:
                    cuerpo = r.read()
                break
            except urllib.error.HTTPError as e:
                # La API responde 404 con un cuerpo JSON válido cuando no hay datos.
                cuerpo = e.read()
                if json_404 and e.code == 404 and cuerpo.strip().startswith(b"{"):
                    break
                ultimo_error = e
            # OSError cubre URLError, TimeoutError y ConnectionError; HTTPException, las
            # respuestas cortadas a mitad de camino (IncompleteRead).
            except (OSError, http.client.HTTPException) as e:
                ultimo_error = e
            time.sleep(2 * (intento + 1))
        else:
            raise ErrorAPI(f"No se pudo obtener {url}: {ultimo_error}")
        self.consultas += 1
        time.sleep(self.pausa)
        return cuerpo
