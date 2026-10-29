// Fechas en hora argentina (principio 2, RF-05).
//
// Argentina está en UTC−3 todo el año: no usa horario de verano desde 2009.
// Un desfase fijo es más simple y predecible que depender de la base de zonas
// horarias del runtime.
const DESFASE_MS = -3 * 60 * 60 * 1000;

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"] as const;
const DIAS_COMPLETOS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** Horarios por defecto para "a la mañana", "a la tarde" y "a la noche" (A9). */
export const HORA_POR_FRANJA = { manana: "09:00", tarde: "17:00", noche: "21:00" } as const;
export type Franja = keyof typeof HORA_POR_FRANJA;

/** Fecha local argentina, sin hora: "2026-10-29". */
export type FechaLocal = string;

function local(d: Date): Date {
  return new Date(d.getTime() + DESFASE_MS);
}

function dosDigitos(n: number): string {
  return String(n).padStart(2, "0");
}

/** Fecha de hoy en Argentina para el instante `ahora`. */
export function fechaLocal(ahora: Date): FechaLocal {
  return local(ahora).toISOString().slice(0, 10);
}

/** 0 = domingo … 6 = sábado. */
export function diaDeLaSemana(fecha: FechaLocal): number {
  return new Date(`${fecha}T00:00:00Z`).getUTCDay();
}

export function sumarDias(fecha: FechaLocal, dias: number): FechaLocal {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Convierte fecha y hora argentinas al instante UTC que se guarda en la base. */
export function aUtc(fecha: FechaLocal, hora: string): Date {
  return new Date(new Date(`${fecha}T${hora}:00Z`).getTime() - DESFASE_MS);
}

/** Formato de toda confirmación y aviso: "jue 29/10 10:00", o "jue 29/10" sin hora. */
export function formatear(instante: Date, conHora = true): string {
  const d = local(instante);
  const fecha = `${DIAS[d.getUTCDay()]} ${dosDigitos(d.getUTCDate())}/${dosDigitos(d.getUTCMonth() + 1)}`;
  return conHora ? `${fecha} ${dosDigitos(d.getUTCHours())}:${dosDigitos(d.getUTCMinutes())}` : fecha;
}

/** Número de día (0 = domingo) a partir de "jueves", "Miércoles", "miercoles", "sabado"… */
export function numeroDeDia(nombre: string): number | undefined {
  const limpio = nombre.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const i = DIAS_COMPLETOS.findIndex((d) => d.normalize("NFD").replace(/[̀-ͯ]/g, "") === limpio);
  return i === -1 ? undefined : i;
}

export type ResolucionDia =
  | { tipo: "exacta"; fecha: FechaLocal }
  /** "El jueves" dicho un jueves: puede ser hoy o el de la semana que viene. Hay que preguntar. */
  | { tipo: "ambigua"; opciones: [FechaLocal, FechaLocal] };

/** Resuelve "el jueves" a la próxima fecha que cae ese día. */
export function proximoDia(ahora: Date, dia: number): ResolucionDia {
  const hoy = fechaLocal(ahora);
  const diferencia = (dia - diaDeLaSemana(hoy) + 7) % 7;
  if (diferencia === 0) return { tipo: "ambigua", opciones: [hoy, sumarDias(hoy, 7)] };
  return { tipo: "exacta", fecha: sumarDias(hoy, diferencia) };
}

export type ProblemaFecha = "invalida" | "pasada" | "dia_no_coincide";

/**
 * Valida una fecha y hora propuestas por el modelo antes de guardarlas.
 * Si se dijo un día de la semana, tiene que coincidir con el número: así un
 * error del modelo se convierte en pregunta y no en un dato mal guardado.
 */
export function validarFecha(
  ahora: Date,
  fecha: FechaLocal,
  hora: string | undefined,
  diaDicho?: string,
): ProblemaFecha | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || (hora !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora))) {
    return "invalida";
  }
  // Descarta fechas que no existen, como 2026-02-30.
  if (new Date(`${fecha}T00:00:00Z`).toISOString().slice(0, 10) !== fecha) return "invalida";

  if (diaDicho !== undefined) {
    const dia = numeroDeDia(diaDicho);
    if (dia === undefined) return "invalida";
    if (dia !== diaDeLaSemana(fecha)) return "dia_no_coincide";
  }

  const pasada = hora === undefined ? fecha < fechaLocal(ahora) : aUtc(fecha, hora).getTime() < ahora.getTime();
  return pasada ? "pasada" : undefined;
}

/** Solo la hora argentina: "10:00". */
export function horaLocal(instante: Date): string {
  const d = local(instante);
  return `${dosDigitos(d.getUTCHours())}:${dosDigitos(d.getUTCMinutes())}`;
}
