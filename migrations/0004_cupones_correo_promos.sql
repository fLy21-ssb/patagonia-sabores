-- Mesas en pausa, códigos de descuento, correo del cliente y promociones.

-- El local trabaja con retiro y delivery; los pedidos en la mesa quedan desactivados (se activan en Ajustes).
UPDATE ajustes SET datos = json_set(
  CASE WHEN json_valid(datos) THEN datos ELSE '{}' END,
  '$.tipos.mesa', json('false')
) WHERE id = 1;
UPDATE ajustes SET datos = json_set(datos, '$.aviso', '¡Ahora puedes pedir online! Retira en el local o pide delivery.')
WHERE id = 1 AND json_extract(datos, '$.aviso') = '¡Ahora puedes pedir online! Retira en el local, pide delivery o pide desde tu mesa.';

ALTER TABLE pedidos ADD COLUMN cliente_email TEXT NOT NULL DEFAULT '';
ALTER TABLE pedidos ADD COLUMN cupon TEXT NOT NULL DEFAULT '';
ALTER TABLE pedidos ADD COLUMN descuento INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_pedidos_cupon ON pedidos (cupon) WHERE cupon != '';

CREATE TABLE cupones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,            -- en mayúsculas
  descripcion TEXT NOT NULL DEFAULT '',
  tipo TEXT NOT NULL CHECK (tipo IN ('porcentaje', 'monto')),
  valor INTEGER NOT NULL CHECK (valor > 0),
  minimo INTEGER NOT NULL DEFAULT 0,      -- compra mínima para usarlo
  max_usos INTEGER,                       -- NULL = sin límite
  usos INTEGER NOT NULL DEFAULT 0,
  uno_por_cliente INTEGER NOT NULL DEFAULT 0,
  desde TEXT,                             -- YYYY-MM-DD (hora de Chile), NULL = desde ya
  hasta TEXT,                             -- YYYY-MM-DD inclusive, NULL = sin vencimiento
  activo INTEGER NOT NULL DEFAULT 1,
  creado TEXT NOT NULL,
  -- Si se agotan mientras alguien paga, el pedido completo falla (nunca se pasa del límite)
  CONSTRAINT cupon_agotado CHECK (max_usos IS NULL OR usos <= max_usos),
  CONSTRAINT cupon_usos CHECK (usos >= 0)
);

-- Clientes que aceptaron recibir promociones por correo (cada uno con su enlace para darse de baja)
CREATE TABLE contactos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL DEFAULT '',
  telefono TEXT NOT NULL DEFAULT '',
  acepta_promos INTEGER NOT NULL DEFAULT 1,
  token_baja TEXT NOT NULL UNIQUE,
  creado TEXT NOT NULL,
  actualizado TEXT NOT NULL
);

-- Teléfonos/computadores que aceptaron notificaciones de promociones
CREATE TABLE suscripciones_promo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  creado TEXT NOT NULL
);

-- Promociones enviadas desde el panel. El envío avanza por tandas: *_cursor = id del último destinatario procesado,
-- *_total = audiencia al crearla, *_hechos = intentos, *_ok = entregados al servicio de notificaciones o a Gmail.
CREATE TABLE promos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo TEXT NOT NULL,
  mensaje TEXT NOT NULL,
  cupon TEXT NOT NULL DEFAULT '',
  push INTEGER NOT NULL DEFAULT 0,
  correo INTEGER NOT NULL DEFAULT 0,
  push_cursor INTEGER NOT NULL DEFAULT 0,
  push_fin INTEGER NOT NULL DEFAULT 0,
  push_total INTEGER NOT NULL DEFAULT 0,
  push_hechos INTEGER NOT NULL DEFAULT 0,
  push_ok INTEGER NOT NULL DEFAULT 0,
  email_cursor INTEGER NOT NULL DEFAULT 0,
  email_fin INTEGER NOT NULL DEFAULT 0,
  email_total INTEGER NOT NULL DEFAULT 0,
  email_hechos INTEGER NOT NULL DEFAULT 0,
  email_ok INTEGER NOT NULL DEFAULT 0,
  creado TEXT NOT NULL,
  enviada TEXT
);
