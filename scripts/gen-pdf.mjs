// Genera el PDF de presentación del sistema para el cliente (diseño de la marca y capturas reales).
// Sin datos internos: ni cuentas, ni credenciales, ni detalles técnicos de la plataforma.
// Uso: node scripts/gen-pdf.mjs
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';
import qrcode from 'qrcode-generator';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const URL_APP = 'https://patagonia.benjaminsotomayor.workers.dev';
const URL_CORTA = URL_APP.replace('https://', '');
const SALIDA = resolve('..', 'Resumen Patagonia Sabores.pdf');
const raiz = resolve('.');
const f = (p) => pathToFileURL(resolve(raiz, p)).href;

// 1) Capturas livianas para el PDF
mkdirSync('capturas/pdf', { recursive: true });
const capturas = {
  portada: ['01-portada.png', 760],
  carta: ['02-carta.png', 760],
  producto: ['03-producto.png', 760],
  carro: ['04-carro.png', 760],
  checkout: ['05-checkout.png', 760],
  seguimiento: ['06-seguimiento.png', 760],
  listo: ['07-seguimiento-listo.png', 760],
  pedidos: ['10-panel-pedidos.png', 1800],
  cartaAdmin: ['11-panel-carta.png', 1400],
  stats: ['12-panel-estadisticas.png', 1800],
  movil: ['15-panel-movil.png', 760],
  promosAdmin: ['16-panel-promos.png', 1400],
  codigos: ['17-panel-codigos.png', 1400],
  correoPasos: ['18b-panel-correo-pasos.png', 1400],
  checkoutCupon: ['22-checkout-cupon.png', 760],
  correoPedido: ['25-correo-pedido.png', 900],
};
const img = {};
for (const [k, [archivo, ancho]] of Object.entries(capturas)) {
  const out = `capturas/pdf/${k}.jpg`;
  await sharp(`capturas/${archivo}`).resize({ width: ancho, withoutEnlargement: true }).jpeg({ quality: 84, mozjpeg: true }).toFile(out);
  img[k] = f(out);
}

// 2) QR del menú
const qr = qrcode(0, 'M');
qr.addData(`${URL_APP}/`);
qr.make();
const qrSvg = qr.createSvgTag({ cellSize: 4, margin: 1, scalable: true });

const cordillera = (color = '#fff1e2', cresta = '#ffc21a') => `
<svg class="cord" viewBox="0 0 1440 120" preserveAspectRatio="none" aria-hidden="true">
  <path d="M0 70 L110 38 L170 58 L290 18 L370 52 L470 28 L560 64 L660 34 L720 50 L820 12 L930 58 L1010 34 L1100 66 L1200 28 L1290 56 L1360 40 L1440 60 L1440 120 L0 120 Z" fill="${color}"/>
  <path d="M0 70 L110 38 L170 58 L290 18 L370 52 L470 28 L560 64 L660 34 L720 50 L820 12 L930 58 L1010 34 L1100 66 L1200 28 L1290 56 L1360 40 L1440 60" fill="none" stroke="${cresta}" stroke-width="7" stroke-linejoin="round"/>
</svg>`;

const rombo = (contenido, color = 'sol') => `<span class="rombo ${color}"><span>${contenido}</span></span>`;
const encabezado = (etiqueta, titulo) => `
  <header class="banda">
    <div class="banda-cielo"><span class="sol-mini"></span><span class="rc a"></span><span class="rc b"></span></div>
    <div class="banda-texto"><span class="etq">${etiqueta}</span><h1>${titulo}</h1></div>
    ${cordillera()}
  </header>`;
const pie = (n) => `<footer class="pie"><span>Patagonia Sabores · Sistema de pedidos online</span><span class="pag">${n}</span></footer>`;
const telefono = (src, titulo) => `<figure class="tel"><div class="tel-marco"><img src="${src}" alt=""></div><figcaption>${titulo}</figcaption></figure>`;
const navegador = (src, titulo, clase = '') => `<figure class="nav ${clase}"><div class="nav-barra"><i></i><i></i><i></i><span>${URL_CORTA}/admin</span></div><img src="${src}" alt=""><figcaption>${titulo}</figcaption></figure>`;
const item = (n, titulo, texto, color = 'sol') => `<div class="item">${rombo(n, color)}<div><h3>${titulo}</h3><p>${texto}</p></div></div>`;
const parada = (n, quien, titulo, texto, color) =>
  `<li>${rombo(n, color)}<div class="tarjeta"><h3>${titulo} <span class="quien ${quien}">${quien === 'cliente' ? 'Tu cliente' : 'Tu local'}</span></h3><p>${texto}</p></div></li>`;

const html = `<!doctype html>
<html lang="es-CL"><head><meta charset="utf-8"><title>Patagonia Sabores · Sistema de pedidos online</title>
<style>
@font-face { font-family: 'Alfa'; src: url('${f('node_modules/@fontsource/alfa-slab-one/files/alfa-slab-one-latin-400-normal.woff2')}') format('woff2'); }
@font-face { font-family: 'Nunito'; font-weight: 200 1000; src: url('${f('node_modules/@fontsource-variable/nunito/files/nunito-latin-wght-normal.woff2')}') format('woff2'); }
@font-face { font-family: 'Josefin'; font-weight: 100 700; src: url('${f('node_modules/@fontsource-variable/josefin-sans/files/josefin-sans-latin-wght-normal.woff2')}') format('woff2'); }
@page { size: A4; margin: 0; }
:root { --ink:#210b22; --ink2:#5e3f5c; --ink3:#8a6c86; --papel:#fff1e2; --card:#fffaf3; --sol:#ffc21a; --sol2:#ffe07a; --boina:#f28c28; --magenta:#d2426f; --ciruela:#8b3487; --ok:#3dbb6c;
  --cielo: linear-gradient(180deg,#3e1650 0%,#8b3487 30%,#d2426f 56%,#f27448 77%,#ffb43a 91%,#ffd25a 100%); }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: 'Nunito', sans-serif; color: var(--ink); background: var(--papel); -webkit-print-color-adjust: exact; print-color-adjust: exact; font-size: 10.4pt; line-height: 1.45; }
h1, h2, h3 { font-family: 'Alfa', Georgia, serif; font-weight: 400; margin: 0; line-height: 1.12; }
p { margin: 0; }
.pagina { position: relative; width: 210mm; height: 297mm; overflow: hidden; page-break-after: always; background: var(--papel); }
.pagina:last-child { page-break-after: auto; }
.contenido { padding: 6mm 14mm 0; }
.etq { font-family: 'Josefin', sans-serif; font-weight: 700; letter-spacing: .26em; text-transform: uppercase; font-size: 7.6pt; }
.cord { position: absolute; left: 0; right: 0; bottom: -1px; width: 100%; height: 16mm; }

/* Portada */
.portada-cielo { position: relative; height: 172mm; background: var(--cielo); overflow: hidden; }
.portada-cielo .sol { position: absolute; left: 50%; top: 72mm; width: 110mm; height: 110mm; transform: translateX(-50%); border-radius: 50%; background: radial-gradient(circle at 50% 45%, #ffe892, #ffd043 45%, #ffb21c 72%); box-shadow: 0 0 0 12mm rgba(255,205,70,.2), 0 0 0 26mm rgba(255,205,70,.09); }
.portada-cielo .logo { position: absolute; left: 50%; top: 30mm; width: 150mm; transform: translateX(-50%); filter: drop-shadow(0 4mm 6mm rgba(60,10,50,.35)); }
.rc { position: absolute; width: 14mm; height: 14mm; transform: rotate(45deg); border: .4mm solid rgba(255,255,255,.3); border-radius: 2mm; background: rgba(255,255,255,.1); }
.portada-cielo .rc.a { left: 14mm; top: 34mm; } .portada-cielo .rc.b { right: 18mm; top: 22mm; width: 10mm; height: 10mm; } .portada-cielo .rc.c { right: 26mm; top: 104mm; }
.portada-cielo .cord { height: 26mm; }
.portada-info { padding: 4mm 16mm 0; text-align: center; }
.portada-info .etq { color: var(--magenta); }
.portada-info h1 { font-size: 30pt; margin: 2mm 0 2mm; }
.portada-info .sub { font-size: 11.6pt; color: var(--ink2); font-weight: 700; text-wrap: balance; }
.sellos { display: flex; justify-content: center; gap: 4mm; margin: 7mm 0 6mm; }
.sello { border: .7mm solid var(--ink); border-radius: 99px; padding: 1.6mm 4.5mm; font-weight: 900; font-size: 9.4pt; box-shadow: .9mm .9mm 0 var(--ink); background: var(--card); }
.sello:nth-child(1) { background: var(--sol2); } .sello:nth-child(2) { background: #ffd9e3; } .sello:nth-child(3) { background: #dcf3e2; }
.enlace { display: flex; align-items: center; gap: 6mm; margin: 0 auto; width: 150mm; padding: 4mm 6mm; border: .8mm solid var(--ink); border-radius: 6mm; background: var(--card); box-shadow: 1.6mm 1.6mm 0 var(--ink); text-align: left; }
.enlace .qr { width: 30mm; flex: none; border: .5mm solid var(--ink); border-radius: 2mm; overflow: hidden; }
.enlace .qr svg { display: block; width: 100%; height: auto; }
.enlace .url { font-family: 'Alfa', serif; font-size: 10.5pt; word-break: break-all; }
.enlace small { display: block; color: var(--ink2); font-weight: 700; margin-top: 1mm; }
.fecha { margin-top: 6mm; color: var(--ink3); font-family: 'Josefin'; font-weight: 700; letter-spacing: .2em; text-transform: uppercase; font-size: 7.5pt; }

/* Banda de título */
.banda { position: relative; height: 40mm; background: var(--cielo); color: #fff; overflow: hidden; }
.banda-cielo .sol-mini { position: absolute; right: 22mm; top: 12mm; width: 34mm; height: 34mm; border-radius: 50%; background: radial-gradient(circle, #ffe892, #ffc21a 70%); box-shadow: 0 0 0 5mm rgba(255,205,70,.2); }
.banda-cielo .rc.a { right: 70mm; top: 6mm; width: 8mm; height: 8mm; } .banda-cielo .rc.b { left: 120mm; top: 18mm; width: 6mm; height: 6mm; }
.banda-texto { position: relative; padding: 9mm 14mm 0; z-index: 1; }
.banda-texto .etq { color: #ffe9b0; }
.banda-texto h1 { font-size: 21pt; margin-top: 1.5mm; text-shadow: 0 .6mm 2mm rgba(60,10,50,.3); }
.banda .cord { height: 12mm; }

/* Elementos */
.rombo { position: relative; display: inline-grid; place-items: center; width: 10mm; height: 10mm; flex: none; }
.rombo::before { content: ''; position: absolute; inset: 1.5mm; transform: rotate(45deg); border: .6mm solid var(--ink); border-radius: 1.6mm; background: var(--sol); box-shadow: .6mm .6mm 0 var(--ink); }
.rombo.magenta::before { background: var(--magenta); } .rombo.magenta span { color: #fff; }
.rombo.boina::before { background: var(--boina); } .rombo.verde::before { background: var(--ok); } .rombo.ciruela::before { background: var(--ciruela); } .rombo.ciruela span { color: #fff; }
.rombo span { position: relative; font-family: 'Alfa'; font-size: 8.5pt; }
.items { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm 6mm; }
.item { display: flex; gap: 3mm; align-items: flex-start; padding: 3mm 3.4mm; border: .55mm solid var(--ink); border-radius: 4mm; background: var(--card); box-shadow: .9mm .9mm 0 var(--ink); }
.item h3 { font-size: 10.6pt; margin-bottom: .8mm; }
.item p { font-size: 9pt; color: var(--ink2); line-height: 1.38; }
.dos { display: grid; grid-template-columns: 1fr 45mm; gap: 7mm; align-items: start; }
.subt { font-size: 14pt; margin: 5mm 0 3mm; display: flex; align-items: center; gap: 2mm; }
.nota { margin-top: 4mm; padding: 3mm 4mm; border: .55mm solid var(--ink); border-radius: 4mm; background: var(--sol2); font-weight: 700; font-size: 9.2pt; box-shadow: .9mm .9mm 0 var(--ink); }
.nota.rosa { background: #ffd9e3; } .nota.verde { background: #dcf3e2; } .nota.azul { background: #dfe9fb; }

/* Cómo funciona */
.sendero { list-style: none; margin: 1mm 0 0; padding: 0; position: relative; display: grid; gap: 3.4mm; }
.sendero::before { content: ''; position: absolute; left: 4.65mm; top: 8mm; bottom: 8mm; border-left: .8mm dashed var(--ink3); }
.sendero li { position: relative; display: grid; grid-template-columns: 10mm 1fr; gap: 4mm; align-items: center; }
.sendero .tarjeta { padding: 3mm 4mm; border: .55mm solid var(--ink); border-radius: 4mm; background: var(--card); box-shadow: .9mm .9mm 0 var(--ink); }
.sendero h3 { font-size: 11pt; margin-bottom: .8mm; display: flex; align-items: center; gap: 2.4mm; }
.sendero p { font-size: 9.2pt; color: var(--ink2); }
.quien { font-family: 'Josefin'; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; font-size: 6.3pt; padding: .5mm 2mm; border: .35mm solid var(--ink); border-radius: 99px; }
.quien.cliente { background: #ffd9e3; } .quien.local { background: var(--sol2); }
.ventajas { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 5mm; margin-top: 7mm; }
.ventaja { display: grid; justify-items: center; gap: 1.6mm; padding: 4.2mm 4mm; border: .6mm solid var(--ink); border-radius: 5mm; background: var(--card); box-shadow: 1.2mm 1.2mm 0 var(--ink); text-align: center; }
.ventaja:nth-child(1) { background: #dcf3e2; } .ventaja:nth-child(2) { background: #ffd9e3; } .ventaja:nth-child(3) { background: var(--sol2); }
.ventaja h3 { font-size: 11.5pt; }
.ventaja p { font-size: 8.8pt; color: var(--ink2); line-height: 1.38; }

/* Capturas */
.tel { margin: 0; text-align: center; }
.tel-marco { border: 1mm solid var(--ink); border-radius: 7mm; overflow: hidden; background: #000; box-shadow: 1.6mm 1.6mm 0 var(--ink); }
.tel-marco img { display: block; width: 100%; }
figcaption { margin-top: 2.6mm; font-family: 'Josefin'; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; font-size: 7pt; color: var(--ink2); }
.nav { margin: 0; }
.nav-barra { display: flex; align-items: center; gap: 1.6mm; padding: 1.8mm 3mm; border: .8mm solid var(--ink); border-bottom: 0; border-radius: 3.4mm 3.4mm 0 0; background: #2b0f30; }
.nav-barra i { width: 2.4mm; height: 2.4mm; border-radius: 50%; background: #f27448; } .nav-barra i:nth-child(2) { background: #ffc21a; } .nav-barra i:nth-child(3) { background: #3dbb6c; }
.nav-barra span { margin-left: 3mm; color: #e9d3e2; font-size: 7.4pt; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.nav img { display: block; width: 100%; border: .8mm solid var(--ink); border-radius: 0 0 3.4mm 3.4mm; box-shadow: 1.6mm 1.6mm 0 var(--ink); }
.nav.compacto img { height: 88mm; object-fit: cover; object-position: top left; }
.nav.medio img { height: 112mm; object-fit: cover; object-position: top left; }
.nav.mini img { height: 64mm; object-fit: cover; object-position: top left; }
.recorte { margin: 0; }
.recorte img { display: block; width: 100%; }
.correo-fig { margin: 0; }
.correo-fig img { display: block; width: 100%; height: 64mm; object-fit: cover; object-position: top center; border: .8mm solid var(--ink); border-radius: 0 0 3.4mm 3.4mm; box-shadow: 1.6mm 1.6mm 0 var(--ink); background: #fff1e2; }
.correo-barra { display: flex; align-items: center; gap: 2mm; padding: 1.6mm 3mm; border: .8mm solid var(--ink); border-bottom: 0; border-radius: 3.4mm 3.4mm 0 0; background: #fffaf3; font-size: 7.4pt; font-weight: 800; color: var(--ink2); }
.fila-tel { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6mm; margin-top: 4mm; }
.fila-2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7mm; margin-top: 5mm; }
.fila-2 > * { min-width: 0; }
.tres { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6mm; margin-top: 5mm; }
.tres > * { min-width: 0; }

/* Pasos */
.pasos { display: grid; gap: 3mm; }
.paso { display: grid; grid-template-columns: 11mm 1fr; gap: 3mm; align-items: start; padding: 3mm 4mm; border: .55mm solid var(--ink); border-radius: 4mm; background: var(--card); box-shadow: .9mm .9mm 0 var(--ink); }
.paso .n { width: 10mm; height: 10mm; border: .6mm solid var(--ink); border-radius: 50%; background: var(--magenta); color: #fff; display: grid; place-items: center; font-family: 'Alfa'; font-size: 11pt; }
.paso h3 { font-size: 11pt; margin-bottom: .6mm; }
.paso p { font-size: 9.2pt; color: var(--ink2); }
code { font-family: Consolas, monospace; font-size: 8.6pt; background: #fff; border: .35mm solid var(--ink3); border-radius: 1.2mm; padding: .2mm 1.2mm; color: var(--ink); }

.pie { position: absolute; left: 14mm; right: 14mm; bottom: 7mm; display: flex; justify-content: space-between; font-family: 'Josefin'; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; font-size: 6.6pt; color: var(--ink3); border-top: .3mm dashed #dcbba3; padding-top: 2mm; }
.pie .pag { color: var(--magenta); }
ul.limpia { list-style: none; margin: 0; padding: 0; display: grid; gap: 1.6mm; }
ul.limpia li { display: flex; gap: 2mm; align-items: baseline; font-size: 9.3pt; }
ul.limpia li::before { content: ''; flex: none; width: 2.2mm; height: 2.2mm; transform: rotate(45deg) translateY(-.4mm); border: .35mm solid var(--ink); background: var(--sol); border-radius: .4mm; }
.oveja-fin { position: absolute; right: 14mm; bottom: 21mm; width: 30mm; filter: drop-shadow(1mm 1.2mm 0 rgba(33,11,34,.25)); }
</style></head><body>

<!-- 1. PORTADA -->
<section class="pagina">
  <div class="portada-cielo">
    <span class="sol"></span><span class="rc a"></span><span class="rc b"></span><span class="rc c"></span>
    <img class="logo" src="${f('public/brand/logo.webp')}" alt="Patagonia Sabores">
    ${cordillera()}
  </div>
  <div class="portada-info">
    <span class="etq">Tu nuevo sistema de pedidos</span>
    <h1>Pedidos online, a tu manera</h1>
    <p class="sub">Un menú web que tus clientes usan como una app, para retiro y delivery, con avisos al celular y por correo, códigos de descuento y promociones. Y un panel para manejarlo todo desde el local.</p>
    <div class="sellos"><span class="sello">Se instala como app</span><span class="sello">Avisos al celular y por correo</span><span class="sello">Sin comisiones por pedido</span></div>
    <div class="enlace">
      <div class="qr">${qrSvg}</div>
      <div>
        <span class="etq" style="color:var(--magenta)">Menú para clientes</span>
        <div class="url">${URL_CORTA}</div>
        <small>Panel del local: el mismo link + <strong>/admin</strong></small>
        <small>Escanea el código con la cámara del celular para abrirlo.</small>
      </div>
    </div>
    <div class="fecha">Noviembre 2026</div>
  </div>
</section>

<!-- 2. CÓMO FUNCIONA -->
<section class="pagina">
  ${encabezado('Paso a paso', 'Cómo funciona un pedido')}
  <div class="contenido">
    <ol class="sendero">
      ${parada('1', 'cliente', 'Entra al menú', 'Desde el link, el QR del mostrador o la app instalada. Ve solo lo que hay hoy, con fotos y precios, y si el local está abierto.', 'sol')}
      ${parada('2', 'cliente', 'Arma su pedido', 'Elige acompañamientos, deja comentarios ("sin cebolla") y, si tiene, escribe su código de descuento.', 'boina')}
      ${parada('3', 'cliente', 'Confirma en segundos', 'Retiro o delivery, cómo paga y, si quiere, su correo para recibir avisos. No necesita crear una cuenta.', 'magenta')}
      ${parada('4', 'local', 'Te llega al instante', 'Suena la campanita en el panel y te llega una notificación al celular, aunque el panel esté cerrado. Puedes imprimir el ticket para la cocina.', 'ciruela')}
      ${parada('5', 'local', 'Lo avanzas con un toque', 'Aceptar, marcar listo y entregado. El stock se descuenta solo y lo que se acaba aparece como agotado.', 'verde')}
      ${parada('6', 'cliente', 'Recibe el aviso', 'Notificación y correo cuando su pedido está listo o va en camino. Mientras, lo sigue en vivo con la ovejita.', 'sol')}
    </ol>
    <div class="ventajas">
      <div class="ventaja">${rombo('$', 'verde')}<h3>Sin comisiones</h3><p>A diferencia de las apps de delivery, cada venta queda completa para el local.</p></div>
      <div class="ventaja">${rombo('+', 'magenta')}<h3>Sin descargar nada</h3><p>Funciona en cualquier celular desde el navegador, y se instala como app si el cliente quiere.</p></div>
      <div class="ventaja">${rombo('>', 'boina')}<h3>Siempre al día</h3><p>Cambias precios, stock, horario o avisos y tus clientes lo ven al instante.</p></div>
    </div>
    <div class="nota azul" style="margin-top:7mm">Sin llamadas ni mensajes cruzados por WhatsApp: cada pedido llega ordenado, con el total calculado, los comentarios de cada plato y los datos del cliente para contactarlo.</div>
  </div>
  ${pie(2)}
</section>

<!-- 3. CLIENTES -->
<section class="pagina">
  ${encabezado('Qué incluye · 1 de 3', 'Lo que ven tus clientes')}
  <div class="contenido">
    <div class="dos">
      <div class="items" style="grid-template-columns:1fr">
        ${item('01', 'Menú del día automático', 'Cada producto tiene sus días (ej. cazuela lunes, miércoles y viernes). La carta muestra solo lo de hoy, con la hora de Chile.')}
        ${item('02', 'Carta con identidad propia', 'Categorías con íconos de la marca, buscador, recomendados del día y fotos. Si un plato no tiene foto, aparece una postal del atardecer.', 'boina')}
        ${item('03', 'Pedido a la medida', 'Acompañamiento obligatorio cuando corresponde (arroz, papas, puré...) y comentario por producto: "sin cebolla", "bien cocido".', 'magenta')}
        ${item('04', 'Retiro o delivery', 'Delivery con costo y pedido mínimo a tu gusto. Y si algún día tienen mesas, el pedido desde la mesa con QR ya está listo para encenderse.', 'ciruela')}
        ${item('05', 'Pagos y descuentos', 'Efectivo, transferencia o tarjeta al recibir. El cliente escribe su código de descuento y el total se recalcula solo.', 'verde')}
        ${item('06', 'Seguimiento en vivo', 'La ovejita sube la montaña: Recibido, Cocinando, Listo o En camino, Entregado. Con hora estimada y cuántos pedidos van antes.')}
        ${item('07', 'Avisos al celular y por correo', 'Notificación cuando cocinan, cuando está listo o va en camino. Si deja su correo, recibe el resumen del pedido y el aviso de listo.', 'boina')}
        ${item('08', 'Se instala como app', 'Ícono propio en Android, iPhone y computador, carga al instante y el menú se ve aun sin internet. "Mis pedidos" y "Pedir lo mismo otra vez".', 'magenta')}
      </div>
      <div>${telefono(img.portada, 'Portada')}<div style="height:6mm"></div>${telefono(img.seguimiento, 'Seguimiento')}</div>
    </div>
  </div>
  ${pie(3)}
</section>

<!-- 4. PANEL -->
<section class="pagina">
  ${encabezado('Qué incluye · 2 de 3', 'Lo que maneja el local')}
  <div class="contenido">
    ${navegador(img.pedidos, 'Pedidos en vivo · Nuevos, Cocina, Listos y Terminados', 'compacto')}
    <div class="items" style="margin-top:6mm">
      ${item('01', 'Pedidos en vivo', 'Llegan solos con campanita, se avanzan con un toque y el cliente recibe el aviso. Recordatorio sonoro si un pedido espera.')}
      ${item('02', 'Avisos en tu teléfono', 'Notificación por cada pedido nuevo, aunque el panel esté cerrado. Se activa en cada celular o tablet del local.', 'magenta')}
      ${item('03', 'Tickets para cocina', 'Impresión de ticket de 58 u 80 mm con comentarios destacados. Opción de imprimir automáticamente cada pedido nuevo.', 'boina')}
      ${item('04', 'Carta y stock', 'Productos con foto (se optimiza sola), precio, stock que se descuenta solo y "Agotado" al llegar a cero. Menú semanal en cuadrícula.', 'verde')}
      ${item('05', 'Promos y códigos', 'Crea códigos de descuento y envía promociones por notificación y por correo a los clientes que las aceptaron.', 'ciruela')}
      ${item('06', 'Historial y Excel', 'Búsqueda por nombre, teléfono, número o código, filtros por fecha y estado, papelera para restaurar y exportación a Excel.')}
      ${item('07', 'Estadísticas', 'Ventas de hoy, la semana y el mes, ticket promedio, gráfico de 30 días, lo más y lo menos pedido, horas punta y descuentos.', 'magenta')}
      ${item('08', 'Ajustes al instante', 'Horario por día, pausar pedidos, delivery, medios de pago, correo para avisos, cartel con QR del menú y contraseña.', 'boina')}
    </div>
  </div>
  ${pie(4)}
</section>

<!-- 5. DESCUENTOS, PROMOS Y CORREOS -->
<section class="pagina">
  ${encabezado('Qué incluye · 3 de 3', 'Descuentos, promos y correos')}
  <div class="contenido">
    <div class="dos">
      <div class="items" style="grid-template-columns:1fr">
        ${item('01', 'Códigos de descuento', 'Porcentaje o monto fijo, compra mínima, máximo de usos, una vez por cliente y fechas de inicio y término. El descuento se calcula solo y nadie puede inventarlo.', 'magenta')}
        ${item('02', 'Promos por notificación', 'El cliente toca "Avísame" en el menú o acepta al pedir. Escribes la promo, eliges un código y la envías a todos con un toque. Al abrirla, el código queda listo en su carro.')}
        ${item('03', 'Correos de cada pedido', 'Si el cliente deja su correo le llega "Recibimos tu pedido" con el detalle, y luego "Tu pedido está listo" o "va en camino". Ideal para quien no instala la app.', 'boina')}
        ${item('04', 'Promos por correo, con permiso', 'Solo a quienes aceptaron. Cada correo trae su enlace para darse de baja, como exige la ley del consumidor. Salen desde el Gmail del local.', 'verde')}
      </div>
      <div>${telefono(img.checkoutCupon, 'Código aplicado')}</div>
    </div>
    <div class="tres">
      ${navegador(img.promosAdmin, 'Enviar una promoción', 'mini')}
      ${navegador(img.codigos, 'Códigos de descuento', 'mini')}
      <figure class="correo-fig"><div class="correo-barra">Bandeja de entrada</div><img src="${img.correoPedido}" alt=""><figcaption>Correo al cliente</figcaption></figure>
    </div>
  </div>
  ${pie(5)}
</section>

<!-- 6. CAPTURAS CLIENTE -->
<section class="pagina">
  ${encabezado('Así se ve', 'La app de tus clientes')}
  <div class="contenido">
    <div class="fila-tel">
      ${telefono(img.carta, 'Carta del día')}
      ${telefono(img.producto, 'Elegir acompañamiento')}
      ${telefono(img.checkout, 'Datos y correo')}
      ${telefono(img.listo, 'Pedido en camino')}
    </div>
    <div class="nota rosa" style="margin-top:7mm">Todo el diseño sale de tu logo: el atardecer (ciruela, magenta, naranjo boina y amarillo), la cordillera con borde amarillo, los rombos del cielo y la ovejita como personaje. Una identidad propia, que no se parece a ninguna otra app.</div>
    <div class="fila-tel" style="grid-template-columns: repeat(2, 41mm); gap: 14mm; justify-content: center; margin-top:6mm">
      ${telefono(img.carro, 'Tu pedido')}
      ${telefono(img.movil, 'El panel en el celular')}
    </div>
  </div>
  ${pie(6)}
</section>

<!-- 7. CAPTURAS PANEL -->
<section class="pagina">
  ${encabezado('Así se ve', 'El panel del local')}
  <div class="contenido">
    ${navegador(img.stats, 'Estadísticas', 'medio')}
    <div class="fila-2">
      ${navegador(img.cartaAdmin, 'Carta, precios y stock')}
      <figure class="recorte"><img src="${img.correoPasos}" alt=""><figcaption>Correo para avisos: se conecta en 3 pasos</figcaption></figure>
    </div>
  </div>
  ${pie(7)}
</section>

<!-- 8. PRIMEROS PASOS -->
<section class="pagina">
  ${encabezado('Para partir', 'Primeros pasos')}
  <div class="contenido">
    <div class="pasos">
      <div class="paso"><span class="n">1</span><div><h3>Entra al panel</h3><p>Abre <code>${URL_CORTA}/admin</code> con la contraseña que te entregamos y cámbiala por una tuya en Ajustes, sección Seguridad.</p></div></div>
      <div class="paso"><span class="n">2</span><div><h3>Completa los datos del local</h3><p>En Ajustes: horario real de atención, dirección, WhatsApp, Instagram, costo y mínimo del delivery, y los datos para transferencias.</p></div></div>
      <div class="paso"><span class="n">3</span><div><h3>Arma tu carta</h3><p>La carta trae platos de ejemplo. Edítalos o bórralos, sube fotos reales (desde el celular sirve) y marca qué días se vende cada plato.</p></div></div>
      <div class="paso"><span class="n">4</span><div><h3>Conecta el Gmail del local</h3><p>En Ajustes, "Correo para avisos": activa la verificación en 2 pasos de Google, crea una contraseña de aplicación (16 letras) y pégala. Desde ahí salen los correos de pedidos y las promociones.</p></div></div>
      <div class="paso"><span class="n">5</span><div><h3>Activa los avisos en tu celular</h3><p>Abre el panel en tu teléfono, toca "Activar" y acepta las notificaciones. Te llegará una de prueba. Repite en cada dispositivo del local.</p></div></div>
      <div class="paso"><span class="n">6</span><div><h3>Comparte el link y crea tu primer código</h3><p>Bio de Instagram, estado de WhatsApp, Google Maps y el cartel con QR (Ajustes, "Comparte tu menú"). Un código como BIENVENIDA anima a probar el pedido online.</p></div></div>
    </div>
    <h2 class="subt">${rombo('i', 'magenta')} Instalar la app (clientes y local)</h2>
    <div class="items">
      ${item('A', 'Android y computador', 'En Chrome aparece el botón "Instalar" (o en el menú de tres puntos). Queda con el ícono de la ovejita.', 'verde')}
      ${item('B', 'iPhone y iPad', 'En Safari: Compartir y luego "Agregar a inicio". Los avisos en iPhone necesitan iOS 16.4 o superior y abrir la app desde ese ícono.', 'ciruela')}
    </div>
  </div>
  ${pie(8)}
</section>

<!-- 9. SEGURO, RÁPIDO Y TUYO -->
<section class="pagina">
  ${encabezado('Para tu tranquilidad', 'Seguro, rápido y tuyo')}
  <div class="contenido">
    <div class="items">
      ${item('01', 'Tus clientes, tus datos', 'Pedidos, teléfonos y correos quedan en tu panel, no en una app de terceros. Los exportas a Excel cuando quieras.', 'magenta')}
      ${item('02', 'Rápido en cualquier celular', 'Android, iPhone o computador. Carga al instante y el menú se ve aun sin internet.')}
      ${item('03', 'Siempre encendido', 'Funciona en la nube, en la red de Cloudflare que usan millones de sitios. No depende de un computador del local.', 'boina')}
      ${item('04', 'Listo para crecer', 'Sin límite de productos ni categorías. Y cuando tengan mesas, el pedido con QR se enciende con un interruptor.', 'verde')}
    </div>
    <h2 class="subt">${rombo('+', 'verde')} Seguridad incluida</h2>
    <ul class="limpia">
      <li>Panel con contraseña, sesión cifrada y bloqueo tras varios intentos fallidos.</li>
      <li>Precios, stock y descuentos se calculan en el servidor: nadie puede alterar el total, y cada código respeta su límite de usos.</li>
      <li>No se guardan datos de tarjetas. Teléfonos, direcciones y correos solo los ve el panel.</li>
      <li>La clave del Gmail se guarda cifrada y nunca vuelve a mostrarse.</li>
    </ul>
    <h2 class="subt">${rombo('@', 'ciruela')} Tu link</h2>
    <p style="font-size:9.3pt; max-width:146mm">Tu menú está en <strong>${URL_CORTA}</strong> y el panel en el mismo link + <strong>/admin</strong>. Si prefieres un dominio propio, por ejemplo <strong>patagoniasabores.cl</strong> (aprox. $10.000 al año), se puede conectar sin cambiar nada más.</p>
    <h2 class="subt">${rombo('>', 'boina')} Mejoras que se pueden sumar</h2>
    <ul class="limpia" style="max-width:146mm">
      <li>Pago online con Mercado Pago, Flow o Webpay.</li>
      <li>Cuentas separadas para cocina, caja y repartidores.</li>
      <li>Programa de puntos para clientes frecuentes y promociones programadas por horario.</li>
    </ul>
  </div>
  <img class="oveja-fin" src="${f('public/brand/oveja.webp')}" alt="">
  ${pie(9)}
</section>
</body></html>`;

mkdirSync('docs', { recursive: true });
writeFileSync('docs/resumen.html', html);

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--allow-file-access-from-files'] });
const page = await browser.newPage();
await page.goto(f('docs/resumen.html'), { waitUntil: 'networkidle0' });
await page.evaluate(() => document.fonts.ready);
await page.pdf({ path: SALIDA, format: 'A4', printBackground: true, preferCSSPageSize: true });
// Vista previa de cada página para revisar el diseño
await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });
const paginas = await page.$$('.pagina');
for (let i = 0; i < paginas.length; i++) await paginas[i].screenshot({ path: `capturas/pdf/pagina-${i + 1}.png` });
await browser.close();
console.log('PDF listo:', SALIDA, `(${paginas.length} páginas)`);
