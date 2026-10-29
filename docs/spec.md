# Asistente por Telegram para papá — Spec SDD v0.5

27 oct 2026 (v0.1) · 28 oct 2026 (v0.2, primera ronda de clarify) · 28 oct 2026 (v0.3, A4, A8 y A9 confirmadas) · 28 oct 2026 (v0.4, A1, A7 y A11) · 28 oct 2026 (v0.5, canal Telegram y costo cero) · @tato

## Contexto

Un asistente por Telegram al que papá le habla como a una secretaria. Él suelta lo que tiene en la cabeza; el sistema lo ordena y se lo devuelve cuando hace falta.

Pedido original: que mediante audios de WhatsApp se generen planillas y automatizaciones que le saquen de encima toda esa información. Tiene que ser muy fácil de usar: tiene 53 años y ya domina los audios. El canal pasó de WhatsApp a Telegram en v0.5 para que cueste cero (ver "Canal y costo"); los audios se mandan igual.

- **Usuario principal:** papá, concejal en Villa Gesell. También participa del día a día del taller (A2).
- **Usuario secundario:** Tato. Revisa, corrige, recibe delegaciones y mantiene el sistema. Es el único delegado (A6).
- **Celular de papá:** Android. Hoy no usa ningún calendario (A3).
- **Fase SDD actual:** clarify (solo queda abierta A10, que es lo único que falta para cerrar P1). Este doc define qué hace y por qué; el cómo (canal, base de datos, transcripción) se decide en plan.
- **Cómo leerlo:** P1 es el MVP y se entrega solo; P2 y P3 entran cuando lo anterior se usa a diario. Las marcas [ACLARAR Ax] remiten a la última sección.

Él solo manda y recibe por un chat de Telegram; todo lo del medio es trabajo del sistema, y Tato lo supervisa desde un panel.

La constitución vive en [`constitucion.md`](constitucion.md).

## Canal y costo (v0.5)

Tato pidió costo cero. Desde el 1/10/2026 la API oficial de WhatsApp cobraría cada mensaje que manda el asistente, incluidas las confirmaciones (unos USD 24/mes estimados; según fuentes secundarias, sin confirmar en Meta), y conectar WhatsApp por vías no oficiales viola el principio 7. Por eso el canal es **un bot de Telegram**:

- Es oficial y gratis, y no tiene ventana de 24 h: avisos y resumen salen sin costo a cualquier hora.
- Los audios, las respuestas citando un mensaje y los reenvíos funcionan igual que en WhatsApp.
- El costo: papá tiene que instalar Telegram. Tato se lo deja instalado, con su número y con el chat del asistente fijado arriba. Es la única excepción al principio 1 y quedó anotada en la constitución.
- Riesgo a vigilar: que no lo abra porque vive en WhatsApp. Las notificaciones de Telegram tienen que quedar activadas y con sonido; CE-01 mide si lo usa.

## Estilo de las respuestas (A5)

Papá lee texto, no escucha audios. Las respuestas son **concisas, sin vueltas**:

- Una línea por ítem. Sin saludos, emojis de relleno ni explicaciones.
- Formato fijo de fecha: `jue 29/10 10:00`.
- Si hace falta preguntar algo, una sola pregunta, al final.

Ejemplo de confirmación válida: `Anotado: jue 29/10 10:00, reunión con secretario de Obras (desagües Paseo 115)`.

## Historias P1: el MVP

P1 cierra el ciclo completo: él suelta algo, queda bien guardado y le vuelve cuando hace falta. Con esto solo ya le sirve.

### H1. Capturar por audio

Como papá, quiero mandar un audio con lo que se me cruza para dejar de cargarlo en la cabeza.

- **Prueba independiente:** 10 audios reales [ACLARAR A10]; al menos 9 quedan bien sin corregir.
- **Escenarios:**
  1. Dice "el jueves a las diez tengo reunión con el secretario de Obras por los desagües del Paseo 115". Queda un evento el jueves 29/10 a las 10:00 y responde: "Anotado: jue 29/10 10:00, reunión con secretario de Obras (desagües Paseo 115)".
  2. Dice "llamar a Gómez por el presupuesto, comprar cartuchos, y el lunes vence el seguro del auto". Quedan tres ítems separados, confirmados en un solo mensaje.
  3. Dice "tengo que averiguar lo del subsidio de la cooperativa". Queda un pendiente sin fecha.
  4. El audio no se entiende por ruido o viento. Pide que lo repita y no guarda nada.
  5. Dice "mañana pasa el de la Hilux a buscar el auto". Queda un evento con ámbito **taller** (A1, A2).

### H2. Corregir y deshacer hablando

Como papá, quiero corregir como corregiría a una persona, para confiar en lo que quedó.

- **Prueba independiente:** sobre 10 capturas con errores provocados, cada corrección se resuelve en un solo mensaje.
- **Escenarios:**
  1. Responde citando una confirmación: "no, era el viernes". Cambia ese ítem y reconfirma con la fecha nueva.
  2. Sin citar, dice "borrá eso". Borra la última captura y dice qué borró.
  3. Dice "lo de Gómez ya está". Lo marca hecho; si hay dos cosas con Gómez, pregunta cuál.

### H3. Agenda y recordatorios

Como papá, quiero que lo que tiene día y hora me avise solo, para no depender de acordarme.

- **Prueba independiente:** 5 eventos y 5 recordatorios; los 10 avisan a tiempo.
- **Canal de avisos (A3):** **por Telegram**, en el mismo chat del asistente. Como no usa calendario, no se integra ninguno en P1: sumarle una app nueva va contra el principio 1.
- **Escenarios:**
  1. Dice "recordame mañana a la tarde llamar a la escuela". Queda para mañana a las 17:00 (horario por defecto, A9) y la confirmación lo dice.
  2. Carga un evento que choca con otro. Lo avisa al confirmar.
  3. ~~Cada evento aparece también en el calendario de su celular.~~ Eliminado en v0.2 (A3). Cada evento avisa por Telegram 1 hora antes; los recordatorios avisan a la hora exacta (A9).

### H4. Resumen de la mañana

Como papá, quiero un solo mensaje temprano con lo del día, para arrancar sin repasar nada.

- **Prueba independiente:** 5 días hábiles seguidos llega a horario y él no necesita preguntar nada más.
- **Escenarios:**
  1. A las 7:30, de lunes a viernes (A4), recibe: agenda del día, pendientes vencidos y lo que lleva más de 7 días sin moverse. Desde P2 suma los compromisos que vencen.
  2. Un día sin nada no recibe ningún mensaje (A4).
  3. Sábados y domingos no hay resumen; los avisos de eventos y recordatorios sí llegan.
  4. El resumen marca el ámbito de cada línea (Concejo, taller, personal) solo si hay ítems de más de uno.

## Historias P2: que no se le escape nada con la gente

P2 convierte capturas en seguimiento de personas y promesas, que es donde más se pierde, en el taller y en el Concejo. Entra cuando P1 se usa a diario; escenarios y pruebas se detallan cuando cada historia sea la próxima.

**Orden de entrega (A1: el taller es lo que más pesa):** H5 → H9 → H7 → H8 → H10 → H6. Primero lo que le sirve al taller (lo que prometió a clientes y espera de proveedores, fichas de clientes, fotos de autos y presupuestos reenviados); H6, que es solo del Concejo, va al final.

### H5. Compromisos en los dos sentidos

Dice "le dije a Rosa, la de Avenida 8, que la llamaba el viernes por el bache". Queda un compromiso suyo con Rosa, con fecha y aviso, que aparece en el resumen hasta cerrarse. "El de Obras me tiene que mandar el informe" queda como algo que espera de otro, con fecha para reclamarlo.

### H6. Pedidos de vecinos

Cada pedido tiene vecino, ubicación, tema y estado: recibido, derivado (a qué área), resuelto y vecino avisado. Dice "derivé lo de la luminaria de la 105 a Servicios Públicos" y el estado cambia. Al resolverse le recuerda avisarle al vecino; el sistema nunca le escribe al vecino.

### H7. Reenviar en vez de dictar

Reenvía al asistente un mensaje, el audio de un vecino, una foto o un PDF. Se procesa como si lo hubiera dictado y el original queda adjunto. La foto de una tarjeta crea un contacto; la de un bache se suma a su pedido.

### H8. Preguntarle a su memoria

"¿Qué quedó con Gómez?", "¿qué pedidos de alumbrado tengo abiertos?", "¿cuándo hablé con el de la cooperativa?". Responde solo con lo cargado; si no hay nada, lo dice y nunca inventa.

### H9. Fichas de personas

Cada persona mencionada tiene una ficha: quién es, cómo ubicarla si se dijo, historial y compromisos abiertos de los dos lados. Si hay dos Gómez, pregunta cuál antes de guardar.

### H10. Planillas a pedido

"Mandame en Excel los pedidos de octubre" devuelve el archivo por Telegram. Cualquier listado sale en Excel o PDF: el Excel del pedido original vuelve como salida.

## Historias P3: que trabaje por él

P3 son las ideas de más valor, pero dependen de que P1 y P2 funcionen. Se detallan recién cuando les toque.

| Historia | Qué hace | Depende de |
|---|---|---|
| H11. Brief antes de reuniones | 30 minutos antes de ver a alguien le manda qué tiene abierto con esa persona y cuándo fue el último contacto. | H5, H9 |
| H12. Minuta al salir | Un audio de 2 minutos al salir de una reunión queda como minuta: quiénes, temas y acuerdos. Cada acuerdo pasa a compromiso. | H5 |
| H13. Delegar | "Pasale a Tato lo de la ordenanza de playa" le llega a Tato con contexto; cuando Tato lo cierra, papá recibe aviso. Tato es el único delegado (A6). | H5 |
| H14. Proyectos del Concejo | Ideas y proyectos con estado: idea, en redacción, presentado, en comisión, aprobado o rechazado. | H8 |
| H15. Taller | Novedades de autos y casos por audio, escritas en la app del taller que está desarrollando Tato (A11), sin duplicar datos. Es la primera de P3 porque el taller es lo que más pesa (A1). El Excel actual no se integra: lo reemplaza esa app. | H5, H9, app del taller |
| H16. Vencimientos y gastos | Seguro, patente, VTV y servicios con aviso previo; gastos por audio o con foto del ticket. | H3, H7 |

## Casos borde

Lo que más rompe la confianza son fechas mal entendidas y personas confundidas; estos casos se prueban antes de cerrar P1.

- **Audio largo con muchos temas** (5 minutos, 10 cosas): separa todo y confirma resumido, con opción de ver el detalle.
- **Fechas ambiguas:** "el jueves" dicho un jueves, "a fin de mes", "después de las fiestas". Confirma con fecha exacta o pregunta; nunca supone en silencio.
- **Ruido y viento:** audios en la calle, la playa o el taller. Si duda de un dato clave (fecha, hora, persona, monto), pregunta solo ese dato.
- **Apodos y nombres repetidos:** "el Colo", "Rosa la de la 8". Aprende el apodo una vez confirmado.
- **Citas de terceros:** "me dijo que lo llame el lunes" crea un compromiso suyo, no del otro.
- **Ámbito dudoso:** "llamar a Gómez" puede ser un cliente del taller o un vecino. Si no surge del audio, guarda sin preguntar con ámbito "sin definir" (el ámbito no es dato clave) y Tato lo corrige desde el panel.
- **Sistema caído:** ninguna captura se pierde; se procesa al volver y avisa la demora.
- **Pedidos fuera de alcance:** "¿cómo salió Boca?" recibe una línea diciendo que eso no lo hace.
- **Otros chats:** el asistente no ve sus conversaciones; solo lo que le mandan o le reenvían.

## Requisitos funcionales

Veinte requisitos; los quince P1 son el contrato del MVP.

| ID | Requisito | Prioridad |
|---|---|---|
| RF-01 | DEBE recibir audios y textos de la cuenta de Telegram de papá; fotos, PDF y reenvíos desde P2. | P1 |
| RF-02 | DEBE transcribir español rioplatense, incluidas calles de Villa Gesell (avenidas y paseos). | P1 |
| RF-03 | DEBE separar un audio en varios ítems cuando trae varias cosas. | P1 |
| RF-04 | DEBE clasificar cada ítem como evento, recordatorio, pendiente o nota, y asignarle ámbito (Concejo, taller, personal o sin definir); compromiso, pedido, contacto y gasto se suman por etapa. | P1 |
| RF-05 | DEBE pasar fechas relativas a fecha exacta en hora argentina y mostrarlas con día, número y hora. | P1 |
| RF-06 | DEBE confirmar cada captura en un mensaje corto de texto (A5), dentro del tiempo de CE-03. | P1 |
| RF-07 | DEBE permitir corregir, completar, marcar hecho y deshacer por voz o texto; citando una confirmación, aplica a ese ítem. | P1 |
| RF-08 | DEBE preguntar antes de guardar si duda de fecha, hora, persona o monto. | P1 |
| RF-09 | DEBE avisar eventos y recordatorios a tiempo **por Telegram** (A3). | P1 |
| RF-10 | DEBE mandar el resumen de la mañana a las 7:30, de lunes a viernes, y no mandarlo si el día no tiene nada (A4). | P1 |
| RF-11 | NO DEBE escribirle a nadie más que a papá y a Tato (único delegado, A6). | P1 |
| RF-12 | DEBE darle a Tato una vista para revisar, corregir y exportar todo. | P1 |
| RF-13 | NO DEBE perder capturas si algo falla: las encola, las procesa al volver y avisa. | P1 |
| RF-14 | DEBE guardar el original (audio, foto, PDF) vinculado a cada ítem hasta 90 días después de cerrado el ítem, salvo que Tato lo marque para conservar (A8). | P1 |
| RF-15 | DEBE rechazar en una línea lo que está fuera de alcance. | P1 |
| RF-16 | DEBE responder consultas solo con lo cargado y decir cuando no tiene datos. | P2 |
| RF-17 | DEBE vincular cada mención de persona a una ficha única y preguntar ante ambigüedad. | P2 |
| RF-18 | DEBE llevar el estado de cada pedido de vecino y recordar avisarle al vecino al resolverse. | P2 |
| RF-19 | DEBE generar Excel o PDF de cualquier listado a pedido y mandarlo por Telegram. | P2 |
| RF-20 | DEBE exportar o borrar todos los datos de una persona a pedido. | P2 |

## Entidades clave

Todo nace de una captura: lo que él mandó, y los ítems y personas que salieron de ahí.

| Entidad | Qué guarda |
|---|---|
| Captura | El mensaje original (audio, texto, foto, PDF, reenvío), su transcripción, la fecha y los ítems que generó. |
| Ítem | Tipo, texto, fecha y hora, estado, ámbito (Concejo, taller, personal, sin definir), personas vinculadas y captura de origen. |
| Evento o recordatorio | Ítem con fecha y hora y aviso previo por Telegram. |
| Pendiente | Ítem sin fecha obligatoria; abierto o hecho. |
| Compromiso | Quién le debe a quién (él o el otro), qué, para cuándo y estado. |
| Pedido de vecino | Vecino, ubicación, tema, área a la que se derivó, estado y si se le avisó. |
| Persona | Nombre, apodos, rol (vecino, funcionario, proveedor, cliente del taller, familia), cómo ubicarla y notas. |
| Proyecto | Título, estado legislativo, quién lo redacta y fechas clave. |
| Gasto | Monto, categoría, fecha y comprobante. |
| Delegado | Persona que aceptó recibir tareas; solo Tato (A6). |

## Criterios de éxito

El éxito se mide por uso real, no por funciones: si a las 2 semanas no lo usa solo, P1 falló.

| ID | Criterio | Meta |
|---|---|---|
| CE-01 | Capturas por día hábil sin que nadie se lo recuerde, desde la semana 3 | 5 o más |
| CE-02 | Ítems correctos sin corregir (muestra semanal revisada por Tato) | 90% o más |
| CE-03 | Tiempo hasta la confirmación, audios de hasta 1 minuto | Menos de 30 s en 95 de cada 100 |
| CE-04 | Compromisos vencidos sin al menos un aviso previo | 0 |
| CE-05 | Mensajes a terceros sin alta explícita | 0 |
| CE-06 | Explicación necesaria para que lo use solo, con Telegram ya instalado por Tato | 5 minutos como máximo |
| CE-07 | Costo mensual total | USD 0 (A7, v0.5): solo planes gratuitos; si una pieza deja de ser gratis, se avisa antes de pagar nada |

## Fuera de alcance v1

Lo que no hace aunque se lo pidan, para proteger la simplicidad y su nombre.

- Escribirles a vecinos, clientes o funcionarios en su nombre.
- Charlar o responder preguntas generales: no es un chatbot.
- Redactar proyectos completos: registra la idea y el estado; la redacción sigue en manos de Tato.
- Pagar, cobrar o mover plata.
- Leer sus otros chats, de Telegram, WhatsApp o cualquier otra app.
- Sincronizar con un calendario (Google Calendar u otro): no usa ninguno (A3). Se reconsidera solo si él lo pide.
- Responder con audios: prefiere texto (A5).

## Aclaraciones

### Resueltas (v0.2 a v0.4, 28/10/2026)

| ID | Pregunta | Respuesta | Impacto en el spec |
|---|---|---|---|
| A1 | Ámbitos | Concejo, taller y personal. | RF-04 asigna ámbito a cada ítem; se suma "sin definir" para no preguntar de más. El que más pesa es el **taller** (v0.4): define el orden de P2 y pone H15 primera en P3. |
| A2 | ¿Participa del taller? | Sí, participa. | H15 sigue en alcance (P3). Escenario H1.5 de ámbito taller. |
| A3 | Calendario y celular | No usa calendario. Android. | Avisos solo por el chat del asistente (Telegram desde v0.5). Se elimina H3 escenario 3 y la sincronización con calendario pasa a fuera de alcance. |
| A5 | ¿Texto o audio? | Mensajes concisos, sin vueltas. | Nueva sección "Estilo de las respuestas"; respuestas solo en texto. |
| A6 | Delegados | Solo Tato. | RF-11 y entidad Delegado limitados a Tato. Secretaria y asesor quedan afuera; sumarlos requiere alta explícita. |
| A7 | Presupuesto | Lo mínimo posible, sin tope fijo (v0.4); pregunta si se puede usar la cuenta de Claude de Tato. | CE-07 como criterio de costo mínimo. Ver nota abajo. |
| A11 | Sistema del taller | Hoy, un Excel muy básico; Tato está desarrollando una app para el taller (v0.4). | H15 escribe en esa app, no en el Excel. El plan decide cómo se conectan las dos sin duplicar datos (por ejemplo, que el asistente le pase los datos a la app y no guarde una copia propia de autos y clientes). |
| A8 | Conservación de originales | Lo necesario; confirmada la propuesta de 90 días (v0.3). | RF-14 con plazo concreto. Detalle abajo. |
| A4 | Resumen de la mañana | Confirmada la propuesta (v0.3): 7:30, lunes a viernes; un día sin nada, silencio. | H4 y RF-10 con hora y días fijos. |
| A9 | Horarios por defecto | Confirmada la propuesta (v0.3): mañana 9:00, tarde 17:00, noche 21:00; eventos avisan 1 hora antes, recordatorios a la hora exacta. | H3 sin marcas pendientes. |

**Nota sobre A7 (¿se puede usar la cuenta de Claude?).** Hay que separar dos usos:

- **Construirlo (fase implement):** sí. La suscripción de Claude de Tato sirve para usar Claude Code y escribir el sistema.
- **Que funcione todos los días:** no con la suscripción. El asistente corre solo, 24 horas, respondiendo mensajes sin nadie frente a la compu; eso necesita una clave de la API de Anthropic, que se paga aparte, por uso. La suscripción es para uso personal en las apps de Claude y no se puede conectar a un servicio automático. Con un modelo chico y el volumen esperado (decenas de mensajes por día), el costo de la IA debería ser bajo; el número real se calcula en plan.
- **Decisión final (v0.5):** costo cero. La IA corre en la capa gratuita de Groq en lugar de la API de Claude, y el canal es Telegram (ver "Canal y costo").

**Detalle de A8.** Audios y fotos originales se guardan **90 días** después de que el ítem se cierra (hecho o borrado), y después se borran solos; la transcripción y el ítem quedan. Alcanza para revisar errores y para la muestra semanal de CE-02 sin acumular datos de terceros de más (principio 7). Tato puede marcar un original como "conservar".

### Abiertas

- [ ] **A10. Audios reales.** 5 a 10 audios como se los mandaría a una secretaria, idealmente mezclando Concejo, taller y personal. Pasan a ser los escenarios de aceptación de H1. **Es lo único que bloquea cerrar P1.**

## Próximos pasos SDD

1. **Clarify:** conseguir los audios de A10 (lo único que falta para P1), con más audios de taller porque es lo que más pesa.
2. **Plan:** ver [`plan.md`](plan.md) (stack definido el 28/10/2026).
3. **Tasks:** dividir P1 en tareas chicas y verificables.
4. **Implement:** P1 con Claude Code, una tarea a la vez, probando contra los escenarios.
