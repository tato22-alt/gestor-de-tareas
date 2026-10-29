// Simulador de Telegram y Groq para las pruebas, y atajos para cargar datos.
import { env } from "cloudflare:test";
import { vi } from "vitest";

export const PAPA = 111;
export const TATO = 222;

/** Martes 27/10/2026 11:00 en Argentina, el día del spec. */
export const MARTES = new Date("2026-10-27T14:00:00Z");

export interface Enviado {
  chat_id: number;
  text: string;
  reply_parameters?: { message_id: number };
  message_id: number;
}

export function simular() {
  const estado = {
    enviados: [] as Enviado[],
    /** Respuestas del modelo, en orden. */
    modelo: [] as unknown[],
    pedidosAlModelo: [] as string[],
    transcripcion: "",
    groqCaido: false,
    telegramCaido: false,
    siguienteMessageId: 1000,
  };
  vi.spyOn(globalThis, "fetch").mockImplementation(async (entrada, init) => {
    const url = String(entrada instanceof Request ? entrada.url : entrada);
    if (url.includes("/sendMessage")) {
      if (estado.telegramCaido) return new Response("caído", { status: 502 });
      const cuerpo = JSON.parse(init!.body as string);
      const message_id = estado.siguienteMessageId++;
      estado.enviados.push({ ...cuerpo, message_id });
      return Response.json({ ok: true, result: { message_id } });
    }
    if (url.includes("/getFile")) return Response.json({ ok: true, result: { file_path: "voice/1.oga" } });
    if (url.includes("api.telegram.org/file/")) return new Response(new Uint8Array([1, 2, 3]));
    if (url.includes("api.groq.com")) {
      if (estado.groqCaido) return new Response("caído", { status: 503 });
      if (url.endsWith("/audio/transcriptions")) return Response.json({ text: estado.transcripcion });
      const cuerpo = JSON.parse(init!.body as string);
      estado.pedidosAlModelo.push(cuerpo.messages[1].content);
      const respuesta = estado.modelo.shift();
      if (respuesta === undefined) throw new Error("El modelo simulado no tiene más respuestas");
      return Response.json({ choices: [{ message: { content: JSON.stringify(respuesta) } }] });
    }
    throw new Error(`fetch no simulado: ${url}`);
  });
  return estado;
}

export async function limpiarBase() {
  await env.DB.batch(
    ["mensajes_salientes", "items", "capturas", "tareas_diarias", "contactos_permitidos"].map((t) => env.DB.prepare(`DELETE FROM ${t}`)),
  );
  await env.DB.batch([
    env.DB.prepare("INSERT INTO contactos_permitidos VALUES (?, 'Papá', 'papa')").bind(PAPA),
    env.DB.prepare("INSERT INTO contactos_permitidos VALUES (?, 'Tato', 'delegado')").bind(TATO),
  ]);
}

let siguienteEntrante = 1;

/** Carga una captura como si hubiera llegado por el webhook y devuelve su id. */
export async function nuevaCaptura(
  contenido: { texto: string } | { audio: string },
  opciones: { respondeA?: number; recibida?: Date; estado?: string } = {},
): Promise<number> {
  const fila = await env.DB.prepare(
    `INSERT INTO capturas (telegram_user_id, telegram_message_id, responde_a_message_id, tipo, texto, audio_file_id, recibida_en, estado)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
  )
    .bind(
      PAPA,
      siguienteEntrante++,
      opciones.respondeA ?? null,
      "texto" in contenido ? "texto" : "audio",
      "texto" in contenido ? contenido.texto : null,
      "audio" in contenido ? contenido.audio : null,
      (opciones.recibida ?? MARTES).toISOString(),
      opciones.estado ?? "pendiente",
    )
    .first<{ id: number }>();
  return fila!.id;
}

export async function nuevoItem(item: {
  tipo: string;
  texto: string;
  fecha_hora?: string | null;
  tiene_hora?: number;
  ambito?: string;
  actualizado_en?: string;
}): Promise<number> {
  const captura = await nuevaCaptura({ texto: item.texto }, { estado: "procesada" });
  const fila = await env.DB.prepare(
    `INSERT INTO items (captura_id, telegram_user_id, tipo, texto, fecha_hora, tiene_hora, ambito, creado_en, actualizado_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
  )
    .bind(
      captura,
      PAPA,
      item.tipo,
      item.texto,
      item.fecha_hora ?? null,
      item.tiene_hora ?? (item.fecha_hora ? 1 : 0),
      item.ambito ?? "sin_definir",
      MARTES.toISOString(),
      item.actualizado_en ?? MARTES.toISOString(),
    )
    .first<{ id: number }>();
  return fila!.id;
}

export async function items() {
  return (await env.DB.prepare("SELECT * FROM items ORDER BY id").all<Record<string, unknown>>()).results;
}

export async function captura(id: number) {
  return env.DB.prepare("SELECT * FROM capturas WHERE id = ?").bind(id).first<Record<string, unknown>>();
}

/** Ítem tal como lo propone el modelo, con valores por defecto. */
export function propuesto(item: Record<string, unknown>) {
  return { fecha: null, hora: null, dia_dicho: null, fecha_explicita: false, ambito: "sin_definir", ...item };
}
