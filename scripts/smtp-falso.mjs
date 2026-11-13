// Servidor SMTP falso para pruebas locales (sin TLS). Acepta la contraseña "clave-de-prueba-16"
// y rechaza destinatarios que contengan "rebota". Guarda cada correo en capturas/correos/ y los
// expone en http://127.0.0.1:2526/correos para que las pruebas los revisen.
// Uso: node scripts/smtp-falso.mjs   (luego: wrangler dev --var SMTP_HOST:127.0.0.1 --var SMTP_PORT:2525 --var SMTP_TLS:off)
import net from 'node:net';
import http from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';

const CLAVE = 'clave-de-prueba-16';
const correos = [];
mkdirSync('capturas/correos', { recursive: true });

net
  .createServer((s) => {
    let buffer = '';
    let enData = false;
    let datos = [];
    let de = '';
    let para = [];
    let autenticado = false;
    const r = (l) => s.write(`${l}\r\n`);
    r('220 smtp.falso ESMTP listo');
    s.on('data', (chunk) => {
      buffer += chunk.toString('latin1');
      let i;
      while ((i = buffer.indexOf('\r\n')) >= 0) {
        const linea = buffer.slice(0, i);
        buffer = buffer.slice(i + 2);
        if (enData) {
          if (linea === '.') {
            enData = false;
            const texto = Buffer.from(datos.join('\r\n'), 'latin1').toString('utf8');
            const correo = { n: correos.length + 1, de, para: [...para], datos: texto };
            correos.push(correo);
            writeFileSync(`capturas/correos/${String(correo.n).padStart(3, '0')}.eml`, texto);
            r('250 2.0.0 OK guardado');
            datos = [];
          } else datos.push(linea.startsWith('..') ? linea.slice(1) : linea);
          continue;
        }
        const cmd = linea.slice(0, 4).toUpperCase();
        if (cmd === 'EHLO' || cmd === 'HELO') {
          s.write('250-smtp.falso hola\r\n250-AUTH PLAIN LOGIN\r\n250 8BITMIME\r\n');
        } else if (cmd === 'AUTH') {
          const [, , b64] = linea.split(' ');
          const [, usuario, clave] = Buffer.from(b64 || '', 'base64').toString('utf8').split('\0');
          if (clave === CLAVE && usuario) {
            autenticado = true;
            r('235 2.7.0 Accepted');
          } else r('535 5.7.8 Username and Password not accepted. BadCredentials');
        } else if (cmd === 'MAIL') {
          if (!autenticado) r('530 5.7.0 Authentication Required');
          else {
            de = linea.slice(10).replace(/[<>]/g, '');
            para = [];
            r('250 2.1.0 OK');
          }
        } else if (cmd === 'RCPT') {
          const dir = linea.slice(8).replace(/[<>]/g, '');
          if (dir.includes('rebota')) r('550 5.1.1 The email account that you tried to reach does not exist');
          else {
            para.push(dir);
            r('250 2.1.5 OK');
          }
        } else if (cmd === 'DATA') {
          enData = true;
          r('354 Go ahead');
        } else if (cmd === 'RSET') {
          para = [];
          r('250 2.0.0 OK');
        } else if (cmd === 'QUIT') {
          r('221 2.0.0 chao');
          s.end();
        } else r('502 5.5.1 Unrecognized command');
      }
    });
    s.on('error', () => {});
  })
  .listen(2525, '127.0.0.1', () => console.log('SMTP falso en 127.0.0.1:2525'));

http
  .createServer((req, res) => {
    if (req.url === '/limpiar') correos.length = 0;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(correos));
  })
  .listen(2526, '127.0.0.1', () => console.log('Correos recibidos en http://127.0.0.1:2526/correos'));
