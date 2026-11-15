-- Sugerencias en el carro, pedidos para más tarde y pedidos grupales (oficinas).

-- Productos que se ofrecen en el carro ("¿Le sumas algo?").
ALTER TABLE productos ADD COLUMN sugerido INTEGER NOT NULL DEFAULT 0;
-- Para partir: bebidas, jugos y postres quedan sugeridos (se cambia en el panel, producto por producto).
UPDATE productos SET sugerido = 1
WHERE categoria_id IN (
  SELECT id FROM categorias WHERE nombre LIKE '%bebida%' OR nombre LIKE '%jugo%' OR nombre LIKE '%postre%'
);

-- Hora pedida por el cliente ('HH:MM', hora de Chile, mismo día del pedido). NULL = lo antes posible.
ALTER TABLE pedidos ADD COLUMN programado TEXT;
-- Pedido grupal del que salió este pedido (NULL = pedido normal).
ALTER TABLE pedidos ADD COLUMN grupo_id INTEGER;
-- En un pedido grupal, para quién es cada producto.
ALTER TABLE pedido_items ADD COLUMN persona TEXT NOT NULL DEFAULT '';

-- Pedido grupal: una persona lo arma, comparte el enlace y cada uno agrega lo suyo.
CREATE TABLE grupos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL UNIQUE,            -- va en el enlace que se comparte
  clave_hash TEXT NOT NULL,              -- huella de la clave del organizador (solo él puede pedir)
  organizador TEXT NOT NULL,
  cierra TEXT,                           -- 'HH:MM' hasta cuándo se pueden sumar (opcional)
  estado TEXT NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto', 'pedido', 'cancelado')),
  pedidos INTEGER NOT NULL DEFAULT 0,
  pedido_token TEXT,
  fecha_local TEXT NOT NULL,
  creado TEXT NOT NULL,
  actualizado TEXT NOT NULL,
  -- Un grupo se convierte en un solo pedido: un segundo intento falla dentro de la transacción.
  CONSTRAINT grupo_ya_pedido CHECK (pedidos <= 1)
);

CREATE TABLE grupo_partes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  grupo_id INTEGER NOT NULL REFERENCES grupos(id) ON DELETE CASCADE,
  parte_id TEXT NOT NULL,                -- clave del dispositivo de cada persona (para editar lo suyo)
  nombre TEXT NOT NULL,
  items TEXT NOT NULL DEFAULT '[]',      -- JSON: [{ productoId, cantidad, acompanamientoId, comentario }]
  creado TEXT NOT NULL,
  actualizado TEXT NOT NULL,
  UNIQUE (grupo_id, parte_id)
);
CREATE INDEX idx_grupo_partes_grupo ON grupo_partes(grupo_id);
