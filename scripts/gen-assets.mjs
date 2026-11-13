// Genera logo optimizado, íconos PWA (normal, maskable, apple), favicon, badge de notificación
// e imagen para compartir (Open Graph) a partir de assets-src/logo-original.png.
// Uso: node scripts/gen-assets.mjs
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const SRC = 'assets-src/logo-original.png';
const OUT_BRAND = 'public/brand';
const OUT_ICONS = 'public/icons';
await mkdir(OUT_BRAND, { recursive: true });
await mkdir(OUT_ICONS, { recursive: true });

// 1) Logo completo recortado (sin márgenes transparentes)
const trimmed = await sharp(SRC).trim({ threshold: 1 }).toBuffer();
await sharp(trimmed).resize({ width: 720 }).png({ compressionLevel: 9, palette: false }).toFile(`${OUT_BRAND}/logo.png`);
await sharp(trimmed).resize({ width: 720 }).webp({ quality: 90, alphaQuality: 100 }).toFile(`${OUT_BRAND}/logo.webp`);
// Versión liviana en PNG para los correos (Outlook y otros no muestran WebP)
await sharp(trimmed).resize({ width: 380 }).png({ palette: true, quality: 90, compressionLevel: 9, effort: 10 }).toFile(`${OUT_BRAND}/logo-correo.png`);

// 2) Ovejita: recorte cuadrado centrado en la mascota, quitando el borde oscuro del óvalo
const CROP = { left: 354, top: 236, width: 572, height: 572 }; // termina sobre el texto "PATAGONIA"
const { data, info } = await sharp(SRC).extract(CROP).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width;
for (let y = 0; y < info.height; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const ox = x + CROP.left; // coordenadas en la imagen original
    const oy = y + CROP.top;
    const dark = Math.max(data[i], data[i + 1], data[i + 2]) < 60;
    if (!dark) continue;
    const insideSheep = ox >= 458 && ox <= 842;
    const ovalTopBand = oy < 400 && (ox < 468 || ox > 752);
    if (!insideSheep || ovalTopBand) data[i + 3] = 0;
  }
}
const sheep = await sharp(data, { raw: { width: W, height: info.height, channels: 4 } }).png().toBuffer();

const sky = (size, r) => Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#9A3D93"/>
      <stop offset="0.45" stop-color="#C9437F"/>
      <stop offset="0.78" stop-color="#E8625F"/>
      <stop offset="1" stop-color="#F59A3B"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${r}" fill="url(#g)"/>
</svg>`);

async function icon(size, { pad = 0.04, radius = 0, file }) {
  const inner = Math.round(size * (1 - pad * 2));
  const sheepImg = await sharp(sheep).resize(inner, inner).toBuffer();
  const top = size - inner; // pegada abajo para que la ovejita "salga" del borde inferior
  await sharp(sky(size, radius))
    .composite([{ input: sheepImg, left: Math.round((size - inner) / 2), top }])
    .png({ compressionLevel: 9 })
    .toFile(file);
}

await icon(512, { pad: 0.03, radius: 0, file: `${OUT_ICONS}/icon-512.png` });
await icon(192, { pad: 0.03, radius: 0, file: `${OUT_ICONS}/icon-192.png` });
await icon(512, { pad: 0.14, radius: 0, file: `${OUT_ICONS}/maskable-512.png` });
await icon(192, { pad: 0.14, radius: 0, file: `${OUT_ICONS}/maskable-192.png` });
await icon(180, { pad: 0.05, radius: 0, file: `${OUT_ICONS}/apple-touch-icon.png` });
await icon(64, { pad: 0.02, radius: 14, file: `${OUT_ICONS}/favicon-64.png` });
await icon(32, { pad: 0.02, radius: 7, file: `${OUT_ICONS}/favicon-32.png` });

// Íconos del panel (fondo oscuro para distinguirlo en el teléfono/tablet)
const adminBg = (size) => Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#2A1530"/><stop offset="1" stop-color="#4A1D3F"/></linearGradient></defs>
  <rect width="${size}" height="${size}" fill="url(#g)"/>
  <rect x="${size * 0.06}" y="${size * 0.06}" width="${size * 0.88}" height="${size * 0.88}" rx="${size * 0.2}" fill="none" stroke="#F59A3B" stroke-width="${size * 0.025}"/>
</svg>`);
for (const [size, pad, file] of [[512, 0.16, 'admin-512.png'], [192, 0.16, 'admin-192.png'], [512, 0.2, 'admin-maskable-512.png']]) {
  const inner = Math.round(size * (1 - pad * 2));
  const sheepImg = await sharp(sheep).resize(inner, inner).toBuffer();
  await sharp(adminBg(size))
    .composite([{ input: sheepImg, left: Math.round((size - inner) / 2), top: Math.round((size - inner) / 2) }])
    .png({ compressionLevel: 9 })
    .toFile(`${OUT_ICONS}/${file}`);
}

// 3) Badge monocromo para la barra de notificaciones de Android (silueta blanca)
const badgeSvg = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
  <g fill="#fff">
    <path d="M48 10c-9 0-17 4-21 10-6 0-11 5-11 11 0 4 2 7 5 9-1 2-2 5-2 8 0 15 13 28 29 28s29-13 29-28c0-3-1-6-2-8 3-2 5-5 5-9 0-6-5-11-11-11-4-6-12-10-21-10z" opacity=".95"/>
    <path d="M14 86l20-26 10 12 8-9 30 23z"/>
  </g>
</svg>`);
await sharp(badgeSvg).png().toFile(`${OUT_ICONS}/badge-96.png`);

// 4) Imagen para compartir el link (WhatsApp, Instagram, etc.)
const ogBg = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#8E3A8C"/><stop offset=".5" stop-color="#D6335F"/><stop offset="1" stop-color="#F7931E"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <circle cx="1080" cy="80" r="220" fill="#FFC21A" opacity=".18"/>
  <circle cx="120" cy="600" r="260" fill="#fff" opacity=".08"/>
  <rect x="60" y="70" width="640" height="490" rx="36" fill="#FFF8F2"/>
  <text x="760" y="250" font-family="Segoe UI, Arial, sans-serif" font-size="58" font-weight="800" fill="#fff">Pide online</text>
  <text x="760" y="320" font-family="Segoe UI, Arial, sans-serif" font-size="34" font-weight="600" fill="#FFF1E6">Retiro, delivery</text>
  <text x="760" y="366" font-family="Segoe UI, Arial, sans-serif" font-size="34" font-weight="600" fill="#FFF1E6">o directo en tu mesa</text>
  <rect x="760" y="420" width="330" height="72" rx="36" fill="#fff"/>
  <text x="925" y="468" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="30" font-weight="800" fill="#D6335F">Ver el menú →</text>
</svg>`);
const ogLogo = await sharp(trimmed).resize({ width: 580, height: 430, fit: 'inside' }).toBuffer();
const ogMeta = await sharp(ogLogo).metadata();
await sharp(ogBg)
  .composite([{ input: ogLogo, left: 60 + Math.round((640 - ogMeta.width) / 2), top: 70 + Math.round((490 - ogMeta.height) / 2) }])
  .jpeg({ quality: 86, mozjpeg: true })
  .toFile(`${OUT_BRAND}/og-image.jpg`);

console.log('Listo: logo, íconos, badge e imagen para compartir generados.');
