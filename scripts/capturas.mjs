// Capturas de pantalla para el PDF de resumen (usa el Chrome instalado, en modo invisible).
// Uso: node scripts/capturas.mjs [baseUrl]   (por defecto el servidor local de pruebas)
import puppeteer from 'puppeteer-core';
import { readFileSync, mkdirSync } from 'node:fs';

const BASE = process.argv[2] || 'http://127.0.0.1:8791';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = 'capturas';
mkdirSync(OUT, { recursive: true });
const pass = readFileSync('.dev.vars', 'utf8').match(/^ADMIN_PASSWORD=(.*)$/m)[1].trim();

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-first-run', '--disable-extensions', '--hide-scrollbars', '--force-color-profile=srgb'],
});
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function pagina({ ancho = 390, alto = 844, escala = 2, movil = true } = {}) {
  const p = await browser.newPage();
  await p.setViewport({ width: ancho, height: alto, deviceScaleFactor: escala, isMobile: movil, hasTouch: movil });
  await p.emulateMediaFeatures([
    { name: 'prefers-color-scheme', value: 'light' },
    { name: 'prefers-reduced-motion', value: 'reduce' },
  ]);
  return p;
}
async function listo(p) {
  await p.evaluate(() => document.fonts.ready);
  await esperar(900);
}

// ---------- Cliente ----------
const c = await pagina();
await c.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
await listo(c);
await c.screenshot({ path: `${OUT}/01-portada.png` });

await c.evaluate(() => document.querySelector('#cat-1')?.scrollIntoView({ block: 'start' }));
await esperar(600);
await c.screenshot({ path: `${OUT}/02-carta.png` });

// Agregar productos y abrir una ficha con acompañamiento
await c.evaluate(() => {
  const b = [...document.querySelectorAll('button.btn-mas')];
  b[0]?.click();
  b[2]?.click();
});
await esperar(500);
await c.evaluate(() => [...document.querySelectorAll('.sticker-prod .card-hit')].find((x) => x.getAttribute('aria-label')?.includes('Pollo asado'))?.click());
await esperar(700);
await c.evaluate(() => [...document.querySelectorAll('.option')][1]?.click());
await esperar(400);
await c.screenshot({ path: `${OUT}/03-producto.png` });
await c.keyboard.press('Escape');
await esperar(500);
await c.evaluate(() => document.querySelector('.cart-fab')?.click());
await esperar(800);
await c.screenshot({ path: `${OUT}/04-carro.png` });

await c.goto(`${BASE}/#/pedir`, { waitUntil: 'networkidle0' });
await listo(c);
await c.screenshot({ path: `${OUT}/05-checkout.png` });

// Seguimiento: crea un pedido local de ejemplo y lo muestra "cocinando" y luego "listo"
const login = await fetch(`${BASE}/api/admin/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-ps-client': '1' },
  body: JSON.stringify({ password: pass }),
});
const cookie = login.headers.get('set-cookie').split(';')[0];
const menu = await (await fetch(`${BASE}/api/menu`)).json();
const prod = (n) => menu.productos.find((p) => p.nombre === n);
const nuevo = await (
  await fetch(`${BASE}/api/pedidos`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      tipo: 'delivery',
      direccion: 'Los Coihues 1240, Coyhaique',
      cliente: { nombre: 'Valentina Soto', telefono: '+56 9 7777 1234' },
      metodoPago: 'transferencia',
      items: [
        { productoId: prod('Lomo a lo pobre').id, cantidad: 1, comentario: 'Huevos bien cocidos' },
        { productoId: prod('Empanada de pino').id, cantidad: 2 },
      ],
    }),
  })
).json();
const cambiar = (estado) =>
  fetch(`${BASE}/api/admin/pedidos/${nuevo.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', 'x-ps-client': '1', cookie },
    body: JSON.stringify({ estado }),
  });
await cambiar('preparando');
await c.goto(`${BASE}/#/pedido/${nuevo.token}`, { waitUntil: 'networkidle0' });
await listo(c);
await c.screenshot({ path: `${OUT}/06-seguimiento.png` });
await cambiar('listo');
await c.reload({ waitUntil: 'networkidle0' });
await listo(c);
await c.screenshot({ path: `${OUT}/07-seguimiento-listo.png` });
await c.close();

// ---------- Panel (sesión con la contraseña local de pruebas) ----------
const a = await pagina({ ancho: 1440, alto: 900, escala: 1.5, movil: false });
await a.goto(`${BASE}/admin/`, { waitUntil: 'networkidle0' });
await a.evaluate(async (password) => {
  await fetch('/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-ps-client': '1' }, body: JSON.stringify({ password }) });
}, pass);
await a.reload({ waitUntil: 'networkidle0' }); // el panel revisa la sesión al cargar
for (const [ruta, archivo] of [
  ['pedidos', '10-panel-pedidos'],
  ['carta', '11-panel-carta'],
  ['estadisticas', '12-panel-estadisticas'],
  ['mesas', '13-panel-mesas'],
  ['ajustes', '14-panel-ajustes'],
]) {
  await a.goto(`${BASE}/admin/#/${ruta}`, { waitUntil: 'networkidle0' });
  await listo(a);
  await esperar(800);
  await a.screenshot({ path: `${OUT}/${archivo}.png` });
}
// Panel en el celular
const am = await pagina();
const cookies = await a.cookies();
await am.setCookie(...cookies);
await am.goto(`${BASE}/admin/#/pedidos`, { waitUntil: 'networkidle0' });
await listo(am);
await am.screenshot({ path: `${OUT}/15-panel-movil.png` });
await a.close();
await am.close();

await browser.close();
console.log('Capturas listas en', OUT);
