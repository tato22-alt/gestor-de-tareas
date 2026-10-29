-- Esquema de P1 (plan.md). Fechas en ISO 8601 UTC; se muestran en hora argentina.

-- Únicos usuarios con los que el bot habla (RF-11). Se cargan a mano en la puesta en marcha.
CREATE TABLE contactos_permitidos (
  telegram_user_id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN ('papa', 'delegado'))
);

-- Lo que mandó, tal cual llegó. Se guarda antes de procesar para no perder nada (RF-13).
CREATE TABLE capturas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_user_id INTEGER NOT NULL REFERENCES contactos_permitidos (telegram_user_id),
  telegram_message_id INTEGER NOT NULL,
  responde_a_message_id INTEGER,
  tipo TEXT NOT NULL CHECK (tipo IN ('audio', 'texto')),
  texto TEXT,
  audio_file_id TEXT,
  transcripcion TEXT,
  estado TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'procesando', 'procesada', 'error', 'descartada')),
  intentos INTEGER NOT NULL DEFAULT 0,
  -- Cuándo la tomó el último intento: evita que el webhook y el cron la procesen a la vez.
  tomada_en TEXT,
  demora_avisada INTEGER NOT NULL DEFAULT 0,
  -- Si la captura respondía a una pregunta del asistente, el mensaje que la motivó.
  contexto_previo TEXT,
  -- Respuesta ya decidida y aplicada en la base. Si falla el envío, el reintento solo reenvía:
  -- así no se duplican ítems.
  respuesta TEXT,
  respuesta_tipo TEXT,
  respuesta_item_ids TEXT,
  estado_final TEXT CHECK (estado_final IN ('procesada', 'descartada')),
  recibida_en TEXT NOT NULL,
  procesada_en TEXT,
  -- Telegram reintenta el webhook si no respondemos a tiempo: esto evita duplicados.
  UNIQUE (telegram_user_id, telegram_message_id)
);
CREATE INDEX capturas_por_estado ON capturas (estado, recibida_en);

CREATE TABLE items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  captura_id INTEGER NOT NULL REFERENCES capturas (id),
  telegram_user_id INTEGER NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('evento', 'recordatorio', 'pendiente', 'nota')),
  texto TEXT NOT NULL,
  fecha_hora TEXT,
  -- 0 cuando se dijo solo el día ("el lunes vence el seguro"): fecha_hora queda a las 00:00.
  tiene_hora INTEGER NOT NULL DEFAULT 0,
  ambito TEXT NOT NULL DEFAULT 'sin_definir'
    CHECK (ambito IN ('concejo', 'taller', 'personal', 'sin_definir')),
  estado TEXT NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto', 'hecho', 'borrado')),
  aviso_enviado_en TEXT,
  creado_en TEXT NOT NULL,
  actualizado_en TEXT NOT NULL,
  cerrado_en TEXT
);
CREATE INDEX items_por_fecha ON items (estado, fecha_hora);
CREATE INDEX items_por_usuario ON items (telegram_user_id, estado);

-- Cada confirmación enviada, para saber a qué ítems apunta una respuesta citada (H2).
CREATE TABLE mensajes_salientes (
  telegram_user_id INTEGER NOT NULL,
  telegram_message_id INTEGER NOT NULL,
  captura_id INTEGER REFERENCES capturas (id),
  tipo TEXT NOT NULL CHECK (tipo IN ('confirmacion', 'pregunta', 'aviso', 'resumen', 'otro')),
  -- Ítems que muestra el mensaje; en una pregunta, las opciones.
  item_ids TEXT NOT NULL DEFAULT '[]',
  enviado_en TEXT NOT NULL,
  PRIMARY KEY (telegram_user_id, telegram_message_id)
);

-- Links de un solo uso para entrar al panel de Tato (RF-12).
CREATE TABLE panel_tokens (
  token TEXT PRIMARY KEY,
  vence_en TEXT NOT NULL,
  usado INTEGER NOT NULL DEFAULT 0
);

-- Tareas que corren una vez por día desde el cron (resumen, limpieza): evita repetirlas.
CREATE TABLE tareas_diarias (
  fecha TEXT NOT NULL,
  nombre TEXT NOT NULL,
  PRIMARY KEY (fecha, nombre)
);
