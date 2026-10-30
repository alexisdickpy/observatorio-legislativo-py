// Bot de Telegram del Observatorio Legislativo (#66), como Cloudflare Worker.
//
// - Recibe los mensajes del bot (webhook de Telegram en /telegram) y deja que cada persona elija sus
//   avisos con un menú: leyes nuevas, votaciones de proyectos de ley, proyectos de ley presentados y
//   resumen semanal.
// - Guarda en Cloudflare KV (SUSCRIPTORES) solo el número de chat y los avisos elegidos, como metadatos
//   de una clave por chat. Ningún nombre, usuario ni teléfono. /baja, o bloquear el bot, borra la clave.
// - Los avisos no salen de aquí: los envía la sincronización diaria de GitHub Actions
//   (importador/avisos.py), que pide la lista a /suscriptores y avisa de los chats que bloquearon el bot
//   en /baja. Ambas rutas exigen la clave CLAVE_ENVIO.
//
// Secretos del Worker: TELEGRAM_TOKEN, WEBHOOK_SECRETO (el que Telegram envía en cada mensaje) y
// CLAVE_ENVIO. Variable: SITIO (dirección pública del sitio).

export const TIPOS = [
  { id: "leyes", nombre: "Leyes nuevas sancionadas" },
  { id: "votaciones", nombre: "Votaciones nominales de proyectos de ley" },
  { id: "proyectos", nombre: "Proyectos de ley presentados, con sus autores" },
  { id: "resumen", nombre: "Resumen de la semana anterior (los lunes al mediodía)" },
];
const INICIALES = { leyes: true, votaciones: true, proyectos: true, resumen: true };
const CITA = "Origen de los datos: Datos Abiertos Poder Legislativo.";

export const textoBienvenida = (sitio) =>
  "Hola. Este bot avisa de la actividad del Congreso Nacional del Paraguay con los datos que publica el " +
  "propio Congreso.\n\nTodos los avisos están activados. Tocá abajo los que no quieras recibir. Podés cambiarlos cuando quieras con /avisos " +
  "y dejar de recibir todo con /baja.\n\nSolo se guarda el número de este chat y los avisos elegidos. " +
  `Más información en ${sitio}/metodologia/\n\n${CITA}`;
const TEXTO_MENU = "Tocá cada aviso para activarlo o desactivarlo.";
const TEXTO_BAJA = "Listo, ya no vas a recibir avisos y se borró este chat de la lista. Para volver, escribí /start.";
const TEXTO_AYUDA =
  "/avisos para elegir qué avisos recibir.\n/baja para dejar de recibirlos y borrar este chat de la lista.";

/** Teclado del menú, con la marca de cada aviso según las preferencias. */
export const teclado = (prefs) => ({
  inline_keyboard: TIPOS.map((t) => [{ text: `${prefs[t.id] ? "✅" : "⬜"} ${t.nombre}`, callback_data: `t:${t.id}` }]),
});

const leer = async (env, chat) => {
  const { metadata } = await env.SUSCRIPTORES.getWithMetadata(String(chat));
  return metadata ?? null;
};
const guardar = (env, chat, prefs) => env.SUSCRIPTORES.put(String(chat), "", { metadata: prefs });
const borrar = (env, chat) => env.SUSCRIPTORES.delete(String(chat));

async function telegram(env, metodo, cuerpo) {
  const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/${metodo}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  return r.ok;
}

/** Atiende un mensaje (update) de Telegram. */
export async function atender(update, env) {
  const miembro = update.my_chat_member;
  if (miembro) {
    if (["kicked", "left"].includes(miembro.new_chat_member?.status)) await borrar(env, miembro.chat.id);
    return;
  }

  const consulta = update.callback_query;
  if (consulta) {
    const chat = consulta.message?.chat;
    const tipo = (consulta.data ?? "").replace(/^t:/, "");
    if (chat?.type === "private" && TIPOS.some((t) => t.id === tipo)) {
      const prefs = { ...INICIALES, ...((await leer(env, chat.id)) ?? {}) };
      prefs[tipo] = !prefs[tipo];
      await guardar(env, chat.id, prefs);
      await telegram(env, "editMessageReplyMarkup", {
        chat_id: chat.id,
        message_id: consulta.message.message_id,
        reply_markup: teclado(prefs),
      });
    }
    await telegram(env, "answerCallbackQuery", { callback_query_id: consulta.id });
    return;
  }

  const mensaje = update.message;
  if (!mensaje || mensaje.chat?.type !== "private") return;
  const chat = mensaje.chat.id;
  const comando = (mensaje.text ?? "").trim().split(/[\s@]/)[0].toLowerCase();
  if (comando === "/start") {
    const prefs = (await leer(env, chat)) ?? INICIALES;
    await guardar(env, chat, prefs);
    await telegram(env, "sendMessage", { chat_id: chat, text: textoBienvenida(env.SITIO), reply_markup: teclado(prefs), disable_web_page_preview: true });
  } else if (comando === "/avisos") {
    const prefs = await leer(env, chat);
    if (!prefs) await telegram(env, "sendMessage", { chat_id: chat, text: "Para empezar, escribí /start." });
    else await telegram(env, "sendMessage", { chat_id: chat, text: TEXTO_MENU, reply_markup: teclado(prefs) });
  } else if (comando === "/baja") {
    await borrar(env, chat);
    await telegram(env, "sendMessage", { chat_id: chat, text: TEXTO_BAJA });
  } else {
    await telegram(env, "sendMessage", { chat_id: chat, text: TEXTO_AYUDA });
  }
}

/** Lista de suscriptores con sus avisos, para la sincronización. */
export async function suscriptores(env) {
  const lista = [];
  let cursor;
  do {
    const pagina = await env.SUSCRIPTORES.list({ cursor });
    for (const k of pagina.keys) lista.push({ chat: Number(k.name), avisos: TIPOS.map((t) => t.id).filter((id) => k.metadata?.[id]) });
    cursor = pagina.list_complete ? undefined : pagina.cursor;
  } while (cursor);
  return lista;
}

const autorizado = (request, clave) => Boolean(clave) && request.headers.get("authorization") === `Bearer ${clave}`;
const json = (datos, status = 200) => new Response(JSON.stringify(datos), { status, headers: { "content-type": "application/json" } });

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (request.method === "POST" && pathname === "/telegram") {
      if (!env.WEBHOOK_SECRETO || request.headers.get("x-telegram-bot-api-secret-token") !== env.WEBHOOK_SECRETO) {
        return new Response("No autorizado", { status: 401 });
      }
      await atender(await request.json(), env);
      return new Response("ok");
    }
    if (pathname === "/suscriptores" || pathname === "/baja") {
      if (!autorizado(request, env.CLAVE_ENVIO)) return new Response("No autorizado", { status: 401 });
      if (request.method === "GET" && pathname === "/suscriptores") return json({ suscriptores: await suscriptores(env) });
      if (request.method === "POST" && pathname === "/baja") {
        const { chat } = await request.json();
        if (!Number.isInteger(chat)) return json({ error: "chat inválido" }, 400);
        await borrar(env, chat);
        return json({ ok: true });
      }
    }
    return new Response("No encontrado", { status: 404 });
  },
};
