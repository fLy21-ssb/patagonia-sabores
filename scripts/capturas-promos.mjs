// Capturas de las funciones de promociones, códigos de descuento y correo (para el PDF).
// Uso: node scripts/capturas-promos.mjs [baseUrl]   (necesita capturas/demo-promos.sql cargado en la base local)
import puppeteer from 'puppeteer-core';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.argv[2] || 'http://127.0.0.1:8793';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = 'capturas';
mkdirSync(OUT, { recursive: true });
const pass = readFileSync('.dev.vars', 'utf8').match(/^ADMIN_PASSWORD=(.*)$/m)[1].trim();
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-first-run', '--disable-extensions', '--hide-scrollbars', '--force-color-profile=srgb'],
});

async function pagina({ ancho = 390, alto = 844, escala = 2, movil = true } = {}) {
  const p = await browser.newPage();
  await p.setViewport({ width: ancho, height: alto, deviceScaleFactor: escala, isMobile: movil, hasTouch: movil });
  await p.emulateMediaFeatures([
    { name: 'prefers-color-scheme', value: 'light' },
    { name: 'prefers-reduced-motion', value: 'reduce' },
  ]);
  return p;
}
async function listo(p, ms = 900) {
  await p.evaluate(() => document.fonts.ready);
  await esperar(ms);
}
const centrar = (p, selector, bloque = 'center') =>
  p.evaluate((s, b) => document.querySelector(s)?.scrollIntoView({ block: b }), selector, bloque);

/** Tarjeta "Correo para avisos" con los pasos para conectar Gmail (recortada, sin el resto de la página). */
async function capturaCorreo() {
  const p = await pagina({ ancho: 1440, alto: 900, escala: 1.5, movil: false });
  await p.goto(`${BASE}/admin/`, { waitUntil: 'networkidle0' });
  await p.evaluate(async (password) => {
    await fetch('/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-ps-client': '1' }, body: JSON.stringify({ password }) });
    await fetch('/api/admin/correo', { method: 'DELETE', headers: { 'x-ps-client': '1' } });
  }, pass);
  await p.goto(`${BASE}/admin/#/ajustes`, { waitUntil: 'networkidle0' });
  await p.reload({ waitUntil: 'networkidle0' });
  await listo(p, 1200);
  await p.evaluate(() => [...document.querySelectorAll('#correo button')].find((b) => /Conectar/.test(b.textContent))?.click());
  await esperar(600);
  await centrar(p, '#correo');
  await esperar(300);
  // Coordenadas del documento (incluye la sombra "recortada" de la tarjeta)
  const caja = await p.$eval('#correo', (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height };
  });
  await p.screenshot({ path: `${OUT}/18b-panel-correo-pasos.png`, clip: { x: caja.x - 3, y: caja.y - 3, width: caja.width + 10, height: caja.height + 10 } });
  await p.close();
}
if (process.argv.includes('--solo-correo')) {
  await capturaCorreo();
  await browser.close();
  console.log('Captura del correo lista');
  process.exit(0);
}

// ---------- Preparación: Gmail de ejemplo, un pedido con código y una promo por correo ----------
const login = await fetch(`${BASE}/api/admin/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-ps-client': '1' },
  body: JSON.stringify({ password: pass }),
});
const cookie = login.headers.get('set-cookie').split(';')[0];
const admin = (ruta, metodo = 'GET', cuerpo) =>
  fetch(`${BASE}${ruta}`, {
    method: metodo,
    headers: { 'content-type': 'application/json', 'x-ps-client': '1', cookie },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  }).then((r) => r.json());
await admin('/api/admin/correo', 'PUT', { usuario: 'patagoniasabores@gmail.com', password: 'clave-de-prueba-16', remitente: 'Patagonia Sabores' });
await fetch('http://127.0.0.1:2526/limpiar').catch(() => {});

// ---------- Cliente ----------
const menu = await (await fetch(`${BASE}/api/menu`)).json();
const bit = 1 << menu.estado.dow;
const hoy = menu.productos.filter((p) => p.dias & bit && !p.agotado && !p.conAcompanamiento);
const elegir = (n) => hoy.find((p) => p.nombre === n) || hoy[0];
const lineas = [
  [elegir('Empanada de pino'), 4],
  [elegir('Pastel de choclo'), 1],
  [elegir('Jugo natural'), 2],
].map(([p, cantidad]) => ({
  clave: `${p.id}||`,
  productoId: p.id,
  nombre: p.nombre,
  precio: p.precio,
  cantidad,
  acompanamientoId: null,
  acompanamiento: '',
  comentario: '',
}));

const pedidoCorreo = await (
  await fetch(`${BASE}/api/pedidos`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      tipo: 'retiro',
      // teléfono y correo distintos en cada corrida (BIENVENIDA es "una vez por cliente")
      cliente: { nombre: 'Valentina Soto', telefono: `+56 9 7${String(Date.now()).slice(-7)}`, email: `valentina.${Date.now()}@gmail.com` },
      metodoPago: 'transferencia',
      cupon: 'BIENVENIDA',
      items: lineas.map((l) => ({ productoId: l.productoId, cantidad: l.cantidad })),
    }),
  })
).json();
if (!pedidoCorreo.token) console.warn('No se creó el pedido de ejemplo', pedidoCorreo);
const { promo } = await admin('/api/admin/promos', 'POST', {
  titulo: 'Martes de empanadas',
  mensaje: 'Hoy la docena de empanadas de pino sale más barata. Pide online y retira sin hacer fila.',
  cupon: 'MARTES2000',
  correo: true,
});
for (let i = 0; promo && i < 20; i++) {
  const r = await admin(`/api/admin/promos/${promo.id}/enviar`, 'POST', { canal: 'correo' });
  if (r.listo || r.error) break;
}
if (promo) await admin(`/api/admin/promos/${promo.id}`, 'DELETE');
await esperar(1500);

const c = await pagina();
await c.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
await c.evaluate(() => localStorage.clear());
await c.reload({ waitUntil: 'networkidle0' });
await listo(c);
await centrar(c, '.tarjeta-promos');
await esperar(500);
await c.screenshot({ path: `${OUT}/20-menu-promos.png` });

// Llega desde una promo con código: /?cupon=BIENVENIDA
await c.evaluate((l) => {
  localStorage.setItem('ps-carrito-v1', JSON.stringify(l));
  localStorage.setItem('ps-datos-v1', JSON.stringify({ nombre: 'Camila Rojas', telefono: '+56 9 8888 4321', email: '', direccion: '', recordar: true }));
}, lineas);
await c.goto(`${BASE}/?cupon=BIENVENIDA#/pedir`, { waitUntil: 'networkidle0' });
await listo(c, 1500);
await c.type('#correo-cliente', 'camila.rojas@gmial.com');
await esperar(400);
await centrar(c, '#correo-cliente');
await esperar(400);
await c.screenshot({ path: `${OUT}/21-checkout-correo.png` });
await esperar(6500); // que se vaya el aviso del código guardado
await c.evaluate(() => document.querySelector('.sugerencia-correo')?.click());
await esperar(300);
await c.evaluate(() => document.querySelector('.avisos-checkout .aviso-push:last-child input')?.click());
await esperar(300);
await centrar(c, '.cupon-campo');
await esperar(500);
await c.screenshot({ path: `${OUT}/22-checkout-cupon.png` });
await c.evaluate(() => document.querySelector('.avisos-checkout')?.scrollIntoView({ block: 'end' }));
await esperar(400);
await c.screenshot({ path: `${OUT}/23-checkout-promos.png` });

await c.goto(`${BASE}/#/baja/demo-token-baja-0001-xxxxxx`, { waitUntil: 'networkidle0' });
await listo(c);
await c.screenshot({ path: `${OUT}/24-baja.png` });
await c.close();

// ---------- Correos (los guardó scripts/smtp-falso.mjs) ----------
const correos = readdirSync(`${OUT}/correos`).filter((f) => f.endsWith('.eml')).sort();
const html = (archivo) => {
  const eml = readFileSync(`${OUT}/correos/${archivo}`, 'utf8');
  const partes = [...eml.matchAll(/Content-Type: text\/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n([\s\S]*?)\r\n--/g)];
  return partes.length ? Buffer.from(partes[0][1].replace(/\r\n/g, ''), 'base64').toString('utf8') : null;
};
const buscar = (re) => [...correos].reverse().find((f) => re.test(readFileSync(`${OUT}/correos/${f}`, 'utf8')));
for (const [re, nombre] of [
  [/List-Unsubscribe:/, '26-correo-promo'],
  [/Subject: =\?UTF-8\?B\?UmVjaWJpbW9z/, '25-correo-pedido'], // "Recibimos..."
]) {
  const archivo = buscar(re);
  if (!archivo) continue;
  const tmp = resolve(`${OUT}/correos/${nombre}.html`);
  writeFileSync(tmp, html(archivo));
  const p = await pagina({ ancho: 600, alto: 900, escala: 2, movil: false });
  await p.goto(`file:///${tmp.replace(/\\/g, '/')}`, { waitUntil: 'networkidle0' });
  await esperar(500);
  await p.screenshot({ path: `${OUT}/${nombre}.png`, fullPage: true });
  await p.close();
}

// ---------- Panel ----------
const a = await pagina({ ancho: 1440, alto: 900, escala: 1.5, movil: false });
await a.goto(`${BASE}/admin/`, { waitUntil: 'networkidle0' });
await a.evaluate(async (password) => {
  await fetch('/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-ps-client': '1' }, body: JSON.stringify({ password }) });
}, pass);
await a.reload({ waitUntil: 'networkidle0' });
// Gmail de ejemplo (en local responde scripts/smtp-falso.mjs)
await a.evaluate(async () => {
  await fetch('/api/admin/correo', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', 'x-ps-client': '1' },
    body: JSON.stringify({ usuario: 'patagoniasabores@gmail.com', password: 'clave-de-prueba-16', remitente: 'Patagonia Sabores' }),
  });
});
await a.goto(`${BASE}/admin/#/promos`, { waitUntil: 'networkidle0' });
await listo(a, 1200);
await a.type('.promo-grid input.input', 'Martes de empanadas');
await a.type('.promo-grid textarea', 'Hoy la docena de empanadas de pino sale más barata. Pide online y retira sin hacer fila.');
await a.select('.promo-grid select', 'MARTES2000');
await esperar(500);
await a.screenshot({ path: `${OUT}/16-panel-promos.png` });
await a.goto(`${BASE}/admin/#/promos/codigos`, { waitUntil: 'networkidle0' });
await listo(a, 1200);
await a.screenshot({ path: `${OUT}/17-panel-codigos.png` });
await a.evaluate(() => [...document.querySelectorAll('.tc-acciones .icon-btn')].find((b) => b.getAttribute('aria-label')?.startsWith('Editar'))?.click());
await esperar(700);
await a.screenshot({ path: `${OUT}/17b-panel-codigo-form.png` });
await a.keyboard.press('Escape');
await a.goto(`${BASE}/admin/#/ajustes`, { waitUntil: 'networkidle0' });
await listo(a, 1200);
await centrar(a, '#correo', 'start');
await esperar(400);
await a.screenshot({ path: `${OUT}/18-panel-correo.png` });

const am = await pagina();
await am.setCookie(...(await a.cookies()));
await am.goto(`${BASE}/admin/#/promos/codigos`, { waitUntil: 'networkidle0' });
await listo(am, 1200);
await am.screenshot({ path: `${OUT}/19-panel-codigos-movil.png` });
await am.close();
await a.close();
await capturaCorreo();
await browser.close();
console.log('Capturas de promociones listas en', OUT);
