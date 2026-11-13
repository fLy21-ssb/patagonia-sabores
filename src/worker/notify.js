// Textos y envío de notificaciones push a clientes (estado de su pedido) y al local (pedidos nuevos).
import { enviarPush } from './push.js';
import { clp } from './util.js';

const LUGAR = { retiro: 'Retiro', delivery: 'Delivery', mesa: 'Mesa' };

export function textoParaCliente(p) {
  switch (p.estado) {
    case 'preparando':
      return { title: '¡Estamos preparando tu pedido!', body: `Pedido #${p.id} · Te avisamos apenas esté listo.` };
    case 'listo':
      if (p.tipo === 'delivery') return { title: '¡Tu pedido va en camino!', body: `Pedido #${p.id} · Atento, que ya llega.` };
      if (p.tipo === 'mesa') return { title: '¡Tu pedido está listo!', body: `Pedido #${p.id} · Ya va camino a tu mesa ${p.mesa}.` };
      return { title: '¡Tu pedido está listo!', body: `Pedido #${p.id} · Ya puedes pasar a retirarlo.` };
    case 'cancelado':
      return {
        title: 'Tu pedido fue cancelado',
        body: `Pedido #${p.id}${p.motivo_cancelacion ? ` · ${p.motivo_cancelacion}` : ' · Escríbenos si tienes dudas.'}`,
      };
    default:
      return null;
  }
}

export async function enviarATodos(env, tabla, subs, datos, opciones) {
  const resultados = await Promise.allSettled(subs.map((s) => enviarPush(env, s, datos, opciones)));
  const caducadas = [];
  resultados.forEach((r, i) => {
    if (r.status === 'rejected') console.error('Push falló:', r.reason?.message || r.reason);
    else if (r.value === 404 || r.value === 410) caducadas.push(subs[i].id);
  });
  if (caducadas.length) {
    await env.DB.prepare(`DELETE FROM ${tabla} WHERE id IN (SELECT value FROM json_each(?))`)
      .bind(JSON.stringify(caducadas))
      .run();
  }
  return {
    enviadas: resultados.filter((r) => r.status === 'fulfilled' && r.value >= 200 && r.value < 300).length,
    total: subs.length,
  };
}

export async function avisarCliente(env, pedido, subject) {
  const texto = textoParaCliente(pedido);
  if (!texto) return { enviadas: 0, total: 0 };
  const { results } = await env.DB.prepare(
    'SELECT id, endpoint, p256dh, auth FROM suscripciones_pedido WHERE pedido_id = ?',
  )
    .bind(pedido.id)
    .all();
  if (!results.length) return { enviadas: 0, total: 0 };
  const datos = { ...texto, url: `/#/pedido/${pedido.token}`, tag: `pedido-${pedido.id}` };
  return enviarATodos(env, 'suscripciones_pedido', results, datos, { topic: `pedido${pedido.id}`, subject });
}

export async function avisarLocal(env, pedido, subject) {
  const { results } = await env.DB.prepare('SELECT id, endpoint, p256dh, auth FROM suscripciones_admin').all();
  if (!results.length) return { enviadas: 0, total: 0 };
  const lugar = pedido.tipo === 'mesa' ? `Mesa ${pedido.mesa}` : LUGAR[pedido.tipo];
  const datos = {
    title: `Nuevo pedido #${pedido.id}`,
    body: `${pedido.cliente_nombre} · ${lugar} · ${clp(pedido.total)}`,
    url: '/admin/#/pedidos',
    tag: `nuevo-${pedido.id}`,
    admin: true,
  };
  return enviarATodos(env, 'suscripciones_admin', results, datos, { subject });
}

export async function avisoDePrueba(env, subject, endpoint) {
  const consulta = endpoint
    ? env.DB.prepare('SELECT id, endpoint, p256dh, auth FROM suscripciones_admin WHERE endpoint = ?').bind(endpoint)
    : env.DB.prepare('SELECT id, endpoint, p256dh, auth FROM suscripciones_admin');
  const { results } = await consulta.all();
  if (!results.length) return { enviadas: 0, total: 0 };
  const datos = {
    title: '¡Avisos activados!',
    body: 'Así te llegarán los pedidos nuevos, aunque tengas la app cerrada.',
    url: '/admin/#/pedidos',
    tag: 'prueba',
    admin: true,
  };
  return enviarATodos(env, 'suscripciones_admin', results, datos, { subject });
}
