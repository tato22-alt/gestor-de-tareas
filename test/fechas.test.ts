import { describe, expect, it } from "vitest";
import { aUtc, fechaLocal, formatear, HORA_POR_FRANJA, proximoDia, validarFecha } from "../src/fechas";

// Martes 27/10/2026 a las 11:00 en Argentina, el día del spec.
const MARTES = new Date("2026-10-27T14:00:00Z");

describe("formatear", () => {
  it("muestra día, número y hora (H1.1)", () => {
    expect(formatear(aUtc("2026-10-29", "10:00"))).toBe("jue 29/10 10:00");
  });

  it("sin hora muestra solo día y número", () => {
    expect(formatear(aUtc("2026-11-02", "00:00"), false)).toBe("lun 02/11");
  });

  it("guarda en UTC: las 10:00 de Argentina son las 13:00 UTC", () => {
    expect(aUtc("2026-10-29", "10:00").toISOString()).toBe("2026-10-29T13:00:00.000Z");
  });
});

describe("fechaLocal", () => {
  it("antes de las 3:00 UTC sigue siendo el día anterior en Argentina", () => {
    expect(fechaLocal(new Date("2026-10-28T02:30:00Z"))).toBe("2026-10-27");
  });
});

describe("proximoDia", () => {
  it('"el jueves" dicho un martes es pasado mañana (H1.1)', () => {
    expect(proximoDia(MARTES, 4)).toEqual({ tipo: "exacta", fecha: "2026-10-29" });
  });

  it('"el lunes" dicho un martes es el de la semana que viene', () => {
    expect(proximoDia(MARTES, 1)).toEqual({ tipo: "exacta", fecha: "2026-11-02" });
  });

  it('"el martes" dicho un martes es ambiguo: hay que preguntar', () => {
    expect(proximoDia(MARTES, 2)).toEqual({ tipo: "ambigua", opciones: ["2026-10-27", "2026-11-03"] });
  });
});

describe("horarios por defecto (A9)", () => {
  it('"mañana a la tarde" queda a las 17:00 (H3.1)', () => {
    expect(formatear(aUtc("2026-10-28", HORA_POR_FRANJA.tarde))).toBe("mié 28/10 17:00");
  });

  it("mañana 9:00 y noche 21:00", () => {
    expect(HORA_POR_FRANJA).toEqual({ manana: "09:00", tarde: "17:00", noche: "21:00" });
  });
});

describe("validarFecha", () => {
  it("acepta una fecha futura cuyo día coincide", () => {
    expect(validarFecha(MARTES, "2026-10-29", "10:00", "jueves")).toBeUndefined();
  });

  it("acepta el día dicho sin tilde", () => {
    expect(validarFecha(MARTES, "2026-10-28", "10:00", "miercoles")).toBeUndefined();
  });

  it("detecta cuando el día dicho no coincide con el número", () => {
    expect(validarFecha(MARTES, "2026-10-29", "10:00", "viernes")).toBe("dia_no_coincide");
  });

  it("detecta una fecha y hora pasadas", () => {
    expect(validarFecha(MARTES, "2026-10-27", "09:00")).toBe("pasada");
  });

  it("hoy sin hora no es pasado", () => {
    expect(validarFecha(MARTES, "2026-10-27", undefined)).toBeUndefined();
  });

  it("rechaza fechas que no existen y horas mal formadas", () => {
    expect(validarFecha(MARTES, "2027-02-30", undefined)).toBe("invalida");
    expect(validarFecha(MARTES, "2026-10-29", "25:00")).toBe("invalida");
    expect(validarFecha(MARTES, "2026-10-29", "10:00", "juernes")).toBe("invalida");
  });
});
