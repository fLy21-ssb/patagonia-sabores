# Patagonia Sabores · Sistema de pedidos web

Menú web instalable como app (PWA) para **retiro y delivery**, con panel del local, avisos al celular, códigos de descuento, promociones y correos a clientes.

- Menú para clientes: https://patagonia.benjaminsotomayor.workers.dev
- Panel del local: https://patagonia.benjaminsotomayor.workers.dev/admin

## Arquitectura

Todo corre en la cuenta de Cloudflare del restaurante (plan gratis):

| Parte | Servicio | Dónde está en el código |
| --- | --- | --- |
| App de clientes y panel | Archivos estáticos servidos por Cloudflare | `src/client/`, `index.html`, `admin/index.html`, `public/` |
| Servidor (API) | Cloudflare Worker `patagonia` | `src/worker/` |
| Base de datos | Cloudflare D1 `patagonia-sabores` (región Este de Norteamérica) | `migrations/` |
| Fotos de la carta | Cloudflare KV (`IMAGENES`) | `src/worker/index.js`, `routes/admin.js` |
| Avisos al celular | Web Push estándar (VAPID, sin Firebase) | `src/worker/push.js`, `notify.js`, `public/sw.js` |
| Correos a clientes | Gmail del local por SMTP (contraseña de aplicación, guardada cifrada en D1) | `src/worker/smtp.js`, `correo.js` |

Frontend con Preact + Vite. La configuración de Cloudflare está en `wrangler.jsonc`.

## Comandos

```bash
npm install
npm run dev          # servidor local en http://localhost:8787 (necesita .dev.vars)
npm run deploy       # compila y publica en Cloudflare
npm run migrar       # aplica migraciones nuevas a la base de datos de producción
npm test             # prueba el cifrado de los avisos push
```

- Pruebas de la API (con el servidor local corriendo): `node scripts/smtp-falso.mjs` en una terminal, y `node scripts/test-api.mjs http://127.0.0.1:8787` en otra (el servidor local debe iniciarse con `--var SMTP_HOST:127.0.0.1 --var SMTP_PORT:2525 --var SMTP_TLS:off`).
- Capturas y PDF de presentación: `scripts/capturas.mjs`, `scripts/capturas-promos.mjs` y `scripts/gen-pdf.mjs`.

Todos los comandos de Cloudflare pasan por `scripts/wrangler.mjs`, que usa la sesión guardada en `.cuenta-cloudflare/` (cuenta del restaurante) y no la sesión global del computador.

## Recuperar el proyecto en otro computador

1. `git clone` de este repositorio y `npm install`.
2. Inicia sesión en la cuenta de Cloudflare del restaurante: `node scripts/wrangler.mjs login`.
3. Para probar en local, crea secretos de prueba: `node scripts/gen-secrets.mjs local` (escribe `.dev.vars`).
4. Publica con `npm run deploy`. Los secretos de producción ya están guardados en Cloudflare; no hace falta volver a subirlos.

## Secretos (no están en este repositorio)

- `.dev.vars`: secretos de prueba locales.
- `.secrets.produccion.json`: copia de los secretos de producción (`SESSION_SECRET`, claves VAPID, contraseña inicial). **Guárdala en un lugar seguro** (por ejemplo, un gestor de contraseñas).
- `CREDENCIALES.txt`: contraseña inicial del panel.
- `.cuenta-cloudflare/`: sesión de Cloudflare de este computador.

Cuidado al cambiar secretos en producción: un `SESSION_SECRET` nuevo cierra las sesiones del panel, invalida la clave de Gmail guardada (hay que volver a conectarla) y cambia los QR de las mesas. Claves VAPID nuevas obligan a los clientes y al local a reactivar los avisos.
