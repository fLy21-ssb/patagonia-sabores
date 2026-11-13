// Límite simple de intentos por clave (ej. IP) usando D1. Protege el login y evita spam de pedidos.
import { HttpError } from './http.js';

export async function limitar(env, clave, maximo, ventanaSeg) {
  const ahora = Math.floor(Date.now() / 1000);
  const fila = await env.DB.prepare(
    `INSERT INTO limites (clave, conteo, expira) VALUES (?1, 1, ?2)
     ON CONFLICT(clave) DO UPDATE SET
       conteo = CASE WHEN limites.expira <= ?3 THEN 1 ELSE limites.conteo + 1 END,
       expira = CASE WHEN limites.expira <= ?3 THEN ?2 ELSE limites.expira END
     RETURNING conteo, expira`,
  )
    .bind(clave, ahora + ventanaSeg, ahora)
    .first();
  if (fila && fila.conteo > maximo) {
    const minutos = Math.max(1, Math.ceil((fila.expira - ahora) / 60));
    throw new HttpError(429, `Demasiados intentos. Prueba de nuevo en ${minutos} min.`);
  }
}

export async function limpiarLimite(env, clave) {
  await env.DB.prepare('DELETE FROM limites WHERE clave = ?').bind(clave).run();
}
