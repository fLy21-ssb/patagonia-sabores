// Web Push estándar (sin Firebase): cifrado aes128gcm (RFC 8291) + autenticación VAPID (RFC 8292),
// implementado solo con WebCrypto para que funcione dentro de Cloudflare Workers.
import { b64url, b64urlDecode, concatBytes } from './util.js';

const enc = new TextEncoder();

async function hkdf(salt, ikm, info, bytes) {
  const clave = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, clave, bytes * 8);
  return new Uint8Array(bits);
}

/**
 * Cifra el contenido para una suscripción. `opciones.claveLocal` y `opciones.salt` solo se usan en las pruebas
 * (vectores del RFC 8291); en producción se generan al azar en cada envío.
 */
export async function cifrar(contenido, p256dh, auth, opciones = {}) {
  const uaPublica = b64urlDecode(p256dh);
  const secretoAuth = b64urlDecode(auth);
  if (uaPublica.length !== 65 || uaPublica[0] !== 0x04) throw new Error('Clave p256dh inválida');
  if (secretoAuth.length !== 16) throw new Error('Secreto auth inválido');

  const local =
    opciones.claveLocal ||
    (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']));
  const asPublica = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const uaClave = await crypto.subtle.importKey('raw', uaPublica, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const secretoEcdh = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: uaClave }, local.privateKey, 256),
  );

  const infoClave = concatBytes(enc.encode('WebPush: info\0'), uaPublica, asPublica);
  const ikm = await hkdf(secretoAuth, secretoEcdh, infoClave, 32);
  const salt = opciones.salt || crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const plano = concatBytes(contenido, new Uint8Array([0x02])); // un solo registro, sin relleno
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, plano));

  const cabecera = new Uint8Array(16 + 4 + 1 + asPublica.length);
  cabecera.set(salt, 0);
  new DataView(cabecera.buffer).setUint32(16, 4096);
  cabecera[20] = asPublica.length;
  cabecera.set(asPublica, 21);
  return concatBytes(cabecera, cifrado);
}

let vapid = null;
function claveVapid(env) {
  if (!env.VAPID_PRIVATE_JWK) throw new Error('Falta configurar VAPID_PRIVATE_JWK.');
  if (!vapid || vapid.origen !== env.VAPID_PRIVATE_JWK) {
    const { kty, crv, x, y, d } = JSON.parse(env.VAPID_PRIVATE_JWK);
    vapid = {
      origen: env.VAPID_PRIVATE_JWK,
      clave: crypto.subtle.importKey('jwk', { kty, crv, x, y, d }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']),
    };
  }
  return vapid.clave;
}

const jwts = new Map();
async function jwtVapid(env, aud, sub) {
  const ahora = Math.floor(Date.now() / 1000);
  const llave = `${aud}|${sub}`;
  const guardado = jwts.get(llave);
  if (guardado && guardado.exp - ahora > 3600) return guardado.jwt;
  const exp = ahora + 12 * 3600;
  const cabecera = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const cuerpo = b64url(enc.encode(JSON.stringify({ aud, exp, sub })));
  const firma = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    await claveVapid(env),
    enc.encode(`${cabecera}.${cuerpo}`),
  );
  const jwt = `${cabecera}.${cuerpo}.${b64url(new Uint8Array(firma))}`;
  jwts.set(llave, { jwt, exp });
  return jwt;
}

/** Envía una notificación. Devuelve el código HTTP del servicio de push (404/410 = suscripción caducada). */
export async function enviarPush(env, sub, datos, { topic, ttl = 43_200, urgencia = 'high', subject } = {}) {
  const cuerpo = await cifrar(enc.encode(JSON.stringify(datos)), sub.p256dh, sub.auth);
  const aud = new URL(sub.endpoint).origin;
  const jwt = await jwtVapid(env, aud, subject || env.VAPID_SUBJECT || 'https://patagonia-sabores.workers.dev');
  const headers = {
    TTL: String(ttl),
    Urgency: urgencia,
    'Content-Encoding': 'aes128gcm',
    'Content-Type': 'application/octet-stream',
    Authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`,
  };
  if (topic) headers.Topic = topic;
  const res = await fetch(sub.endpoint, { method: 'POST', headers, body: cuerpo });
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    console.warn('Servicio de push respondió', res.status, (await res.text().catch(() => '')).slice(0, 300));
  }
  return res.status;
}

// Solo se aceptan endpoints de los servicios de push reales (Chrome/Android, Firefox, Safari/iOS, Edge).
const SERVICIOS = ['googleapis.com', 'mozilla.com', 'push.apple.com', 'notify.windows.com'];

/** Valida y normaliza una suscripción enviada por el navegador. Devuelve null si no es válida. */
export function suscripcionValida(s) {
  try {
    const endpoint = String(s?.endpoint || '');
    const p256dh = String(s?.keys?.p256dh || '');
    const auth = String(s?.keys?.auth || '');
    if (endpoint.length > 1000) return null;
    const url = new URL(endpoint);
    if (url.protocol !== 'https:') return null;
    if (!SERVICIOS.some((dominio) => url.hostname === dominio || url.hostname.endsWith(`.${dominio}`))) return null;
    const pub = b64urlDecode(p256dh);
    if (pub.length !== 65 || pub[0] !== 0x04) return null;
    if (b64urlDecode(auth).length !== 16) return null;
    return { endpoint, p256dh, auth };
  } catch {
    return null;
  }
}
