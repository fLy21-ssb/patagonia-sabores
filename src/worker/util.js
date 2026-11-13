// Validación de datos de entrada y utilidades binarias.
import { HttpError } from './http.js';

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Texto limpio y acotado. Lanza 400 si es requerido y viene vacío. */
export function texto(valor, max, { requerido = false, campo = 'el campo', multilinea = false } = {}) {
  if (valor === undefined || valor === null) valor = '';
  if (typeof valor !== 'string' && typeof valor !== 'number') {
    throw new HttpError(400, `Revisa ${campo}.`);
  }
  let s = String(valor).replace(CONTROL_CHARS, '');
  s = multilinea ? s.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n') : s.replace(/\s+/g, ' ');
  s = s.trim();
  if (s.length > max) s = s.slice(0, max).trim();
  if (requerido && !s) throw new HttpError(400, `Falta ${campo}.`);
  return s;
}

/** Entero dentro de un rango. */
export function entero(valor, { min = 0, max = Number.MAX_SAFE_INTEGER, campo = 'el valor', nulo = false } = {}) {
  if (nulo && (valor === null || valor === undefined || valor === '')) return null;
  const n = typeof valor === 'string' && valor.trim() !== '' ? Number(valor) : valor;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) {
    throw new HttpError(400, `Revisa ${campo}.`);
  }
  return n;
}

export const bool = (v) => v === true || v === 1 || v === '1' || v === 'true';
export const bit = (v) => (bool(v) ? 1 : 0);

/** Teléfono chileno o internacional, flexible en el formato. */
export function telefono(valor, { requerido = false } = {}) {
  const s = texto(valor, 25, { campo: 'el teléfono' });
  const digitos = s.replace(/\D/g, '');
  if (!s) {
    if (requerido) throw new HttpError(400, 'Ingresa tu teléfono para avisarte de tu pedido.');
    return '';
  }
  if (digitos.length < 8 || digitos.length > 15) throw new HttpError(400, 'El teléfono no parece válido.');
  return s;
}

const EMAIL_RE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z]{2,24}$/;

/** Correo electrónico (en minúsculas). Vacío si no es requerido; lanza 400 si no parece válido. */
export function email(valor, { requerido = false, campo = 'tu correo' } = {}) {
  const s = texto(valor, 120, { campo }).toLowerCase();
  if (!s) {
    if (requerido) throw new HttpError(400, `Falta ${campo}.`);
    return '';
  }
  if (s.length > 100 || !EMAIL_RE.test(s) || s.includes('..')) {
    throw new HttpError(400, 'El correo no parece válido. Revísalo.');
  }
  return s;
}

export function b64url(bytes) {
  let bin = '';
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(str) {
  let s = String(str).replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function concatBytes(...parts) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

export function tokenAleatorio(bytes = 16) {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export const ahoraIso = () => new Date().toISOString();

export function clp(n) {
  return '$' + Math.round(n).toLocaleString('es-CL');
}
