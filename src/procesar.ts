// De captura a respuesta: transcribir, interpretar, aplicar y confirmar (H1, H2, RF-06 a RF-08, RF-13).

import type { Env } from "./env";
import {
  aUtc,
  diaDeLaSemana,
  fechaLocal,
  formatear,
  horaLocal,
  numeroDeDia,
  proximoDia,
  sumarDias,
  validarFecha,
} from "./fechas";
import { completarJson, transcribir } from "./groq";
import {
  choques,
  itemsAbiertos,
  itemsPorId,
  lineaDeItem,
  lista,
  responder,
  type Item,
  type TipoSaliente,
} from "./items";
import {
  mensajeParaModelo,
  SISTEMA,
  validarInterpretacion,
  type Contexto,
  type ItemPropuesto,
} from "./interpretacion";
import { descargarArchivo } from "./telegram";

const MINUTO = 60_000;
/** Una captura que no se pudo procesar en un día ya no sirve: se pide que la repita. */
const VIDA_MAXIMA = 24 * 60 * MINUTO;
const AVISO_DE_DEMORA = 10 * MINUTO;
const DISCULPA_POR_DEMORA = 5 * MINUTO;
const VIGENCIA_DE_PREGUNTA = 30 * MINUTO;

export const RESPUESTAS = {
  noEntendido: "No te entendí bien, ¿me lo repetís?",
  fueraDeAlcance: "Eso no lo hago: solo anoto, corrijo y te aviso cosas.",
  demora: "Lo tengo, lo proceso en un rato.",
  queCorregir: "¿Qué querés corregir?",
  nadaParaBorrar: "No encontré qué borrar.",
  nadaAbierto: "No encontré nada abierto con eso.",
} as const;

interface Captura {
  id: number;
  telegram_user_id: number;
  telegram_message_id: number;
  responde_a_message_id: number | null;
  tipo: "audio" | "texto";
  texto: string | null;
  audio_file_id: string | null;
  transcripcion: string | null;
  demora_avisada: number;
  contexto_previo: string | null;
  respuesta: string | null;
  respuesta_tipo: TipoSaliente | null;
  respuesta_item_ids: string | null;
  estado_final: "procesada" | "descartada" | null;
  recibida_en: string;
}

interface Plan {
  sentencias: D1PreparedStatement[];
  respuesta: string;
  tipo: TipoSaliente;
  /** null: los ítems que se crean en esta captura. */
  itemIds: number[] | null;
  estadoFinal: "procesada" | "descartada";
  contextoPrevio?: string;
}

/** Toma la captura para procesarla. Devuelve null si otro intento la tiene o ya terminó. */
async function tomar(db: D1Database, id: number, ahora: Date): Promise<Captura | null> {
  return db
    .prepare(
      `UPDATE capturas SET estado = 'procesando', intentos = intentos + 1, tomada_en = ?1
       WHERE id = ?2 AND (estado = 'pendiente' OR (estado = 'procesando' AND tomada_en < ?3))
       RETURNING *`,
    )
    .bind(ahora.toISOString(), id, new Date(ahora.getTime() - 5 * MINUTO).toISOString())
    .first<Captura>();
}

export async function procesarCaptura(env: Env, id: number, ahora = new Date()): Promise<void> {
  const captura = await tomar(env.DB, id, ahora);
  if (!captura) return;
  try {
    await completar(env, captura, ahora);
  } catch (error) {
    console.error(`Captura ${id} falló`, error);
    await alFallar(env, captura, ahora);
  }
}

async function completar(env: Env, captura: Captura, ahora: Date): Promise<void> {
  if (captura.respuesta === null) {
    const texto = await textoDe(env, captura);
    const plan = texto ? await planificar(env, captura, texto, ahora) : planNoEntendido();
    const actualizar = env.DB.prepare(
      `UPDATE capturas SET respuesta = ?, respuesta_tipo = ?, respuesta_item_ids = ?, estado_final = ?,
       contexto_previo = ? WHERE id = ?`,
    ).bind(
      plan.respuesta,
      plan.tipo,
      plan.itemIds === null ? null : JSON.stringify(plan.itemIds),
      plan.estadoFinal,
      plan.contextoPrevio ?? null,
      captura.id,
    );
    // En una sola transacción: o se aplica todo y queda la respuesta guardada, o nada.
    await env.DB.batch([...plan.sentencias, actualizar]);
    captura.respuesta = plan.respuesta;
    captura.respuesta_tipo = plan.tipo;
    captura.respuesta_item_ids = plan.itemIds === null ? null : JSON.stringify(plan.itemIds);
    captura.estado_final = plan.estadoFinal;
  }

  const itemIds =
    captura.respuesta_item_ids === null
      ? (
          await env.DB.prepare("SELECT id FROM items WHERE captura_id = ? ORDER BY id").bind(captura.id).all<{ id: number }>()
        ).results.map((r) => r.id)
      : (JSON.parse(captura.respuesta_item_ids) as number[]);

  const demorada = ahora.getTime() - new Date(captura.recibida_en).getTime() > DISCULPA_POR_DEMORA;
  await responder(env, captura.telegram_user_id, (demorada ? "Perdón la demora. " : "") + captura.respuesta, {
    tipo: captura.respuesta_tipo ?? "otro",
    ahora,
    respondeA: captura.telegram_message_id,
    capturaId: captura.id,
    itemIds,
  });
  await env.DB.prepare("UPDATE capturas SET estado = ?, procesada_en = ? WHERE id = ?")
    .bind(captura.estado_final ?? "procesada", ahora.toISOString(), captura.id)
    .run();
}

async function alFallar(env: Env, captura: Captura, ahora: Date): Promise<void> {
  const edad = ahora.getTime() - new Date(captura.recibida_en).getTime();
  if (edad > VIDA_MAXIMA) {
    await env.DB.prepare("UPDATE capturas SET estado = 'error' WHERE id = ?").bind(captura.id).run();
    await responderSinFallar(
      env,
      captura,
      `No pude procesar tu mensaje del ${formatear(new Date(captura.recibida_en))}. ¿Me lo mandás de nuevo?`,
      ahora,
    );
    return;
  }
  await env.DB.prepare("UPDATE capturas SET estado = 'pendiente' WHERE id = ?").bind(captura.id).run();
  if (captura.demora_avisada === 0 && edad > AVISO_DE_DEMORA && (await responderSinFallar(env, captura, RESPUESTAS.demora, ahora))) {
    await env.DB.prepare("UPDATE capturas SET demora_avisada = 1 WHERE id = ?").bind(captura.id).run();
  }
}

async function responderSinFallar(env: Env, captura: Captura, texto: string, ahora: Date): Promise<boolean> {
  try {
    await responder(env, captura.telegram_user_id, texto, { tipo: "otro", ahora, respondeA: captura.telegram_message_id, capturaId: captura.id });
    return true;
  } catch (error) {
    console.error(`No se pudo avisar sobre la captura ${captura.id}`, error);
    return false;
  }
}

async function textoDe(env: Env, captura: Captura): Promise<string> {
  if (captura.tipo === "texto") return (captura.texto ?? "").trim();
  if (captura.transcripcion !== null) return captura.transcripcion;
  const transcripcion = await transcribir(env, await descargarArchivo(env, captura.audio_file_id!));
  // Se guarda enseguida: si falla lo que sigue, el reintento no vuelve a transcribir.
  await env.DB.prepare("UPDATE capturas SET transcripcion = ? WHERE id = ?").bind(transcripcion, captura.id).run();
  return transcripcion;
}

// --- Contexto para el modelo ---

async function idsDeSaliente(db: D1Database, consulta: string, ...valores: unknown[]): Promise<{ ids: number[]; fila: SalienteFila | null }> {
  const fila = await db.prepare(consulta).bind(...valores).first<SalienteFila>();
  return { ids: fila ? (JSON.parse(fila.item_ids) as number[]) : [], fila };
}

interface SalienteFila {
  item_ids: string;
  tipo: TipoSaliente;
  captura_id: number | null;
  enviado_en: string;
}

async function armarContexto(env: Env, captura: Captura, ahora: Date): Promise<Contexto> {
  const usuario = captura.telegram_user_id;
  const citado =
    captura.responde_a_message_id === null
      ? { ids: [] }
      : await idsDeSaliente(
          env.DB,
          "SELECT * FROM mensajes_salientes WHERE telegram_user_id = ? AND telegram_message_id = ?",
          usuario,
          captura.responde_a_message_id,
        );
  const ultimo = await idsDeSaliente(
    env.DB,
    `SELECT * FROM mensajes_salientes WHERE telegram_user_id = ? AND tipo = 'confirmacion'
     ORDER BY enviado_en DESC, rowid DESC LIMIT 1`,
    usuario,
  );
  const previo = await idsDeSaliente(
    env.DB,
    "SELECT * FROM mensajes_salientes WHERE telegram_user_id = ? ORDER BY enviado_en DESC, rowid DESC LIMIT 1",
    usuario,
  );

  let preguntaPendiente: Contexto["preguntaPendiente"];
  if (
    previo.fila?.tipo === "pregunta" &&
    previo.fila.captura_id !== null &&
    previo.fila.captura_id !== captura.id &&
    ahora.getTime() - new Date(previo.fila.enviado_en).getTime() < VIGENCIA_DE_PREGUNTA
  ) {
    const original = await env.DB.prepare("SELECT * FROM capturas WHERE id = ?").bind(previo.fila.captura_id).first<Captura>();
    if (original?.respuesta) {
      preguntaPendiente = {
        pregunta: original.respuesta,
        mensajeOriginal: [original.contexto_previo, original.texto ?? original.transcripcion].filter(Boolean).join(" / "),
        opciones: await itemsPorId(env.DB, usuario, previo.ids),
      };
    }
  }

  return {
    ahora,
    citados: await itemsPorId(env.DB, usuario, citado.ids),
    ultimos: await itemsPorId(env.DB, usuario, ultimo.ids),
    abiertos: await itemsAbiertos(env.DB, usuario),
    preguntaPendiente,
  };
}

// --- Del resultado del modelo a cambios en la base ---

function planNoEntendido(): Plan {
  return { sentencias: [], respuesta: RESPUESTAS.noEntendido, tipo: "otro", itemIds: [], estadoFinal: "descartada" };
}

function pregunta(texto: string, opciones: number[] = []): Plan {
  return { sentencias: [], respuesta: texto, tipo: "pregunta", itemIds: opciones, estadoFinal: "procesada" };
}

function soloDia(fecha: string): string {
  return formatear(aUtc(fecha, "12:00"), false);
}

/** Si la fecha propuesta tiene un problema, la pregunta para hacerle (RF-08). */
function preguntaPorFecha(ahora: Date, item: Pick<ItemPropuesto, "tipo" | "texto" | "fecha" | "hora" | "dia_dicho" | "fecha_explicita">): string | undefined {
  if (item.fecha === null) {
    if (item.tipo === "evento") return `¿Qué día es “${item.texto}”?`;
    if (item.tipo === "recordatorio") return `¿Cuándo te recuerdo “${item.texto}”?`;
    return undefined;
  }
  const hoy = fechaLocal(ahora);
  const dia = item.dia_dicho === null ? undefined : numeroDeDia(item.dia_dicho);
  if (dia !== undefined && !item.fecha_explicita && dia === diaDeLaSemana(hoy)) {
    return `¿“${item.texto}” es hoy ${soloDia(hoy)} o el ${soloDia(sumarDias(hoy, 7))}?`;
  }
  switch (validarFecha(ahora, item.fecha, item.hora ?? undefined, item.dia_dicho ?? undefined)) {
    case "invalida":
      return `No entendí la fecha de “${item.texto}”. ¿Para cuándo es?`;
    case "dia_no_coincide": {
      const r = proximoDia(ahora, dia!);
      const delDia = r.tipo === "exacta" ? r.fecha : r.opciones[0];
      return `¿“${item.texto}” es el ${soloDia(delDia)} o el ${soloDia(item.fecha)}?`;
    }
    case "pasada":
      return `“${item.texto}” me quedó para el ${item.hora ? formatear(aUtc(item.fecha, item.hora)) : soloDia(item.fecha)}, que ya pasó. ¿Para cuándo es?`;
    default:
      return undefined;
  }
}

function fechaHora(item: Pick<ItemPropuesto, "fecha" | "hora">): { fecha_hora: string | null; tiene_hora: number } {
  if (item.fecha === null) return { fecha_hora: null, tiene_hora: 0 };
  return { fecha_hora: aUtc(item.fecha, item.hora ?? "00:00").toISOString(), tiene_hora: item.hora ? 1 : 0 };
}

/** Un evento que empieza en menos de una hora ya quedó avisado con la confirmación. */
function avisoYaCubierto(tipo: string, fechaHoraIso: string | null, tieneHora: number, ahora: Date): string | null {
  if (tipo !== "evento" || !fechaHoraIso || tieneHora !== 1) return null;
  return new Date(fechaHoraIso).getTime() - 60 * MINUTO <= ahora.getTime() ? ahora.toISOString() : null;
}

type ConFecha = { tipo: string; texto: string; fecha_hora: string | null; tiene_hora: number };

function esEventoConHora(n: ConFecha): boolean {
  return n.tipo === "evento" && n.tiene_hora === 1 && n.fecha_hora !== null;
}

/** Avisos de choque para la confirmación (H3.2), contra lo guardado y entre los ítems nuevos. */
async function lineasDeChoque(env: Env, usuario: number, nuevos: ConFecha[], excluir: number[]): Promise<string[]> {
  const lineas = new Set<string>();
  const conHora = nuevos.filter(esEventoConHora);
  for (const [i, n] of conHora.entries()) {
    for (const c of await choques(env.DB, usuario, n.fecha_hora!, excluir)) lineas.add(`Ojo: choca con ${lineaDeItem(c)}`);
    for (const m of conHora.slice(i + 1)) {
      if (Math.abs(new Date(m.fecha_hora!).getTime() - new Date(n.fecha_hora!).getTime()) < 60 * MINUTO) {
        lineas.add(`Ojo: “${m.texto}” choca con “${n.texto}”`);
      }
    }
  }
  return [...lineas];
}

async function planificar(env: Env, captura: Captura, texto: string, ahora: Date): Promise<Plan> {
  const contexto = await armarContexto(env, captura, ahora);
  const interpretacion = validarInterpretacion(await completarJson(env, SISTEMA, mensajeParaModelo(contexto, texto)));
  const usuario = captura.telegram_user_id;
  const contextoPrevio = contexto.preguntaPendiente?.mensajeOriginal;
  const ahoraIso = ahora.toISOString();
  const conPrevio = (plan: Plan): Plan => ({ ...plan, contextoPrevio });

  switch (interpretacion.accion) {
    case "no_entendido":
      return planNoEntendido();

    case "fuera_de_alcance":
      return { sentencias: [], respuesta: RESPUESTAS.fueraDeAlcance, tipo: "otro", itemIds: [], estadoFinal: "procesada" };

    case "preguntar":
      return conPrevio(pregunta(interpretacion.pregunta));

    case "capturar": {
      for (const item of interpretacion.items) {
        const duda = preguntaPorFecha(ahora, item);
        if (duda) return conPrevio(pregunta(duda));
      }
      const nuevos = interpretacion.items.map((item) => ({ ...item, ...fechaHora(item) }));
      const sentencias = nuevos.map((n) =>
        env.DB.prepare(
          `INSERT INTO items (captura_id, telegram_user_id, tipo, texto, fecha_hora, tiene_hora, ambito,
             aviso_enviado_en, creado_en, actualizado_en)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          captura.id, usuario, n.tipo, n.texto, n.fecha_hora, n.tiene_hora, n.ambito,
          avisoYaCubierto(n.tipo, n.fecha_hora, n.tiene_hora, ahora), ahoraIso, ahoraIso,
        ),
      );
      const choque = await lineasDeChoque(env, usuario, nuevos, []);
      return conPrevio({
        sentencias,
        respuesta: [lista("Anotado", nuevos), ...choque].join("\n"),
        tipo: "confirmacion",
        itemIds: null,
        estadoFinal: "procesada",
      });
    }

    case "corregir": {
      const candidatos = unicos([...contexto.citados, ...contexto.ultimos, ...contexto.abiertos, ...(contexto.preguntaPendiente?.opciones ?? [])]);
      const elegidos = candidatos.filter((i) => interpretacion.item_ids.includes(i.id));
      if (elegidos.length === 0) return conPrevio(pregunta(RESPUESTAS.queCorregir));
      if (elegidos.length > 1) return conPrevio(preguntaCual(elegidos));
      const actual = elegidos[0]!;
      const c = interpretacion.cambios;
      const tocaFecha = "fecha" in c || "hora" in c || "dia_dicho" in c;
      const fechaActual = actual.fecha_hora ? fechaLocal(new Date(actual.fecha_hora)) : null;
      const horaActual = actual.fecha_hora && actual.tiene_hora === 1 ? horaLocal(new Date(actual.fecha_hora)) : null;
      const nuevo = {
        tipo: c.tipo ?? actual.tipo,
        texto: c.texto ?? actual.texto,
        ambito: c.ambito ?? actual.ambito,
        fecha: "fecha" in c ? (c.fecha ?? null) : fechaActual,
        hora: "hora" in c ? (c.hora ?? null) : horaActual,
        dia_dicho: c.dia_dicho ?? null,
        fecha_explicita: c.fecha_explicita ?? false,
      };
      if (tocaFecha) {
        const duda = preguntaPorFecha(ahora, nuevo);
        if (duda) return conPrevio(pregunta(duda, [actual.id]));
      }
      const fh = tocaFecha ? fechaHora(nuevo) : { fecha_hora: actual.fecha_hora, tiene_hora: actual.tiene_hora };
      const aviso = tocaFecha ? avisoYaCubierto(nuevo.tipo, fh.fecha_hora, fh.tiene_hora, ahora) : actual.aviso_enviado_en;
      const corregido = { ...actual, ...nuevo, ...fh };
      const choque = await lineasDeChoque(env, usuario, [corregido], [actual.id]);
      return conPrevio({
        sentencias: [
          env.DB.prepare(
            `UPDATE items SET tipo = ?, texto = ?, ambito = ?, fecha_hora = ?, tiene_hora = ?, aviso_enviado_en = ?,
             actualizado_en = ? WHERE id = ?`,
          ).bind(nuevo.tipo, nuevo.texto, nuevo.ambito, fh.fecha_hora, fh.tiene_hora, aviso, ahoraIso, actual.id),
        ],
        respuesta: [`Corregido: ${lineaDeItem(corregido)}`, ...choque].join("\n"),
        tipo: "confirmacion",
        itemIds: [actual.id],
        estadoFinal: "procesada",
      });
    }

    case "borrar": {
      const candidatos = unicos([...contexto.citados, ...contexto.ultimos, ...contexto.abiertos]);
      let elegidos = candidatos.filter((i) => interpretacion.item_ids.includes(i.id));
      if (elegidos.length === 0) elegidos = contexto.citados.length ? contexto.citados : contexto.ultimos;
      if (elegidos.length === 0) return { sentencias: [], respuesta: RESPUESTAS.nadaParaBorrar, tipo: "otro", itemIds: [], estadoFinal: "procesada" };
      return conPrevio({
        sentencias: elegidos.map((i) =>
          env.DB.prepare("UPDATE items SET estado = 'borrado', cerrado_en = ?, actualizado_en = ? WHERE id = ?").bind(ahoraIso, ahoraIso, i.id),
        ),
        respuesta: lista("Borrado", elegidos),
        tipo: "otro",
        itemIds: elegidos.map((i) => i.id),
        estadoFinal: "procesada",
      });
    }

    case "marcar_hecho": {
      const candidatos = unicos([...contexto.abiertos, ...contexto.citados, ...(contexto.preguntaPendiente?.opciones ?? [])]).filter((i) => i.estado === "abierto");
      const elegidos = candidatos.filter((i) => interpretacion.item_ids.includes(i.id));
      if (elegidos.length === 0) return { sentencias: [], respuesta: RESPUESTAS.nadaAbierto, tipo: "otro", itemIds: [], estadoFinal: "procesada" };
      if (elegidos.length > 1) return conPrevio(preguntaCual(elegidos));
      const item = elegidos[0]!;
      return conPrevio({
        sentencias: [
          env.DB.prepare("UPDATE items SET estado = 'hecho', cerrado_en = ?, actualizado_en = ? WHERE id = ?").bind(ahoraIso, ahoraIso, item.id),
        ],
        respuesta: `Hecho: ${lineaDeItem(item)}`,
        tipo: "otro",
        itemIds: [item.id],
        estadoFinal: "procesada",
      });
    }
  }
}

function preguntaCual(opciones: Item[]): Plan {
  return pregunta(["¿Cuál?", ...opciones.map((o, n) => `${n + 1}. ${lineaDeItem(o)}`)].join("\n"), opciones.map((o) => o.id));
}

function unicos(items: Item[]): Item[] {
  return [...new Map(items.map((i) => [i.id, i])).values()];
}
