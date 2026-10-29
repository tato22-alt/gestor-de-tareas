// Lo que el modelo devuelve para cada mensaje, y la validación en código de esa
// respuesta: el modelo propone, el código decide qué se guarda (principio 2).

import { fechaLocal, formatear, sumarDias } from "./fechas";
import { lineaDeItem, type Ambito, type Item, type TipoItem } from "./items";

export interface ItemPropuesto {
  tipo: TipoItem;
  texto: string;
  fecha: string | null;
  hora: string | null;
  dia_dicho: string | null;
  fecha_explicita: boolean;
  ambito: Ambito;
}

export type Interpretacion =
  | { accion: "capturar"; items: ItemPropuesto[] }
  | { accion: "corregir"; item_ids: number[]; cambios: Partial<ItemPropuesto> }
  | { accion: "borrar" | "marcar_hecho"; item_ids: number[] }
  | { accion: "preguntar"; pregunta: string }
  | { accion: "fuera_de_alcance" | "no_entendido" };

export interface Contexto {
  ahora: Date;
  /** Ítems de la confirmación que citó al responder (H2.1). */
  citados: Item[];
  /** Ítems de la última captura (para "borrá eso" sin citar, H2.2). */
  ultimos: Item[];
  abiertos: Item[];
  /** Pregunta que el asistente hizo hace poco y todavía espera respuesta. */
  preguntaPendiente?: { pregunta: string; mensajeOriginal: string; opciones: Item[] };
}

export const SISTEMA = `Sos el asistente de un concejal de Villa Gesell que también trabaja en un taller mecánico. Él te manda audios transcriptos o textos, desordenados, como a una secretaria. Tu trabajo es entender qué quiere y devolver SOLO un objeto JSON.

Acciones posibles (campo "accion"):
- "capturar": cosas nuevas para anotar. Devolvé "items": una lista con un elemento por cada cosa distinta que mencionó.
- "corregir": cambia un ítem ya anotado ("no, era el viernes"). Devolvé "item_ids" con el id del ítem y "cambios" solo con los campos que cambian.
- "borrar": "borrá eso", "eso no va". Devolvé "item_ids". Si no dice cuál, usá los ítems del último ingreso.
- "marcar_hecho": "lo de Gómez ya está". Devolvé en "item_ids" TODOS los ítems abiertos que podrían ser; si hay más de uno, el sistema pregunta cuál.
- "preguntar": falta un dato clave (fecha, hora o persona) y no se puede suponer. Devolvé "pregunta": una sola pregunta corta.
- "fuera_de_alcance": pide algo que no es anotar, corregir ni recordar (charlar, noticias, fútbol, el clima).
- "no_entendido": el texto no tiene sentido, está cortado o es ruido.

Cada ítem tiene:
- "tipo": "evento" (algo con día y hora en que él tiene que estar: reunión, turno, visita), "recordatorio" (algo que hay que avisarle en un momento: "recordame…", vencimientos), "pendiente" (algo para hacer, sin fecha) o "nota" (un dato para guardar).
- "texto": corto, en tercera persona impersonal, sin la fecha. Ejemplo: "reunión con secretario de Obras (desagües Paseo 115)".
- "fecha": "AAAA-MM-DD" o null. Usá el calendario que te paso; nunca calcules fechas de memoria.
- "hora": "HH:MM" en 24 h o null. "A la mañana" = 09:00, "a la tarde" = 17:00, "a la noche" = 21:00. "A las diez" para una reunión es 10:00.
- "dia_dicho": el día de la semana tal como lo dijo ("jueves") o null si no lo dijo.
- "fecha_explicita": true si dijo "hoy" o "el de la semana que viene" o una fecha con número; false si no.
- "ambito": "concejo" (vecinos, funcionarios, ordenanzas, el Concejo), "taller" (autos, clientes del taller, repuestos, presupuestos de arreglos), "personal" (familia, casa, auto propio, trámites propios) o "sin_definir" si no queda claro.

Reglas:
- Nunca inventes datos. Si no dijo fecha, la fecha es null.
- "Me dijo que lo llame el lunes" es un ítem de él: llamarlo el lunes.
- Si hay una pregunta pendiente, el mensaje probablemente la responde: combiná el mensaje original con la respuesta y devolvé la acción completa.
- Si cita un mensaje del asistente, la acción casi seguro se refiere a esos ítems.`;

function itemParaModelo(i: Item): string {
  return `id ${i.id} · ${lineaDeItem(i)}`;
}

export function mensajeParaModelo(contexto: Contexto, texto: string): string {
  const hoy = fechaLocal(contexto.ahora);
  const calendario = Array.from({ length: 21 }, (_, n) => {
    const fecha = sumarDias(hoy, n);
    return `${formatear(new Date(`${fecha}T12:00:00Z`), false)} = ${fecha}${n === 0 ? " (hoy)" : n === 1 ? " (mañana)" : ""}`;
  });
  const partes = [
    `Ahora: ${formatear(contexto.ahora)} (hora argentina).`,
    `Calendario:\n${calendario.join("\n")}`,
  ];
  if (contexto.preguntaPendiente) {
    const p = contexto.preguntaPendiente;
    partes.push(
      `Pregunta pendiente del asistente: "${p.pregunta}"\nMensaje original que la motivó: "${p.mensajeOriginal}"` +
        (p.opciones.length ? `\nOpciones de esa pregunta:\n${p.opciones.map(itemParaModelo).join("\n")}` : ""),
    );
  }
  if (contexto.citados.length) partes.push(`Cita este mensaje del asistente, con estos ítems:\n${contexto.citados.map(itemParaModelo).join("\n")}`);
  if (contexto.ultimos.length) partes.push(`Último ingreso:\n${contexto.ultimos.map(itemParaModelo).join("\n")}`);
  partes.push(`Ítems abiertos:\n${contexto.abiertos.length ? contexto.abiertos.map(itemParaModelo).join("\n") : "(ninguno)"}`);
  partes.push(`Mensaje:\n"${texto}"`);
  return partes.join("\n\n");
}

// --- Validación de la respuesta del modelo ---

export class InterpretacionInvalida extends Error {}

const TIPOS: TipoItem[] = ["evento", "recordatorio", "pendiente", "nota"];
const AMBITOS: Ambito[] = ["concejo", "taller", "personal", "sin_definir"];

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function textoONulo(v: unknown, campo: string): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string") throw new InterpretacionInvalida(`${campo} no es texto`);
  return v.trim();
}

function validarItem(v: unknown): ItemPropuesto {
  if (!esObjeto(v)) throw new InterpretacionInvalida("ítem no es un objeto");
  if (!TIPOS.includes(v.tipo as TipoItem)) throw new InterpretacionInvalida(`tipo inválido: ${String(v.tipo)}`);
  const texto = textoONulo(v.texto, "texto");
  if (!texto) throw new InterpretacionInvalida("ítem sin texto");
  return {
    tipo: v.tipo as TipoItem,
    texto,
    fecha: textoONulo(v.fecha, "fecha"),
    hora: textoONulo(v.hora, "hora"),
    dia_dicho: textoONulo(v.dia_dicho, "dia_dicho"),
    fecha_explicita: v.fecha_explicita === true,
    ambito: AMBITOS.includes(v.ambito as Ambito) ? (v.ambito as Ambito) : "sin_definir",
  };
}

function validarIds(v: unknown): number[] {
  if (!Array.isArray(v) || !v.every((n) => Number.isInteger(n))) throw new InterpretacionInvalida("item_ids inválido");
  return v as number[];
}

export function validarInterpretacion(v: unknown): Interpretacion {
  if (!esObjeto(v)) throw new InterpretacionInvalida("la respuesta no es un objeto");
  switch (v.accion) {
    case "capturar": {
      if (!Array.isArray(v.items) || v.items.length === 0) throw new InterpretacionInvalida("capturar sin ítems");
      return { accion: "capturar", items: v.items.map(validarItem) };
    }
    case "corregir": {
      if (!esObjeto(v.cambios)) throw new InterpretacionInvalida("corregir sin cambios");
      const cambios: Partial<ItemPropuesto> = {};
      const c = v.cambios;
      if ("tipo" in c) {
        if (!TIPOS.includes(c.tipo as TipoItem)) throw new InterpretacionInvalida("tipo inválido en cambios");
        cambios.tipo = c.tipo as TipoItem;
      }
      if ("ambito" in c && AMBITOS.includes(c.ambito as Ambito)) cambios.ambito = c.ambito as Ambito;
      for (const campo of ["texto", "fecha", "hora", "dia_dicho"] as const) {
        if (campo in c) cambios[campo] = textoONulo(c[campo], campo) as never;
      }
      if ("fecha_explicita" in c) cambios.fecha_explicita = c.fecha_explicita === true;
      return { accion: "corregir", item_ids: validarIds(v.item_ids), cambios };
    }
    case "borrar":
    case "marcar_hecho":
      return { accion: v.accion, item_ids: validarIds(v.item_ids ?? []) };
    case "preguntar": {
      const pregunta = textoONulo(v.pregunta, "pregunta");
      if (!pregunta) throw new InterpretacionInvalida("preguntar sin pregunta");
      return { accion: "preguntar", pregunta };
    }
    case "fuera_de_alcance":
    case "no_entendido":
      return { accion: v.accion };
    default:
      throw new InterpretacionInvalida(`acción desconocida: ${String(v.accion)}`);
  }
}
