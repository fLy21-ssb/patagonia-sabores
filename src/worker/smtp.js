// Cliente SMTP mínimo sobre los sockets TCP de Cloudflare Workers (cloudflare:sockets).
// Sirve para enviar correos desde el Gmail del local (smtp.gmail.com:465, TLS) con una contraseña de aplicación:
// gratis, sin servicios externos y con buena entrega (los correos salen del propio Gmail).
import { connect } from 'cloudflare:sockets';

const enc = new TextEncoder();
const dec = new TextDecoder();

export class ErrorSmtp extends Error {
  constructor(mensaje, codigo = 0, etapa = '') {
    super(mensaje);
    this.codigo = codigo;
    this.etapa = etapa;
  }
}

function base64Bytes(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
const base64 = (texto) => base64Bytes(enc.encode(texto));

function conTiempo(promesa, ms, etapa) {
  let timer;
  return Promise.race([
    promesa,
    new Promise((_, rechazar) => {
      timer = setTimeout(() => rechazar(new ErrorSmtp('El servidor de correo no respondió a tiempo.', 0, etapa)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

class Lector {
  constructor(readable) {
    this.reader = readable.getReader();
    this.buffer = '';
  }

  async linea() {
    for (;;) {
      const i = this.buffer.indexOf('\n');
      if (i >= 0) {
        const l = this.buffer.slice(0, i).replace(/\r$/, '');
        this.buffer = this.buffer.slice(i + 1);
        return l;
      }
      const { value, done } = await this.reader.read();
      if (done) throw new ErrorSmtp('El servidor de correo cerró la conexión.', 0, 'conexion');
      this.buffer += dec.decode(value, { stream: true });
    }
  }

  /** Una respuesta SMTP completa (las de varias líneas usan "250-" hasta la última "250 "). */
  async respuesta() {
    const lineas = [];
    for (;;) {
      const l = await this.linea();
      lineas.push(l);
      if (l.length < 4 || l[3] !== '-') break;
      if (lineas.length > 100) throw new ErrorSmtp('Respuesta del servidor de correo no válida.', 0, 'conexion');
    }
    const codigo = Number(lineas[lineas.length - 1].slice(0, 3)) || 0;
    return { codigo, texto: lineas.map((l) => l.slice(4)).join(' ').trim() };
  }
}

/**
 * Abre una sesión SMTP autenticada. Devuelve { enviar({ de, para, datos }), cerrar() }.
 * En una misma conexión se pueden enviar varios correos (una sola conexión cuenta como un subrequest).
 */
export async function abrirSmtp({ host, puerto, tls, usuario, password, ehlo }) {
  const socket = connect({ hostname: host, port: puerto }, { secureTransport: tls ? 'on' : 'off', allowHalfOpen: false });
  const escritor = socket.writable.getWriter();
  const lector = new Lector(socket.readable);
  const escribir = (texto) => escritor.write(enc.encode(texto));

  async function comando(linea, esperados, etapa, ms = 20_000) {
    if (linea !== null) await escribir(`${linea}\r\n`);
    const r = await conTiempo(lector.respuesta(), ms, etapa);
    if (!esperados.includes(r.codigo)) throw new ErrorSmtp(r.texto || 'Error del servidor de correo.', r.codigo, etapa);
    return r;
  }

  const cerrar = async () => {
    try {
      await escribir('QUIT\r\n');
      await conTiempo(lector.respuesta(), 3000, 'quit');
    } catch {
      /* da igual: se cierra igual */
    }
    try {
      await socket.close();
    } catch {
      /* ya estaba cerrado */
    }
  };

  try {
    await comando(null, [220], 'saludo');
    await comando(`EHLO ${ehlo}`, [250], 'ehlo');
    await comando(`AUTH PLAIN ${base64(`\0${usuario}\0${password}`)}`, [235], 'auth');
  } catch (e) {
    await cerrar();
    if (e instanceof ErrorSmtp) throw e;
    throw new ErrorSmtp(`No se pudo conectar con el servidor de correo (${e?.message || e}).`, 0, 'conexion');
  }

  return {
    async enviar({ de, para, datos }) {
      await comando(`MAIL FROM:<${de}>`, [250], 'remitente');
      try {
        await comando(`RCPT TO:<${para}>`, [250, 251], 'destinatario');
      } catch (e) {
        if (e.codigo >= 500) await comando('RSET', [250], 'rset').catch(() => {});
        throw e;
      }
      await comando('DATA', [354], 'data');
      // "Dot-stuffing": una línea que empieza con punto se duplica para no confundirla con el fin del mensaje.
      await escribir(`${datos.replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..')}\r\n.\r\n`);
      await comando(null, [250], 'mensaje', 60_000);
    },
    cerrar,
  };
}

// ---------- Armado del mensaje (MIME, UTF-8) ----------

/** Encabezado con tildes/ñ codificado según RFC 2047 (palabras de máx. 75 caracteres). */
export function encabezado(texto) {
  const limpio = String(texto).replace(/[\r\n]+/g, ' ');
  if (/^[\x20-\x7e]*$/.test(limpio)) return limpio;
  const palabras = [];
  let actual = '';
  for (const ch of limpio) {
    if (enc.encode(actual + ch).length > 45) {
      palabras.push(actual);
      actual = '';
    }
    actual += ch;
  }
  if (actual) palabras.push(actual);
  return palabras.map((p) => `=?UTF-8?B?${base64(p)}?=`).join('\r\n ');
}

function direccion(nombre, email) {
  if (!nombre) return `<${email}>`;
  const limpio = String(nombre).replace(/[\r\n"\\<>]/g, '').trim();
  return /^[\x20-\x7e]*$/.test(limpio) ? `"${limpio}" <${email}>` : `${encabezado(limpio)} <${email}>`;
}

const envolver = (b64) => b64.replace(/.{1,76}/g, '$&\r\n').trimEnd();

/** Arma un correo multipart (texto + HTML) listo para enviar por SMTP. */
export function construirMensaje({ de, nombreDe, para, asunto, texto, html, dominio, cabeceras = {} }) {
  const limite = `ps-${crypto.randomUUID()}`;
  const id = `${crypto.randomUUID()}@${dominio || 'patagonia.local'}`;
  const lineas = [
    `From: ${direccion(nombreDe, de)}`,
    `To: <${para}>`,
    `Subject: ${encabezado(asunto)}`,
    `Date: ${new Date().toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${id}>`,
    'MIME-Version: 1.0',
    ...Object.entries(cabeceras).map(([k, v]) => `${k}: ${v}`),
    `Content-Type: multipart/alternative; boundary="${limite}"`,
    '',
    `--${limite}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    envolver(base64(texto)),
    `--${limite}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    envolver(base64(html)),
    `--${limite}--`,
    '',
  ];
  return lineas.join('\r\n');
}
