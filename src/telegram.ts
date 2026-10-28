import type { Env } from "./env";

// Solo los campos de la Bot API que usa el asistente.
export interface Update {
  update_id: number;
  message?: Mensaje;
}

export interface Mensaje {
  message_id: number;
  date: number;
  from?: { id: number };
  chat: { id: number; type: string };
  text?: string;
  voice?: { file_id: string; duration: number };
  audio?: { file_id: string; duration: number };
  reply_to_message?: { message_id: number };
}

export async function esPermitido(db: D1Database, telegramUserId: number): Promise<boolean> {
  const fila = await db
    .prepare("SELECT 1 FROM contactos_permitidos WHERE telegram_user_id = ?")
    .bind(telegramUserId)
    .first();
  return fila !== null;
}

export class DestinatarioNoPermitido extends Error {
  constructor(telegramUserId: number) {
    super(`El usuario ${telegramUserId} no está en contactos_permitidos`);
  }
}

/**
 * Único punto de salida de mensajes. Rechaza cualquier destinatario que no sea
 * papá o un delegado dado de alta (principio 4, RF-11), aunque el resto del
 * código se equivoque. Devuelve el message_id del mensaje enviado.
 */
export async function enviarMensaje(
  env: Env,
  telegramUserId: number,
  texto: string,
  respondeA?: number,
): Promise<number> {
  if (!(await esPermitido(env.DB, telegramUserId))) throw new DestinatarioNoPermitido(telegramUserId);

  const respuesta = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      // En un chat privado, el id del chat es el del usuario.
      chat_id: telegramUserId,
      text: texto,
      ...(respondeA !== undefined && { reply_parameters: { message_id: respondeA, allow_sending_without_reply: true } }),
    }),
  });
  const cuerpo = (await respuesta.json()) as { ok: boolean; result?: { message_id: number }; description?: string };
  if (!cuerpo.ok || !cuerpo.result) throw new Error(`Telegram sendMessage falló: ${cuerpo.description ?? respuesta.status}`);
  return cuerpo.result.message_id;
}
