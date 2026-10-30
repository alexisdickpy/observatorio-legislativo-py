// Pruebas del bot de Telegram (#66), con KV y Telegram simulados.
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import worker, { atender, suscriptores, TIPOS } from "../worker.js";

class KV {
  datos = new Map();
  async getWithMetadata(k) {
    return { value: this.datos.has(k) ? "" : null, metadata: this.datos.get(k) ?? null };
  }
  async put(k, _v, { metadata }) {
    this.datos.set(k, metadata);
  }
  async delete(k) {
    this.datos.delete(k);
  }
  async list() {
    return { keys: [...this.datos].map(([name, metadata]) => ({ name, metadata })), list_complete: true };
  }
}

let env;
let llamadas;
const fetchOriginal = globalThis.fetch;

beforeEach(() => {
  env = { SUSCRIPTORES: new KV(), TELEGRAM_TOKEN: "t", WEBHOOK_SECRETO: "w", CLAVE_ENVIO: "c", SITIO: "https://ejemplo.test" };
  llamadas = [];
  globalThis.fetch = async (url, opciones) => {
    llamadas.push({ metodo: url.split("/").pop(), cuerpo: JSON.parse(opciones.body) });
    return new Response("{}");
  };
});
afterEach(() => {
  globalThis.fetch = fetchOriginal;
});

const mensaje = (text, chat = 7, type = "private") => ({ message: { text, chat: { id: chat, type } } });
const toque = (data, chat = 7) => ({ callback_query: { id: "q", data, message: { message_id: 1, chat: { id: chat, type: "private" } } } });

test("/start suscribe con todos los avisos activados, muestra el menú y no guarda más que las preferencias", async () => {
  await atender(mensaje("/start"), env);
  assert.deepEqual(env.SUSCRIPTORES.datos.get("7"), { leyes: true, votaciones: true, proyectos: true, resumen: true });
  assert.equal(llamadas[0].metodo, "sendMessage");
  assert.equal(llamadas[0].cuerpo.reply_markup.inline_keyboard.length, TIPOS.length);
  assert.ok(llamadas[0].cuerpo.text.includes("/baja"));
});

test("/start de nuevo conserva lo elegido", async () => {
  await atender(mensaje("/start"), env);
  await atender(toque("t:votaciones"), env);
  await atender(mensaje("/start"), env);
  assert.equal(env.SUSCRIPTORES.datos.get("7").votaciones, false);
});

test("tocar una opción la cambia y actualiza el menú", async () => {
  await atender(mensaje("/start"), env);
  await atender(toque("t:resumen"), env);
  assert.equal(env.SUSCRIPTORES.datos.get("7").resumen, false);
  const edicion = llamadas.find((l) => l.metodo === "editMessageReplyMarkup");
  assert.ok(edicion.cuerpo.reply_markup.inline_keyboard.flat().some((b) => b.text.startsWith("⬜") && b.callback_data === "t:resumen"));
  await atender(toque("t:resumen"), env);
  assert.equal(env.SUSCRIPTORES.datos.get("7").resumen, true);
});

test("una opción desconocida no cambia nada", async () => {
  await atender(mensaje("/start"), env);
  const antes = { ...env.SUSCRIPTORES.datos.get("7") };
  await atender(toque("t:otra"), env);
  assert.deepEqual(env.SUSCRIPTORES.datos.get("7"), antes);
});

test("/baja y bloquear el bot borran el chat", async () => {
  await atender(mensaje("/start"), env);
  await atender(mensaje("/baja"), env);
  assert.equal(env.SUSCRIPTORES.datos.size, 0);
  await atender(mensaje("/start"), env);
  await atender({ my_chat_member: { chat: { id: 7 }, new_chat_member: { status: "kicked" } } }, env);
  assert.equal(env.SUSCRIPTORES.datos.size, 0);
});

test("los grupos se ignoran", async () => {
  await atender(mensaje("/start", -5, "group"), env);
  assert.equal(env.SUSCRIPTORES.datos.size, 0);
  assert.equal(llamadas.length, 0);
});

test("la lista de suscriptores trae el chat y sus avisos", async () => {
  await atender(mensaje("/start", 7), env);
  await atender(toque("t:proyectos", 7), env);
  assert.deepEqual(await suscriptores(env), [{ chat: 7, avisos: ["leyes", "votaciones", "resumen"] }]);
});

test("las rutas exigen sus claves", async () => {
  const pedir = (ruta, init) => worker.fetch(new Request(`https://bot.test${ruta}`, init), env);
  assert.equal((await pedir("/suscriptores")).status, 401);
  assert.equal((await pedir("/suscriptores", { headers: { authorization: "Bearer mala" } })).status, 401);
  assert.equal((await pedir("/suscriptores", { headers: { authorization: "Bearer c" } })).status, 200);
  assert.equal((await pedir("/telegram", { method: "POST", body: "{}" })).status, 401);
  const conClave = { method: "POST", body: JSON.stringify(mensaje("/start")), headers: { "x-telegram-bot-api-secret-token": "w" } };
  assert.equal((await pedir("/telegram", conClave)).status, 200);
  assert.equal(env.SUSCRIPTORES.datos.size, 1);
  const baja = { method: "POST", body: JSON.stringify({ chat: 7 }), headers: { authorization: "Bearer c" } };
  assert.equal((await pedir("/baja", baja)).status, 200);
  assert.equal(env.SUSCRIPTORES.datos.size, 0);
  assert.equal((await pedir("/otra")).status, 404);
});
