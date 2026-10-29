import type { Env } from "./env";

const BASE = "https://api.groq.com/openai/v1";

// Pista para Whisper con nombres que suele decir y que un modelo genérico escribe mal (RF-02).
const VOCABULARIO =
  "Villa Gesell, Concejo Deliberante, concejal, Paseo 115, Avenida 3, Avenida Buenos Aires, " +
  "Secretaría de Obras, Servicios Públicos, desagües, luminaria, bache, cooperativa, ordenanza, taller, VTV.";

export class ErrorGroq extends Error {}

async function verificar(respuesta: Response): Promise<void> {
  if (!respuesta.ok) throw new ErrorGroq(`Groq respondió ${respuesta.status}: ${await respuesta.text()}`);
}

/** Audio → texto con Whisper. */
export async function transcribir(env: Env, audio: ArrayBuffer): Promise<string> {
  const formulario = new FormData();
  // Las notas de voz de Telegram vienen en OGG/Opus.
  formulario.append("file", new File([audio], "audio.ogg", { type: "audio/ogg" }));
  formulario.append("model", "whisper-large-v3-turbo");
  formulario.append("language", "es");
  formulario.append("prompt", VOCABULARIO);
  formulario.append("response_format", "json");

  const respuesta = await fetch(`${BASE}/audio/transcriptions`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.GROQ_API_KEY}` },
    body: formulario,
  });
  await verificar(respuesta);
  const { text } = (await respuesta.json()) as { text: string };
  return text.trim();
}

/** Pide al modelo un objeto JSON. La validación del contenido queda a cargo de quien llama. */
export async function completarJson(env: Env, sistema: string, usuario: string): Promise<unknown> {
  const respuesta = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.GROQ_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: env.GROQ_MODELO,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: sistema },
        { role: "user", content: usuario },
      ],
    }),
  });
  await verificar(respuesta);
  const cuerpo = (await respuesta.json()) as { choices: { message: { content: string } }[] };
  const contenido = cuerpo.choices[0]?.message.content;
  if (contenido === undefined) throw new ErrorGroq("Groq no devolvió contenido");
  try {
    return JSON.parse(contenido);
  } catch {
    throw new ErrorGroq(`Groq devolvió JSON inválido: ${contenido}`);
  }
}
