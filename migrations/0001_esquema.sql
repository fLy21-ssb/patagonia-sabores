-- Patagonia Sabores · esquema de la base de datos (Cloudflare D1 / SQLite)

CREATE TABLE ajustes (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  datos TEXT NOT NULL DEFAULT '{}',
  actualizado TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Valores sensibles (huella de la contraseña del panel). Nunca se exponen por la API.
CREATE TABLE secretos (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);

CREATE TABLE categorias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '',
  orden INTEGER NOT NULL DEFAULT 0,
  activo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE productos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  descripcion TEXT NOT NULL DEFAULT '',
  precio INTEGER NOT NULL CHECK (precio >= 0),
  categoria_id INTEGER REFERENCES categorias(id) ON DELETE SET NULL,
  -- NULL = sin control de stock. El CHECK hace que un pedido sin stock suficiente falle completo.
  stock INTEGER CHECK (stock IS NULL OR stock >= 0),
  imagen TEXT,
  con_acompanamiento INTEGER NOT NULL DEFAULT 0,
  -- Días en que aparece en el menú: bit 0 = lunes ... bit 6 = domingo (127 = todos los días)
  dias INTEGER NOT NULL DEFAULT 127 CHECK (dias BETWEEN 0 AND 127),
  destacado INTEGER NOT NULL DEFAULT 0,
  activo INTEGER NOT NULL DEFAULT 1,
  orden INTEGER NOT NULL DEFAULT 0,
  creado TEXT NOT NULL,
  actualizado TEXT NOT NULL
);
CREATE INDEX idx_productos_categoria ON productos(categoria_id);

CREATE TABLE acompanamientos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  activo INTEGER NOT NULL DEFAULT 1,
  orden INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE mesas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero INTEGER NOT NULL UNIQUE CHECK (numero > 0),
  nombre TEXT NOT NULL DEFAULT '',
  activo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE pedidos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL UNIQUE,
  estado TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'preparando', 'listo', 'entregado', 'cancelado')),
  tipo TEXT NOT NULL CHECK (tipo IN ('retiro', 'delivery', 'mesa')),
  mesa INTEGER,
  cliente_nombre TEXT NOT NULL,
  cliente_telefono TEXT NOT NULL DEFAULT '',
  direccion TEXT NOT NULL DEFAULT '',
  notas TEXT NOT NULL DEFAULT '',
  metodo_pago TEXT NOT NULL DEFAULT '',
  subtotal INTEGER NOT NULL,
  costo_envio INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL,
  motivo_cancelacion TEXT NOT NULL DEFAULT '',
  eliminado INTEGER NOT NULL DEFAULT 0,
  stock_devuelto INTEGER NOT NULL DEFAULT 0,
  fecha_local TEXT NOT NULL,      -- YYYY-MM-DD en hora de Chile
  hora_local INTEGER NOT NULL,    -- 0-23 en hora de Chile
  creado TEXT NOT NULL,           -- ISO UTC
  actualizado TEXT NOT NULL,      -- ISO UTC (para sincronizar el tablero)
  preparando_en TEXT,
  listo_en TEXT,
  entregado_en TEXT,
  cancelado_en TEXT
);
CREATE INDEX idx_pedidos_actualizado ON pedidos(actualizado);
CREATE INDEX idx_pedidos_fecha ON pedidos(fecha_local);
CREATE INDEX idx_pedidos_estado ON pedidos(estado);

CREATE TABLE pedido_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  producto_id INTEGER REFERENCES productos(id) ON DELETE SET NULL,
  nombre TEXT NOT NULL,           -- copia del nombre al momento del pedido
  precio INTEGER NOT NULL,        -- copia del precio al momento del pedido
  cantidad INTEGER NOT NULL CHECK (cantidad > 0),
  acompanamiento TEXT NOT NULL DEFAULT '',
  comentario TEXT NOT NULL DEFAULT '',
  total INTEGER NOT NULL
);
CREATE INDEX idx_items_pedido ON pedido_items(pedido_id);
CREATE INDEX idx_items_producto ON pedido_items(producto_id);

-- Dispositivos de clientes que quieren aviso de un pedido
CREATE TABLE suscripciones_pedido (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  creado TEXT NOT NULL,
  UNIQUE (pedido_id, endpoint)
);

-- Dispositivos del local que reciben aviso de pedidos nuevos
CREATE TABLE suscripciones_admin (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  nombre TEXT NOT NULL DEFAULT '',
  creado TEXT NOT NULL
);

-- Límite de intentos (login, pedidos) por IP
CREATE TABLE limites (
  clave TEXT PRIMARY KEY,
  conteo INTEGER NOT NULL,
  expira INTEGER NOT NULL
);

INSERT INTO ajustes (id, datos) VALUES (1, '{}');
