import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { alCron } from "../src/cron";
import { items, limpiarBase, nuevoItem, PAPA, simular } from "./ayuda";

let sim: ReturnType<typeof simular>;

beforeEach(async () => {
  await limpiarBase();
  sim = simular();
});

afterEach(() => vi.restoreAllMocks());

const textos = () => sim.enviados.map((e) => e.text);

describe("H3. Avisos", () => {
  // Un sábado, para que no se cruce con el resumen de la mañana.
  it("un evento avisa una hora antes, una sola vez", async () => {
    await nuevoItem({ tipo: "evento", texto: "asado con la cooperativa", fecha_hora: "2026-10-31T13:00:00.000Z" });

    await alCron(env, new Date("2026-10-31T11:59:00Z"));
    expect(textos()).toEqual([]);

    await alCron(env, new Date("2026-10-31T12:00:00Z"));
    await alCron(env, new Date("2026-10-31T12:01:00Z"));
    expect(sim.enviados).toMatchObject([{ chat_id: PAPA, text: "Aviso: sáb 31/10 10:00, asado con la cooperativa" }]);
  });

  it("un recordatorio avisa a la hora exacta (H3.1)", async () => {
    await nuevoItem({ tipo: "recordatorio", texto: "llamar a la escuela", fecha_hora: "2026-10-28T20:00:00.000Z" });

    await alCron(env, new Date("2026-10-28T19:59:00Z"));
    await alCron(env, new Date("2026-10-28T20:00:00Z"));
    expect(textos()).toEqual(["Recordatorio: llamar a la escuela"]);
  });

  it("si el recordatorio sale tarde, dice para qué hora era", async () => {
    await nuevoItem({ tipo: "recordatorio", texto: "llamar a la escuela", fecha_hora: "2026-10-28T20:00:00.000Z" });
    await alCron(env, new Date("2026-10-28T20:30:00Z"));
    expect(textos()).toEqual(["Recordatorio (era para las 17:00): llamar a la escuela"]);
  });

  it("pendientes y notas no avisan", async () => {
    await nuevoItem({ tipo: "pendiente", texto: "comprar cartuchos" });
    await nuevoItem({ tipo: "nota", texto: "el Colo es Martín", fecha_hora: "2026-10-28T20:00:00.000Z" });
    await alCron(env, new Date("2026-10-28T20:00:00Z"));
    expect(textos()).toEqual([]);
  });

  it("lo que tiene solo día avisa a las 9:00 un fin de semana", async () => {
    await nuevoItem({ tipo: "recordatorio", texto: "vence la patente", fecha_hora: "2026-10-31T03:00:00.000Z", tiene_hora: 0 });
    await alCron(env, new Date("2026-10-31T11:59:00Z"));
    await alCron(env, new Date("2026-10-31T12:00:00Z"));
    expect(textos()).toEqual(["Hoy: vence la patente"]);
  });

  it("si falla el envío, el aviso sale en la corrida siguiente", async () => {
    await nuevoItem({ tipo: "recordatorio", texto: "llamar a la escuela", fecha_hora: "2026-10-28T20:00:00.000Z" });
    sim.telegramCaido = true;
    await alCron(env, new Date("2026-10-28T20:00:00Z"));
    sim.telegramCaido = false;
    await alCron(env, new Date("2026-10-28T20:01:00Z"));
    expect(textos()).toEqual(["Recordatorio: llamar a la escuela"]);
  });
});

describe("H4. Resumen de la mañana", () => {
  // Jueves 29/10/2026 a las 7:30 en Argentina.
  const SIETE_Y_MEDIA = new Date("2026-10-29T10:30:00Z");

  async function cargarDia() {
    await nuevoItem({ tipo: "evento", texto: "reunión con Obras", fecha_hora: "2026-10-29T13:00:00.000Z", ambito: "concejo" });
    await nuevoItem({ tipo: "recordatorio", texto: "vence el seguro del auto", fecha_hora: "2026-10-29T03:00:00.000Z", tiene_hora: 0, ambito: "personal" });
    await nuevoItem({ tipo: "recordatorio", texto: "pagar la luz", fecha_hora: "2026-10-26T15:00:00.000Z", ambito: "personal" });
    await nuevoItem({ tipo: "pendiente", texto: "presupuesto de la Hilux", ambito: "taller", actualizado_en: "2026-10-20T12:00:00.000Z" });
    // Reciente: no aparece.
    await nuevoItem({ tipo: "pendiente", texto: "comprar cartuchos", actualizado_en: "2026-10-28T12:00:00.000Z" });
  }

  it("a las 7:30 manda agenda, vencidos y lo que lleva más de 7 días quieto, con el ámbito", async () => {
    await cargarDia();
    await alCron(env, SIETE_Y_MEDIA);

    expect(textos()).toEqual([
      [
        "Hoy jue 29/10:",
        "• vence el seguro del auto · personal",
        "• 10:00 reunión con Obras · Concejo",
        "",
        "Vencidos:",
        "• lun 26/10 12:00, pagar la luz · personal",
        "",
        "Sin moverse hace más de 7 días:",
        "• presupuesto de la Hilux · taller",
      ].join("\n"),
    ]);
  });

  it("sale una sola vez por día, y lo que tiene solo día no se repite a las 9:00", async () => {
    await cargarDia();
    await alCron(env, SIETE_Y_MEDIA);
    await alCron(env, new Date("2026-10-29T10:31:00Z"));
    await alCron(env, new Date("2026-10-29T12:00:00Z"));
    // El resumen y, a las 9:00 (12:00 UTC), el aviso de la reunión de las 10:00.
    expect(textos()).toHaveLength(2);
    expect(textos()[1]).toBe("Aviso: jue 29/10 10:00, reunión con Obras");
  });

  it("sin ámbitos distintos no los muestra", async () => {
    await nuevoItem({ tipo: "evento", texto: "reunión con Obras", fecha_hora: "2026-10-29T13:00:00.000Z", ambito: "concejo" });
    await alCron(env, SIETE_Y_MEDIA);
    expect(textos()).toEqual(["Hoy jue 29/10:\n• 10:00 reunión con Obras"]);
  });

  it("un día sin nada no manda mensaje", async () => {
    await alCron(env, SIETE_Y_MEDIA);
    expect(textos()).toEqual([]);
  });

  it("sábados y domingos no hay resumen", async () => {
    await nuevoItem({ tipo: "pendiente", texto: "presupuesto de la Hilux", actualizado_en: "2026-10-20T12:00:00.000Z" });
    await alCron(env, new Date("2026-10-31T10:30:00Z"));
    expect(textos()).toEqual([]);
  });

  it("antes de las 7:30 no sale", async () => {
    await cargarDia();
    await alCron(env, new Date("2026-10-29T10:29:00Z"));
    expect(textos()).toEqual([]);
    expect(await items()).toHaveLength(5);
  });
});
