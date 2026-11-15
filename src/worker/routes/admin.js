// API del panel de administración (requiere sesión).
import { HttpError, json, readJson } from '../http.js';
import {
  cookieCerrar,
  cookieSesion,
  crearSesion,
  firmaMesa,
  guardarPassword,
  passwordCorrecta,
  soloAdmin,
} from '../auth.js';
import { guardarAjustes, leerAjustes } from '../settings.js';
import { horaChile, sumarDias } from '../time.js';
import { ahoraIso, bit, entero, texto, tokenAleatorio } from '../util.js';
import { limitar, limpiarLimite } from '../limits.js';
import { avisarCliente, avisoDePrueba } from '../notify.js';
import { suscripcionValida } from '../push.js';
import { pedidoDTO, productoDTO } from '../dto.js';
import { avisarPorCorreo } from '../correo.js';

const ESTADOS = ['pendiente', 'preparando', 'listo', 'entregado', 'cancelado'];
const TRANSICIONES = {
  pendiente: ['preparando', 'listo', 'entregado', 'cancelado'],
  preparando: ['pendiente', 'listo', 'entregado', 'cancelado'],
  listo: ['preparando', 'entregado', 'cancelado'],
  entregado: ['listo'],
  cancelado: [],
};
const COLUMNA_TIEMPO = { preparando: 'preparando_en', listo: 'listo_en', entregado: 'entregado_en', cancelado: 'cancelado_en' };
const NOMBRE_ESTADO = { pendiente: 'Nuevo', preparando: 'En preparación', listo: 'Listo', entregado: 'Entregado', cancelado: 'Cancelado' };
const IMAGEN_RE = /^p\/[A-Za-z0-9_-]{8,40}\.(webp|jpg|png)$/;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const subjectDe = (env, url) => env.VAPID_SUBJECT || url.origin;

export function rutasAdmin(router) {
  router.post('/api/admin/login', login);
  router.post('/api/admin/logout', logout);
  router.get('/api/admin/sesion', soloAdmin(sesion));

  router.get('/api/admin/tablero', soloAdmin(tablero));
  router.get('/api/admin/pedidos', soloAdmin(historial));
  router.get('/api/admin/pedidos/:id', soloAdmin(verPedido));
  router.patch('/api/admin/pedidos/:id', soloAdmin(cambiarEstado));
  router.delete('/api/admin/pedidos/:id', soloAdmin(eliminarPedido));
  router.post('/api/admin/pedidos/:id/restaurar', soloAdmin(restaurarPedido));

  router.get('/api/admin/carta', soloAdmin(carta));
  router.post('/api/admin/productos', soloAdmin(crearProducto));
  router.put('/api/admin/productos/:id', soloAdmin(editarProducto));
  router.patch('/api/admin/productos/:id', soloAdmin(ajustarProducto));
  router.delete('/api/admin/productos/:id', soloAdmin(eliminarProducto));
  router.post('/api/admin/imagenes', soloAdmin(subirImagen));

  router.post('/api/admin/categorias', soloAdmin(crearCategoria));
  router.put('/api/admin/categorias/:id', soloAdmin(editarCategoria));
  router.delete('/api/admin/categorias/:id', soloAdmin(eliminarCategoria));
  router.post('/api/admin/categorias-orden', soloAdmin(ordenarCategorias));

  router.post('/api/admin/acompanamientos', soloAdmin(crearAcompanamiento));
  router.put('/api/admin/acompanamientos/:id', soloAdmin(editarAcompanamiento));
  router.delete('/api/admin/acompanamientos/:id', soloAdmin(eliminarAcompanamiento));

  router.get('/api/admin/mesas', soloAdmin(listarMesas));
  router.post('/api/admin/mesas', soloAdmin(crearMesa));
  router.put('/api/admin/mesas/:id', soloAdmin(editarMesa));
  router.delete('/api/admin/mesas/:id', soloAdmin(eliminarMesa));

  router.get('/api/admin/ajustes', soloAdmin(verAjustes));
  router.put('/api/admin/ajustes', soloAdmin(cambiarAjustes));
  router.post('/api/admin/password', soloAdmin(cambiarPassword));

  router.get('/api/admin/estadisticas', soloAdmin(estadisticas));

  router.post('/api/admin/suscripcion', soloAdmin(suscribirAdmin));
  router.post('/api/admin/suscripcion/borrar', soloAdmin(desuscribirAdmin));
  router.post('/api/admin/suscripcion/prueba', soloAdmin(pruebaPush));
}

// ---------- Sesión ----------

async function login({ request, env, url }) {
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  const b = await readJson(request, 2000);
  await limitar(env, `login:${ip}`, 8, 15 * 60);
  if (!(await passwordCorrecta(env, b.password))) throw new HttpError(401, 'Contraseña incorrecta.');
  await limpiarLimite(env, `login:${ip}`);
  const token = await crearSesion(env);
  return json({ ok: true }, 200, { 'set-cookie': cookieSesion(token, url) });
}

async function logout({ url }) {
  return json({ ok: true }, 200, { 'set-cookie': cookieCerrar(url) });
}

async function sesion({ env }) {
  const aj = await leerAjustes(env);
  return json({ ok: true, nombre: aj.nombre, ticketAncho: aj.ticketAncho, vapidPublicKey: env.VAPID_PUBLIC_KEY || null });
}

// ---------- Pedidos ----------

async function itemsDe(env, ids) {
  const mapa = new Map();
  if (!ids.length) return mapa;
  const { results } = await env.DB.prepare(
    'SELECT * FROM pedido_items WHERE pedido_id IN (SELECT value FROM json_each(?)) ORDER BY id',
  )
    .bind(JSON.stringify(ids))
    .all();
  for (const it of results) {
    if (!mapa.has(it.pedido_id)) mapa.set(it.pedido_id, []);
    mapa.get(it.pedido_id).push(it);
  }
  return mapa;
}

async function pedidoCompleto(env, id) {
  const p = await env.DB.prepare('SELECT * FROM pedidos WHERE id = ?').bind(id).first();
  if (!p) throw new HttpError(404, 'Pedido no encontrado.');
  const items = await itemsDe(env, [id]);
  return pedidoDTO(p, items.get(id));
}

/** Tablero en vivo. Sin `since`: pedidos activos + los de hoy. Con `since`: solo lo que cambió (más liviano). */
async function tablero({ env, url }) {
  const since = url.searchParams.get('since');
  const ahora = horaChile();
  let filas;
  if (since && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(since)) {
    filas = (await env.DB.prepare('SELECT * FROM pedidos WHERE actualizado > ? ORDER BY id').bind(since).all()).results;
  } else {
    filas = (
      await env.DB.prepare(
        `SELECT * FROM pedidos WHERE eliminado = 0
         AND (estado IN ('pendiente', 'preparando', 'listo') OR fecha_local = ?) ORDER BY id`,
      )
        .bind(ahora.fecha)
        .all()
    ).results;
  }
  const items = await itemsDe(env, filas.map((p) => p.id));
  return json({
    pedidos: filas.map((p) => pedidoDTO(p, items.get(p.id))),
    cursor: new Date(Date.now() - 5000).toISOString(), // traslape de 5 s para no perder cambios simultáneos
    hoy: ahora.fecha,
    completo: !since,
  });
}

async function historial({ env, url }) {
  const q = url.searchParams;
  const ahora = horaChile();
  const desde = FECHA_RE.test(q.get('desde') || '') ? q.get('desde') : sumarDias(ahora.fecha, -6);
  const hasta = FECHA_RE.test(q.get('hasta') || '') ? q.get('hasta') : ahora.fecha;
  const estado = q.get('estado');
  const buscar = (q.get('q') || '').trim().slice(0, 60);
  const antesDe = Number(q.get('antesDe')) || null;

  const where = ['eliminado = ?', 'fecha_local BETWEEN ? AND ?'];
  const binds = [q.get('eliminados') === '1' ? 1 : 0, desde, hasta];
  if (ESTADOS.includes(estado)) {
    where.push('estado = ?');
    binds.push(estado);
  }
  if (buscar) {
    if (/^#?\d+$/.test(buscar)) {
      where.push('id = ?');
      binds.push(Number(buscar.replace('#', '')));
    } else {
      const like = `%${buscar.replace(/[%_]/g, '')}%`;
      where.push('(cliente_nombre LIKE ? OR cliente_telefono LIKE ? OR cliente_email LIKE ? OR direccion LIKE ? OR cupon LIKE ?)');
      binds.push(like, like, like, like, like);
    }
  }
  const condicion = where.join(' AND ');
  const [lista, resumen] = await env.DB.batch([
    env.DB.prepare(`SELECT * FROM pedidos WHERE ${condicion}${antesDe ? ' AND id < ?' : ''} ORDER BY id DESC LIMIT 51`).bind(
      ...binds,
      ...(antesDe ? [antesDe] : []),
    ),
    env.DB.prepare(
      `SELECT COUNT(*) AS pedidos, COALESCE(SUM(CASE WHEN estado != 'cancelado' THEN total ELSE 0 END), 0) AS ventas
       FROM pedidos WHERE ${condicion}`,
    ).bind(...binds),
  ]);
  const filas = lista.results.slice(0, 50);
  const items = await itemsDe(env, filas.map((p) => p.id));
  return json({
    pedidos: filas.map((p) => pedidoDTO(p, items.get(p.id))),
    hayMas: lista.results.length > 50,
    resumen: resumen.results[0],
    desde,
    hasta,
  });
}

async function verPedido({ env, params }) {
  return json({ pedido: await pedidoCompleto(env, entero(params.id, { min: 1, campo: 'el pedido' })) });
}

/**
 * Devuelve al inventario lo descontado por un pedido y libera el uso de su código de descuento
 * (solo una vez y solo si quedó cancelado/eliminado).
 */
function devolverStock(env, id, ts) {
  const pendiente = `EXISTS (SELECT 1 FROM pedidos WHERE id = ?1 AND stock_devuelto = 0 AND (estado = 'cancelado' OR eliminado = 1))`;
  return [
    env.DB.prepare(
      `UPDATE productos SET
         stock = stock + (SELECT SUM(i.cantidad) FROM pedido_items i WHERE i.pedido_id = ?1 AND i.producto_id = productos.id),
         actualizado = ?2
       WHERE stock IS NOT NULL
         AND id IN (SELECT producto_id FROM pedido_items WHERE pedido_id = ?1 AND producto_id IS NOT NULL)
         AND ${pendiente}`,
    ).bind(id, ts),
    env.DB.prepare(
      `UPDATE cupones SET usos = usos - 1 WHERE usos > 0 AND codigo = (SELECT cupon FROM pedidos WHERE id = ?1) AND ${pendiente}`,
    ).bind(id),
    env.DB.prepare(
      `UPDATE pedidos SET stock_devuelto = 1
       WHERE id = ?1 AND stock_devuelto = 0 AND (estado = 'cancelado' OR eliminado = 1)`,
    ).bind(id),
  ];
}

async function cambiarEstado({ request, env, ctx, params, url }) {
  const id = entero(params.id, { min: 1, campo: 'el pedido' });
  const b = await readJson(request, 2000);
  const nuevo = String(b.estado || '');
  if (!ESTADOS.includes(nuevo)) throw new HttpError(400, 'Estado no válido.');
  const p = await env.DB.prepare('SELECT * FROM pedidos WHERE id = ?').bind(id).first();
  if (!p || p.eliminado) throw new HttpError(404, 'Pedido no encontrado.');
  if (p.estado === nuevo) return json({ pedido: await pedidoCompleto(env, id) });
  if (!TRANSICIONES[p.estado].includes(nuevo)) {
    throw new HttpError(409, `Un pedido "${NOMBRE_ESTADO[p.estado]}" no puede pasar a "${NOMBRE_ESTADO[nuevo]}".`);
  }

  const ts = ahoraIso();
  const motivo = nuevo === 'cancelado' ? texto(b.motivo, 140) : p.motivo_cancelacion;
  const columna = COLUMNA_TIEMPO[nuevo];
  const sql = `UPDATE pedidos SET estado = ?, actualizado = ?, motivo_cancelacion = ?${columna ? `, ${columna} = ?` : ''}
               WHERE id = ? AND estado = ? AND eliminado = 0`;
  const binds = [nuevo, ts, motivo, ...(columna ? [ts] : []), id, p.estado];
  const sentencias = [env.DB.prepare(sql).bind(...binds)];
  if (nuevo === 'cancelado') sentencias.push(...devolverStock(env, id, ts));
  const resultado = await env.DB.batch(sentencias);
  if (!resultado[0].meta.changes) throw new HttpError(409, 'El pedido cambió recién. Actualiza e intenta de nuevo.');

  const actualizado = await env.DB.prepare('SELECT * FROM pedidos WHERE id = ?').bind(id).first();
  ctx.waitUntil(avisarCliente(env, actualizado, subjectDe(env, url)).catch((e) => console.error('avisarCliente', e)));
  if (actualizado.cliente_email && (nuevo === 'listo' || nuevo === 'cancelado')) {
    ctx.waitUntil(avisarPorCorreo(env, actualizado, nuevo, url.origin));
  }
  return json({ pedido: await pedidoCompleto(env, id) });
}

async function eliminarPedido({ env, params }) {
  const id = entero(params.id, { min: 1, campo: 'el pedido' });
  const p = await env.DB.prepare('SELECT * FROM pedidos WHERE id = ?').bind(id).first();
  if (!p) throw new HttpError(404, 'Pedido no encontrado.');
  if (p.eliminado) return json({ ok: true });
  const ts = ahoraIso();
  const sentencias = [env.DB.prepare('UPDATE pedidos SET eliminado = 1, actualizado = ? WHERE id = ?').bind(ts, id)];
  if (p.estado !== 'entregado') sentencias.push(...devolverStock(env, id, ts));
  await env.DB.batch(sentencias);
  return json({ ok: true });
}

async function restaurarPedido({ env, params }) {
  const id = entero(params.id, { min: 1, campo: 'el pedido' });
  const p = await env.DB.prepare('SELECT * FROM pedidos WHERE id = ?').bind(id).first();
  if (!p) throw new HttpError(404, 'Pedido no encontrado.');
  if (!p.eliminado) return json({ pedido: await pedidoCompleto(env, id) });
  const ts = ahoraIso();
  const sentencias = [env.DB.prepare('UPDATE pedidos SET eliminado = 0, actualizado = ? WHERE id = ?').bind(ts, id)];
  if (p.stock_devuelto && p.estado !== 'cancelado') {
    // Vuelve a descontar lo que se había devuelto (falla completo si ya no alcanza el stock).
    sentencias.push(
      env.DB.prepare(
        `UPDATE productos SET
           stock = stock - (SELECT SUM(i.cantidad) FROM pedido_items i WHERE i.pedido_id = ?1 AND i.producto_id = productos.id),
           actualizado = ?2
         WHERE stock IS NOT NULL AND id IN (SELECT producto_id FROM pedido_items WHERE pedido_id = ?1 AND producto_id IS NOT NULL)`,
      ).bind(id, ts),
      env.DB.prepare('UPDATE pedidos SET stock_devuelto = 0 WHERE id = ?').bind(id),
    );
    if (p.cupon) {
      // Vuelve a contar el uso del código (si ya no quedan cupos, no se bloquea la restauración).
      sentencias.push(
        env.DB.prepare('UPDATE cupones SET usos = usos + 1 WHERE codigo = ? AND (max_usos IS NULL OR usos < max_usos)').bind(p.cupon),
      );
    }
  }
  try {
    await env.DB.batch(sentencias);
  } catch (e) {
    if (String(e?.message || e).includes('CHECK constraint failed')) {
      throw new HttpError(409, 'No hay stock suficiente para restaurar este pedido. Cancélalo o ajusta el stock primero.');
    }
    throw e;
  }
  return json({ pedido: await pedidoCompleto(env, id) });
}

// ---------- Carta: productos, categorías y acompañamientos ----------

async function carta({ env }) {
  const [prods, cats, acomps] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM productos ORDER BY orden, id'),
    env.DB.prepare('SELECT * FROM categorias ORDER BY orden, id'),
    env.DB.prepare('SELECT * FROM acompanamientos ORDER BY orden, id'),
  ]);
  return json({
    productos: prods.results.map(productoDTO),
    categorias: cats.results.map((c) => ({ id: c.id, nombre: c.nombre, emoji: c.emoji, orden: c.orden, activo: Boolean(c.activo) })),
    acompanamientos: acomps.results.map((a) => ({ id: a.id, nombre: a.nombre, orden: a.orden, activo: Boolean(a.activo) })),
  });
}

function leerProducto(b) {
  const imagen = b.imagenClave ? String(b.imagenClave) : null;
  if (imagen && !IMAGEN_RE.test(imagen)) throw new HttpError(400, 'La imagen no es válida.');
  return {
    nombre: texto(b.nombre, 80, { requerido: true, campo: 'el nombre' }),
    descripcion: texto(b.descripcion, 300, { multilinea: true }),
    precio: entero(b.precio, { min: 0, max: 10_000_000, campo: 'el precio' }),
    categoria_id: entero(b.categoriaId, { min: 1, campo: 'la categoría', nulo: true }),
    stock: entero(b.stock, { min: 0, max: 100_000, campo: 'el stock', nulo: true }),
    imagen,
    con_acompanamiento: bit(b.conAcompanamiento),
    dias: entero(b.dias ?? 127, { min: 0, max: 127, campo: 'los días' }),
    destacado: bit(b.destacado),
    sugerido: bit(b.sugerido),
    activo: b.activo === undefined ? 1 : bit(b.activo),
  };
}

async function productoPorId(env, id) {
  const p = await env.DB.prepare('SELECT * FROM productos WHERE id = ?').bind(id).first();
  if (!p) throw new HttpError(404, 'Producto no encontrado.');
  return p;
}

async function crearProducto({ request, env }) {
  const d = leerProducto(await readJson(request));
  const ts = ahoraIso();
  const { orden } = await env.DB.prepare('SELECT COALESCE(MAX(orden), 0) + 1 AS orden FROM productos').first();
  const fila = await env.DB.prepare(
    `INSERT INTO productos (nombre, descripcion, precio, categoria_id, stock, imagen, con_acompanamiento, dias, destacado, sugerido, activo, orden, creado, actualizado)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
  )
    .bind(d.nombre, d.descripcion, d.precio, d.categoria_id, d.stock, d.imagen, d.con_acompanamiento, d.dias, d.destacado, d.sugerido, d.activo, orden, ts, ts)
    .first();
  return json({ producto: productoDTO(fila) }, 201);
}

async function editarProducto({ request, env, ctx, params }) {
  const id = entero(params.id, { min: 1, campo: 'el producto' });
  const anterior = await productoPorId(env, id);
  const d = leerProducto(await readJson(request));
  // El crédito de la foto se mantiene solo si la foto no cambió (SQLite evalúa los CASE con los valores anteriores).
  const fila = await env.DB.prepare(
    `UPDATE productos SET nombre = ?, descripcion = ?, precio = ?, categoria_id = ?, stock = ?, imagen = ?,
       imagen_credito = CASE WHEN imagen IS ? THEN imagen_credito ELSE '' END,
       imagen_fuente = CASE WHEN imagen IS ? THEN imagen_fuente ELSE '' END,
       con_acompanamiento = ?, dias = ?, destacado = ?, sugerido = ?, activo = ?, actualizado = ?
     WHERE id = ? RETURNING *`,
  )
    .bind(d.nombre, d.descripcion, d.precio, d.categoria_id, d.stock, d.imagen, d.imagen, d.imagen, d.con_acompanamiento, d.dias, d.destacado, d.sugerido, d.activo, ahoraIso(), id)
    .first();
  if (anterior.imagen && anterior.imagen !== d.imagen) ctx.waitUntil(env.IMAGENES.delete(anterior.imagen));
  return json({ producto: productoDTO(fila) });
}

/** Cambios rápidos desde la lista: activo, destacado, días o stock (incluye sumar/restar). */
async function ajustarProducto({ request, env, params }) {
  const id = entero(params.id, { min: 1, campo: 'el producto' });
  const p = await productoPorId(env, id);
  const b = await readJson(request, 2000);
  const cambios = {};
  if ('activo' in b) cambios.activo = bit(b.activo);
  if ('destacado' in b) cambios.destacado = bit(b.destacado);
  if ('sugerido' in b) cambios.sugerido = bit(b.sugerido);
  if ('dias' in b) cambios.dias = entero(b.dias, { min: 0, max: 127, campo: 'los días' });
  if ('stock' in b) cambios.stock = entero(b.stock, { min: 0, max: 100_000, campo: 'el stock', nulo: true });
  if ('sumarStock' in b) {
    if (p.stock === null) throw new HttpError(400, 'Este producto no tiene control de stock.');
    cambios.stock = Math.max(0, p.stock + entero(b.sumarStock, { min: -100_000, max: 100_000, campo: 'el stock' }));
  }
  const columnas = Object.keys(cambios);
  if (!columnas.length) return json({ producto: productoDTO(p) });
  const fila = await env.DB.prepare(
    `UPDATE productos SET ${columnas.map((c) => `${c} = ?`).join(', ')}, actualizado = ? WHERE id = ? RETURNING *`,
  )
    .bind(...columnas.map((c) => cambios[c]), ahoraIso(), id)
    .first();
  return json({ producto: productoDTO(fila) });
}

async function eliminarProducto({ env, ctx, params }) {
  const id = entero(params.id, { min: 1, campo: 'el producto' });
  const p = await productoPorId(env, id);
  await env.DB.prepare('DELETE FROM productos WHERE id = ?').bind(id).run();
  if (p.imagen) ctx.waitUntil(env.IMAGENES.delete(p.imagen));
  return json({ ok: true });
}

const TIPOS_IMAGEN = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };

function firmaCoincide(bytes, tipo) {
  if (tipo === 'image/png') return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (tipo === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (tipo === 'image/webp') {
    const riff = String.fromCharCode(...bytes.slice(0, 4));
    const webp = String.fromCharCode(...bytes.slice(8, 12));
    return riff === 'RIFF' && webp === 'WEBP';
  }
  return false;
}

async function subirImagen({ request, env }) {
  const tipo = (request.headers.get('content-type') || '').split(';')[0].trim();
  const ext = TIPOS_IMAGEN[tipo];
  if (!ext) throw new HttpError(415, 'Formato de imagen no soportado. Usa JPG, PNG o WebP.');
  const buf = await request.arrayBuffer();
  if (buf.byteLength > 3_000_000) throw new HttpError(413, 'La imagen es muy pesada (máximo 3 MB).');
  if (buf.byteLength < 100 || !firmaCoincide(new Uint8Array(buf.slice(0, 12)), tipo)) {
    throw new HttpError(400, 'El archivo no parece ser una imagen válida.');
  }
  const clave = `p/${tokenAleatorio(12)}.${ext}`;
  await env.IMAGENES.put(clave, buf, { metadata: { tipo } });
  return json({ clave, url: `/img/${clave}` }, 201);
}

function leerCategoria(b) {
  return {
    nombre: texto(b.nombre, 40, { requerido: true, campo: 'el nombre' }),
    emoji: texto(b.emoji, 16),
    activo: b.activo === undefined ? 1 : bit(b.activo),
  };
}

async function crearCategoria({ request, env }) {
  const d = leerCategoria(await readJson(request));
  const fila = await env.DB.prepare(
    `INSERT INTO categorias (nombre, emoji, activo, orden)
     VALUES (?, ?, ?, (SELECT COALESCE(MAX(orden), 0) + 1 FROM categorias)) RETURNING *`,
  )
    .bind(d.nombre, d.emoji, d.activo)
    .first();
  return json({ categoria: { ...fila, activo: Boolean(fila.activo) } }, 201);
}

async function editarCategoria({ request, env, params }) {
  const id = entero(params.id, { min: 1, campo: 'la categoría' });
  const d = leerCategoria(await readJson(request));
  const fila = await env.DB.prepare('UPDATE categorias SET nombre = ?, emoji = ?, activo = ? WHERE id = ? RETURNING *')
    .bind(d.nombre, d.emoji, d.activo, id)
    .first();
  if (!fila) throw new HttpError(404, 'Categoría no encontrada.');
  return json({ categoria: { ...fila, activo: Boolean(fila.activo) } });
}

async function eliminarCategoria({ env, params }) {
  const id = entero(params.id, { min: 1, campo: 'la categoría' });
  await env.DB.prepare('DELETE FROM categorias WHERE id = ?').bind(id).run(); // los productos quedan "sin categoría"
  return json({ ok: true });
}

async function ordenarCategorias({ request, env }) {
  const b = await readJson(request, 4000);
  const ids = (Array.isArray(b.ids) ? b.ids : []).map((id) => entero(id, { min: 1, campo: 'una categoría' }));
  if (!ids.length) return json({ ok: true });
  await env.DB.batch(ids.map((id, i) => env.DB.prepare('UPDATE categorias SET orden = ? WHERE id = ?').bind(i + 1, id)));
  return json({ ok: true });
}

async function crearAcompanamiento({ request, env }) {
  const b = await readJson(request);
  const nombre = texto(b.nombre, 40, { requerido: true, campo: 'el nombre' });
  const fila = await env.DB.prepare(
    `INSERT INTO acompanamientos (nombre, activo, orden)
     VALUES (?, ?, (SELECT COALESCE(MAX(orden), 0) + 1 FROM acompanamientos)) RETURNING *`,
  )
    .bind(nombre, b.activo === undefined ? 1 : bit(b.activo))
    .first();
  return json({ acompanamiento: { ...fila, activo: Boolean(fila.activo) } }, 201);
}

async function editarAcompanamiento({ request, env, params }) {
  const id = entero(params.id, { min: 1, campo: 'el acompañamiento' });
  const b = await readJson(request);
  const fila = await env.DB.prepare('UPDATE acompanamientos SET nombre = ?, activo = ? WHERE id = ? RETURNING *')
    .bind(texto(b.nombre, 40, { requerido: true, campo: 'el nombre' }), bit(b.activo ?? true), id)
    .first();
  if (!fila) throw new HttpError(404, 'Acompañamiento no encontrado.');
  return json({ acompanamiento: { ...fila, activo: Boolean(fila.activo) } });
}

async function eliminarAcompanamiento({ env, params }) {
  const id = entero(params.id, { min: 1, campo: 'el acompañamiento' });
  await env.DB.prepare('DELETE FROM acompanamientos WHERE id = ?').bind(id).run();
  return json({ ok: true });
}

// ---------- Mesas (con link firmado para el código QR) ----------

async function mesaDTO(env, m) {
  return { id: m.id, numero: m.numero, nombre: m.nombre, activo: Boolean(m.activo), link: `/?mesa=${m.numero}&k=${await firmaMesa(env, m.numero)}` };
}

async function listarMesas({ env }) {
  const { results } = await env.DB.prepare('SELECT * FROM mesas ORDER BY numero').all();
  return json({ mesas: await Promise.all(results.map((m) => mesaDTO(env, m))) });
}

async function crearMesa({ request, env }) {
  const b = await readJson(request);
  const numero = entero(b.numero, { min: 1, max: 9999, campo: 'el número de mesa' });
  try {
    const fila = await env.DB.prepare('INSERT INTO mesas (numero, nombre, activo) VALUES (?, ?, 1) RETURNING *')
      .bind(numero, texto(b.nombre, 40))
      .first();
    return json({ mesa: await mesaDTO(env, fila) }, 201);
  } catch (e) {
    if (String(e?.message || e).includes('UNIQUE')) throw new HttpError(409, `Ya existe la mesa ${numero}.`);
    throw e;
  }
}

async function editarMesa({ request, env, params }) {
  const id = entero(params.id, { min: 1, campo: 'la mesa' });
  const b = await readJson(request);
  const fila = await env.DB.prepare('UPDATE mesas SET nombre = ?, activo = ? WHERE id = ? RETURNING *')
    .bind(texto(b.nombre, 40), bit(b.activo ?? true), id)
    .first();
  if (!fila) throw new HttpError(404, 'Mesa no encontrada.');
  return json({ mesa: await mesaDTO(env, fila) });
}

async function eliminarMesa({ env, params }) {
  const id = entero(params.id, { min: 1, campo: 'la mesa' });
  await env.DB.prepare('DELETE FROM mesas WHERE id = ?').bind(id).run();
  return json({ ok: true });
}

// ---------- Ajustes y contraseña ----------

async function verAjustes({ env }) {
  return json({ ajustes: await leerAjustes(env) });
}

async function cambiarAjustes({ request, env }) {
  const b = await readJson(request, 16_000);
  return json({ ajustes: await guardarAjustes(env, b.ajustes || b) });
}

async function cambiarPassword({ request, env, url }) {
  const b = await readJson(request, 2000);
  if (!(await passwordCorrecta(env, b.actual))) throw new HttpError(400, 'La contraseña actual no es correcta.');
  const nueva = typeof b.nueva === 'string' ? b.nueva : '';
  if (nueva.length < 8) throw new HttpError(400, 'La nueva contraseña debe tener al menos 8 caracteres.');
  if (nueva.length > 100) throw new HttpError(400, 'La nueva contraseña es demasiado larga.');
  await guardarPassword(env, nueva);
  const token = await crearSesion(env); // las demás sesiones quedan cerradas
  return json({ ok: true }, 200, { 'set-cookie': cookieSesion(token, url) });
}

// ---------- Estadísticas ----------

async function estadisticas({ env }) {
  const ahora = horaChile();
  const hoy = ahora.fecha;
  const lunes = sumarDias(hoy, -ahora.dow);
  const inicioMes = `${hoy.slice(0, 8)}01`;
  const hace6 = sumarDias(hoy, -6);
  const hace29 = sumarDias(hoy, -29);
  const desde = inicioMes < hace29 ? inicioMes : hace29;
  const valido = "eliminado = 0 AND estado != 'cancelado'";
  const ranking = (fecha) =>
    env.DB.prepare(
      `SELECT COALESCE(i.producto_id, 0) AS id, i.nombre, SUM(i.cantidad) AS cantidad, SUM(i.total) AS ventas
       FROM pedido_items i JOIN pedidos p ON p.id = i.pedido_id
       WHERE p.eliminado = 0 AND p.estado != 'cancelado' AND p.fecha_local >= ?
       GROUP BY COALESCE(i.producto_id, i.nombre) ORDER BY cantidad DESC, ventas DESC`,
    ).bind(fecha);

  const [dias, tipos, horas, semana, mes, cancelados, activos, descuentos] = await env.DB.batch([
    env.DB.prepare(
      `SELECT fecha_local AS fecha, COUNT(*) AS pedidos, SUM(total) AS ventas FROM pedidos
       WHERE ${valido} AND fecha_local >= ? GROUP BY fecha_local`,
    ).bind(desde),
    env.DB.prepare(
      `SELECT tipo, COUNT(*) AS pedidos, SUM(total) AS ventas FROM pedidos WHERE ${valido} AND fecha_local >= ? GROUP BY tipo`,
    ).bind(hace29),
    env.DB.prepare(`SELECT hora_local AS hora, COUNT(*) AS pedidos FROM pedidos WHERE ${valido} AND fecha_local >= ? GROUP BY hora_local`).bind(hace29),
    ranking(lunes),
    ranking(inicioMes),
    env.DB.prepare("SELECT COUNT(*) AS n FROM pedidos WHERE eliminado = 0 AND estado = 'cancelado' AND fecha_local >= ?").bind(hace29),
    env.DB.prepare('SELECT id, nombre FROM productos WHERE activo = 1'),
    env.DB.prepare(
      `SELECT COUNT(*) AS pedidos, COALESCE(SUM(descuento), 0) AS monto FROM pedidos
       WHERE ${valido} AND cupon != '' AND fecha_local >= ?`,
    ).bind(hace29),
  ]);

  const porFecha = new Map(dias.results.map((r) => [r.fecha, r]));
  const suma = (desdeFecha) =>
    dias.results
      .filter((r) => r.fecha >= desdeFecha)
      .reduce((a, r) => ({ pedidos: a.pedidos + r.pedidos, ventas: a.ventas + r.ventas }), { pedidos: 0, ventas: 0 });
  const serie = [];
  for (let i = 29; i >= 0; i--) {
    const fecha = sumarDias(hoy, -i);
    const r = porFecha.get(fecha);
    serie.push({ fecha, pedidos: r?.pedidos || 0, ventas: r?.ventas || 0 });
  }
  const vendidosSemana = new Map(semana.results.map((r) => [r.id, r.cantidad]));
  const menosSemana = activos.results
    .map((p) => ({ id: p.id, nombre: p.nombre, cantidad: vendidosSemana.get(p.id) || 0 }))
    .sort((a, b) => a.cantidad - b.cantidad || a.nombre.localeCompare(b.nombre))
    .slice(0, 3);
  const ult30 = suma(hace29);

  return json({
    fechas: { hoy, lunes, inicioMes },
    hoy: suma(hoy),
    semana: suma(lunes),
    mes: suma(inicioMes),
    ult7: suma(hace6),
    ult30,
    ticketPromedio: ult30.pedidos ? Math.round(ult30.ventas / ult30.pedidos) : 0,
    cancelados30: cancelados.results[0].n,
    descuentos30: descuentos.results[0],
    serie,
    tipos: tipos.results,
    horas: Array.from({ length: 24 }, (_, h) => horas.results.find((r) => r.hora === h)?.pedidos || 0),
    topSemana: semana.results.slice(0, 5),
    topMes: mes.results.slice(0, 5),
    menosSemana,
  });
}

// ---------- Avisos push para el local ----------

async function suscribirAdmin({ request, env }) {
  const b = await readJson(request, 4000);
  const sub = suscripcionValida(b.suscripcion || b);
  if (!sub) throw new HttpError(400, 'Este navegador no entregó una suscripción válida.');
  await env.DB.prepare(
    `INSERT INTO suscripciones_admin (endpoint, p256dh, auth, nombre, creado) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, nombre = excluded.nombre`,
  )
    .bind(sub.endpoint, sub.p256dh, sub.auth, texto(b.nombre, 60), ahoraIso())
    .run();
  const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM suscripciones_admin').first();
  return json({ ok: true, dispositivos: n }, 201);
}

async function desuscribirAdmin({ request, env }) {
  const b = await readJson(request, 4000);
  await env.DB.prepare('DELETE FROM suscripciones_admin WHERE endpoint = ?').bind(String(b.endpoint || '')).run();
  return json({ ok: true });
}

async function pruebaPush({ request, env, url }) {
  const b = await readJson(request, 4000);
  const r = await avisoDePrueba(env, subjectDe(env, url), b.endpoint ? String(b.endpoint) : null);
  return json(r);
}
