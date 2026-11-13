// Pruebas de punta a punta de la API contra `wrangler dev` (http://127.0.0.1:8787).
// Uso: node scripts/test-api.mjs [baseUrl]
import { readFileSync } from 'node:fs';
import sharp from 'sharp';

const BASE = process.argv[2] || 'http://127.0.0.1:8787';
const vars = Object.fromEntries(
  readFileSync('.dev.vars', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);

let fallos = 0;
let pruebas = 0;
function ok(cond, msg, extra) {
  pruebas++;
  if (cond) console.log(`  ✔ ${msg}`);
  else {
    fallos++;
    console.log(`  ✘ ${msg}`, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : '');
  }
}
const seccion = (t) => console.log(`\n▸ ${t}`);

let cookie = '';
async function api(method, path, body, { admin = false, raw = false, headers = {} } = {}) {
  const h = { ...headers };
  if (body !== undefined && !raw) h['content-type'] = 'application/json';
  if (admin) {
    h['x-ps-client'] = '1';
    if (cookie) h.cookie = cookie;
  }
  const res = await fetch(BASE + path, { method, headers: h, body: raw ? body : body !== undefined ? JSON.stringify(body) : undefined });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie && admin) cookie = setCookie.split(';')[0];
  const tipo = res.headers.get('content-type') || '';
  const data = tipo.includes('json') ? await res.json() : await res.arrayBuffer();
  return { status: res.status, data, headers: res.headers };
}

// ---------------------------------------------------------------
seccion('Menú público');
const m = await api('GET', '/api/menu');
ok(m.status === 200, 'GET /api/menu responde 200', m.data);
ok(m.data.productos.length >= 15 && m.data.categorias.length === 6, `trae carta de ejemplo (${m.data.productos.length} productos)`);
ok(typeof m.data.estado.abierto === 'boolean' && m.data.estado.mensaje, `estado del local: "${m.data.estado.mensaje}"`);
ok(m.data.vapidPublicKey?.length > 80, 'entrega la clave pública VAPID');
ok(!('stock' in m.data.productos[0]), 'no expone el stock exacto a clientes');
const dow = m.data.estado.dow;
const bit = 1 << dow;
const hoy = m.data.productos.filter((p) => p.dias & bit);
const noHoy = m.data.productos.find((p) => !(p.dias & bit));
const empanada = m.data.productos.find((p) => p.nombre === 'Empanada de pino');
const pollo = m.data.productos.find((p) => p.nombre === 'Pollo asado');
const kuchen = m.data.productos.find((p) => p.nombre === 'Kuchen de murta');
const acomp = m.data.acompanamientos[0];
ok(hoy.length > 0, `${hoy.length} productos disponibles hoy (día ${dow})`);

seccion('Panel: acceso');
let r = await api('GET', '/api/admin/carta', undefined, { admin: true });
ok(r.status === 401, 'sin sesión → 401');
r = await api('POST', '/api/admin/login', { password: 'incorrecta' }, { admin: true });
ok(r.status === 401, 'contraseña incorrecta → 401');
r = await api('POST', '/api/admin/login', { password: vars.ADMIN_PASSWORD }, { admin: true });
ok(r.status === 200 && cookie.startsWith('ps_admin='), 'login correcto entrega cookie de sesión');
ok(/HttpOnly/i.test(r.headers.get('set-cookie')) && /SameSite=Strict/i.test(r.headers.get('set-cookie')), 'cookie HttpOnly + SameSite=Strict');
r = await fetch(BASE + '/api/admin/productos', { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: '{}' });
ok(r.status === 403, 'escritura sin cabecera anti-CSRF → 403');

const stockAntes = async (nombre) => (await api('GET', '/api/admin/carta', undefined, { admin: true })).data.productos.find((p) => p.nombre === nombre).stock;
const stockEmpanadaInicial = await stockAntes('Empanada de pino');

seccion('Abrir el local para las pruebas (horario 24 h)');
const ajustesOriginales = (await api('GET', '/api/admin/ajustes', undefined, { admin: true })).data.ajustes;
ok(ajustesOriginales.tipos.retiro && ajustesOriginales.tipos.delivery && !ajustesOriginales.tipos.mesa, 'retiro y delivery activos; pedidos en la mesa en pausa');
const abierto24h = { ...ajustesOriginales, recibiendoPedidos: true, horario: ajustesOriginales.horario.map(() => ({ abierto: true, desde: '00:00', hasta: '00:00' })) };
r = await api('PUT', '/api/admin/ajustes', abierto24h, { admin: true });
ok(r.status === 200 && r.data.ajustes.horario[0].desde === '00:00', 'ajustes guardados');
r = await api('POST', '/api/pedidos', { tipo: 'mesa', mesa: 3, mesaFirma: 'x', cliente: { nombre: 'Juan' }, metodoPago: 'tarjeta', items: [{ productoId: empanada.id, cantidad: 1 }] });
ok(r.status === 400 && /no está disponible/.test(r.data.error), 'con las mesas en pausa no se aceptan pedidos en la mesa', r.data);
r = await api('PUT', '/api/admin/ajustes', { ...abierto24h, tipos: { ...ajustesOriginales.tipos, mesa: true } }, { admin: true });
ok(r.data.ajustes.tipos.mesa === true, 'mesas activadas para probar esa función (queda lista para el futuro)');

seccion('Crear pedidos (validaciones)');
const base = { tipo: 'retiro', cliente: { nombre: 'Ana Pérez', telefono: '+56 9 1234 5678' }, metodoPago: 'efectivo' };
r = await api('POST', '/api/pedidos', { ...base, items: [] });
ok(r.status === 400, 'carro vacío → 400', r.data);
r = await api('POST', '/api/pedidos', { ...base, cliente: { nombre: '', telefono: '912345678' }, items: [{ productoId: empanada.id, cantidad: 1 }] });
ok(r.status === 400 && /nombre/.test(r.data.error), 'sin nombre → 400', r.data);
r = await api('POST', '/api/pedidos', { ...base, cliente: { nombre: 'Ana', telefono: '12' }, items: [{ productoId: empanada.id, cantidad: 1 }] });
ok(r.status === 400, 'teléfono inválido → 400', r.data);
r = await api('POST', '/api/pedidos', { ...base, items: [{ productoId: pollo.id, cantidad: 1 }] });
ok(r.status === 400 && /acompañamiento/.test(r.data.error), 'sin acompañamiento obligatorio → 400', r.data);
if (noHoy) {
  r = await api('POST', '/api/pedidos', { ...base, items: [{ productoId: noHoy.id, cantidad: 1 }] });
  ok(r.status === 409 && /menú de hoy/.test(r.data.error), `"${noHoy.nombre}" no está hoy → 409`, r.data);
}
r = await api('POST', '/api/pedidos', { ...base, items: [{ productoId: kuchen.id, cantidad: 30 }] });
ok(r.status === 409 && /quedan/i.test(r.data.error), 'más que el stock → 409 "Solo quedan…"', r.data);
r = await api('POST', '/api/pedidos', { ...base, metodoPago: 'bitcoin', items: [{ productoId: empanada.id, cantidad: 1 }] });
ok(r.status === 400, 'medio de pago inválido → 400', r.data);
r = await api('POST', '/api/pedidos', { ...base, tipo: 'delivery', direccion: 'Av. Siempre Viva 123', items: [{ productoId: empanada.id, cantidad: 1 }] });
ok(r.status === 409 && /mínimo/.test(r.data.error), 'delivery bajo el mínimo → 409', r.data);
r = await api('POST', '/api/pedidos', { ...base, web: 'http://spam', items: [{ productoId: empanada.id, cantidad: 1 }] });
ok(r.status === 400, 'campo trampa de bots → 400');

seccion('Crear pedido válido (retiro) y descontar stock');
const itemsOk = [
  { productoId: empanada.id, cantidad: 3, comentario: 'Bien calientes 🔥' },
  { productoId: pollo.id, cantidad: 1, acompanamientoId: acomp.id, comentario: 'sin sal' },
];
r = await api('POST', '/api/pedidos', { ...base, notas: 'Paso a las 13:30', items: itemsOk });
ok(r.status === 201 && r.data.token?.length >= 16, 'pedido creado → 201 con token', r.data);
const p1 = r.data;
ok((await stockAntes('Empanada de pino')) === stockEmpanadaInicial - 3, 'stock de empanadas descontado (−3)');
r = await api('GET', `/api/pedidos/${p1.token}`);
ok(r.status === 200 && r.data.pedido.estado === 'pendiente', 'seguimiento público del pedido');
ok(r.data.pedido.total === empanada.precio * 3 + pollo.precio, `total calculado por el servidor (${r.data.pedido.total})`);
ok(r.data.pedido.items[1].acompanamiento === acomp.nombre, 'guarda el acompañamiento elegido');
ok(r.data.pedido.items[0].comentario === 'Bien calientes 🔥', 'guarda el comentario con emoji');
r = await api('GET', '/api/pedidos/tokenquenoexiste123456');
ok(r.status === 404, 'token inexistente → 404');

seccion('Pedido delivery');
r = await api('POST', '/api/pedidos', {
  ...base,
  tipo: 'delivery',
  direccion: 'Los Aromos 456, depto 12',
  metodoPago: 'transferencia',
  items: [{ productoId: empanada.id, cantidad: 4 }],
});
ok(r.status === 201, 'delivery sobre el mínimo → 201', r.data);
const p2 = r.data;
r = await api('GET', `/api/pedidos/${p2.token}`);
ok(r.data.pedido.costoEnvio === 2000 && r.data.pedido.total === empanada.precio * 4 + 2000, 'suma costo de envío');

seccion('Pedido desde mesa (QR firmado)');
const mesas = (await api('GET', '/api/admin/mesas', undefined, { admin: true })).data.mesas;
ok(mesas.length === 6 && mesas[0].link.includes('k='), 'mesas con link firmado');
const linkMesa = new URL(mesas[2].link, BASE);
r = await api('GET', `/api/mesa?n=${linkMesa.searchParams.get('mesa')}&k=${linkMesa.searchParams.get('k')}`);
ok(r.status === 200 && r.data.mesa === 3, 'link de mesa verificado');
r = await api('GET', `/api/mesa?n=3&k=falsificado123`);
ok(r.status === 404, 'firma falsa → 404');
r = await api('POST', '/api/pedidos', { tipo: 'mesa', mesa: 3, mesaFirma: 'falsificado', cliente: { nombre: 'Mesa 3' }, metodoPago: 'tarjeta', items: [{ productoId: empanada.id, cantidad: 1 }] });
ok(r.status === 403, 'pedido de mesa con firma falsa → 403');
r = await api('POST', '/api/pedidos', { tipo: 'mesa', mesa: 3, mesaFirma: linkMesa.searchParams.get('k'), cliente: { nombre: 'Juan' }, metodoPago: 'tarjeta', items: [{ productoId: empanada.id, cantidad: 2 }] });
ok(r.status === 201, 'pedido de mesa sin teléfono → 201', r.data);
const p3 = r.data;

seccion('Avisos push del cliente');
r = await api('POST', `/api/pedidos/${p1.token}/suscripcion`, { endpoint: 'https://evil.example.com/push', keys: { p256dh: 'x', auth: 'y' } });
ok(r.status === 400, 'endpoint no permitido → 400');
const nav = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
const p256dh = Buffer.from(await crypto.subtle.exportKey('raw', nav.publicKey)).toString('base64url');
const auth = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url');
r = await api('POST', `/api/pedidos/${p1.token}/suscripcion`, { endpoint: 'https://fcm.googleapis.com/fcm/send/prueba-local-invalida', keys: { p256dh, auth } });
ok(r.status === 201, 'suscripción válida guardada');
r = await api('GET', `/api/pedidos/${p1.token}`);
ok(r.data.suscripciones === 1, 'el pedido registra 1 dispositivo para avisos');

seccion('Tablero en vivo y cambios de estado');
r = await api('GET', '/api/admin/tablero', undefined, { admin: true });
ok(r.status === 200 && r.data.pedidos.some((p) => p.id === p1.id), 'tablero completo incluye el pedido');
const cursor = r.data.cursor;
r = await api('PATCH', `/api/admin/pedidos/${p1.id}`, { estado: 'preparando' }, { admin: true });
ok(r.status === 200 && r.data.pedido.estado === 'preparando' && r.data.pedido.tiempos.preparando, 'pendiente → preparando (con hora)');
r = await api('GET', `/api/admin/tablero?since=${encodeURIComponent(cursor)}`, undefined, { admin: true });
ok(r.data.completo === false && r.data.pedidos.some((p) => p.id === p1.id && p.estado === 'preparando'), 'sincronización incremental trae el cambio');
r = await api('PATCH', `/api/admin/pedidos/${p1.id}`, { estado: 'listo' }, { admin: true });
ok(r.data.pedido?.estado === 'listo', 'preparando → listo (envía aviso push)');
r = await api('PATCH', `/api/admin/pedidos/${p1.id}`, { estado: 'entregado' }, { admin: true });
ok(r.data.pedido?.estado === 'entregado', 'listo → entregado');
r = await api('PATCH', `/api/admin/pedidos/${p1.id}`, { estado: 'pendiente' }, { admin: true });
ok(r.status === 409, 'entregado → nuevo no permitido → 409', r.data);

seccion('Cancelar devuelve stock');
const antesCancelar = await stockAntes('Empanada de pino');
r = await api('PATCH', `/api/admin/pedidos/${p2.id}`, { estado: 'cancelado', motivo: 'Sin repartidor disponible' }, { admin: true });
ok(r.data.pedido?.estado === 'cancelado' && r.data.pedido.motivoCancelacion === 'Sin repartidor disponible', 'pedido cancelado con motivo');
ok((await stockAntes('Empanada de pino')) === antesCancelar + 4, 'stock devuelto (+4)');
r = await api('PATCH', `/api/admin/pedidos/${p2.id}`, { estado: 'preparando' }, { admin: true });
ok(r.status === 409, 'cancelado es final → 409');
ok((await stockAntes('Empanada de pino')) === antesCancelar + 4, 'no devuelve stock dos veces');

seccion('Eliminar y restaurar');
const antesEliminar = await stockAntes('Empanada de pino');
r = await api('DELETE', `/api/admin/pedidos/${p3.id}`, undefined, { admin: true });
ok(r.status === 200, 'pedido eliminado (papelera)');
ok((await stockAntes('Empanada de pino')) === antesEliminar + 2, 'eliminar un pedido activo devuelve stock');
r = await api('GET', `/api/pedidos/${p3.token}`);
ok(r.data.pedido.estado === 'cancelado', 'el cliente lo ve como cancelado');
r = await api('GET', '/api/admin/pedidos?eliminados=1', undefined, { admin: true });
ok(r.data.pedidos.some((p) => p.id === p3.id), 'aparece en eliminados');
r = await api('POST', `/api/admin/pedidos/${p3.id}/restaurar`, {}, { admin: true });
ok(r.status === 200 && r.data.pedido.eliminado === false, 'pedido restaurado');
ok((await stockAntes('Empanada de pino')) === antesEliminar, 'al restaurar vuelve a descontar stock');

seccion('Historial y búsqueda');
r = await api('GET', '/api/admin/pedidos', undefined, { admin: true });
ok(r.status === 200 && r.data.pedidos.length >= 3 && r.data.resumen.pedidos >= 3, `historial con ${r.data.pedidos.length} pedidos`);
r = await api('GET', `/api/admin/pedidos?q=${encodeURIComponent('Ana')}`, undefined, { admin: true });
ok(r.data.pedidos.every((p) => p.cliente.nombre.includes('Ana')), 'búsqueda por nombre');
r = await api('GET', `/api/admin/pedidos?q=%23${p1.id}`, undefined, { admin: true });
ok(r.data.pedidos.length === 1 && r.data.pedidos[0].id === p1.id, 'búsqueda por número #');

seccion('Carta: productos, imágenes, categorías y acompañamientos');
const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#e2466f' } }).png().toBuffer();
r = await api('POST', '/api/admin/imagenes', png, { admin: true, raw: true, headers: { 'content-type': 'image/png' } });
ok(r.status === 201 && /^p\/.+\.png$/.test(r.data.clave), 'imagen subida a KV', r.data);
const img = r.data;
r = await api('POST', '/api/admin/imagenes', Buffer.from('<script>alert(1)</script>'.repeat(10)), { admin: true, raw: true, headers: { 'content-type': 'image/png' } });
ok(r.status === 400, 'archivo que no es imagen → 400');
const resImg = await fetch(BASE + img.url);
ok(resImg.status === 200 && resImg.headers.get('content-type') === 'image/png' && /immutable/.test(resImg.headers.get('cache-control')), 'imagen servida con caché inmutable');
r = await api('POST', '/api/admin/productos', { nombre: 'Completo italiano', descripcion: 'Palta, tomate y mayo', precio: 3500, categoriaId: 3, stock: 10, imagenClave: img.clave, dias: 127 }, { admin: true });
ok(r.status === 201 && r.data.producto.imagen === img.url, 'producto creado con imagen');
const nuevo = r.data.producto;
r = await api('PATCH', `/api/admin/productos/${nuevo.id}`, { sumarStock: 5 }, { admin: true });
ok(r.data.producto.stock === 15, 'stock +5 rápido');
r = await api('PATCH', `/api/admin/productos/${nuevo.id}`, { activo: false }, { admin: true });
ok(r.data.producto.activo === false, 'producto pausado');
r = await api('GET', '/api/menu');
ok(!r.data.productos.some((p) => p.id === nuevo.id), 'producto pausado no aparece en el menú');
r = await api('PUT', `/api/admin/productos/${nuevo.id}`, { ...nuevo, precio: 3900, imagenClave: null, activo: true }, { admin: true });
ok(r.data.producto.precio === 3900 && r.data.producto.imagen === null, 'producto editado (y se borra la imagen vieja)');
ok((await fetch(BASE + img.url)).status === 404, 'imagen antigua eliminada de KV');
r = await api('PUT', `/api/admin/productos/${nuevo.id}`, { ...nuevo, precio: -5 }, { admin: true });
ok(r.status === 400, 'precio negativo → 400');
r = await api('DELETE', `/api/admin/productos/${nuevo.id}`, undefined, { admin: true });
ok(r.status === 200, 'producto eliminado');
r = await api('POST', '/api/admin/categorias', { nombre: 'Sándwiches', emoji: '🥪' }, { admin: true });
ok(r.status === 201, 'categoría creada');
const cat = r.data.categoria;
r = await api('DELETE', `/api/admin/categorias/${cat.id}`, undefined, { admin: true });
ok(r.status === 200, 'categoría eliminada');
r = await api('POST', '/api/admin/acompanamientos', { nombre: 'Fideos' }, { admin: true });
ok(r.status === 201, 'acompañamiento creado');
r = await api('DELETE', `/api/admin/acompanamientos/${r.data.acompanamiento.id}`, undefined, { admin: true });
ok(r.status === 200, 'acompañamiento eliminado');

seccion('Mesas');
r = await api('POST', '/api/admin/mesas', { numero: 3 }, { admin: true });
ok(r.status === 409, 'mesa duplicada → 409');
r = await api('POST', '/api/admin/mesas', { numero: 12, nombre: 'Terraza' }, { admin: true });
ok(r.status === 201 && r.data.mesa.link.includes('mesa=12'), 'mesa creada con QR');
await api('DELETE', `/api/admin/mesas/${r.data.mesa.id}`, undefined, { admin: true });

seccion('Correo del local (Gmail simulado con scripts/smtp-falso.mjs)');
const SMTP = 'http://127.0.0.1:2526';
const hayCorreoFalso = await fetch(`${SMTP}/limpiar`).then(() => true).catch(() => false);
ok(hayCorreoFalso, 'servidor SMTP falso disponible');
const esperarCorreos = async (n, ms = 8000) => {
  const fin = Date.now() + ms;
  let lista = [];
  while (Date.now() < fin) {
    lista = await (await fetch(`${SMTP}/correos`)).json();
    if (lista.length >= n) break;
    await new Promise((res) => setTimeout(res, 250));
  }
  return lista;
};
const contenido = (eml) =>
  [...eml.matchAll(/Content-Transfer-Encoding: base64\r\n\r\n([\s\S]*?)\r\n--/g)]
    .map((x) => Buffer.from(x[1].replace(/\r\n/g, ''), 'base64').toString('utf8'))
    .join('\n');
r = await api('DELETE', '/api/admin/correo', undefined, { admin: true });
r = await api('GET', '/api/admin/correo', undefined, { admin: true });
ok(r.status === 200 && r.data.configurado === false, 'correo sin configurar');
r = await api('PUT', '/api/admin/correo', { usuario: 'local@gmail.com', password: 'mala' }, { admin: true });
ok(r.status === 400, 'contraseña de aplicación muy corta → 400');
r = await api('PUT', '/api/admin/correo', { usuario: 'local@gmail.com', password: 'abcd efgh ijkl mnop' }, { admin: true });
ok(r.status === 400 && /Gmail no aceptó/.test(r.data.error), 'Gmail rechaza la clave → mensaje claro', r.data);
r = await api('PUT', '/api/admin/correo', { usuario: 'Local@Gmail.com', password: 'clave-de-prueba-16', remitente: 'Patagonia Sabores' }, { admin: true });
ok(r.status === 200 && r.data.configurado && r.data.usuario === 'local@gmail.com' && !('password' in r.data), 'Gmail conectado (la clave nunca vuelve al navegador)', r.data);
r = await api('POST', '/api/admin/correo/prueba', {}, { admin: true });
ok(r.status === 200 && r.data.para === 'local@gmail.com', 'correo de prueba enviado', r.data);
let correos = await esperarCorreos(1);
ok(correos[0]?.para[0] === 'local@gmail.com' && /Subject: =\?UTF-8\?B\?/.test(correos[0].datos), 'llega con asunto en UTF-8');
ok(/^From: "Patagonia Sabores" <local@gmail.com>/m.test(correos[0]?.datos || ''), 'remitente: Patagonia Sabores <local@gmail.com>');

seccion('Códigos de descuento');
const sufijo = Date.now().toString(36).slice(-4).toUpperCase();
const COD = `BIENVENIDA${sufijo}`;
r = await api('POST', '/api/admin/cupones', { codigo: 'ab', tipo: 'porcentaje', valor: 10 }, { admin: true });
ok(r.status === 400, 'código muy corto → 400');
r = await api('POST', '/api/admin/cupones', { codigo: `x${sufijo}p`, tipo: 'porcentaje', valor: 150 }, { admin: true });
ok(r.status === 400, 'porcentaje sobre 100 → 400');
r = await api('POST', '/api/admin/cupones', { codigo: ` bienvenida ${sufijo.toLowerCase()} `, tipo: 'porcentaje', valor: 10, minimo: 5000, maxUsos: 2, unoPorCliente: true, descripcion: 'Primera compra' }, { admin: true });
ok(r.status === 201 && r.data.cupon.codigo === COD && r.data.cupon.estado === 'vigente', `código ${COD} creado (mayúsculas, sin espacios)`, r.data);
const cup = r.data.cupon;
r = await api('POST', '/api/admin/cupones', { codigo: COD, tipo: 'monto', valor: 1000 }, { admin: true });
ok(r.status === 409, 'código repetido → 409');
r = await api('POST', '/api/admin/cupones', { codigo: `MIL${sufijo}`, tipo: 'monto', valor: 3000 }, { admin: true });
ok(r.status === 201 && r.data.cupon.resumen.startsWith('$3.000 de descuento'), 'código de monto fijo', r.data);
r = await api('POST', '/api/admin/cupones', { codigo: `VIEJO${sufijo}`, tipo: 'monto', valor: 1000, hasta: '2020-01-31' }, { admin: true });
ok(r.data.cupon?.estado === 'vencido', 'código con fecha pasada queda "vencido"');
r = await api('POST', '/api/cupones/validar', { codigo: 'NOEXISTE99', subtotal: 10000 });
ok(r.status === 404, 'código inexistente → 404');
r = await api('POST', '/api/cupones/validar', { codigo: COD.toLowerCase(), subtotal: 3000 });
ok(r.status === 409 && /Te faltan \$2\.000/.test(r.data.error), 'bajo la compra mínima → dice cuánto falta', r.data);
r = await api('POST', '/api/cupones/validar', { codigo: ` ${COD.toLowerCase()} `, subtotal: 10000 });
ok(r.status === 200 && r.data.cupon.descuento === 1000, '10% de $10.000 = $1.000', r.data);
r = await api('POST', '/api/cupones/validar', { codigo: `VIEJO${sufijo}`, subtotal: 10000 });
ok(r.status === 409 && /venció/.test(r.data.error), 'código vencido → 409');
r = await api('POST', '/api/cupones/validar', { codigo: `MIL${sufijo}`, subtotal: 2000 });
ok(r.data.cupon?.descuento === 2000, 'el descuento nunca supera el subtotal');

const cant = Math.max(1, Math.ceil(5000 / empanada.precio));
const subtotalCupon = empanada.precio * cant;
const descEsperado = Math.round(subtotalCupon * 0.1);
const itemsCupon = [{ productoId: empanada.id, cantidad: cant }];
const clienteA = { nombre: 'Carla Soto', telefono: '+56 9 8765 4321', email: 'Carla.Soto@Ejemplo.cl' };
r = await api('POST', '/api/pedidos', { ...base, cliente: { ...clienteA, email: 'carla@ejemplo' }, cupon: COD, items: itemsCupon });
ok(r.status === 400 && /correo/.test(r.data.error), 'correo inválido → 400', r.data);
r = await api('POST', '/api/pedidos', { ...base, cliente: clienteA, cupon: COD.toLowerCase(), promos: true, items: itemsCupon });
ok(r.status === 201, 'pedido con código, correo y promociones → 201', r.data);
const pc1 = r.data;
r = await api('GET', `/api/pedidos/${pc1.token}`);
ok(r.data.pedido.cupon === COD && r.data.pedido.descuento === descEsperado && r.data.pedido.total === subtotalCupon - descEsperado, `descuento calculado por el servidor (−$${descEsperado})`, r.data.pedido);
ok(r.data.pedido.cliente.email === 'carla.soto@ejemplo.cl', 'guarda el correo en minúsculas');
correos = await esperarCorreos(2);
const recibido = correos.find((c) => c.para[0] === 'carla.soto@ejemplo.cl');
const textoRecibido = recibido ? contenido(recibido.datos) : '';
ok(/Recibimos tu pedido #\d+/.test(textoRecibido), 'correo "Recibimos tu pedido" al cliente');
ok(textoRecibido.includes(COD) && textoRecibido.includes('/#/pedido/'), 'el correo trae el descuento y el enlace de seguimiento');
r = await api('POST', '/api/pedidos', { ...base, cliente: { ...clienteA, email: '', telefono: '987654321' }, cupon: COD, items: itemsCupon });
ok(r.status === 409 && /Ya usaste/.test(r.data.error), 'mismo cliente (teléfono escrito distinto) → 409 "Ya usaste"', r.data);
r = await api('POST', '/api/pedidos', { ...base, cliente: { nombre: 'Pedro', telefono: '+56 9 1111 2222' }, cupon: COD, items: itemsCupon });
ok(r.status === 201, 'otro cliente usa el código');
const pc2 = r.data;
r = await api('POST', '/api/pedidos', { ...base, cliente: { nombre: 'Luisa', telefono: '+56 9 3333 4444' }, cupon: COD, items: itemsCupon });
ok(r.status === 409 && /agot/.test(r.data.error), 'máximo de usos alcanzado → 409', r.data);
r = await api('PATCH', `/api/admin/pedidos/${pc2.id}`, { estado: 'cancelado', motivo: 'Prueba' }, { admin: true });
r = await api('GET', '/api/admin/cupones', undefined, { admin: true });
let c2 = r.data.cupones.find((c) => c.codigo === COD);
ok(c2?.usos === 1 && c2.pedidos === 1 && c2.descontado === descEsperado, 'cancelar libera el uso; el panel cuenta pedidos y monto descontado', c2);
r = await api('DELETE', `/api/admin/pedidos/${pc2.id}`, undefined, { admin: true });
r = await api('POST', `/api/admin/pedidos/${pc2.id}/restaurar`, {}, { admin: true });
c2 = (await api('GET', '/api/admin/cupones', undefined, { admin: true })).data.cupones.find((c) => c.codigo === COD);
ok(c2?.usos === 1, 'eliminar/restaurar un pedido cancelado no cuenta usos de más');
r = await api('PUT', `/api/admin/cupones/${cup.id}`, { ...cup, activo: false }, { admin: true });
ok(r.status === 200 && r.data.cupon.estado === 'pausado', 'código pausado');
r = await api('POST', '/api/cupones/validar', { codigo: COD, subtotal: 10000 });
ok(r.status === 404, 'código pausado ya no sirve');
r = await api('PATCH', `/api/admin/pedidos/${pc1.id}`, { estado: 'listo' }, { admin: true });
correos = await esperarCorreos(3);
ok(correos.some((c) => c.para[0] === 'carla.soto@ejemplo.cl' && /está listo/.test(contenido(c.datos))), 'correo "Tu pedido está listo"');
r = await api('GET', `/api/admin/pedidos?q=${COD}`, undefined, { admin: true });
ok(r.data.pedidos.some((p) => p.id === pc1.id), 'historial: búsqueda por código de descuento');

seccion('Promociones');
const subPromo = { endpoint: `https://fcm.googleapis.com/fcm/send/promo-${sufijo}`, keys: { p256dh, auth } };
r = await api('POST', '/api/promos/suscripcion', subPromo);
ok(r.status === 201 && r.data.suscrito, 'cliente activa notificaciones de promociones');
r = await api('POST', '/api/promos/suscripcion/estado', { endpoint: subPromo.endpoint });
ok(r.data.suscrito === true, 'el menú sabe que está suscrito');
r = await api('GET', '/api/admin/promos', undefined, { admin: true });
ok(r.status === 200 && r.data.audiencia.correo >= 1 && r.data.audiencia.push >= 1 && r.data.correo.configurado, `audiencia: ${r.data.audiencia.correo} por correo, ${r.data.audiencia.push} por notificación`, r.data.audiencia);
const audienciaCorreo = r.data.audiencia.correo;
r = await api('POST', '/api/admin/promos', { titulo: 'Sin canal', mensaje: 'x' }, { admin: true });
ok(r.status === 400, 'promo sin canal → 400');
r = await api('POST', '/api/admin/promos', { titulo: 'Con código malo', mensaje: 'x', cupon: 'NOEXISTE99', push: true }, { admin: true });
ok(r.status === 400, 'promo con código inexistente → 400');
r = await api('POST', '/api/admin/promos', { titulo: 'Martes de empanadas', mensaje: 'Hoy la docena sale más barata.\n\nSolo por hoy.', cupon: `mil${sufijo}`, push: true, correo: true }, { admin: true });
ok(r.status === 201 && r.data.promo.pendiente, 'promo creada', r.data);
const promo = r.data.promo;
let res;
let vueltas = 0;
do {
  res = await api('POST', `/api/admin/promos/${promo.id}/enviar`, { canal: 'push' }, { admin: true });
  vueltas++;
} while (res.status === 200 && !res.data.listo && vueltas < 50);
ok(res.status === 200 && res.data.listo && res.data.promo.pushHechos >= 1, `notificaciones enviadas en ${vueltas} tanda(s)`, res.data);
vueltas = 0;
do {
  res = await api('POST', `/api/admin/promos/${promo.id}/enviar`, { canal: 'correo' }, { admin: true });
  vueltas++;
} while (res.status === 200 && !res.data.listo && vueltas < 50);
ok(res.status === 200 && res.data.listo && res.data.promo.emailOk === audienciaCorreo && res.data.promo.enviada, `correos enviados: ${res.data.promo?.emailOk}/${audienciaCorreo}`, res.data);
res = await api('POST', `/api/admin/promos/${promo.id}/enviar`, { canal: 'correo' }, { admin: true });
ok(res.data.listo === true, 'no se reenvía una promo terminada');
correos = await esperarCorreos(4);
const correoPromo = correos.find((c) => c.para[0] === 'carla.soto@ejemplo.cl' && /List-Unsubscribe:/.test(c.datos));
ok(Boolean(correoPromo) && /List-Unsubscribe-Post: List-Unsubscribe=One-Click/.test(correoPromo.datos), 'la promo trae "darse de baja" con un clic');
ok(contenido(correoPromo?.datos || '').includes(`MIL${sufijo}`), 'la promo muestra el código');
const tokenBaja = /baja\?t=([A-Za-z0-9_-]+)/.exec(correoPromo?.datos || '')?.[1] || '';
const rr = await fetch(`${BASE}/api/promos/baja?t=${tokenBaja}`, { redirect: 'manual' });
ok(rr.status === 302 && rr.headers.get('location') === `/#/baja/${tokenBaja}`, 'el enlace de baja abre la página de confirmación');
const rb = await fetch(`${BASE}/api/promos/baja?t=${tokenBaja}`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click' });
ok(rb.status === 200, 'baja con un clic desde Gmail (RFC 8058)');
r = await api('GET', '/api/admin/promos', undefined, { admin: true });
ok(r.data.audiencia.correo === audienciaCorreo - 1, 'deja de recibir promociones por correo');
r = await api('POST', '/api/promos/alta', { token: tokenBaja });
ok(r.status === 200 && r.data.acepta === true && /•/.test(r.data.email), 'puede volver a suscribirse (correo oculto)', r.data);
r = await api('POST', '/api/promos/baja', { token: 'token-falso-que-no-existe-123' });
ok(r.status === 404, 'token de baja falso → 404');
r = await api('POST', '/api/promos/suscripcion/borrar', { endpoint: subPromo.endpoint });
r = await api('POST', '/api/promos/suscripcion/estado', { endpoint: subPromo.endpoint });
ok(r.data.suscrito === false, 'cliente desactiva las notificaciones de promociones');
r = await api('GET', '/api/admin/estadisticas', undefined, { admin: true });
ok(r.data.descuentos30?.pedidos >= 1 && r.data.descuentos30.monto >= descEsperado, 'estadísticas: descuentos de los últimos 30 días', r.data.descuentos30);
r = await api('DELETE', '/api/admin/correo', undefined, { admin: true });
ok(r.data.configurado === false, 'se puede desconectar el Gmail');

seccion('Local cerrado / pausado');
r = await api('PUT', '/api/admin/ajustes', { ...ajustesOriginales, recibiendoPedidos: false, horario: ajustesOriginales.horario.map(() => ({ abierto: true, desde: '00:00', hasta: '00:00' })) }, { admin: true });
r = await api('POST', '/api/pedidos', { ...base, items: [{ productoId: empanada.id, cantidad: 1 }] });
ok(r.status === 409, 'pedidos pausados → 409', r.data);
r = await api('GET', '/api/menu');
ok(r.data.estado.abierto === false && r.data.estado.pausado === true, 'el menú muestra que está pausado');

seccion('Estadísticas');
r = await api('GET', '/api/admin/estadisticas', undefined, { admin: true });
ok(r.status === 200 && r.data.serie.length === 30 && r.data.horas.length === 24, 'series de 30 días y 24 horas');
ok(r.data.hoy.pedidos >= 2 && r.data.topSemana.length > 0, `hoy: ${r.data.hoy.pedidos} pedidos, $${r.data.hoy.ventas}`, r.data.hoy);
ok(r.data.cancelados30 >= 1, 'cuenta cancelados');

seccion('Cambio de contraseña');
const cookieVieja = cookie;
r = await api('POST', '/api/admin/password', { actual: 'mala', nueva: 'otra-clave-123' }, { admin: true });
ok(r.status === 400, 'contraseña actual incorrecta → 400');
r = await api('POST', '/api/admin/password', { actual: vars.ADMIN_PASSWORD, nueva: 'otra-clave-123' }, { admin: true });
ok(r.status === 200 && cookie !== cookieVieja, 'contraseña cambiada (nueva sesión)');
let r2 = await fetch(BASE + '/api/admin/sesion', { headers: { cookie: cookieVieja } });
ok(r2.status === 401, 'las sesiones anteriores quedan cerradas');
r = await api('GET', '/api/admin/sesion', undefined, { admin: true });
ok(r.status === 200, 'la sesión nueva funciona');
r = await api('POST', '/api/admin/password', { actual: 'otra-clave-123', nueva: vars.ADMIN_PASSWORD }, { admin: true });
ok(r.status === 200, 'contraseña restaurada');

seccion('Restaurar ajustes');
r = await api('PUT', '/api/admin/ajustes', ajustesOriginales, { admin: true });
ok(r.status === 200, 'ajustes originales restaurados');

seccion('404');
r2 = await fetch(BASE + '/no-existe');
ok(r2.status === 404, 'ruta desconocida → 404');
r2 = await fetch(BASE + '/api/no-existe');
ok(r2.status === 404, 'API desconocida → 404 JSON');

console.log(`\n${pruebas - fallos}/${pruebas} pruebas OK`);
if (fallos) process.exit(1);
