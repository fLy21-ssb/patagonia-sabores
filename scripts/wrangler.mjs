// Ejecuta wrangler con la cuenta Cloudflare del restaurante, guardada en .cuenta-cloudflare/
// (así no se mezcla con otras cuentas de este computador, como la de la ferretería).
// Uso: node scripts/wrangler.mjs <comando de wrangler>   ej: node scripts/wrangler.mjs deploy
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const env = { ...process.env, XDG_CONFIG_HOME: resolve('.cuenta-cloudflare'), WRANGLER_SEND_METRICS: 'false' };
const wrangler = resolve('node_modules/wrangler/bin/wrangler.js');
const r = spawnSync(process.execPath, [wrangler, ...process.argv.slice(2)], { stdio: 'inherit', env });
process.exit(r.status ?? 1);
