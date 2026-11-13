// Sesión del panel (cookie firmada con HMAC), contraseña y firma de los códigos QR de las mesas.
import { HttpError } from './http.js';
import { b64url } from './util.js';

const enc = new TextEncoder();
const COOKIE = 'ps_admin';
const DURACION_SEG = 30 * 24 * 3600; // 30 días
const claves = new Map();

function claveHmac(secreto) {
  let clave = claves.get(secreto);
  if (!clave) {
    clave = crypto.subtle.importKey('raw', enc.encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    claves.set(secreto, clave);
  }
  return clave;
}

export async function firmar(env, dato) {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
    throw new Error('Falta configurar SESSION_SECRET (mínimo 32 caracteres).');
  }
  const firma = await crypto.subtle.sign('HMAC', await claveHmac(env.SESSION_SECRET), enc.encode(dato));
  return b64url(new Uint8Array(firma));
}

/** Comparación en tiempo constante. */
export function igualSeguro(a, b) {
  const x = String(a);
  const y = String(b);
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  return diff === 0;
}

const huellaPassword = (env, password) => firmar(env, `pwd:${password}`);

/** Huella de la contraseña vigente: la cambiada desde el panel o, si no hay, la configurada como secreto. */
async function huellaActual(env) {
  const fila = await env.DB.prepare("SELECT valor FROM secretos WHERE clave = 'admin_password'").first();
  if (fila?.valor) return fila.valor;
  if (env.ADMIN_PASSWORD) return huellaPassword(env, env.ADMIN_PASSWORD);
  return null;
}

export async function passwordCorrecta(env, password) {
  if (typeof password !== 'string' || !password || password.length > 200) return false;
  const actual = await huellaActual(env);
  if (!actual) return false;
  return igualSeguro(await huellaPassword(env, password), actual);
}

export async function guardarPassword(env, nueva) {
  await env.DB.prepare(
    `INSERT INTO secretos (clave, valor) VALUES ('admin_password', ?1)
     ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`,
  )
    .bind(await huellaPassword(env, nueva))
    .run();
}

// La firma de la sesión incluye parte de la huella: al cambiar la contraseña, todas las sesiones caducan.
export async function crearSesion(env) {
  const huella = await huellaActual(env);
  const exp = Date.now() + DURACION_SEG * 1000;
  return `${exp}.${await firmar(env, `ses:${exp}:${huella.slice(0, 16)}`)}`;
}

function leerCookie(request, nombre) {
  const header = request.headers.get('cookie') || '';
  for (const parte of header.split(';')) {
    const [k, ...v] = parte.trim().split('=');
    if (k === nombre) return v.join('=');
  }
  return null;
}

export async function sesionValida(env, request) {
  const token = leerCookie(request, COOKIE);
  if (!token) return false;
  const [exp, firma] = token.split('.');
  if (!exp || !firma || !(Number(exp) > Date.now())) return false;
  const huella = await huellaActual(env);
  if (!huella) return false;
  return igualSeguro(firma, await firmar(env, `ses:${exp}:${huella.slice(0, 16)}`));
}

export function cookieSesion(token, url) {
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${DURACION_SEG}${secure}`;
}

export function cookieCerrar(url) {
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}

/** Envuelve un handler para que exija sesión. Las escrituras exigen además la cabecera propia del panel (anti-CSRF). */
export function soloAdmin(handler) {
  return async (ctx) => {
    if (ctx.request.method !== 'GET' && ctx.request.headers.get('x-ps-client') !== '1') {
      throw new HttpError(403, 'Solicitud no permitida.');
    }
    if (!(await sesionValida(ctx.env, ctx.request))) {
      throw new HttpError(401, 'Tu sesión expiró. Vuelve a ingresar.');
    }
    return handler(ctx);
  };
}

export async function firmaMesa(env, numero) {
  return (await firmar(env, `mesa:${numero}`)).slice(0, 12);
}

export async function mesaValida(env, numero, firma) {
  if (!Number.isInteger(numero) || numero < 1 || typeof firma !== 'string') return false;
  return igualSeguro(await firmaMesa(env, numero), firma);
}
