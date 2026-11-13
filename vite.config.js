import { defineConfig } from 'vite';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const raiz = process.cwd();
const URL_PUBLICA = (process.env.PUBLIC_URL || 'https://patagonia.benjaminsotomayor.workers.dev').replace(/\/$/, '');

// Inserta la lista de archivos a precachear y una versión en dist/sw.js (la app funciona offline tras la 1ª visita).
function precacheServiceWorker() {
  return {
    name: 'ps-precache-sw',
    apply: 'build',
    closeBundle() {
      const dist = resolve(raiz, 'dist');
      const archivos = [];
      const recorrer = (dir) => {
        for (const f of readdirSync(dir)) {
          const p = join(dir, f);
          if (statSync(p).isDirectory()) recorrer(p);
          else archivos.push('/' + relative(dist, p).replace(/\\/g, '/'));
        }
      };
      recorrer(dist);
      const assets = archivos.filter(
        (f) => /^\/assets\/.+\.(js|css)$/.test(f) || (/^\/assets\/.+\.woff2$/.test(f) && /latin/.test(f) && !/(cyrillic|greek|vietnamese|hebrew)/.test(f)),
      );
      const fijos = ['/', '/admin/', '/offline.html', '/manifest.webmanifest', '/admin/manifest.webmanifest', '/brand/logo.webp', '/icons/icon-192.png', '/icons/admin-192.png', '/icons/badge-96.png'];
      const lista = [...fijos, ...assets];
      const huella = createHash('sha256')
        .update(lista.join('|'))
        .update(readFileSync(join(dist, 'index.html')))
        .update(readFileSync(join(dist, 'admin', 'index.html')))
        .digest('hex')
        .slice(0, 12);
      const sw = join(dist, 'sw.js');
      writeFileSync(sw, readFileSync(sw, 'utf8').replace('__VERSION__', huella).replace('"__PRECACHE__"', JSON.stringify(lista)));
      console.log(`  service worker v${huella} · ${lista.length} archivos para uso offline`);
    },
  };
}

// Reemplaza %PUBLIC_URL% (imagen para compartir en WhatsApp/Instagram necesita URL absoluta)
function urlPublica() {
  return {
    name: 'ps-public-url',
    transformIndexHtml: (html) => html.replaceAll('%PUBLIC_URL%', URL_PUBLICA),
  };
}

export default defineConfig({
  oxc: {
    jsx: { runtime: 'automatic', importSource: 'preact' },
  },
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    rolldownOptions: {
      input: {
        main: resolve(raiz, 'index.html'),
        admin: resolve(raiz, 'admin/index.html'),
      },
    },
  },
  plugins: [urlPublica(), precacheServiceWorker()],
});
