-- Carta de ejemplo para partir. Se edita o borra desde el panel (Carta).
-- Días: bit 0 = lunes, 1 = martes, 2 = miércoles, 3 = jueves, 4 = viernes, 5 = sábado, 6 = domingo.

INSERT INTO categorias (id, nombre, emoji, orden) VALUES
  (1, 'Menú del día', '🍲', 1),
  (2, 'Platos de fondo', '🍽️', 2),
  (3, 'Empanadas y picoteo', '🥟', 3),
  (4, 'Ensaladas', '🥗', 4),
  (5, 'Bebidas y jugos', '🥤', 5),
  (6, 'Postres', '🍮', 6);

INSERT INTO acompanamientos (nombre, orden) VALUES
  ('Arroz graneado', 1),
  ('Papas fritas', 2),
  ('Puré casero', 3),
  ('Ensalada chilena', 4),
  ('Papas cocidas', 5);

INSERT INTO productos (nombre, descripcion, precio, categoria_id, stock, con_acompanamiento, dias, destacado, orden, creado, actualizado) VALUES
  ('Cazuela de vacuno', 'Caldo casero con osobuco, papa, zapallo, choclo y arroz. Como la de la abuela.', 6900, 1, NULL, 0, 21, 1, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('Pastel de choclo', 'Pino de carne, pollo, huevo y aceituna bajo pasta de choclo gratinada.', 7500, 1, 20, 0, 42, 1, 2, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('Charquicán con huevo', 'Guiso de zapallo, papa, carne y verduras, coronado con huevo frito.', 5900, 1, NULL, 0, 10, 0, 3, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('Porotos granados', 'Con mazamorra, zapallo y albahaca fresca.', 5900, 1, NULL, 0, 5, 0, 4, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('Merluza frita', 'Filete de merluza apanado y crujiente. Viernes de pescado.', 7200, 1, 15, 1, 16, 0, 5, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('Lomo a lo pobre', 'Lomo liso a la plancha con papas fritas, cebolla caramelizada y dos huevos.', 9900, 2, NULL, 0, 127, 1, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('Pollo asado', 'Cuarto de pollo al horno con hierbas y ajo.', 6500, 2, NULL, 1, 127, 0, 2, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('Milanesa de pollo', 'Pechuga apanada, dorada y jugosa.', 6900, 2, NULL, 1, 127, 0, 3, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('Costillar de cerdo', 'Costillar al horno glaseado con salsa BBQ de la casa.', 8900, 2, NULL, 1, 127, 0, 4, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('Empanada de pino', 'De horno, con pino jugoso, huevo y aceituna.', 2800, 3, 40, 0, 127, 1, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('Empanada de queso', 'Frita, crocante y bien quesuda.', 2200, 3, 40, 0, 127, 0, 2, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('Sopaipillas (4 un.)', 'Con pebre de la casa.', 2000, 3, NULL, 0, 127, 0, 3, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('Ensalada chilena', 'Tomate, cebolla pluma y cilantro.', 2500, 4, NULL, 0, 127, 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('Ensalada surtida', 'Lechuga, tomate, zanahoria, choclo y palta.', 3200, 4, NULL, 0, 127, 0, 2, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('Bebida en lata', '350 ml. Coca-Cola, Sprite o Fanta (indícalo en el comentario).', 1500, 5, NULL, 0, 127, 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('Jugo natural', 'Frutilla, piña o mango. Pregunta por el sabor del día.', 2500, 5, NULL, 0, 127, 0, 2, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('Mote con huesillo', 'Bien heladito, con mote de trigo y huesillos.', 2500, 5, NULL, 0, 127, 0, 3, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('Leche asada', 'Postre casero con caramelo.', 2300, 6, NULL, 0, 127, 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('Kuchen de murta', 'Clásico del sur, con murta patagónica.', 2900, 6, 12, 0, 127, 1, 2, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'));

INSERT INTO mesas (numero) VALUES (1), (2), (3), (4), (5), (6);
