# Plan técnico — P1 · v0.1

28 oct 2026 · @tato · Fase SDD: plan. Base: [`spec.md`](spec.md) v0.4 y [`constitucion.md`](constitucion.md).

Criterio: KISS y costo mínimo (A7). Cada pieza es la opción más barata que cumple CE-03 (confirmar en menos de 30 s). Todo lo que se pueda se resuelve dentro de un solo proyecto Supabase, compartido con la app del taller.

## Stack

| Pieza | Elección | Por qué | Costo estimado |
|---|---|---|---|
| Canal | **WhatsApp Cloud API** (Meta), con número propio del asistente | Es el canal oficial (principio 7); el número personal de papá no se conecta a nada. | Ver "Costos" |
| Número | Chip prepago nuevo, solo para el asistente | Meta pide un número que no esté usado en otra cuenta de WhatsApp. | Chip + recarga mínima |
| Transcripción | **Groq, Whisper large-v3-turbo** | La API de Claude no recibe audio, así que hace falta transcribir antes. Rápida y con capa gratuita de 8 h de audio por día, que sobra. | USD 0 (pago: USD 0,04 por hora de audio) |
| IA | **Claude Haiku 5.5** (`claude-haiku-5-5`) con salida estructurada | Separa ítems, clasifica, pasa fechas a exactas y detecta dudas. Es extracción, no razonamiento largo: el modelo más barato alcanza. Si falla en los escenarios, se sube a Sonnet 5.5 cambiando una línea. | ~USD 1/mes |
| Base de datos | **Supabase Postgres**, mismo proyecto que la app del taller, en un esquema propio `asistente` | Un solo proyecto, una sola cuenta, y H15 después lee y escribe las tablas del taller sin copiar datos (A11). | USD 0 (plan gratis) |
| Archivos | **Supabase Storage**, bucket privado | Audios originales vinculados a cada captura (RF-14); se borran a los 90 días de cerrado el ítem (A8). | USD 0 |
| Código | **TypeScript** en **Supabase Edge Functions** | Sin servidor propio que mantener ni pagar. | USD 0 |
| Agenda y cola | **pg_cron + pg_net** dentro de Postgres | Dispara avisos cada minuto, el resumen de las 7:30 y reintenta capturas trabadas. Sin servicios extra. | USD 0 |
| Panel de Tato | **Supabase Studio** + vistas SQL | Revisar, corregir y exportar a CSV sin escribir un panel (RF-12). Un panel propio queda para después, si hace falta. | USD 0 |

## Cómo fluye un audio

```
papá ──audio──▶ WhatsApp Cloud API ──webhook──▶ Edge Function `whatsapp`
                                                  1. guarda la captura (estado: pendiente) y responde 200
                                                  2. baja el audio a Storage
                                                  3. Groq: audio → texto
                                                  4. Haiku: texto + fecha/hora actual + últimos ítems → ítems
                                                  5. guarda ítems (o pregunta, si hay dudas en un dato clave)
                                                  6. manda la confirmación
pg_cron (cada minuto) ──▶ Edge Function `avisos`: eventos 1 h antes, recordatorios a la hora
                       ──▶ reintenta capturas que quedaron en "pendiente" (RF-13)
pg_cron (lun a vie 10:30 UTC = 7:30 ART) ──▶ Edge Function `resumen`
```

- **Nada se pierde (RF-13):** la captura se guarda antes de procesarla. Si Groq, Claude o WhatsApp fallan, queda pendiente, el cron la reintenta y la confirmación avisa la demora.
- **Hora argentina:** todo se calcula en `America/Argentina/Buenos_Aires` (UTC−3, sin horario de verano). El modelo recibe la fecha y hora actuales y devuelve fechas exactas; el código valida que sean coherentes antes de guardar (por ejemplo, que "el jueves" no quede en el pasado).
- **Correcciones (H2):** WhatsApp avisa a qué mensaje se respondió. Cada confirmación guarda su id de mensaje, así "no, era el viernes" citando una confirmación va directo a ese ítem. Sin cita, se usa la última captura.
- **Solo papá y Tato (RF-11):** el webhook ignora cualquier número que no esté en una lista blanca, y el envío solo acepta esos dos destinos. Se controla en código, no solo en el prompt.

## Modelo de datos (P1)

| Tabla | Campos principales |
|---|---|
| `capturas` | id, wa_message_id, tipo (audio/texto), audio_path, transcripción, estado (pendiente/procesada/error/descartada), recibida_en, procesada_en |
| `items` | id, captura_id, tipo (evento/recordatorio/pendiente/nota), texto, fecha_hora, ámbito (concejo/taller/personal/sin_definir), estado (abierto/hecho/borrado), aviso_enviado, creado_en, actualizado_en |
| `mensajes` | id, wa_message_id, dirección (entrante/saliente), cuerpo, items vinculados (para resolver citas) |
| `contactos_permitidos` | teléfono, nombre, rol (papá/delegado) |

Las personas, compromisos y pedidos (P2) se agregan en migraciones nuevas cuando toque.

## Costos mensuales estimados

Supuestos: 30 capturas por día, 22 resúmenes por mes y unos 60 avisos por mes.

| Concepto | Estimación |
|---|---|
| Claude Haiku 5.5 (USD 0,10 / 0,50 por millón de tokens de entrada / salida; ~3 000 de entrada y ~600 de salida por captura) | ~USD 1 |
| Groq (capa gratuita) | USD 0 |
| Supabase (plan gratis) | USD 0 |
| WhatsApp: mensajes que inicia el sistema fuera de una conversación abierta (resúmenes y avisos), como plantilla "utility", a ~USD 0,03 cada uno en Argentina | ~USD 2,50 |
| **Total** | **~USD 3,50/mes** + recarga del chip |

**Sobre WhatsApp:** si papá escribió en las últimas 24 h, la conversación está abierta y responder es gratis, incluidas las plantillas utility. Lo que se paga es lo que el sistema inicia fuera de esa ventana, como el resumen de las 7:30. La tarifa de Argentina sale de un sitio de terceros (enero 2026) y Meta la puede cambiar cada trimestre; hay que confirmarla en el panel de Meta antes de implementar. Una fuente secundaria menciona que Meta empezaría a cobrar los mensajes de servicio desde el 1/10/2026: también hay que verificarlo, porque podría sumar unos pocos dólares.

## Validación contra la constitución

| Principio | Cómo lo cumple el plan |
|---|---|
| 1. Cero curva de aprendizaje | Papá solo usa WhatsApp; no instala nada. |
| 2. Nada se guarda sin que lo vea | Cada captura termina en una confirmación con fecha `jue 29/10 10:00`; si el modelo duda, pregunta antes de guardar. |
| 3. Corregir es hablar | Las correcciones entran por el mismo webhook y el mismo modelo. |
| 4. Nunca habla en su nombre | Lista blanca de destinos en código: solo papá y Tato. |
| 5. Él tira, el sistema ordena | Haiku separa, clasifica y fecha. |
| 6. Pocas funciones, muy confiables | Cuatro Edge Functions y cuatro tablas para todo P1. |
| 7. Datos de terceros con cuidado | Número propio, canal oficial, bucket privado, borrado a 90 días, acceso solo con la cuenta de Supabase de Tato. |
| 8. Excel es una salida | Los datos viven en Postgres; el CSV o Excel se genera a pedido. |

## Riesgos y cómo se cubren

| Riesgo | Cobertura |
|---|---|
| Whisper entiende mal calles o nombres de Villa Gesell | Se le pasa un vocabulario (avenidas, paseos, nombres frecuentes) como pista; si la fecha, la hora o la persona quedan dudosas, se pregunta (RF-08). |
| Haiku no alcanza para casos ambiguos | Los escenarios de H1 y H2 se corren como prueba automática; si no llega a 9 de 10, se cambia a Sonnet 5.5. |
| Supabase gratis no tiene backups automáticos | Export semanal de la base con un GitHub Action a un archivo privado. |
| Supabase gratis pausa proyectos sin actividad | El uso diario y el cron de cada minuto lo mantienen activo. |
| La plantilla de WhatsApp tarda en aprobarse o se rechaza | Pedir la aprobación de las plantillas de aviso y resumen apenas esté el número, antes de escribir código. |
| Sin audios reales (A10) | Mientras tanto, Tato graba audios de prueba imitando a papá. P1 no se da por cerrado hasta probar con los reales. |

## Antes de tasks: cuentas y trámites

1. Chip prepago para el número del asistente.
2. App en Meta for Developers con WhatsApp Cloud API, el número verificado y una cuenta de Meta Business.
3. Plantillas utility para aviso y resumen, enviadas a aprobación.
4. API key de Anthropic con un límite de gasto mensual bajo (por ejemplo, USD 5) en la consola.
5. API key de Groq.
6. Acceso al proyecto Supabase de la app del taller, con pg_cron y pg_net habilitados.
