-- Las categorías usan íconos propios de la marca (no emojis).
UPDATE categorias SET emoji = CASE
  WHEN emoji IN ('olla','guiso','plato','empanada','ensalada','bebida','postre','sandwich','cafe','mate','pescado','carne','pollo','pizza','pan','helado','vino','cerveza','picante','verde','estrella') THEN emoji
  WHEN emoji = '🍲' THEN 'olla'
  WHEN emoji = '🥟' THEN 'empanada'
  WHEN emoji = '🥗' THEN 'ensalada'
  WHEN emoji = '🥤' THEN 'bebida'
  WHEN emoji = '🍮' THEN 'postre'
  ELSE 'plato'
END;
