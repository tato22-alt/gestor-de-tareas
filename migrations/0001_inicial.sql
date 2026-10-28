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
    CHECK (estado IN ('pendiente', 'procesada', 'error', 'descartada')),
  intentos INTEGER NOT NULL DEFAULT 0,
  recibida_en TEXT NOT NULL,
  procesada_en TEXT,
  -- Telegram reintenta el webhook si no respondemos a tiempo: esto evita duplicados.
  UNIQUE (telegram_user_id, telegram_message_id)
);
CREATE INDEX capturas_por_estado ON capturas (estado, recibida_en);

CREATE TABLE items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  captura_id INTEGER NOT NULL REFERENCES capturas (id),
  tipo TEXT NOT NULL CHECK (tipo IN ('evento', 'recordatorio', 'pendiente', 'nota')),
  texto TEXT NOT NULL,
  fecha_hora TEXT,
  ambito TEXT NOT NULL DEFAULT 'sin_definir'
    CHECK (ambito IN ('concejo', 'taller', 'personal', 'sin_definir')),
  estado TEXT NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto', 'hecho', 'borrado')),
  aviso_enviado_en TEXT,
  creado_en TEXT NOT NULL,
  actualizado_en TEXT NOT NULL,
  cerrado_en TEXT
);
CREATE INDEX items_por_fecha ON items (estado, fecha_hora);

-- Cada confirmación enviada, para saber a qué ítems apunta una respuesta citada (H2).
CREATE TABLE mensajes_salientes (
  telegram_user_id INTEGER NOT NULL,
  telegram_message_id INTEGER NOT NULL,
  captura_id INTEGER REFERENCES capturas (id),
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
