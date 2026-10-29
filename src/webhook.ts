import type { Env } from "./env";
import { procesarCaptura } from "./procesar";
import { enviarMensaje, esPermitido, type Update } from "./telegram";

const SOLO_AUDIOS_Y_TEXTOS = "Por ahora entiendo audios y textos.";

/**
 * Recibe los mensajes de Telegram. Guarda la captura y responde enseguida; el
 * procesamiento (transcribir, interpretar, confirmar) sigue en segundo plano.
 * Si falla, la captura queda pendiente y el cron la reintenta (RF-13).
 */
export async function manejarWebhook(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  procesar: typeof procesarCaptura = procesarCaptura,
): Promise<Response> {
  if (request.method !== "POST") return new Response(null, { status: 405 });
  if (request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.TELEGRAM_WEBHOOK_SECRET) {
    return new Response(null, { status: 401 });
  }

  let update: Update;
  try {
    update = await request.json();
  } catch {
    // Telegram reintenta lo que no recibe 200, y un cuerpo roto no se arregla reintentando.
    return new Response(null, { status: 200 });
  }

  const mensaje = update.message;
  // Solo chats privados de contactos permitidos. A los demás no se les contesta nada.
  if (!mensaje?.from || mensaje.chat.type !== "private" || !(await esPermitido(env.DB, mensaje.from.id))) {
    return new Response(null, { status: 200 });
  }

  const audio = mensaje.voice ?? mensaje.audio;
  if (!audio && mensaje.text === undefined) {
    await enviarMensaje(env, mensaje.from.id, SOLO_AUDIOS_Y_TEXTOS, mensaje.message_id);
    return new Response(null, { status: 200 });
  }

  const nueva = await env.DB.prepare(
    `INSERT OR IGNORE INTO capturas
       (telegram_user_id, telegram_message_id, responde_a_message_id, tipo, texto, audio_file_id, recibida_en)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
  )
    .bind(
      mensaje.from.id,
      mensaje.message_id,
      mensaje.reply_to_message?.message_id ?? null,
      audio ? "audio" : "texto",
      mensaje.text ?? null,
      audio?.file_id ?? null,
      new Date(mensaje.date * 1000).toISOString(),
    )
    .first<{ id: number }>();

  // Sin fila: Telegram reintentó un mensaje que ya teníamos.
  if (nueva) ctx.waitUntil(procesar(env, nueva.id));
  return new Response(null, { status: 200 });
}
