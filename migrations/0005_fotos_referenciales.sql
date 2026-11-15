-- Crédito de la foto de cada producto (para fotos de referencia con licencia libre, que piden citar al autor).
-- Queda vacío para las fotos propias del local. Se borra solo cuando se cambia o se quita la foto en el panel.
ALTER TABLE productos ADD COLUMN imagen_credito TEXT NOT NULL DEFAULT '';
-- Página de origen de la foto (enlace al autor y la licencia).
ALTER TABLE productos ADD COLUMN imagen_fuente TEXT NOT NULL DEFAULT '';
