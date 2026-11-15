// Correos para clientes desde el Gmail del local: pedido recibido / listo / cancelado y promociones.
// La contraseña de aplicación de Gmail se guarda cifrada (AES-GCM) en D1; la llave sale de SESSION_SECRET.
import { abrirSmtp, construirMensaje, ErrorSmtp } from './smtp.js';
import { leerAjustes } from './settings.js';
import { b64url, b64urlDecode, clp } from './util.js';

const enc = new TextEncoder();
const dec = new TextDecoder();
const CLAVE_SECRETO = 'correo';

// ---------- Configuración (cifrada) ----------

let llave = null;
function llaveCorreo(env) {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) throw new Error('Falta configurar SESSION_SECRET.');
  if (!llave || llave.origen !== env.SESSION_SECRET) {
    llave = {
      origen: env.SESSION_SECRET,
      clave: crypto.subtle
        .importKey('raw', enc.encode(env.SESSION_SECRET), 'HKDF', false, ['deriveKey'])
        .then((base) =>
          crypto.subtle.deriveKey(
            { name: 'HKDF', hash: 'SHA-256', salt: enc.encode('patagonia-correo'), info: enc.encode('v1') },
            base,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt'],
          ),
        ),
    };
  }
  return llave.clave;
}

export async function leerConfigCorreo(env) {
  const fila = await env.DB.prepare('SELECT valor FROM secretos WHERE clave = ?').bind(CLAVE_SECRETO).first();
  if (!fila?.valor) return null;
  try {
    const [version, iv, datos] = fila.valor.split('.');
    if (version !== 'v1') return null;
    const plano = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64urlDecode(iv) }, await llaveCorreo(env), b64urlDecode(datos));
    const cfg = JSON.parse(dec.decode(plano));
    return cfg?.usuario && cfg?.password ? cfg : null;
  } catch (e) {
    console.error('No se pudo leer la configuración de correo', e?.message || e);
    return null;
  }
}

export async function guardarConfigCorreo(env, cfg) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cifrado = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await llaveCorreo(env), enc.encode(JSON.stringify(cfg)));
  await env.DB.prepare(
    `INSERT INTO secretos (clave, valor) VALUES (?1, ?2) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`,
  )
    .bind(CLAVE_SECRETO, `v1.${b64url(iv)}.${b64url(new Uint8Array(cifrado))}`)
    .run();
}

export async function borrarConfigCorreo(env) {
  await env.DB.prepare('DELETE FROM secretos WHERE clave = ?').bind(CLAVE_SECRETO).run();
}

/** Lo que el panel puede ver (nunca la contraseña). */
export const configPublica = (cfg) => (cfg ? { configurado: true, usuario: cfg.usuario, remitente: cfg.remitente } : { configurado: false });

function servidor(env) {
  return {
    host: env.SMTP_HOST || 'smtp.gmail.com',
    puerto: Number(env.SMTP_PORT) || 465,
    tls: env.SMTP_TLS !== 'off',
  };
}

const dominioDe = (origen) => {
  try {
    return new URL(origen).hostname;
  } catch {
    return 'patagonia.local';
  }
};

/** Traduce los errores de Gmail a algo que el dueño del local entienda. */
export function mensajeErrorCorreo(e) {
  const texto = String(e?.message || e || '');
  if (e?.etapa === 'auth' || /5\.7\.8|Username and Password not accepted|BadCredentials/i.test(texto)) {
    return 'Gmail no aceptó el correo o la contraseña de aplicación. Revisa que la verificación en 2 pasos esté activa y que copiaste bien la clave de 16 letras.';
  }
  if (/5\.4\.5|sending limit|quota/i.test(texto)) {
    return 'Gmail llegó a su límite de envíos por hoy (unos 500 correos). Continúa mañana.';
  }
  if (e?.codigo >= 400 && e?.codigo < 500) return 'Gmail pidió esperar un poco antes de seguir enviando. Intenta de nuevo en unos minutos.';
  if (e?.etapa === 'conexion' || e?.etapa === 'saludo') return 'No se pudo conectar con Gmail. Intenta de nuevo en unos minutos.';
  return `Gmail respondió: ${texto.slice(0, 160)}`;
}

/** Prueba que el correo y la contraseña de aplicación funcionen (se conecta, inicia sesión y cierra). */
export async function probarCredenciales(env, cfg, origen) {
  const smtp = await abrirSmtp({ ...servidor(env), usuario: cfg.usuario, password: cfg.password, ehlo: dominioDe(origen) });
  await smtp.cerrar();
}

/**
 * Envía varios correos usando una sola conexión.
 * Si un destinatario es rechazado (error 5xx) se marca y se sigue con el resto.
 * Si Gmail corta o pide esperar, se detiene y lo informa en `error` (los no enviados quedan sin marcar).
 */
export async function enviarCorreos(env, cfg, mensajes, origen) {
  const resultados = [];
  if (!mensajes.length) return { resultados, error: null };
  let smtp;
  try {
    smtp = await abrirSmtp({ ...servidor(env), usuario: cfg.usuario, password: cfg.password, ehlo: dominioDe(origen) });
  } catch (e) {
    return { resultados, error: e };
  }
  let error = null;
  for (const m of mensajes) {
    try {
      const datos = construirMensaje({
        de: cfg.usuario,
        nombreDe: cfg.remitente,
        para: m.para,
        asunto: m.asunto,
        texto: m.texto,
        html: m.html,
        dominio: dominioDe(origen),
        cabeceras: m.cabeceras,
      });
      await smtp.enviar({ de: cfg.usuario, para: m.para, datos });
      resultados.push({ id: m.id, ok: true });
    } catch (e) {
      const permanente = e instanceof ErrorSmtp && e.codigo >= 500 && !/5\.4\.5|limit|quota/i.test(e.message) && e.etapa !== 'remitente';
      if (permanente) {
        resultados.push({ id: m.id, ok: false, motivo: e.message });
        continue;
      }
      error = e;
      break;
    }
  }
  await smtp.cerrar();
  return { resultados, error };
}

// ---------- Plantillas ----------

const C = {
  papel: '#fff1e2',
  tarjeta: '#fffaf3',
  tinta: '#210b22',
  tinta2: '#5e3f5c',
  linea: '#ecd3bf',
  ciruela: '#5b1f63',
  magenta: '#d2426f',
  coral: '#f27448',
  boina: '#f28c28',
  sol: '#ffc21a',
  crema: '#fdf0e3',
};
const FUENTE = "'Nunito','Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const FUENTE_TITULO = "'Alfa Slab One',Rockwell,'Roboto Slab',Georgia,serif";

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const parrafos = (texto) =>
  String(texto || '')
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.55;color:${C.tinta};">${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('');

const FRANJA = [C.ciruela, C.magenta, C.coral, C.boina, C.sol]
  .map((c) => `<td height="6" style="height:6px;background:${c};font-size:0;line-height:0;">&nbsp;</td>`)
  .join('');

function diseno({ origen, nombreLocal, preencabezado, titulo, cuerpo, boton, pie }) {
  const botonHtml = boton
    ? `<tr><td align="center" style="padding:6px 28px 28px;">
        <a href="${esc(boton.url)}" style="display:inline-block;background:${C.magenta};color:#ffffff;text-decoration:none;font-family:${FUENTE};font-weight:800;font-size:16px;line-height:1;padding:15px 28px;border:3px solid ${C.tinta};border-radius:999px;">${esc(boton.texto)}</a>
      </td></tr>`
    : '';
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"><title>${esc(titulo)}</title></head>
<body style="margin:0;padding:0;background:${C.papel};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(preencabezado)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.papel};"><tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:${C.tarjeta};border:3px solid ${C.tinta};border-radius:20px;">
    <tr><td align="center" style="padding:22px 24px 14px;">
      <img src="${esc(origen)}/brand/logo-correo.png" width="190" alt="${esc(nombreLocal)}" style="display:block;width:190px;max-width:60%;height:auto;border:0;">
    </td></tr>
    <tr><td style="padding:0 28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${FRANJA}</tr></table></td></tr>
    <tr><td style="padding:24px 28px 6px;font-family:${FUENTE};color:${C.tinta};">
      <h1 style="margin:0 0 14px;font-family:${FUENTE_TITULO};font-weight:400;font-size:27px;line-height:1.15;color:${C.ciruela};">${esc(titulo)}</h1>
      ${cuerpo}
    </td></tr>
    ${botonHtml}
  </table>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;"><tr><td align="center" style="padding:16px 24px 8px;font-family:${FUENTE};font-size:12px;line-height:1.6;color:${C.tinta2};">
    ${pie}
  </td></tr></table>
</td></tr></table>
</body></html>`;
}

function piePedido(aj) {
  const partes = [esc(aj.nombre)];
  if (aj.direccion) partes.push(esc(aj.direccion));
  if (aj.telefono) partes.push(esc(aj.telefono));
  return `${partes.join(' &middot; ')}<br>Te escribimos porque dejaste este correo al hacer tu pedido.`;
}

const PAGO = { efectivo: 'Efectivo', transferencia: 'Transferencia', tarjeta: 'Tarjeta (débito o crédito)' };
const LUGAR = { retiro: 'Retiro en el local', delivery: 'Delivery', mesa: 'En la mesa' };

function tablaPedido(pedido, items) {
  const filas = items
    .map(
      (i) => `<tr>
        <td valign="top" width="34" style="width:34px;padding:7px 6px 7px 0;font-family:${FUENTE};font-size:15px;font-weight:800;color:${C.magenta};white-space:nowrap;">${i.cantidad}&times;</td>
        <td valign="top" style="padding:7px 8px;font-family:${FUENTE};font-size:15px;line-height:1.4;color:${C.tinta};">${esc(i.nombre)}${
          i.acompanamiento ? `<br><span style="font-size:13px;color:${C.tinta2};">Con ${esc(i.acompanamiento)}</span>` : ''
        }${i.comentario ? `<br><span style="font-size:13px;color:${C.tinta2};font-style:italic;">&ldquo;${esc(i.comentario)}&rdquo;</span>` : ''}</td>
        <td valign="top" align="right" style="padding:7px 0 7px 8px;font-family:${FUENTE};font-size:15px;color:${C.tinta};white-space:nowrap;">${clp(i.total)}</td>
      </tr>`,
    )
    .join('');
  const fila = (etiqueta, valor, fuerte = false) =>
    `<tr><td colspan="2" style="padding:4px 8px 4px 0;font-family:${FUENTE};font-size:${fuerte ? 17 : 14}px;font-weight:${fuerte ? 800 : 400};color:${C.tinta};">${etiqueta}</td><td align="right" style="padding:4px 0;font-family:${FUENTE};font-size:${fuerte ? 17 : 14}px;font-weight:${fuerte ? 800 : 400};color:${C.tinta};white-space:nowrap;">${valor}</td></tr>`;
  const totales = [
    pedido.costo_envio || pedido.descuento ? fila('Subtotal', clp(pedido.subtotal)) : '',
    pedido.costo_envio ? fila('Envío', clp(pedido.costo_envio)) : '',
    pedido.descuento ? fila(`Descuento (${esc(pedido.cupon)})`, `&minus;${clp(pedido.descuento)}`) : '',
    fila('Total', clp(pedido.total), true),
  ].join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 16px;border-top:2px dashed ${C.linea};border-bottom:2px dashed ${C.linea};">
    ${filas}
    <tr><td colspan="3" style="padding:0;border-top:1px solid ${C.linea};font-size:0;line-height:0;">&nbsp;</td></tr>
    ${totales}
  </table>`;
}

function datoCaja(etiqueta, valor) {
  return `<p style="margin:0 0 10px;font-size:14px;line-height:1.5;color:${C.tinta2};"><strong style="color:${C.tinta};">${esc(etiqueta)}:</strong> ${valor}</p>`;
}

/** Correo de un pedido. evento: 'recibido' | 'listo' | 'cancelado'. */
export function correoPedido({ pedido, items, aj, origen, evento }) {
  const n = `#${pedido.id}`;
  const primerNombre = String(pedido.cliente_nombre || '').split(' ')[0];
  const hola = primerNombre ? `Hola ${primerNombre}` : 'Hola';
  const linkPedido = `${origen}/#/pedido/${pedido.token}`;
  const lugar = pedido.tipo === 'delivery' ? `Delivery a ${esc(pedido.direccion)}` : pedido.tipo === 'mesa' ? `Mesa ${pedido.mesa}` : `Retiro en el local${aj.direccion ? `: ${esc(aj.direccion)}` : ''}`;
  let asunto;
  let titulo;
  let intro;
  let extra = '';
  let boton = { texto: 'Seguir mi pedido', url: linkPedido };

  if (evento === 'recibido') {
    asunto = `Recibimos tu pedido ${n}`;
    titulo = `Recibimos tu pedido ${n}`;
    const cuando = pedido.tipo === 'delivery' ? 'salga a tu dirección' : 'esté listo para retirar';
    const plazo = pedido.programado
      ? `Lo tendremos ${pedido.tipo === 'delivery' ? 'en tu dirección cerca' : 'listo'} de las ${pedido.programado}, como lo pediste.`
      : `Tiempo estimado: unos ${aj.tiempoPreparacion} minutos.`;
    intro = `${hola}, gracias por pedir en ${aj.nombre}. ${pedido.programado ? 'Quedó agendado' : 'Ya estamos en eso'}: te escribimos de nuevo apenas tu pedido ${cuando}.\n\n${plazo}`;
    extra =
      tablaPedido(pedido, items) +
      datoCaja('Entrega', lugar) +
      datoCaja('Pago', `${esc(PAGO[pedido.metodo_pago] || pedido.metodo_pago)}${pedido.metodo_pago === 'transferencia' ? '' : pedido.tipo === 'delivery' ? ' al recibir' : ' al retirar'}`) +
      (pedido.metodo_pago === 'transferencia' && aj.datosTransferencia
        ? `<div style="margin:4px 0 14px;padding:12px 14px;background:${C.crema};border:2px solid ${C.tinta};border-radius:12px;font-size:14px;line-height:1.5;color:${C.tinta};"><strong>Datos para transferir</strong><br>${esc(aj.datosTransferencia).replace(/\n/g, '<br>')}</div>`
        : '') +
      (pedido.notas ? datoCaja('Tus notas', esc(pedido.notas)) : '');
  } else if (evento === 'listo') {
    if (pedido.tipo === 'delivery') {
      asunto = `Tu pedido ${n} va en camino`;
      titulo = 'Tu pedido va en camino';
      intro = `${hola}, tu pedido ${n} ya salió del local y va camino a ${pedido.direccion || 'tu dirección'}. Atento, que ya llega.`;
    } else if (pedido.tipo === 'mesa') {
      asunto = `Tu pedido ${n} está listo`;
      titulo = 'Tu pedido está listo';
      intro = `${hola}, tu pedido ${n} ya va camino a tu mesa.`;
    } else {
      asunto = `Tu pedido ${n} está listo para retirar`;
      titulo = 'Tu pedido está listo';
      intro = `${hola}, tu pedido ${n} ya está listo. Puedes pasar a retirarlo${aj.direccion ? ` en ${aj.direccion}` : ''}.`;
    }
    extra = datoCaja('Total', `<strong style="color:${C.tinta};">${clp(pedido.total)}</strong> &middot; ${esc(PAGO[pedido.metodo_pago] || '')}`);
    boton = { texto: 'Ver mi pedido', url: linkPedido };
  } else if (evento === 'cancelado') {
    asunto = `Tu pedido ${n} fue cancelado`;
    titulo = 'Tu pedido fue cancelado';
    intro = `${hola}, lo sentimos: tuvimos que cancelar tu pedido ${n}.${pedido.motivo_cancelacion ? `\n\nMotivo: ${pedido.motivo_cancelacion}` : ''}\n\nSi tienes dudas, contáctanos y lo vemos.`;
    boton = aj.whatsapp
      ? { texto: 'Escribir por WhatsApp', url: `https://wa.me/${aj.whatsapp}?text=${encodeURIComponent(`Hola, consulto por mi pedido ${n}`)}` }
      : { texto: 'Ver el menú', url: `${origen}/` };
  } else {
    return null;
  }

  const html = diseno({
    origen,
    nombreLocal: aj.nombre,
    preencabezado: intro.split('\n')[0],
    titulo,
    cuerpo: parrafos(intro) + extra,
    boton,
    pie: piePedido(aj),
  });

  const lineasTexto = [titulo, '', intro, ''];
  if (evento === 'recibido') {
    for (const i of items) lineasTexto.push(`${i.cantidad} x ${i.nombre}${i.acompanamiento ? ` (con ${i.acompanamiento})` : ''}  ${clp(i.total)}`);
    if (pedido.descuento) lineasTexto.push(`Descuento (${pedido.cupon}): -${clp(pedido.descuento)}`);
    if (pedido.costo_envio) lineasTexto.push(`Envío: ${clp(pedido.costo_envio)}`);
    lineasTexto.push(`Total: ${clp(pedido.total)}`, `Pago: ${PAGO[pedido.metodo_pago] || pedido.metodo_pago}`, '');
    if (pedido.metodo_pago === 'transferencia' && aj.datosTransferencia) lineasTexto.push('Datos para transferir:', aj.datosTransferencia, '');
  }
  lineasTexto.push(`${boton.texto}: ${boton.url}`, '', `${aj.nombre}${aj.direccion ? ` · ${aj.direccion}` : ''}`);

  return { asunto: `${asunto} · ${aj.nombre}`, html, texto: lineasTexto.join('\n') };
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export function fechaLarga(iso) {
  const [, m, d] = String(iso).split('-').map(Number);
  return m && d ? `${d} de ${MESES[m - 1]}` : String(iso);
}

/** "15% de descuento" / "$3.000 de descuento" + condiciones. */
export function resumenCupon(c) {
  const base = c.tipo === 'porcentaje' ? `${c.valor}% de descuento` : `${clp(c.valor)} de descuento`;
  const condiciones = [];
  if (c.minimo) condiciones.push(`en compras desde ${clp(c.minimo)}`);
  if (c.hasta) condiciones.push(`válido hasta el ${fechaLarga(c.hasta)}`);
  if (c.uno_por_cliente) condiciones.push('una vez por cliente');
  return { base, condiciones };
}

/** Correo de una promoción (con enlace para darse de baja). */
export function correoPromo({ promo, cupon, aj, origen, tokenBaja }) {
  const linkBaja = `${origen}/#/baja/${tokenBaja}`;
  const linkMenu = `${origen}/${promo.cupon ? `?cupon=${encodeURIComponent(promo.cupon)}` : ''}`;
  let cuponHtml = '';
  let cuponTexto = '';
  if (promo.cupon) {
    const r = cupon ? resumenCupon(cupon) : null;
    cuponHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 18px;"><tr><td align="center" style="padding:16px 12px;background:${C.crema};border:3px dashed ${C.magenta};border-radius:16px;">
      <div style="font-family:${FUENTE};font-size:12px;letter-spacing:2px;text-transform:uppercase;font-weight:800;color:${C.tinta2};">Tu código</div>
      <div style="font-family:${FUENTE_TITULO};font-size:30px;line-height:1.2;letter-spacing:2px;color:${C.ciruela};padding:4px 0;">${esc(promo.cupon)}</div>
      ${r ? `<div style="font-family:${FUENTE};font-size:15px;font-weight:800;color:${C.tinta};">${esc(r.base)}</div>${r.condiciones.length ? `<div style="font-family:${FUENTE};font-size:13px;color:${C.tinta2};padding-top:2px;">${esc(r.condiciones.join(' · '))}</div>` : ''}` : ''}
    </td></tr></table>`;
    cuponTexto = `\nTu código: ${promo.cupon}${r ? ` (${[r.base, ...r.condiciones].join(', ')})` : ''}\n`;
  }
  const html = diseno({
    origen,
    nombreLocal: aj.nombre,
    preencabezado: promo.mensaje.split('\n')[0].slice(0, 120),
    titulo: promo.titulo,
    cuerpo: parrafos(promo.mensaje) + cuponHtml,
    boton: { texto: promo.cupon ? 'Pedir con mi código' : 'Ver el menú', url: linkMenu },
    pie: `${esc(aj.nombre)}${aj.direccion ? ` &middot; ${esc(aj.direccion)}` : ''}<br>Recibes este correo porque aceptaste recibir promociones al hacer un pedido.<br><a href="${esc(linkBaja)}" style="color:${C.tinta2};text-decoration:underline;">No quiero recibir más promociones</a>`,
  });
  const texto = [promo.titulo, '', promo.mensaje, cuponTexto, `Pide aquí: ${linkMenu}`, '', '--', aj.nombre, `Para no recibir más promociones: ${linkBaja}`].join('\n');
  return {
    asunto: promo.titulo,
    html,
    texto,
    cabeceras: {
      'List-Unsubscribe': `<${origen}/api/promos/baja?t=${tokenBaja}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  };
}

/** Correo de prueba para el dueño del local. */
export function correoPrueba({ aj, origen }) {
  const titulo = 'El correo del local ya funciona';
  const intro = `Desde ahora, cuando un cliente deje su correo al pedir, le escribiremos desde esta cuenta: cuando recibamos su pedido, cuando esté listo y si se cancela.

Las promociones que envíes desde el panel también saldrán desde aquí.`;
  const html = diseno({
    origen,
    nombreLocal: aj.nombre,
    preencabezado: 'Prueba de correo de tu panel',
    titulo,
    cuerpo: parrafos(intro),
    boton: { texto: 'Ver el menú', url: `${origen}/` },
    pie: `${esc(aj.nombre)} &middot; Correo de prueba enviado desde el panel del local.`,
  });
  return { asunto: `Prueba de correo · ${aj.nombre}`, html, texto: `${titulo}

${intro}

${origen}/` };
}

/**
 * Avisa al cliente por correo sobre su pedido (si dejó correo y el local configuró Gmail).
 * Pensado para ctx.waitUntil: nunca lanza errores.
 */
export async function avisarPorCorreo(env, pedido, evento, origen, items = null) {
  try {
    if (!pedido?.cliente_email) return { enviado: false };
    const cfg = await leerConfigCorreo(env);
    if (!cfg) return { enviado: false };
    const aj = await leerAjustes(env);
    const lista =
      items ||
      (await env.DB.prepare('SELECT * FROM pedido_items WHERE pedido_id = ? ORDER BY id').bind(pedido.id).all()).results.map((i) =>
        i.persona ? { ...i, nombre: `${i.nombre} (${i.persona})` } : i,
      );
    const correo = correoPedido({ pedido, items: lista, aj, origen, evento });
    if (!correo) return { enviado: false };
    const { resultados, error } = await enviarCorreos(env, cfg, [{ id: pedido.id, para: pedido.cliente_email, ...correo }], origen);
    if (error) console.error('Correo de pedido no enviado:', error.message);
    return { enviado: Boolean(resultados[0]?.ok) };
  } catch (e) {
    console.error('avisarPorCorreo', e?.message || e);
    return { enviado: false };
  }
}
