// T5: escenarios del spec contra el modelo real de Groq. Mide cuántos interpreta bien.
//
//   GROQ_API_KEY=... npm run escenarios
//   GROQ_API_KEY=... GROQ_MODELO=otro-modelo npm run escenarios
//
// Sin GROQ_API_KEY se saltea, así `npm test` no necesita cuentas.

import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { completarJson } from "../src/groq";
import { mensajeParaModelo, SISTEMA, validarInterpretacion, type Contexto, type Interpretacion } from "../src/interpretacion";
import type { Item } from "../src/items";
import { MARTES } from "./ayuda";

function item(id: number, datos: Partial<Item>): Item {
  return {
    id,
    captura_id: 1,
    telegram_user_id: 1,
    tipo: "pendiente",
    texto: "",
    fecha_hora: null,
    tiene_hora: 0,
    ambito: "sin_definir",
    estado: "abierto",
    aviso_enviado_en: null,
    creado_en: MARTES.toISOString(),
    actualizado_en: MARTES.toISOString(),
    ...datos,
  };
}

const REUNION = item(1, {
  tipo: "evento",
  texto: "reunión con secretario de Obras (desagües Paseo 115)",
  fecha_hora: "2026-10-29T13:00:00.000Z",
  tiene_hora: 1,
});
const GOMEZ_1 = item(2, { texto: "llamar a Gómez por el presupuesto" });
const GOMEZ_2 = item(3, { texto: "pasarle a Gómez los repuestos" });
const CARTUCHOS = item(4, { texto: "comprar cartuchos" });

const vacio: Contexto = { ahora: MARTES, citados: [], ultimos: [], abiertos: [] };

interface Escenario {
  nombre: string;
  texto: string;
  contexto?: Partial<Contexto>;
  /** Devuelve qué está mal, o undefined si está bien. */
  revisar: (i: Interpretacion) => string | undefined;
}

const capturo = (i: Interpretacion) => (i.accion === "capturar" ? i.items : undefined);

const ESCENARIOS: Escenario[] = [
  {
    nombre: "H1.1 reunión el jueves a las diez",
    texto: "el jueves a las diez tengo reunión con el secretario de Obras por los desagües del Paseo 115",
    revisar: (i) => {
      const items = capturo(i);
      if (items?.length !== 1) return "no es un solo ítem";
      const [r] = items;
      if (r!.tipo !== "evento" || r!.fecha !== "2026-10-29" || r!.hora !== "10:00") return "tipo, fecha u hora mal";
      if (r!.ambito !== "concejo") return `ámbito ${r!.ambito}`;
    },
  },
  {
    nombre: "H1.2 tres cosas en un audio",
    texto: "llamar a Gómez por el presupuesto, comprar cartuchos, y el lunes vence el seguro del auto",
    revisar: (i) => {
      const items = capturo(i);
      if (items?.length !== 3) return `${items?.length ?? 0} ítems`;
      if (!items.some((x) => x.fecha === "2026-11-02")) return "el seguro no quedó el lunes 02/11";
      if (items.filter((x) => x.fecha !== null).length !== 1) return "fechas de más";
    },
  },
  {
    nombre: "H1.3 pendiente sin fecha",
    texto: "tengo que averiguar lo del subsidio de la cooperativa",
    revisar: (i) => {
      const items = capturo(i);
      if (items?.length !== 1 || items[0]!.fecha !== null || items[0]!.tipo !== "pendiente") return "no es un pendiente sin fecha";
    },
  },
  {
    nombre: "H3.1 mañana a la tarde",
    texto: "recordame mañana a la tarde llamar a la escuela",
    revisar: (i) => {
      const items = capturo(i);
      if (items?.length !== 1) return "no es un solo ítem";
      if (items[0]!.tipo !== "recordatorio" || items[0]!.fecha !== "2026-10-28" || items[0]!.hora !== "17:00") return "no quedó mañana 17:00";
    },
  },
  {
    nombre: "H1.5 ámbito taller",
    texto: "mañana pasa el de la Hilux a buscar el auto",
    revisar: (i) => {
      const items = capturo(i);
      if (items?.length !== 1 || items[0]!.fecha !== "2026-10-28") return "no quedó para mañana";
      if (items[0]!.ambito !== "taller") return `ámbito ${items[0]!.ambito}`;
    },
  },
  {
    nombre: "Cita de terceros: el compromiso es de él",
    texto: "me dijo Rosa, la de Avenida 8, que la llame el viernes por el bache",
    revisar: (i) => {
      const items = capturo(i);
      if (items?.length !== 1 || items[0]!.fecha !== "2026-10-30") return "no quedó el viernes 30/10";
      if (!/llam/i.test(items[0]!.texto)) return `texto: ${items[0]!.texto}`;
    },
  },
  {
    nombre: "Fuera de alcance",
    texto: "che, ¿cómo salió Boca anoche?",
    revisar: (i) => (i.accion === "fuera_de_alcance" ? undefined : i.accion),
  },
  {
    nombre: "H1.4 ruido",
    texto: "eh… no… shh… se corta… ahí… ",
    revisar: (i) => (i.accion === "no_entendido" || i.accion === "preguntar" ? undefined : i.accion),
  },
  {
    nombre: "Fecha vaga: a fin de mes",
    texto: "a fin de mes tengo que presentar el proyecto de la ordenanza de playa",
    // Vale preguntar o dejarlo el 31/10; no vale inventar otra fecha.
    revisar: (i) => {
      if (i.accion === "preguntar") return undefined;
      const items = capturo(i);
      if (items?.length !== 1) return i.accion;
      return items[0]!.fecha === "2026-10-31" ? undefined : `fecha ${items[0]!.fecha}`;
    },
  },
  {
    nombre: "H2.1 corregir citando",
    texto: "no, era el viernes",
    contexto: { citados: [REUNION], ultimos: [REUNION], abiertos: [REUNION] },
    revisar: (i) => {
      if (i.accion !== "corregir") return i.accion;
      if (i.item_ids.join() !== "1") return `ids ${i.item_ids}`;
      if (i.cambios.fecha !== "2026-10-30") return `fecha ${i.cambios.fecha}`;
    },
  },
  {
    nombre: "H2.2 borrá eso",
    texto: "borrá eso",
    contexto: { ultimos: [CARTUCHOS], abiertos: [REUNION, CARTUCHOS] },
    revisar: (i) => {
      if (i.accion !== "borrar") return i.accion;
      if (i.item_ids.length && i.item_ids.join() !== "4") return `ids ${i.item_ids}`;
    },
  },
  {
    nombre: "H2.3 lo de Gómez ya está",
    texto: "lo de Gómez ya está",
    contexto: { abiertos: [REUNION, GOMEZ_1, GOMEZ_2, CARTUCHOS] },
    revisar: (i) => {
      if (i.accion !== "marcar_hecho") return i.accion;
      if ([...i.item_ids].sort().join() !== "2,3") return `ids ${i.item_ids}`;
    },
  },
];

describe.skipIf(!env.GROQ_REAL)(`Escenarios contra Groq (${env.GROQ_MODELO})`, () => {
  it("interpreta bien al menos 9 de cada 10", { timeout: 120_000 }, async () => {
    const fallas: string[] = [];
    for (const e of ESCENARIOS) {
      try {
        const respuesta = await completarJson(env, SISTEMA, mensajeParaModelo({ ...vacio, ...e.contexto }, e.texto));
        const problema = e.revisar(validarInterpretacion(respuesta));
        if (problema) fallas.push(`${e.nombre}: ${problema} → ${JSON.stringify(respuesta)}`);
      } catch (error) {
        fallas.push(`${e.nombre}: ${String(error)}`);
      }
    }
    const bien = ESCENARIOS.length - fallas.length;
    console.log(`${env.GROQ_MODELO}: ${bien}/${ESCENARIOS.length} bien\n${fallas.join("\n")}`);
    expect(bien / ESCENARIOS.length, fallas.join("\n")).toBeGreaterThanOrEqual(0.9);
  });
});
