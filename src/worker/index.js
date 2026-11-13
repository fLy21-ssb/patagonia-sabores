// Punto de entrada del servidor (Cloudflare Workers). Responde /api/* y /img/*;
// la app de clientes y el panel son archivos estáticos (dist/) servidos por Cloudflare.
import { Router, errorJson } from './http.js';
import { rutasPublicas } from './routes/public.js';
import { rutasAdmin } from './routes/admin.js';
import { rutasPromociones } from './routes/promociones.js';

const router = new Router();
rutasPublicas(router);
rutasAdmin(router);
rutasPromociones(router);

const IMAGEN_RE = /^p\/[A-Za-z0-9_-]{8,40}\.(webp|jpg|png)$/;
const TIPO_POR_EXT = { webp: 'image/webp', jpg: 'image/jpeg', png: 'image/png' };

async function servirImagen(env, url) {
  const clave = decodeURIComponent(url.pathname.slice('/img/'.length));
  if (!IMAGEN_RE.test(clave)) return new Response('No encontrada', { status: 404 });
  const { value, metadata } = await env.IMAGENES.getWithMetadata(clave, { type: 'arrayBuffer', cacheTtl: 86_400 });
  if (!value) return new Response('No encontrada', { status: 404 });
  return new Response(value, {
    headers: {
      'content-type': metadata?.tipo || TIPO_POR_EXT[clave.split('.').pop()],
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    },
  });
}

/** Limpieza liviana: límites vencidos y suscripciones de pedidos de hace más de 2 días. */
export async function limpieza(env) {
  const ahora = Math.floor(Date.now() / 1000);
  const hace2dias = new Date(Date.now() - 2 * 864e5).toISOString();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM limites WHERE expira < ?').bind(ahora),
    env.DB.prepare('DELETE FROM suscripciones_pedido WHERE pedido_id IN (SELECT id FROM pedidos WHERE creado < ?)').bind(hace2dias),
  ]);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith('/api/')) {
        // De vez en cuando (≈1 de cada 50 llamadas) hace la limpieza, sin demorar la respuesta.
        if (Math.random() < 0.02) ctx.waitUntil(limpieza(env).catch((e) => console.error('limpieza', e)));
        return await router.handle({ request, env, ctx, url });
      }
      if (url.pathname.startsWith('/img/')) return await servirImagen(env, url);
      return env.ASSETS.fetch(request);
    } catch (err) {
      return errorJson(err);
    }
  },

  // Limpieza diaria (cron en wrangler.jsonc).
  async scheduled(_event, env) {
    await limpieza(env);
  },
};
