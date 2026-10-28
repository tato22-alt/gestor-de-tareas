# Plan técnico — P1 · v0.2

28 oct 2026 · @tato · Fase SDD: plan. Base: [`spec.md`](spec.md) v0.5 y [`constitucion.md`](constitucion.md).

Criterio: KISS y **costo cero** (A7, CE-07). Cada pieza usa solo un plan gratuito, y no hace falta poner tarjeta en ningún servicio. No se usa Supabase: los dos proyectos gratis de la cuenta ya están ocupados.

## Stack

| Pieza | Elección | Por qué |
|---|---|---|
| Canal | **Bot de Telegram** (Bot API oficial) | Gratis, oficial y sin ventana de 24 h: avisos y resumen salen a cualquier hora sin costo. No necesita chip ni número propio. |
| Transcripción | **Groq, Whisper large-v3-turbo**, capa gratuita | La capa gratis da 8 h de audio por día, y papá manda unos minutos. |
| IA | **Modelo abierto en Groq**, capa gratuita (por ejemplo, Llama 3.3 70B), con respuesta en JSON | Separa ítems, clasifica, pasa fechas a exactas y detecta dudas. El modelo concreto se elige en T5 corriendo los escenarios del spec. Según el contrato de Groq, no entrena con los datos. |
| Código | **TypeScript** en **Cloudflare Workers**, plan gratis | 100 000 pedidos por día, sin servidor que mantener. El tiempo esperando a Groq o a Telegram no cuenta para el límite de CPU. |
| Base de datos | **Cloudflare D1** (SQLite), plan gratis | 5 GB y millones de lecturas por día; el asistente usa una fracción mínima. |
| Agenda y reintentos | **Cron Triggers** del Worker | Un solo cron, cada minuto: manda avisos, reintenta capturas trabadas y, a las 7:30 de lunes a viernes, el resumen. |
| Audios originales | **No se copian**: se guarda el `file_id` de Telegram | Telegram ya guarda el audio y el bot lo puede volver a bajar con ese id. Evita R2, que pide tarjeta. A los 90 días de cerrado el ítem se borra la referencia (A8). |
| Panel de Tato | **Página chica servida por el mismo Worker** | Lista, edición y export a CSV (RF-12). Se entra con un link de un solo uso que el bot le manda a Tato por Telegram: no hace falta otro servicio de login. |
| Herramientas | `wrangler` (deploy y migraciones de D1) y `vitest` (pruebas) | Lo estándar de Cloudflare, sin costo. |

**Costo mensual: USD 0.** Si Groq o Cloudflare cambian sus planes gratis, se avisa antes de pagar nada. Las salidas posibles son Claude Haiku 5.5 (unos USD 1/mes) o un plan pago chico.

## Cómo fluye un audio

```
papá ──audio──▶ Telegram ──webhook──▶ Worker  POST /telegram
                                        1. valida el secreto del webhook y que el remitente sea papá o Tato
                                        2. guarda la captura (estado: pendiente) y responde 200 enseguida
                                        3. en segundo plano (waitUntil):
                                           a. baja el audio de Telegram con su file_id
                                           b. Groq Whisper: audio → texto
                                           c. Groq LLM: texto + fecha/hora actual + ítems abiertos → JSON de ítems
                                           d. el código valida fechas y tipos; si un dato clave es dudoso, pregunta
                                           e. guarda los ítems y manda la confirmación citando el audio
Cron (cada minuto) ──▶ avisos de eventos (1 h antes) y recordatorios (a la hora)
                   ──▶ reintenta capturas en "pendiente" de hace más de 2 minutos (RF-13)
                   ──▶ a las 10:30 UTC de lunes a viernes (7:30 ART): resumen de la mañana
                   ──▶ una vez por día: borra referencias de audios vencidas (A8)
```

- **Nada se pierde (RF-13):** la captura se guarda antes de procesarla. Si Groq o Telegram fallan, queda pendiente, el cron la reintenta y la confirmación avisa la demora. Si Groq está caído más de 10 minutos, el bot avisa "lo tengo, lo proceso en un rato".
- **Hora argentina:** el Worker corre en UTC; todo se convierte con `America/Argentina/Buenos_Aires` (UTC−3, sin horario de verano). El modelo recibe la fecha y hora actuales con el día de la semana. El código, no el modelo, verifica que la fecha sea válida, que no quede en el pasado y que coincida el día de la semana dicho con el número.
- **Formato de fechas:** lo arma el código, no el modelo: `jue 29/10 10:00`. Así el principio 2 no depende de que la IA escriba bien.
- **Correcciones (H2):** cuando papá responde citando un mensaje, Telegram dice a cuál. Cada confirmación guarda su `message_id` y los ítems que contiene, así "no, era el viernes" va directo a ese ítem. Sin cita, se usa la última captura.
- **Solo papá y Tato (RF-11):** el Worker ignora a cualquier usuario de Telegram que no esté en la tabla `contactos_permitidos`, y la función de envío solo acepta esos ids. Se controla en código, no en el prompt. Al bot cualquiera lo puede encontrar, pero a los demás no les contesta nada.

## Modelo de datos (P1)

| Tabla | Campos principales |
|---|---|
| `capturas` | id, telegram_user_id, telegram_message_id, responde_a_message_id, tipo (audio/texto), audio_file_id, transcripción, estado (pendiente/procesada/error/descartada), intentos, recibida_en, procesada_en |
| `items` | id, captura_id, tipo (evento/recordatorio/pendiente/nota), texto, fecha_hora (UTC), ámbito (concejo/taller/personal/sin_definir), estado (abierto/hecho/borrado), aviso_enviado_en, creado_en, actualizado_en, cerrado_en |
| `mensajes_salientes` | telegram_message_id, captura_id, item_ids, enviado_en (para resolver citas) |
| `contactos_permitidos` | telegram_user_id, nombre, rol (papá/delegado) |
| `panel_tokens` | token, vence_en, usado |

Personas, compromisos y pedidos (P2) se agregan en migraciones nuevas cuando toque. H15 (taller) va a leer y escribir la app del taller en Supabase por su API REST, sin copiar datos.

## Validación contra la constitución

| Principio | Cómo lo cumple el plan |
|---|---|
| 1. Cero curva de aprendizaje | Un chat de Telegram que Tato deja instalado y fijado; después, solo audios y textos. |
| 2. Nada se guarda sin que lo vea | Cada captura termina en una confirmación con fecha armada por el código; si hay duda en un dato clave, pregunta antes de guardar. |
| 3. Corregir es hablar | Las correcciones entran por el mismo webhook y el mismo modelo. |
| 4. Nunca habla en su nombre | Lista blanca de destinatarios en código: solo papá y Tato. |
| 5. Él tira, el sistema ordena | El modelo separa, clasifica y fecha; el código valida. |
| 6. Pocas funciones, muy confiables | Un Worker, un cron y cinco tablas para todo P1. |
| 7. Datos de terceros con cuidado | Bot propio, APIs oficiales, panel con link de un solo uso, referencias a audios borradas a 90 días, export en CSV. |
| 8. Excel es una salida | Los datos viven en D1; el CSV o Excel se genera a pedido. |

## Riesgos y cómo se cubren

| Riesgo | Cobertura |
|---|---|
| Papá no abre Telegram porque vive en WhatsApp | Chat fijado arriba, notificaciones con sonido. Si en 2 semanas no llega a CE-01, se revisa el canal antes de seguir con P2. |
| El modelo gratis de Groq entiende mal fechas o separa mal | Los escenarios de H1 y H2 corren como prueba automática; tiene que pasar 9 de 10. Si no llega, se prueba otro modelo de Groq y, en último caso, Claude Haiku 5.5 (unos USD 1/mes, decisión de Tato). |
| Whisper entiende mal calles o nombres de Villa Gesell | Se le pasa un vocabulario (avenidas, paseos, nombres frecuentes) como pista, y RF-08 pregunta ante la duda. |
| Límites o caídas de la capa gratis de Groq | Cola en D1 y reintento por cron; el bot avisa la demora. |
| Cambian los planes gratis | Se revisa la consola de cada servicio una vez por mes; ninguno tiene tarjeta cargada, así que no puede haber cobros sorpresa. |
| D1 no tiene backup en la cuenta gratis más allá de su historial de recuperación | Export semanal a CSV que el bot le manda a Tato por Telegram. |
| Sin audios reales (A10) | Tato graba audios de prueba imitando a papá. P1 no se cierra hasta probar con los reales. |

## Cuentas que hacen falta (todas gratis, sin tarjeta)

1. Bot de Telegram creado con @BotFather (da el token).
2. Cuenta de Cloudflare (Workers y D1).
3. Cuenta de Groq y API key.
4. Telegram instalado en el celular de papá, con el chat del bot iniciado.

## Fuentes de los datos de costo

- WhatsApp cobrando también las respuestas desde el 1/10/2026: [peppercloud](https://blog.peppercloud.com/whatsapp-api-pricing-everything-you-need-to-know/), [conferbot](https://www.conferbot.com/whatsapp-free-api), [gradezilla](https://gradezilla.org/whatsapp-business-api-pricing/). Son fuentes secundarias; Meta no lo confirma en su página.
- Groq Whisper y su capa gratuita: [Groq](https://groq.com/whisper-large-v3-turbo-now-available-on-groq-combining-speed-quality-for-speech-recognition/), [comparativa](https://dev.to/build996/free-whisper-api-groq-deepgram-assemblyai-compared-562m).
- Política de datos de Groq: [aireiter](https://aireiter.com/blog/best-free-ai-api).
