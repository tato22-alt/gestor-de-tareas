import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { alCron } from "../src/cron";
import { procesarCaptura, RESPUESTAS } from "../src/procesar";
import { captura, items, limpiarBase, MARTES, nuevaCaptura, nuevoItem, PAPA, propuesto, simular } from "./ayuda";

const REUNION = propuesto({
  tipo: "evento",
  texto: "reunión con secretario de Obras (desagües Paseo 115)",
  fecha: "2026-10-29",
  hora: "10:00",
  dia_dicho: "jueves",
  ambito: "concejo",
});

let sim: ReturnType<typeof simular>;

beforeEach(async () => {
  await limpiarBase();
  sim = simular();
});

afterEach(() => vi.restoreAllMocks());

const minutos = (n: number) => new Date(MARTES.getTime() + n * 60_000);
const ultimo = () => sim.enviados.at(-1)!;

describe("H1. Capturar por audio", () => {
  it("H1.1: transcribe, anota el evento y confirma con fecha explícita", async () => {
    sim.transcripcion = "el jueves a las diez tengo reunión con el secretario de Obras por los desagües del Paseo 115";
    sim.modelo.push({ accion: "capturar", items: [REUNION] });
    const id = await nuevaCaptura({ audio: "AUDIO1" });

    await procesarCaptura(env, id, MARTES);

    expect(ultimo()).toMatchObject({
      chat_id: PAPA,
      text: "Anotado: jue 29/10 10:00, reunión con secretario de Obras (desagües Paseo 115)",
      reply_parameters: { message_id: expect.any(Number) },
    });
    expect(await items()).toMatchObject([
      { tipo: "evento", fecha_hora: "2026-10-29T13:00:00.000Z", tiene_hora: 1, ambito: "concejo", estado: "abierto" },
    ]);
    expect(await captura(id)).toMatchObject({ estado: "procesada", transcripcion: sim.transcripcion });
    // El modelo recibe el calendario para no calcular fechas de memoria.
    expect(sim.pedidosAlModelo[0]).toContain("jue 29/10 = 2026-10-29");
  });

  it("H1.2: separa tres cosas en tres ítems confirmados en un solo mensaje", async () => {
    sim.modelo.push({
      accion: "capturar",
      items: [
        propuesto({ tipo: "pendiente", texto: "llamar a Gómez por el presupuesto" }),
        propuesto({ tipo: "pendiente", texto: "comprar cartuchos" }),
        propuesto({ tipo: "recordatorio", texto: "vence el seguro del auto", fecha: "2026-11-02", dia_dicho: "lunes", ambito: "personal" }),
      ],
    });
    await procesarCaptura(env, await nuevaCaptura({ texto: "llamar a Gómez…" }), MARTES);

    expect(sim.enviados).toHaveLength(1);
    expect(ultimo().text).toBe(
      "Anotado:\n• Pendiente: llamar a Gómez por el presupuesto\n• Pendiente: comprar cartuchos\n• lun 02/11, vence el seguro del auto",
    );
    expect(await items()).toHaveLength(3);
  });

  it("H1.3: un pendiente sin fecha queda sin fecha", async () => {
    sim.modelo.push({ accion: "capturar", items: [propuesto({ tipo: "pendiente", texto: "averiguar lo del subsidio de la cooperativa" })] });
    await procesarCaptura(env, await nuevaCaptura({ texto: "tengo que averiguar…" }), MARTES);

    expect(ultimo().text).toBe("Anotado: Pendiente: averiguar lo del subsidio de la cooperativa");
    expect(await items()).toMatchObject([{ fecha_hora: null }]);
  });

  it("H1.4: si no se entiende, pide que lo repita y no guarda nada", async () => {
    sim.transcripcion = "eh… shhh… viento";
    sim.modelo.push({ accion: "no_entendido" });
    const id = await nuevaCaptura({ audio: "RUIDO" });
    await procesarCaptura(env, id, MARTES);

    expect(ultimo().text).toBe(RESPUESTAS.noEntendido);
    expect(await items()).toHaveLength(0);
    expect(await captura(id)).toMatchObject({ estado: "descartada" });
  });

  it("un audio vacío no llega al modelo", async () => {
    sim.transcripcion = "";
    await procesarCaptura(env, await nuevaCaptura({ audio: "MUDO" }), MARTES);
    expect(ultimo().text).toBe(RESPUESTAS.noEntendido);
    expect(sim.pedidosAlModelo).toHaveLength(0);
  });

  it("RF-15: lo fuera de alcance recibe una línea", async () => {
    sim.modelo.push({ accion: "fuera_de_alcance" });
    await procesarCaptura(env, await nuevaCaptura({ texto: "¿cómo salió Boca?" }), MARTES);
    expect(ultimo().text).toBe(RESPUESTAS.fueraDeAlcance);
  });
});

describe("RF-08. Pregunta antes de guardar si duda de la fecha", () => {
  it("si el día dicho no coincide con el número, pregunta y no guarda; con la respuesta, guarda", async () => {
    sim.modelo.push({ accion: "capturar", items: [{ ...REUNION, dia_dicho: "viernes" }] });
    await procesarCaptura(env, await nuevaCaptura({ texto: "el viernes a las diez reunión con Obras" }), MARTES);

    expect(ultimo().text).toBe("¿“reunión con secretario de Obras (desagües Paseo 115)” es el vie 30/10 o el jue 29/10?");
    expect(await items()).toHaveLength(0);

    sim.modelo.push({ accion: "capturar", items: [{ ...REUNION, fecha: "2026-10-30", dia_dicho: "viernes" }] });
    await procesarCaptura(env, await nuevaCaptura({ texto: "el viernes" }), minutos(1));

    expect(sim.pedidosAlModelo[1]).toContain('Mensaje original que la motivó: "el viernes a las diez reunión con Obras"');
    expect(ultimo().text).toBe("Anotado: vie 30/10 10:00, reunión con secretario de Obras (desagües Paseo 115)");
    expect(await items()).toHaveLength(1);
  });

  it('"el martes" dicho un martes pregunta si es hoy o el de la semana que viene', async () => {
    sim.modelo.push({ accion: "capturar", items: [propuesto({ tipo: "evento", texto: "turno médico", fecha: "2026-10-27", hora: "18:00", dia_dicho: "martes" })] });
    await procesarCaptura(env, await nuevaCaptura({ texto: "el martes a las 18 turno médico" }), MARTES);
    expect(ultimo().text).toBe("¿“turno médico” es hoy mar 27/10 o el mar 03/11?");
  });

  it("un evento sin día pregunta qué día es", async () => {
    sim.modelo.push({ accion: "capturar", items: [propuesto({ tipo: "evento", texto: "reunión con la cooperativa", hora: "10:00" })] });
    await procesarCaptura(env, await nuevaCaptura({ texto: "reunión con la cooperativa a las 10" }), MARTES);
    expect(ultimo().text).toBe("¿Qué día es “reunión con la cooperativa”?");
  });

  it("una fecha que ya pasó se pregunta", async () => {
    sim.modelo.push({ accion: "capturar", items: [propuesto({ tipo: "recordatorio", texto: "llamar a la escuela", fecha: "2026-10-26", hora: "17:00" })] });
    await procesarCaptura(env, await nuevaCaptura({ texto: "…" }), MARTES);
    expect(ultimo().text).toBe("“llamar a la escuela” me quedó para el lun 26/10 17:00, que ya pasó. ¿Para cuándo es?");
  });

  it("la pregunta del modelo se manda tal cual", async () => {
    sim.modelo.push({ accion: "preguntar", pregunta: "¿Con qué Gómez?" });
    await procesarCaptura(env, await nuevaCaptura({ texto: "reunión con Gómez el jueves" }), MARTES);
    expect(ultimo().text).toBe("¿Con qué Gómez?");
  });
});

describe("H3.2. Choques", () => {
  it("avisa al confirmar si el evento choca con otro", async () => {
    await nuevoItem({ tipo: "evento", texto: "visita a la escuela 3", fecha_hora: "2026-10-29T13:00:00.000Z" });
    sim.modelo.push({ accion: "capturar", items: [{ ...REUNION, hora: "10:30" }] });
    await procesarCaptura(env, await nuevaCaptura({ texto: "…" }), MARTES);
    expect(ultimo().text).toBe(
      "Anotado: jue 29/10 10:30, reunión con secretario de Obras (desagües Paseo 115)\nOjo: choca con jue 29/10 10:00, visita a la escuela 3",
    );
  });

  it("no avisa si hay más de una hora de diferencia", async () => {
    await nuevoItem({ tipo: "evento", texto: "visita a la escuela 3", fecha_hora: "2026-10-29T15:00:00.000Z" });
    sim.modelo.push({ accion: "capturar", items: [REUNION] });
    await procesarCaptura(env, await nuevaCaptura({ texto: "…" }), MARTES);
    expect(ultimo().text).not.toContain("Ojo");
  });
});

describe("H2. Corregir y deshacer hablando", () => {
  async function anotarReunion() {
    sim.modelo.push({ accion: "capturar", items: [REUNION] });
    await procesarCaptura(env, await nuevaCaptura({ texto: "el jueves a las diez reunión con Obras" }), MARTES);
    return { confirmacion: ultimo().message_id, itemId: (await items())[0]!.id as number };
  }

  it("H2.1: citando la confirmación, corrige ese ítem y reconfirma con la fecha nueva", async () => {
    const { confirmacion, itemId } = await anotarReunion();
    sim.modelo.push({ accion: "corregir", item_ids: [itemId], cambios: { fecha: "2026-10-30", dia_dicho: "viernes" } });
    await procesarCaptura(env, await nuevaCaptura({ texto: "no, era el viernes" }, { respondeA: confirmacion }), minutos(1));

    expect(sim.pedidosAlModelo[1]).toContain(`Cita este mensaje del asistente, con estos ítems:\nid ${itemId}`);
    expect(ultimo().text).toBe("Corregido: vie 30/10 10:00, reunión con secretario de Obras (desagües Paseo 115)");
    expect(await items()).toMatchObject([{ fecha_hora: "2026-10-30T13:00:00.000Z", tiene_hora: 1 }]);
  });

  it("H2.2: sin citar, \"borrá eso\" borra la última captura y dice qué borró", async () => {
    await anotarReunion();
    sim.modelo.push({ accion: "borrar", item_ids: [] });
    await procesarCaptura(env, await nuevaCaptura({ texto: "borrá eso" }), minutos(1));

    expect(ultimo().text).toBe("Borrado: jue 29/10 10:00, reunión con secretario de Obras (desagües Paseo 115)");
    expect(await items()).toMatchObject([{ estado: "borrado" }]);
  });

  it("H2.3: \"lo de Gómez ya está\" con dos opciones pregunta cuál, y con la respuesta lo marca hecho", async () => {
    const presupuesto = await nuevoItem({ tipo: "pendiente", texto: "llamar a Gómez por el presupuesto" });
    const repuestos = await nuevoItem({ tipo: "pendiente", texto: "pasarle a Gómez los repuestos" });
    sim.modelo.push({ accion: "marcar_hecho", item_ids: [presupuesto, repuestos] });
    await procesarCaptura(env, await nuevaCaptura({ texto: "lo de Gómez ya está" }), MARTES);

    expect(ultimo().text).toBe("¿Cuál?\n1. Pendiente: llamar a Gómez por el presupuesto\n2. Pendiente: pasarle a Gómez los repuestos");

    sim.modelo.push({ accion: "marcar_hecho", item_ids: [presupuesto] });
    await procesarCaptura(env, await nuevaCaptura({ texto: "el primero" }), minutos(1));

    expect(sim.pedidosAlModelo[1]).toContain(`Opciones de esa pregunta:\nid ${presupuesto}`);
    expect(ultimo().text).toBe("Hecho: Pendiente: llamar a Gómez por el presupuesto");
    expect(await items()).toMatchObject([{ estado: "hecho" }, { estado: "abierto" }]);
  });

  it("con una sola opción la marca hecha directo", async () => {
    const id = await nuevoItem({ tipo: "pendiente", texto: "llamar a Gómez por el presupuesto" });
    sim.modelo.push({ accion: "marcar_hecho", item_ids: [id] });
    await procesarCaptura(env, await nuevaCaptura({ texto: "lo de Gómez ya está" }), MARTES);
    expect(ultimo().text).toBe("Hecho: Pendiente: llamar a Gómez por el presupuesto");
  });

  it("ignora ids que el modelo invente", async () => {
    sim.modelo.push({ accion: "marcar_hecho", item_ids: [9999] });
    await procesarCaptura(env, await nuevaCaptura({ texto: "lo de Pérez ya está" }), MARTES);
    expect(ultimo().text).toBe(RESPUESTAS.nadaAbierto);
  });
});

describe("RF-13. No pierde capturas", () => {
  it("si Groq está caído queda pendiente, y el cron la procesa al volver con una disculpa", async () => {
    sim.groqCaido = true;
    const id = await nuevaCaptura({ audio: "AUDIO1" });
    await procesarCaptura(env, id, MARTES);
    expect(await captura(id)).toMatchObject({ estado: "pendiente", intentos: 1 });
    expect(sim.enviados).toHaveLength(0);

    sim.groqCaido = false;
    sim.transcripcion = "el jueves a las diez reunión con Obras";
    sim.modelo.push({ accion: "capturar", items: [REUNION] });
    await alCron(env, minutos(6));

    expect(ultimo().text).toBe("Perdón la demora. Anotado: jue 29/10 10:00, reunión con secretario de Obras (desagües Paseo 115)");
    expect(await captura(id)).toMatchObject({ estado: "procesada", intentos: 2 });
  });

  it("a los 10 minutos avisa una sola vez que lo tiene", async () => {
    sim.groqCaido = true;
    const id = await nuevaCaptura({ audio: "AUDIO1" });
    await procesarCaptura(env, id, MARTES);
    await alCron(env, minutos(11));
    await alCron(env, minutos(14));
    expect(sim.enviados.map((e) => e.text)).toEqual([RESPUESTAS.demora]);
    expect(await captura(id)).toMatchObject({ estado: "pendiente", demora_avisada: 1 });
  });

  it("si falla el envío de la confirmación, el reintento reenvía sin duplicar ítems", async () => {
    sim.telegramCaido = true;
    sim.modelo.push({ accion: "capturar", items: [REUNION] });
    const id = await nuevaCaptura({ texto: "el jueves a las diez reunión con Obras" });
    await procesarCaptura(env, id, MARTES);
    expect(await captura(id)).toMatchObject({ estado: "pendiente" });

    sim.telegramCaido = false;
    await alCron(env, minutos(3));
    expect(ultimo().text).toBe("Anotado: jue 29/10 10:00, reunión con secretario de Obras (desagües Paseo 115)");
    expect(await items()).toHaveLength(1);
    // El modelo se consultó una sola vez.
    expect(sim.pedidosAlModelo).toHaveLength(1);
  });

  it("si pasó un día sin poder procesarla, pide que la manden de nuevo", async () => {
    sim.groqCaido = true;
    const id = await nuevaCaptura({ audio: "AUDIO1" });
    await procesarCaptura(env, id, new Date(MARTES.getTime() + 25 * 60 * 60_000));
    expect(ultimo().text).toBe("No pude procesar tu mensaje del mar 27/10 11:00. ¿Me lo mandás de nuevo?");
    expect(await captura(id)).toMatchObject({ estado: "error" });
  });
});
