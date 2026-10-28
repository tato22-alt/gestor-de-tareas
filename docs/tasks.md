# Tareas — P1 · v0.1

28 oct 2026 · @tato · Fase SDD: tasks. Base: [`plan.md`](plan.md) v0.2.

Cada tarea es chica, se prueba sola y deja el repo andando. "Necesita" marca lo que hay que tener antes de empezarla: las tareas sin cuentas se pueden hacer ya.

| ID | Tarea | Verificación | Necesita | Estado |
|---|---|---|---|---|
| T1 | Esqueleto del Worker en TypeScript con `wrangler` y `vitest` | `npm test` y `npm run typecheck` pasan | — | Hecha |
| T2 | Migración inicial de D1 con las tablas del plan | La migración aplica sobre una base SQLite limpia y la prueba lo verifica | T1 | Hecha |
| T3 | Fechas en hora argentina: formato `jue 29/10 10:00`, horarios por defecto (A9), resolver "el jueves", "mañana a la tarde", y validar que el día de la semana coincida con el número | Pruebas unitarias con los casos de H1, H3 y los casos borde de fechas | T1 | Hecha |
| T4 | Webhook de Telegram: valida el secreto, ignora a quien no está en la lista blanca, guarda la captura como pendiente y responde 200. Envío de mensajes que solo acepta papá y Tato (RF-11) | Pruebas con requests simulados: remitente ajeno no genera nada; papá genera una captura | T2 | Hecha |
| T5 | Extracción con el modelo de Groq: prompt, esquema JSON y validación en código. Elegir el modelo corriendo los escenarios de H1 y H2 | 9 de 10 escenarios de texto bien sin corregir | Groq | Pendiente |
| T6 | Transcripción con Groq Whisper, con vocabulario de Villa Gesell como pista | 5 audios de prueba grabados por Tato transcriptos sin errores en fechas, horas ni nombres | Groq, audios de prueba | Pendiente |
| T7 | H1 completo: audio → ítems → confirmación corta (RF-06), o pregunta si duda un dato clave (RF-08). Rechazo en una línea de lo fuera de alcance (RF-15) | Escenarios H1.1 a H1.5 de punta a punta en el bot de prueba | T3 a T6, bot | Pendiente |
| T8 | H2: corregir citando una confirmación, "borrá eso" sin citar y "lo de X ya está", con pregunta si hay dos | Escenarios H2.1 a H2.3 | T7 | Pendiente |
| T9 | H3: cron de avisos (eventos 1 h antes, recordatorios a la hora) y aviso de choque al confirmar | 5 eventos y 5 recordatorios avisan a tiempo | T7 | Pendiente |
| T10 | H4: resumen de las 7:30, lunes a viernes, silencio si no hay nada | 5 días hábiles seguidos | T9 | Pendiente |
| T11 | RF-13: reintento de capturas pendientes por cron y aviso de demora | Con Groq cortado a propósito, la captura se procesa al volver y avisa | T7 | Pendiente |
| T12 | Panel de Tato: link de un solo uso por Telegram, lista y edición de ítems, export a CSV (RF-12) | Entrar, corregir un ítem y bajar el CSV; un link usado no vuelve a abrir | T7 | Pendiente |
| T13 | A8 y backup: borrar referencias de audios a 90 días de cerrado el ítem; CSV semanal a Tato | Pruebas con fechas simuladas | T11 | Pendiente |
| T14 | Puesta en marcha: deploy, webhook registrado, guía paso a paso para Tato y para instalarle Telegram a papá | Papá manda un audio y recibe la confirmación | Cloudflare, bot | Pendiente |
| T15 | Aceptación con los audios reales (A10) | 9 de 10 bien sin corregir; si no, ajustar T5 o T6 | A10 | Pendiente |
