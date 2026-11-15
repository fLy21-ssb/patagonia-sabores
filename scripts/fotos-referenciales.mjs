// Pone fotos de referencia (Wikimedia Commons, licencia libre) a los productos de la carta que no tienen foto.
// La lista está en assets-src/fotos-referenciales.json. Cada foto queda con su crédito ("Imagen referencial · Foto: ...")
// y un enlace a su página de origen, como piden las licencias Creative Commons. Nunca reemplaza una foto ya puesta.
//
// Uso:
//   node scripts/fotos-referenciales.mjs --vista    solo descarga y optimiza en .wrangler/tmp/fotos/ para revisarlas
//   node scripts/fotos-referenciales.mjs --local    las sube al servidor local (npm run dev)
//   node scripts/fotos-referenciales.mjs --remote   las sube a producción
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';

const modo = ['--vista', '--local', '--remote'].find((m) => process.argv.includes(m));
if (!modo) {
  console.error('Indica --vista, --local o --remote');
  process.exit(1);
}
const UA = 'patagonia-sabores-fotos/1.0 (script de carta)';
const MAX = 1100; // igual que la compresión del panel (src/client/admin/Carta.jsx)
const lista = JSON.parse(readFileSync('assets-src/fotos-referenciales.json', 'utf8'));
const tmp = resolve('.wrangler/tmp/fotos');
mkdirSync(tmp, { recursive: true });

function wrangler(args, { json = false } = {}) {
  const r = spawnSync(process.execPath, ['scripts/wrangler.mjs', ...args], { encoding: 'utf8', stdio: json ? ['ignore', 'pipe', 'inherit'] : 'inherit' });
  if (r.status !== 0) throw new Error(`wrangler ${args.join(' ')} falló`);
  return json ? JSON.parse(r.stdout.slice(r.stdout.indexOf('['))) : null;
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
async function pedir(url, tipo) {
  for (let intento = 1; intento <= 6; intento++) {
    const r = await fetch(url, { headers: { 'user-agent': UA } });
    if (r.ok) return tipo === 'json' ? r.json() : Buffer.from(await r.arrayBuffer());
    await esperar(1500 * intento); // Wikimedia limita las descargas seguidas
  }
  throw new Error(`No se pudo descargar ${url}`);
}

// 1. Productos que aún no tienen foto
const lugar = modo === '--remote' ? '--remote' : '--local';
let sinFoto = new Map(lista.map((f) => [f.producto, null]));
if (modo !== '--vista') {
  const [res] = wrangler(['d1', 'execute', 'patagonia-sabores', lugar, '--json', '--command', 'SELECT id, nombre FROM productos WHERE imagen IS NULL'], { json: true });
  sinFoto = new Map(res.results.map((p) => [p.nombre, p.id]));
}
const pendientes = lista.filter((f) => sinFoto.has(f.producto));
if (!pendientes.length) {
  console.log('Todos los productos de la lista ya tienen foto. Nada que hacer.');
  process.exit(0);
}

// 2. Datos de cada archivo en Wikimedia Commons (licencia, página y miniatura de 1280 px)
const api = new URL('https://commons.wikimedia.org/w/api.php');
Object.entries({ action: 'query', titles: pendientes.map((f) => f.archivo).join('|'), prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: '1280', format: 'json', formatversion: '2' }).forEach(([k, v]) => api.searchParams.set(k, v));
const info = await pedir(api, 'json');
const paginas = new Map(info.query.pages.map((p) => [p.title, p]));
for (const n of info.query.normalized || []) paginas.set(n.from, paginas.get(n.to));

// 3. Descarga, recorte y compresión a WebP
const kv = [];
const sql = [];
for (const f of pendientes) {
  const p = paginas.get(f.archivo);
  const ii = p?.imageinfo?.[0];
  if (!ii) throw new Error(`No existe en Commons: ${f.archivo}`);
  const licencia = ii.extmetadata?.LicenseShortName?.value || '';
  if (!/^(CC BY(-SA)? [\d.]+|CC0|Public domain)/i.test(licencia)) throw new Error(`Licencia no apta (${licencia}): ${f.archivo}`);
  await esperar(800);
  let img = sharp(await pedir(ii.thumburl || ii.url)).rotate();
  if (f.recorte) {
    const { width, height } = await sharp(await img.toBuffer()).metadata();
    const r = f.recorte;
    img = sharp(await img.toBuffer()).extract({ left: Math.round(r.x * width), top: Math.round(r.y * height), width: Math.round(r.w * width), height: Math.round(r.h * height) });
  }
  const webp = await img.resize(MAX, MAX, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
  const clave = `p/ref_${randomBytes(12).toString('base64url')}.webp`;
  const credito = `Imagen referencial · Foto: ${f.autor}, ${licencia}`;
  writeFileSync(resolve(tmp, `${f.producto.replace(/[^\p{L}\d]+/gu, '-')}.webp`), webp);
  console.log(`${f.producto}: ${Math.round(webp.length / 1024)} KB · ${credito}`);
  if (modo === '--vista') continue;
  const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
  kv.push({ key: clave, value: webp.toString('base64'), base64: true, metadata: { tipo: 'image/webp' } });
  sql.push(
    `UPDATE productos SET imagen = ${q(clave)}, imagen_credito = ${q(credito)}, imagen_fuente = ${q(ii.descriptionurl)}, ` +
      `actualizado = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ${Number(sinFoto.get(f.producto))} AND imagen IS NULL;`,
  );
}
if (modo === '--vista') {
  console.log(`\nListo: revisa las fotos en ${tmp}`);
  process.exit(0);
}

// 4. Sube las fotos a KV y luego las asigna en la base de datos
const archivoKv = resolve(tmp, 'kv.json');
const archivoSql = resolve(tmp, 'fotos.sql');
writeFileSync(archivoKv, JSON.stringify(kv));
writeFileSync(archivoSql, sql.join('\n') + '\n');
wrangler(['kv', 'bulk', 'put', archivoKv, '--binding', 'IMAGENES', lugar]);
wrangler(['d1', 'execute', 'patagonia-sabores', lugar, '--file', archivoSql, '--yes']);
console.log(`\nListo: ${kv.length} fotos puestas (${lugar === '--remote' ? 'producción' : 'local'}).`);
