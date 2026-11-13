// Service worker de Patagonia Sabores: funciona offline, cachea imágenes y muestra las notificaciones push.
const VERSION = '__VERSION__';
const PRECACHE = "__PRECACHE__";
const CACHE_APP = `ps-app-${VERSION}`;
const CACHE_IMG = 'ps-img-v1';
const CACHE_DATOS = 'ps-datos-v1';
const MAX_IMAGENES = 150;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_APP)
      .then((cache) => cache.addAll(Array.isArray(PRECACHE) ? PRECACHE : []))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const clave of await caches.keys()) {
        if (clave.startsWith('ps-app-') && clave !== CACHE_APP) await caches.delete(clave);
      }
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/')) {
    // Solo el menú se guarda para verlo sin conexión; el resto siempre va a la red.
    if (url.pathname === '/api/menu') event.respondWith(redPrimero(req, CACHE_DATOS));
    return;
  }
  if (url.pathname.startsWith('/img/')) {
    event.respondWith(cachePrimero(req, CACHE_IMG, MAX_IMAGENES));
    return;
  }
  if (req.mode === 'navigate') {
    event.respondWith(navegacion(event, url));
    return;
  }
  if (/^\/(assets|icons|brand)\//.test(url.pathname) || url.pathname.endsWith('.webmanifest')) {
    event.respondWith(cachePrimero(req, CACHE_APP));
  }
});

async function navegacion(event, url) {
  try {
    const precargada = await event.preloadResponse;
    if (precargada) return precargada;
    return await fetch(event.request);
  } catch {
    const shell = url.pathname.startsWith('/admin') ? '/admin/' : '/';
    return (await caches.match(shell)) || (await caches.match('/offline.html')) || Response.error();
  }
}

async function redPrimero(req, nombreCache) {
  const cache = await caches.open(nombreCache);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) {
    const guardada = await cache.match(req);
    if (guardada) return guardada;
    throw e;
  }
}

async function cachePrimero(req, nombreCache, maximo) {
  const cache = await caches.open(nombreCache);
  const guardada = await cache.match(req);
  if (guardada) return guardada;
  const res = await fetch(req);
  if (res.ok) {
    await cache.put(req, res.clone());
    if (maximo) {
      const claves = await cache.keys();
      for (let i = 0; i < claves.length - maximo; i++) await cache.delete(claves[i]);
    }
  }
  return res;
}

// ---------- Notificaciones push ----------
self.addEventListener('push', (event) => {
  let datos = {};
  try {
    datos = event.data ? event.data.json() : {};
  } catch {
    datos = { title: 'Patagonia Sabores', body: event.data ? event.data.text() : '' };
  }
  const titulo = datos.title || 'Patagonia Sabores';
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(titulo, {
        body: datos.body || '',
        icon: datos.admin ? '/icons/admin-192.png' : '/icons/icon-192.png',
        badge: '/icons/badge-96.png',
        tag: datos.tag || undefined,
        renotify: Boolean(datos.tag),
        requireInteraction: Boolean(datos.admin),
        vibrate: [180, 80, 180, 80, 260],
        lang: 'es-CL',
        data: { url: datos.url || '/' },
      });
      const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      ventanas.forEach((v) => v.postMessage({ tipo: 'push', datos }));
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destino = new URL(event.notification.data?.url || '/', self.location.origin);
  const esPanel = destino.pathname.startsWith('/admin');
  event.waitUntil(
    (async () => {
      const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const misma = ventanas.find((v) => new URL(v.url).pathname.startsWith('/admin') === esPanel);
      if (misma) {
        await misma.focus();
        misma.postMessage({ tipo: 'navegar', url: destino.href });
        return;
      }
      await self.clients.openWindow(destino.href);
    })(),
  );
});
