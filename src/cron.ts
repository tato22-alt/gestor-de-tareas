// Lo que corre cada minuto: reintentos (RF-13), avisos (H3) y resumen de la mañana (H4).

import type { Env } from "./env";
import { aUtc, diaDeLaSemana, fechaLocal, formatear, horaLocal, sumarDias } from "./fechas";
import { lineaDeItem, responder, type Item } from "./items";
import { procesarCaptura } from "./procesar";

const MINUTO = 60_000;
const HORA = 60 * MINUTO;

export async function alCron(env: Env, ahora: Date): Promise<void> {
  // Cada parte por separado: que falle una no frena a las otras.
  for (const [nombre, tarea] of [
    ["reintentos", reintentar],
    ["avisos", avisar],
    ["resumen", resumirSiToca],
  ] as const) {
    try {
      await tarea(env, ahora);
    } catch (error) {
      console.error(`Cron: falló ${nombre}`, error);
    }
  }
}

/** Capturas que quedaron sin procesar: Groq caído, el Worker cortado a mitad, etc. */
async function reintentar(env: Env, ahora: Date): Promise<void> {
  const { results } = await env.DB.prepare(
    `SELECT id FROM capturas WHERE estado IN ('pendiente', 'procesando') AND recibida_en < ?
     AND (tomada_en IS NULL OR tomada_en < ?) ORDER BY recibida_en LIMIT 10`,
  )
    .bind(new Date(ahora.getTime() - MINUTO).toISOString(), new Date(ahora.getTime() - 2 * MINUTO).toISOString())
    .all<{ id: number }>();
  for (const { id } of results) await procesarCaptura(env, id, ahora);
}

/**
 * Eventos con hora avisan 1 hora antes; recordatorios con hora, a la hora (A9).
 * Lo que tiene solo día va en el resumen; si no hubo resumen (fin de semana), avisa a las 9:00.
 */
async function avisar(env: Env, ahora: Date): Promise<void> {
  const hoy = fechaLocal(ahora);
  const ahoraIso = ahora.toISOString();
  const { results } = await env.DB.prepare(
    `SELECT * FROM items WHERE estado = 'abierto' AND aviso_enviado_en IS NULL AND fecha_hora IS NOT NULL AND (
       (tipo = 'evento' AND tiene_hora = 1 AND fecha_hora > ?1 AND fecha_hora <= ?2)
       OR (tipo = 'recordatorio' AND tiene_hora = 1 AND fecha_hora <= ?1 AND fecha_hora > ?3)
       OR (tipo IN ('evento', 'recordatorio') AND tiene_hora = 0 AND fecha_hora = ?4 AND ?5)
     ) ORDER BY fecha_hora`,
  )
    .bind(
      ahoraIso,
      new Date(ahora.getTime() + HORA).toISOString(),
      // Un recordatorio que no salió en 12 horas (sistema caído mucho tiempo) ya no se manda.
      new Date(ahora.getTime() - 12 * HORA).toISOString(),
      aUtc(hoy, "00:00").toISOString(),
      horaLocal(ahora) >= "09:00" ? 1 : 0,
    )
    .all<Item>();

  for (const item of results) {
    // Se marca antes de enviar para que dos corridas del cron no lo manden dos veces.
    const tomado = await env.DB.prepare("UPDATE items SET aviso_enviado_en = ? WHERE id = ? AND aviso_enviado_en IS NULL")
      .bind(ahoraIso, item.id)
      .run();
    if (tomado.meta.changes !== 1) continue;
    try {
      await responder(env, item.telegram_user_id, textoDeAviso(item, ahora), { tipo: "aviso", ahora, itemIds: [item.id] });
    } catch (error) {
      await env.DB.prepare("UPDATE items SET aviso_enviado_en = NULL WHERE id = ?").bind(item.id).run();
      throw error;
    }
  }
}

function textoDeAviso(item: Item, ahora: Date): string {
  if (item.tiene_hora === 0) return `Hoy: ${item.texto}`;
  if (item.tipo === "evento") return `Aviso: ${lineaDeItem(item)}`;
  const tarde = ahora.getTime() - new Date(item.fecha_hora!).getTime() > 10 * MINUTO;
  return tarde ? `Recordatorio (era para las ${horaLocal(new Date(item.fecha_hora!))}): ${item.texto}` : `Recordatorio: ${item.texto}`;
}

/** A las 7:30, de lunes a viernes (A4). Una vez por día aunque el cron corra cada minuto. */
async function resumirSiToca(env: Env, ahora: Date): Promise<void> {
  const hoy = fechaLocal(ahora);
  const dia = diaDeLaSemana(hoy);
  const hora = horaLocal(ahora);
  // Si a las 7:30 algo estaba caído, se intenta hasta las 10:00; después ya no sirve.
  if (dia === 0 || dia === 6 || hora < "07:30" || hora >= "10:00") return;

  const nueva = await env.DB.prepare("INSERT OR IGNORE INTO tareas_diarias (fecha, nombre) VALUES (?, 'resumen')").bind(hoy).run();
  if (nueva.meta.changes !== 1) return;
  try {
    const { results } = await env.DB.prepare("SELECT telegram_user_id FROM contactos_permitidos WHERE rol = 'papa'").all<{
      telegram_user_id: number;
    }>();
    for (const { telegram_user_id } of results) await enviarResumen(env, telegram_user_id, ahora);
  } catch (error) {
    await env.DB.prepare("DELETE FROM tareas_diarias WHERE fecha = ? AND nombre = 'resumen'").bind(hoy).run();
    throw error;
  }
}

export async function armarResumen(db: D1Database, usuario: number, ahora: Date): Promise<{ texto: string; agendaSinHora: number[]; ids: number[] } | null> {
  const hoy = fechaLocal(ahora);
  const inicio = aUtc(hoy, "00:00").toISOString();
  const fin = aUtc(sumarDias(hoy, 1), "00:00").toISOString();
  const consulta = (where: string, ...valores: unknown[]) =>
    db
      .prepare(`SELECT * FROM items WHERE telegram_user_id = ? AND estado = 'abierto' AND ${where} ORDER BY fecha_hora, id`)
      .bind(usuario, ...valores)
      .all<Item>()
      .then((r) => r.results);

  const agenda = await consulta("fecha_hora >= ? AND fecha_hora < ?", inicio, fin);
  const vencidos = await consulta("tipo IN ('recordatorio', 'pendiente') AND fecha_hora < ?", inicio);
  const quietos = await consulta(
    "tipo = 'pendiente' AND fecha_hora IS NULL AND actualizado_en < ?",
    new Date(ahora.getTime() - 7 * 24 * HORA).toISOString(),
  );
  // Un día sin nada no recibe mensaje (A4).
  if (agenda.length + vencidos.length + quietos.length === 0) return null;

  const todos = [...agenda, ...vencidos, ...quietos];
  // El ámbito se muestra solo si hay ítems de más de uno (H4.4).
  const variosAmbitos = new Set(todos.map((i) => i.ambito).filter((a) => a !== "sin_definir")).size > 1;
  const conAmbito = (linea: string, item: Item) =>
    variosAmbitos && item.ambito !== "sin_definir" ? `${linea} · ${item.ambito === "concejo" ? "Concejo" : item.ambito}` : linea;
  const lineaAgenda = (i: Item) => conAmbito(i.tiene_hora === 1 ? `${horaLocal(new Date(i.fecha_hora!))} ${i.texto}` : i.texto, i);

  const secciones: string[] = [];
  if (agenda.length) secciones.push([`Hoy ${formatear(ahora, false)}:`, ...agenda.map((i) => `• ${lineaAgenda(i)}`)].join("\n"));
  if (vencidos.length) secciones.push(["Vencidos:", ...vencidos.map((i) => `• ${conAmbito(lineaDeItem(i), i)}`)].join("\n"));
  if (quietos.length) secciones.push(["Sin moverse hace más de 7 días:", ...quietos.map((i) => `• ${conAmbito(i.texto, i)}`)].join("\n"));

  return {
    texto: secciones.join("\n\n"),
    agendaSinHora: agenda.filter((i) => i.tiene_hora === 0).map((i) => i.id),
    ids: todos.map((i) => i.id),
  };
}

async function enviarResumen(env: Env, usuario: number, ahora: Date): Promise<void> {
  const resumen = await armarResumen(env.DB, usuario, ahora);
  if (!resumen) return;
  await responder(env, usuario, resumen.texto, { tipo: "resumen", ahora, itemIds: resumen.ids });
  // Lo que tiene solo día ya quedó avisado con el resumen: no se repite a las 9:00.
  for (const id of resumen.agendaSinHora) {
    await env.DB.prepare("UPDATE items SET aviso_enviado_en = ? WHERE id = ? AND aviso_enviado_en IS NULL").bind(ahora.toISOString(), id).run();
  }
}
