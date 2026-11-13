// API pública: menú, crear pedido, seguimiento y suscripción a avisos.
import { HttpError, json, readJson } from '../http.js';
import { ajustesPublicos, leerAjustes, parsearAjustes } from '../settings.js';
import { estadoLocal, horaChile } from '../time.js';
import { ahoraIso, clp, email, entero, telefono, texto, tokenAleatorio } from '../util.js';
import { limitar } from '../limits.js';
import { mesaValida } from '../auth.js';
import { avisarLocal } from '../notify.js';
import { suscripcionValida } from '../push.js';
import { pedidoPublicoDTO, productoPublicoDTO } from '../dto.js';
import { evaluarCupon } from '../cupones.js';
import { avisarPorCorreo } from '../correo.js';

const TOKEN_RE = /^[A-Za-z0-9_-]{16,40}$/;
const subjectDe = (env, url) => env.VAPID_SUBJECT || url.origin;

export function rutasPublicas(router) {
  router.get('/api/menu', menu);
  router.get('/api/mesa', verificarMesa);
  router.post('/api/pedidos', crearPedido);
  router.post('/api/pedidos/consulta', consultarVarios);
  router.get('/api/pedidos/:token', verPedido);
  router.post('/api/pedidos/:token/suscripcion', suscribir);
}

async function menu({ env }) {
  const ahora = horaChile();
  const [aj, cats, prods, acomps] = await env.DB.batch([
    env.DB.prepare('SELECT datos FROM ajustes WHERE id = 1'),
    env.DB.prepare('SELECT id, nombre, emoji, orden FROM categorias WHERE activo = 1 ORDER BY orden, id'),
    env.DB.prepare('SELECT * FROM productos WHERE activo = 1 ORDER BY orden, id'),
    env.DB.prepare('SELECT id, nombre FROM acompanamientos WHERE activo = 1 ORDER BY orden, id'),
  ]);
  const ajustes = parsearAjustes(aj.results[0]?.datos);
  return json({
    local: ajustesPublicos(ajustes),
    estado: { ...estadoLocal(ajustes, ahora), dow: ahora.dow, fecha: ahora.fecha },
    categorias: cats.results,
    productos: prods.results.map(productoPublicoDTO),
    acompanamientos: acomps.results,
    vapidPublicKey: env.VAPID_PUBLIC_KEY || null,
  });
}

async function verificarMesa({ env, url }) {
  const numero = Number(url.searchParams.get('n'));
  const firma = url.searchParams.get('k') || '';
  if (!(await mesaValida(env, numero, firma))) throw new HttpError(404, 'Código de mesa no válido.');
  const mesa = await env.DB.prepare('SELECT numero, nombre FROM mesas WHERE numero = ? AND activo = 1').bind(numero).first();
  if (!mesa) throw new HttpError(404, 'Esta mesa no está disponible.');
  return json({ mesa: mesa.numero, nombre: mesa.nombre });
}

async function crearPedido({ request, env, ctx, url }) {
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  const b = await readJson(request, 24_000);
  if (b.web) throw new HttpError(400, 'Solicitud no válida.'); // campo trampa para bots
  await limitar(env, `pedido:${ip}`, Number(env.LIMITE_PEDIDOS_POR_IP) || 8, 15 * 60);

  const ahora = horaChile();
  const aj = await leerAjustes(env);
  const estado = estadoLocal(aj, ahora);
  if (!estado.abierto) throw new HttpError(409, estado.mensaje);

  const tipo = String(b.tipo || '');
  if (!['retiro', 'delivery', 'mesa'].includes(tipo) || !aj.tipos[tipo]) {
    throw new HttpError(400, 'Ese tipo de pedido no está disponible.');
  }

  let mesa = null;
  if (tipo === 'mesa') {
    mesa = entero(b.mesa, { min: 1, max: 9999, campo: 'la mesa' });
    if (!(await mesaValida(env, mesa, String(b.mesaFirma || '')))) {
      throw new HttpError(403, 'El código QR de la mesa no es válido. Vuelve a escanearlo.');
    }
    const existe = await env.DB.prepare('SELECT 1 AS ok FROM mesas WHERE numero = ? AND activo = 1').bind(mesa).first();
    if (!existe) throw new HttpError(409, `La mesa ${mesa} no está disponible.`);
  }

  const nombre = texto(b.cliente?.nombre, 60, { requerido: true, campo: 'tu nombre' });
  const tel = telefono(b.cliente?.telefono, { requerido: tipo !== 'mesa' });
  const correo = email(b.cliente?.email);
  const quierePromos = b.promos === true && Boolean(correo);
  const direccion = tipo === 'delivery' ? texto(b.direccion, 200, { requerido: true, campo: 'la dirección de entrega' }) : '';
  const notas = texto(b.notas, 300, { multilinea: true });
  const metodoPago = String(b.metodoPago || '');
  if (!['efectivo', 'transferencia', 'tarjeta'].includes(metodoPago) || !aj.pagos[metodoPago]) {
    throw new HttpError(400, 'Elige cómo vas a pagar.');
  }

  if (!Array.isArray(b.items) || b.items.length === 0) throw new HttpError(400, 'Tu carro está vacío.');
  if (b.items.length > 40) throw new HttpError(400, 'Son demasiados productos para un solo pedido.');
  const ids = [...new Set(b.items.map((i) => entero(i?.productoId, { min: 1, campo: 'un producto' })))];

  const [prodRes, acompRes] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM productos WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(ids)),
    env.DB.prepare('SELECT id, nombre FROM acompanamientos WHERE activo = 1'),
  ]);
  const productos = new Map(prodRes.results.map((p) => [p.id, p]));
  const acomps = new Map(acompRes.results.map((a) => [a.id, a.nombre]));
  const bitHoy = 1 << ahora.dow;

  const lineas = [];
  const usoStock = new Map();
  for (const it of b.items) {
    const p = productos.get(Number(it.productoId));
    if (!p || !p.activo) {
      throw new HttpError(409, 'Uno de los productos ya no está disponible. Revisa tu carro.', { productoId: Number(it.productoId) });
    }
    if (!(p.dias & bitHoy)) {
      throw new HttpError(409, `"${p.nombre}" no está en el menú de hoy.`, { productoId: p.id });
    }
    const cantidad = entero(it.cantidad, { min: 1, max: 30, campo: `la cantidad de "${p.nombre}"` });
    let acompanamiento = '';
    if (p.con_acompanamiento && acomps.size) {
      const aid = Number(it.acompanamientoId);
      if (!acomps.has(aid)) throw new HttpError(400, `Elige el acompañamiento de "${p.nombre}".`, { productoId: p.id });
      acompanamiento = acomps.get(aid);
    }
    const comentario = texto(it.comentario, 140);
    lineas.push({ p, cantidad, acompanamiento, comentario, total: p.precio * cantidad });
    usoStock.set(p.id, (usoStock.get(p.id) || 0) + cantidad);
  }

  for (const [id, cantidad] of usoStock) {
    const p = productos.get(id);
    if (p.stock !== null && p.stock < cantidad) {
      throw new HttpError(
        409,
        p.stock === 0 ? `"${p.nombre}" se agotó.` : `Solo quedan ${p.stock} de "${p.nombre}".`,
        { productoId: id, stock: p.stock },
      );
    }
  }

  const subtotal = lineas.reduce((n, l) => n + l.total, 0);
  const envio = tipo === 'delivery' ? aj.delivery.costo : 0;
  if (tipo === 'delivery' && subtotal < aj.delivery.minimo) {
    throw new HttpError(409, `El pedido mínimo para delivery es ${clp(aj.delivery.minimo)}.`);
  }
  let cupon = null;
  let descuento = 0;
  if (b.cupon) {
    const r = await evaluarCupon(env, b.cupon, { subtotal, telefono: tel, email: correo, ahora });
    cupon = r.codigo;
    descuento = r.descuento;
  }
  const total = subtotal + envio - descuento;
  const token = tokenAleatorio(16);
  const ts = ahoraIso();

  const sentencias = [
    env.DB.prepare(
      `INSERT INTO pedidos (token, tipo, mesa, cliente_nombre, cliente_telefono, cliente_email, direccion, notas, metodo_pago,
         subtotal, costo_envio, cupon, descuento, total, fecha_local, hora_local, creado, actualizado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(token, tipo, mesa, nombre, tel, correo, direccion, notas, metodoPago, subtotal, envio, cupon || '', descuento, total, ahora.fecha, ahora.hora, ts, ts),
    ...lineas.map((l) =>
      env.DB.prepare(
        `INSERT INTO pedido_items (pedido_id, producto_id, nombre, precio, cantidad, acompanamiento, comentario, total)
         VALUES ((SELECT id FROM pedidos WHERE token = ?), ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(token, l.p.id, l.p.nombre, l.p.precio, l.cantidad, l.acompanamiento, l.comentario, l.total),
    ),
    ...[...usoStock]
      .filter(([id]) => productos.get(id).stock !== null)
      .map(([id, cantidad]) =>
        env.DB.prepare('UPDATE productos SET stock = stock - ?, actualizado = ? WHERE id = ? AND stock IS NOT NULL').bind(cantidad, ts, id),
      ),
  ];
  // El uso del código se cuenta en la misma transacción: si se agotó recién, el pedido no se guarda.
  if (cupon) sentencias.push(env.DB.prepare('UPDATE cupones SET usos = usos + 1 WHERE codigo = ?').bind(cupon));
  if (quierePromos) {
    sentencias.push(
      env.DB.prepare(
        `INSERT INTO contactos (email, nombre, telefono, acepta_promos, token_baja, creado, actualizado) VALUES (?, ?, ?, 1, ?, ?, ?)
         ON CONFLICT(email) DO UPDATE SET nombre = excluded.nombre, telefono = excluded.telefono, acepta_promos = 1,
           actualizado = excluded.actualizado`,
      ).bind(correo, nombre, tel, tokenAleatorio(18), ts, ts),
    );
  }

  try {
    await env.DB.batch(sentencias); // transacción: si falta stock, no se guarda nada
  } catch (e) {
    const mensaje = String(e?.message || e);
    if (mensaje.includes('cupon_agotado')) {
      throw new HttpError(409, `El código ${cupon} se acaba de agotar. Quítalo para continuar.`, { campo: 'cupon' });
    }
    if (mensaje.includes('CHECK constraint failed')) {
      throw new HttpError(409, 'Alguien se nos adelantó y se agotó un producto de tu carro. Revisa y vuelve a intentar.');
    }
    throw e;
  }

  const pedido = await env.DB.prepare('SELECT * FROM pedidos WHERE token = ?').bind(token).first();
  ctx.waitUntil(avisarLocal(env, pedido, subjectDe(env, url)).catch((e) => console.error('avisarLocal', e)));
  if (correo) {
    const items = lineas.map((l) => ({ cantidad: l.cantidad, nombre: l.p.nombre, acompanamiento: l.acompanamiento, comentario: l.comentario, total: l.total }));
    ctx.waitUntil(avisarPorCorreo(env, pedido, 'recibido', url.origin, items));
  }
  return json({ id: pedido.id, token }, 201);
}

async function verPedido({ env, params }) {
  if (!TOKEN_RE.test(params.token)) throw new HttpError(404, 'No encontramos ese pedido.');
  const p = await env.DB.prepare('SELECT * FROM pedidos WHERE token = ?').bind(params.token).first();
  if (!p) throw new HttpError(404, 'No encontramos ese pedido.');
  const [items, adelante, aj, subs] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM pedido_items WHERE pedido_id = ? ORDER BY id').bind(p.id),
    env.DB.prepare(
      "SELECT COUNT(*) AS n FROM pedidos WHERE eliminado = 0 AND estado IN ('pendiente', 'preparando') AND id < ?",
    ).bind(p.id),
    env.DB.prepare('SELECT datos FROM ajustes WHERE id = 1'),
    env.DB.prepare('SELECT COUNT(*) AS n FROM suscripciones_pedido WHERE pedido_id = ?').bind(p.id),
  ]);
  const ajustes = parsearAjustes(aj.results[0]?.datos);
  const dto = pedidoPublicoDTO(p, items.results);
  return json({
    pedido: dto,
    adelante: ['pendiente', 'preparando'].includes(dto.estado) ? adelante.results[0].n : 0,
    suscripciones: subs.results[0].n,
    local: {
      nombre: ajustes.nombre,
      whatsapp: ajustes.whatsapp,
      telefono: ajustes.telefono,
      direccion: ajustes.direccion,
      tiempoPreparacion: ajustes.tiempoPreparacion,
      datosTransferencia: dto.metodoPago === 'transferencia' ? ajustes.datosTransferencia : '',
    },
  });
}

async function consultarVarios({ request, env }) {
  const b = await readJson(request, 4000);
  const tokens = (Array.isArray(b.tokens) ? b.tokens : []).filter((t) => TOKEN_RE.test(String(t))).slice(0, 20);
  if (!tokens.length) return json({ pedidos: [] });
  const { results } = await env.DB.prepare(
    `SELECT id, token, estado, tipo, total, creado, eliminado FROM pedidos
     WHERE token IN (SELECT value FROM json_each(?)) ORDER BY id DESC`,
  )
    .bind(JSON.stringify(tokens))
    .all();
  return json({
    pedidos: results.map((p) => ({
      id: p.id,
      token: p.token,
      estado: p.eliminado && p.estado !== 'entregado' ? 'cancelado' : p.estado,
      tipo: p.tipo,
      total: p.total,
      creado: p.creado,
    })),
  });
}

async function suscribir({ request, env, params }) {
  if (!TOKEN_RE.test(params.token)) throw new HttpError(404, 'No encontramos ese pedido.');
  const sub = suscripcionValida(await readJson(request, 4000));
  if (!sub) throw new HttpError(400, 'Este navegador no entregó una suscripción válida.');
  const p = await env.DB.prepare('SELECT id FROM pedidos WHERE token = ?').bind(params.token).first();
  if (!p) throw new HttpError(404, 'No encontramos ese pedido.');
  const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM suscripciones_pedido WHERE pedido_id = ?').bind(p.id).first();
  if (n >= 5) return json({ ok: true });
  await env.DB.prepare(
    `INSERT INTO suscripciones_pedido (pedido_id, endpoint, p256dh, auth, creado) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(pedido_id, endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth`,
  )
    .bind(p.id, sub.endpoint, sub.p256dh, sub.auth, ahoraIso())
    .run();
  return json({ ok: true }, 201);
}
