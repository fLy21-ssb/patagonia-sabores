// Prueba el cifrado Web Push contra el vector oficial del RFC 8291 (Apéndice A)
// y hace un ida y vuelta (cifrar → descifrar como lo haría el navegador) con claves al azar.
// Uso: node scripts/test-push.mjs
import { cifrar } from '../src/worker/push.js';
import { b64url, b64urlDecode, concatBytes } from '../src/worker/util.js';

const enc = new TextEncoder();
const dec = new TextDecoder();
let fallos = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? '✔' : '✘'} ${msg}`);
  if (!cond) fallos++;
};

// --- Vector del RFC 8291, Apéndice A ---
const V = {
  texto: 'When I grow up, I want to be a watermelon',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  uaPrivate: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  esperado:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};

async function importarPar(pub, priv) {
  const raw = b64urlDecode(pub);
  const jwk = { kty: 'EC', crv: 'P-256', x: b64url(raw.slice(1, 33)), y: b64url(raw.slice(33, 65)), d: priv };
  const privateKey = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const publicKey = await crypto.subtle.importKey('raw', raw, { name: 'ECDH', namedCurve: 'P-256' }, true, []);
  return { privateKey, publicKey };
}

const claveLocal = await importarPar(V.asPublic, V.asPrivate);
const salida = await cifrar(enc.encode(V.texto), V.uaPublic, V.auth, { claveLocal, salt: b64urlDecode(V.salt) });
ok(b64url(salida) === V.esperado, 'Cifrado idéntico al vector oficial del RFC 8291');

// --- Descifrado como navegador (receptor) para validar el ida y vuelta ---
async function hkdf(salt, ikm, info, bytes) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, bytes * 8));
}
async function descifrar(cuerpo, uaPar, uaPublicRaw, auth) {
  const salt = cuerpo.slice(0, 16);
  const idlen = cuerpo[20];
  const asPublic = cuerpo.slice(21, 21 + idlen);
  const datos = cuerpo.slice(21 + idlen);
  const asKey = await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, uaPar.privateKey, 256));
  const ikm = await hkdf(auth, ecdh, concatBytes(enc.encode('WebPush: info\0'), uaPublicRaw, asPublic), 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const plano = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, aes, datos));
  let fin = plano.length - 1;
  while (fin >= 0 && plano[fin] === 0) fin--;
  if (plano[fin] !== 2) throw new Error('Delimitador de registro incorrecto');
  return dec.decode(plano.slice(0, fin));
}

const ua = await importarPar(V.uaPublic, V.uaPrivate);
ok((await descifrar(salida, ua, b64urlDecode(V.uaPublic), b64urlDecode(V.auth))) === V.texto, 'El vector se descifra correctamente');

const navegador = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
const navPublic = new Uint8Array(await crypto.subtle.exportKey('raw', navegador.publicKey));
const navAuth = crypto.getRandomValues(new Uint8Array(16));
const mensaje = JSON.stringify({ title: '🎉 ¡Tu pedido está listo!', body: 'Pedido #12 · Ya puedes pasar a retirarlo.' });
const cuerpo = await cifrar(enc.encode(mensaje), b64url(navPublic), b64url(navAuth));
ok((await descifrar(cuerpo, navegador, navPublic, navAuth)) === mensaje, 'Ida y vuelta con claves al azar (con emojis y tildes)');

if (fallos) {
  console.error(`\n${fallos} prueba(s) fallaron`);
  process.exit(1);
}
console.log('\nTodo OK');
