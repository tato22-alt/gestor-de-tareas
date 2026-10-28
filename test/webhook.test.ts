import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import { DestinatarioNoPermitido, enviarMensaje } from "../src/telegram";

const PAPA = 111;
const DESCONOCIDO = 999;

function update(mensaje: Record<string, unknown>, desde = PAPA, tipoDeChat = "private") {
  return {
    update_id: 1,
    message: { message_id: 50, date: 1_793_116_800, from: { id: desde }, chat: { id: desde, type: tipoDeChat }, ...mensaje },
  };
}

function enviar(cuerpo: unknown, secreto = "secreto-de-prueba") {
  const request = new Request<unknown, IncomingRequestCfProperties>("https://asistente.test/telegram", {
    method: "POST",
    headers: { "content-type": "application/json", "X-Telegram-Bot-Api-Secret-Token": secreto },
    body: JSON.stringify(cuerpo),
  });
  return worker.fetch(request, env);
}

async function capturas() {
  const { results } = await env.DB.prepare("SELECT * FROM capturas").all();
  return results;
}

let fetchTelegram: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM capturas"),
    env.DB.prepare("DELETE FROM contactos_permitidos"),
    env.DB.prepare("INSERT INTO contactos_permitidos VALUES (?, 'Papá', 'papa')").bind(PAPA),
  ]);
  fetchTelegram = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(Response.json({ ok: true, result: { message_id: 77 } }));
});

afterEach(() => vi.restoreAllMocks());

describe("webhook de Telegram", () => {
  it("rechaza pedidos sin el secreto del webhook", async () => {
    const respuesta = await enviar(update({ text: "hola" }), "otro");
    expect(respuesta.status).toBe(401);
    expect(await capturas()).toHaveLength(0);
  });

  it("guarda un audio de papá como captura pendiente", async () => {
    const respuesta = await enviar(update({ voice: { file_id: "AUDIO1", duration: 12 } }));
    expect(respuesta.status).toBe(200);
    expect(await capturas()).toMatchObject([
      { telegram_user_id: PAPA, tipo: "audio", audio_file_id: "AUDIO1", estado: "pendiente", texto: null },
    ]);
  });

  it("guarda un texto y a qué mensaje respondía (H2)", async () => {
    await enviar(update({ text: "no, era el viernes", reply_to_message: { message_id: 40 } }));
    expect(await capturas()).toMatchObject([{ tipo: "texto", texto: "no, era el viernes", responde_a_message_id: 40 }]);
  });

  it("no duplica la captura si Telegram reintenta el mismo mensaje", async () => {
    await enviar(update({ text: "comprar cartuchos" }));
    await enviar(update({ text: "comprar cartuchos" }));
    expect(await capturas()).toHaveLength(1);
  });

  it("ignora en silencio a quien no está permitido (RF-11)", async () => {
    const respuesta = await enviar(update({ text: "hola" }, DESCONOCIDO));
    expect(respuesta.status).toBe(200);
    expect(await capturas()).toHaveLength(0);
    expect(fetchTelegram).not.toHaveBeenCalled();
  });

  it("ignora grupos aunque escriba papá", async () => {
    await enviar(update({ text: "hola" }, PAPA, "group"));
    expect(await capturas()).toHaveLength(0);
  });

  it("a una foto le contesta que por ahora entiende audios y textos", async () => {
    await enviar(update({ photo: [{ file_id: "FOTO" }] }));
    expect(await capturas()).toHaveLength(0);
    const cuerpo = JSON.parse(fetchTelegram.mock.calls[0]![1]!.body as string);
    expect(cuerpo).toMatchObject({ chat_id: PAPA, text: "Por ahora entiendo audios y textos." });
  });
});

describe("enviarMensaje", () => {
  it("se niega a escribirle a alguien fuera de la lista (principio 4)", async () => {
    await expect(enviarMensaje(env, DESCONOCIDO, "hola")).rejects.toBeInstanceOf(DestinatarioNoPermitido);
    expect(fetchTelegram).not.toHaveBeenCalled();
  });

  it("devuelve el message_id para poder resolver citas después", async () => {
    expect(await enviarMensaje(env, PAPA, "Anotado")).toBe(77);
  });
});
