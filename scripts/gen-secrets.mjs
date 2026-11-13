// Genera los secretos de la app: claves VAPID (avisos push), SESSION_SECRET y una contraseña inicial del panel.
//   node scripts/gen-secrets.mjs local        → escribe .dev.vars (para probar en tu PC)
//   node scripts/gen-secrets.mjs produccion   → escribe .secrets.produccion.json (para subir a Cloudflare)
//                                                y CREDENCIALES.txt con la contraseña del panel
import { existsSync, writeFileSync } from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';

const destino = process.argv[2] || 'local';
const b64url = (bytes) => Buffer.from(bytes).toString('base64url');

const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const jwk = await crypto.subtle.exportKey('jwk', par.privateKey);
const publica = b64url(new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey)));
const privada = JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d });
const sesion = b64url(crypto.getRandomValues(new Uint8Array(48)));

// Contraseña legible: 3 palabras + número (fácil de dictar, difícil de adivinar)
const palabras = ['lenga', 'calafate', 'huemul', 'glaciar', 'fiordo', 'coigue', 'ñirre', 'pudu', 'condor', 'chilco', 'maqui', 'murta', 'nalca', 'pehuen', 'raulí', 'canelo', 'trauco', 'piedra', 'viento', 'cordillera'];
const al = (n) => crypto.getRandomValues(new Uint32Array(1))[0] % n;
const password = `${palabras[al(palabras.length)]}-${palabras[al(palabras.length)]}-${palabras[al(palabras.length)]}-${100 + al(900)}`;

if (destino === 'local') {
  if (existsSync('.dev.vars')) {
    console.log('.dev.vars ya existe; no se sobrescribe.');
    process.exit(0);
  }
  writeFileSync(
    '.dev.vars',
    [
      '# Secretos SOLO para pruebas locales (wrangler dev). No se suben a Cloudflare.',
      `ADMIN_PASSWORD=${password}`,
      `SESSION_SECRET=${sesion}`,
      `VAPID_PUBLIC_KEY=${publica}`,
      `VAPID_PRIVATE_JWK=${privada}`,
      '',
    ].join('\n'),
  );
  console.log('Creado .dev.vars (la contraseña local del panel está ahí).');
} else {
  writeFileSync(
    '.secrets.produccion.json',
    JSON.stringify({ ADMIN_PASSWORD: password, SESSION_SECRET: sesion, VAPID_PUBLIC_KEY: publica, VAPID_PRIVATE_JWK: privada }, null, 2),
  );
  writeFileSync(
    'CREDENCIALES.txt',
    [
      'PATAGONIA SABORES · Acceso al panel de administración',
      '=====================================================',
      '',
      `Contraseña inicial del panel: ${password}`,
      '',
      'Cámbiala cuando quieras desde el panel: Ajustes → Seguridad.',
      'No compartas este archivo. Si lo pierdes, se puede generar una nueva con: npx wrangler secret put ADMIN_PASSWORD',
      '',
    ].join('\n'),
  );
  console.log('Creados .secrets.produccion.json y CREDENCIALES.txt');
}
