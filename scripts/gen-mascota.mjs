// Recorta la ovejita del logo (sin el cielo ni el borde del óvalo) para usarla como personaje.
// Salidas: public/brand/oveja.webp/.png (cuerpo entero) y public/brand/oveja-cara.webp (cara, para avatares).
import sharp from 'sharp';

const SRC = 'assets-src/logo-original.png';
const CROP = { left: 440, top: 236, width: 420, height: 600 }; // zona de la oveja en el logo original
const { data, info } = await sharp(SRC).extract(CROP).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const H = info.height;
const N = W * H;

function hsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

// 1) ¿Qué píxeles pueden ser "fondo"? (transparente, cielo rosado/morado, nubes, montañas amarillas)
const transitable = new Uint8Array(N);
const cielo = new Uint8Array(N);
for (let i = 0; i < N; i++) {
  const r = data[i * 4];
  const g = data[i * 4 + 1];
  const b = data[i * 4 + 2];
  const a = data[i * 4 + 3];
  const ox = (i % W) + CROP.left;
  const oy = Math.floor(i / W) + CROP.top;
  if (a < 100) {
    transitable[i] = 1;
    continue;
  }
  const [h, s, l] = hsl(r, g, b);
  const esCielo = s > 0.25 && l > 0.2 && l < 0.85 && (h >= 280 || h <= 18);
  const esMontana = oy > 700 && s > 0.45 && h > 18 && h < 62 && l > 0.25; // borde amarillo de las montañas
  const esOscuro = Math.max(r, g, b) < 70;
  const bordeOvalo = esOscuro && oy < 400 && (ox < 468 || ox > 752); // borde negro del óvalo detrás de la cabeza
  if (esCielo) cielo[i] = 1;
  if (esCielo || esMontana || bordeOvalo) transitable[i] = 1;
}

// 2) Relleno desde los bordes y desde todo el cielo
const fondo = new Uint8Array(N);
const cola = new Int32Array(N);
let ini = 0;
let fin = 0;
const sembrar = (i) => {
  if (!fondo[i] && transitable[i]) {
    fondo[i] = 1;
    cola[fin++] = i;
  }
};
for (let x = 0; x < W; x++) {
  sembrar(x);
  sembrar((H - 1) * W + x);
}
for (let y = 0; y < H; y++) {
  sembrar(y * W);
  sembrar(y * W + W - 1);
}
// (solo desde los bordes: así la nariz rosada, encerrada por el contorno, no se confunde con el cielo)
while (ini < fin) {
  const i = cola[ini++];
  const x = i % W;
  const y = (i / W) | 0;
  if (x > 0) sembrar(i - 1);
  if (x < W - 1) sembrar(i + 1);
  if (y > 0) sembrar(i - W);
  if (y < H - 1) sembrar(i + W);
}

// 3) Nos quedamos con la figura más grande (la oveja); se descartan destellos y restos sueltos
const etiqueta = new Int32Array(N).fill(-1);
let mejor = -1;
let mejorTam = 0;
let id = 0;
for (let i = 0; i < N; i++) {
  if (fondo[i] || etiqueta[i] !== -1 || data[i * 4 + 3] < 100) continue;
  let tam = 0;
  ini = 0;
  fin = 0;
  cola[fin++] = i;
  etiqueta[i] = id;
  while (ini < fin) {
    const j = cola[ini++];
    tam++;
    const x = j % W;
    const y = (j / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const k = ny * W + nx;
      if (!fondo[k] && etiqueta[k] === -1 && data[k * 4 + 3] >= 100) {
        etiqueta[k] = id;
        cola[fin++] = k;
      }
    }
  }
  if (tam > mejorTam) {
    mejorTam = tam;
    mejor = id;
  }
  id++;
}
for (let i = 0; i < N; i++) if (etiqueta[i] !== mejor) data[i * 4 + 3] = 0;

// Suaviza el borde (1 px) para que no se vea serrucho
// Cortamos a la altura de la cintura (abajo quedan restos de las montañas del logo)
const corte = Math.round(H * 0.8);
for (let i = corte * W; i < N; i++) data[i * 4 + 3] = 0;
// Restos finos (líneas oscuras) de la cordillera del logo en las esquinas inferiores
for (let y = Math.round(H * 0.66); y < corte; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const oscuro = Math.max(data[i], data[i + 1], data[i + 2]) < 90;
    if (oscuro && (x < W * 0.1 || x > W * 0.86)) data[i + 3] = 0;
  }
}
const recorte = await sharp(data, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
const sinBorde = await sharp(recorte).trim({ threshold: 1 }).toBuffer();
const meta = await sharp(sinBorde).metadata();
console.log(`oveja: ${meta.width}x${meta.height} (figura de ${mejorTam} px)`);

await sharp(sinBorde).resize({ height: 520 }).webp({ quality: 90, alphaQuality: 100 }).toFile('public/brand/oveja.webp');
await sharp(sinBorde).resize({ height: 520 }).png({ compressionLevel: 9 }).toFile('public/brand/oveja.png');
// Cara + boina (parte superior), para avatares y marcadores
const mitad = await sharp(sinBorde).extract({ left: 0, top: 0, width: meta.width, height: Math.round(meta.height * 0.5) }).png().toBuffer();
const cara = await sharp(mitad).trim({ threshold: 1 }).toBuffer();
await sharp(cara).resize({ width: 220 }).webp({ quality: 90, alphaQuality: 100 }).toFile('public/brand/oveja-cara.webp');
// Vista previa sobre fondos claro y oscuro
const prev = await sharp(sinBorde).resize({ height: 300 }).toBuffer();
const pm = await sharp(prev).metadata();
await sharp({ create: { width: pm.width * 2 + 30, height: 320, channels: 4, background: '#fff3e4' } })
  .composite([
    { input: Buffer.from(`<svg width="${pm.width + 10}" height="320"><rect width="100%" height="100%" fill="#2a0f2e"/></svg>`), left: pm.width + 20, top: 0 },
    { input: prev, left: 5, top: 10 },
    { input: prev, left: pm.width + 25, top: 10 },
  ])
  .png()
  .toFile('assets-src/_oveja_preview.png');
