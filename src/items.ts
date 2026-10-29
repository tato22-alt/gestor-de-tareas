import type { Env } from "./env";
import { formatear } from "./fechas";
import { enviarMensaje } from "./telegram";

export type TipoItem = "evento" | "recordatorio" | "pendiente" | "nota";
export type Ambito = "concejo" | "taller" | "personal" | "sin_definir";

export interface Item {
  id: number;
  captura_id: number;
  telegram_user_id: number;
  tipo: TipoItem;
  texto: string;
  fecha_hora: string | null;
  tiene_hora: number;
  ambito: Ambito;
  estado: "abierto" | "hecho" | "borrado";
  aviso_enviado_en: string | null;
  creado_en: string;
  actualizado_en: string;
}

export type TipoSaliente = "confirmacion" | "pregunta" | "aviso" | "resumen" | "otro";

/** Una línea por ítem, igual en confirmaciones, avisos y resumen: "jue 29/10 10:00, reunión con…". */
export function lineaDeItem(item: Pick<Item, "tipo" | "texto" | "fecha_hora" | "tiene_hora">): string {
  if (item.fecha_hora) return `${formatear(new Date(item.fecha_hora), item.tiene_hora === 1)}, ${item.texto}`;
  return `${item.tipo === "nota" ? "Nota" : "Pendiente"}: ${item.texto}`;
}

/** "Anotado: x" para un ítem; con varios, una línea con viñeta por cada uno. */
export function lista(titulo: string, items: Parameters<typeof lineaDeItem>[0][]): string {
  if (items.length === 1) return `${titulo}: ${lineaDeItem(items[0]!)}`;
  return [`${titulo}:`, ...items.map((i) => `• ${lineaDeItem(i)}`)].join("\n");
}

export async function itemsPorId(db: D1Database, telegramUserId: number, ids: number[]): Promise<Item[]> {
  if (ids.length === 0) return [];
  const { results } = await db
    .prepare(
      `SELECT * FROM items WHERE telegram_user_id = ? AND estado != 'borrado'
       AND id IN (${ids.map(() => "?").join(",")}) ORDER BY id`,
    )
    .bind(telegramUserId, ...ids)
    .all<Item>();
  return results;
}

/** Ítems abiertos más recientes, para que el modelo pueda resolver "lo de Gómez". */
export async function itemsAbiertos(db: D1Database, telegramUserId: number, limite = 60): Promise<Item[]> {
  const { results } = await db
    .prepare("SELECT * FROM items WHERE telegram_user_id = ? AND estado = 'abierto' ORDER BY id DESC LIMIT ?")
    .bind(telegramUserId, limite)
    .all<Item>();
  return results.reverse();
}

/** Eventos con hora que caen a menos de una hora de `fechaHora` (H3.2). */
export async function choques(db: D1Database, telegramUserId: number, fechaHora: string, excluir: number[]): Promise<Item[]> {
  const t = new Date(fechaHora).getTime();
  const { results } = await db
    .prepare(
      `SELECT * FROM items WHERE telegram_user_id = ? AND estado = 'abierto' AND tipo = 'evento'
       AND tiene_hora = 1 AND fecha_hora > ? AND fecha_hora < ? ORDER BY fecha_hora`,
    )
    .bind(telegramUserId, new Date(t - 3_600_000).toISOString(), new Date(t + 3_600_000).toISOString())
    .all<Item>();
  return results.filter((i) => !excluir.includes(i.id));
}

/** Envía un mensaje y lo registra, para poder resolver después una respuesta que lo cite. */
export async function responder(
  env: Env,
  telegramUserId: number,
  texto: string,
  opciones: { tipo: TipoSaliente; ahora: Date; respondeA?: number; capturaId?: number; itemIds?: number[] },
): Promise<number> {
  const messageId = await enviarMensaje(env, telegramUserId, texto, opciones.respondeA);
  await env.DB.prepare(
    `INSERT INTO mensajes_salientes (telegram_user_id, telegram_message_id, captura_id, tipo, item_ids, enviado_en)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      telegramUserId,
      messageId,
      opciones.capturaId ?? null,
      opciones.tipo,
      JSON.stringify(opciones.itemIds ?? []),
      opciones.ahora.toISOString(),
    )
    .run();
  return messageId;
}
