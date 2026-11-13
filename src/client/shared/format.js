// Formatos chilenos: pesos, horas, fechas y textos de estados.

export const ZONA = 'America/Santiago';
const pesos = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
export const clp = (n) => pesos.format(Math.round(n || 0));

export const hora = (iso) =>
  new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: ZONA });

export const fechaHora = (iso) =>
  new Date(iso).toLocaleString('es-CL', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: ZONA,
  });

/** "2026-11-13" → "vie 13 nov" */
export function fechaCorta(yyyyMmDd) {
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('es-CL', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

export function minutosDesde(iso, ahora = Date.now()) {
  return Math.max(0, Math.floor((ahora - new Date(iso).getTime()) / 60000));
}

export function hace(iso, ahora = Date.now()) {
  const min = minutosDesde(iso, ahora);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h${min % 60 ? ` ${min % 60} min` : ''}`;
  return fechaHora(iso);
}

export const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

export const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
export const DIAS_LETRA = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

export const TIPOS = {
  retiro: { nombre: 'Retiro en el local', corto: 'Retiro' },
  delivery: { nombre: 'Delivery a domicilio', corto: 'Delivery' },
  mesa: { nombre: 'En la mesa', corto: 'Mesa' },
};

export const PAGOS = {
  efectivo: { nombre: 'Efectivo', detalle: 'Pagas al recibir o retirar' },
  transferencia: { nombre: 'Transferencia', detalle: 'Te mostramos los datos al confirmar' },
  tarjeta: { nombre: 'Tarjeta', detalle: 'Débito o crédito al recibir o retirar' },
};

export const ESTADOS = {
  pendiente: { nombre: 'Nuevo', clase: 'brand' },
  preparando: { nombre: 'En preparación', clase: 'warn' },
  listo: { nombre: 'Listo', clase: 'ok' },
  entregado: { nombre: 'Entregado', clase: 'info' },
  cancelado: { nombre: 'Cancelado', clase: 'bad' },
};

/** Para buscar sin importar tildes ni mayúsculas. */
export const normalizar = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** Link de WhatsApp a un número chileno (acepta 9 dígitos o con 56). */
export function linkWhatsapp(numero, texto) {
  let n = String(numero || '').replace(/\D/g, '');
  if (!n) return null;
  if (n.length === 9 && n.startsWith('9')) n = `56${n}`;
  return `https://wa.me/${n}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`;
}

// ---------- Correo ----------
export const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,24}$/i;

const DOMINIOS_COMUNES = [
  'gmail.com', 'hotmail.com', 'hotmail.cl', 'hotmail.es', 'outlook.com', 'outlook.cl', 'outlook.es',
  'live.com', 'live.cl', 'yahoo.com', 'yahoo.es', 'icloud.com', 'me.com',
];

function distancia(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** "ana@gmial.con" → "ana@gmail.com" (para los errores de tipeo más comunes). */
export function sugerirCorreo(email) {
  const m = /^([^@\s]+)@([^@\s]+)$/.exec(String(email || '').trim().toLowerCase());
  if (!m) return null;
  const [, usuario, dominio] = m;
  if (DOMINIOS_COMUNES.includes(dominio)) return null;
  let mejor = null;
  let menor = 3;
  for (const c of DOMINIOS_COMUNES) {
    const x = distancia(dominio, c);
    if (x < menor) {
      menor = x;
      mejor = c;
    }
  }
  return mejor ? `${usuario}@${mejor}` : null;
}

// ---------- Códigos de descuento ----------
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export function fechaLarga(iso) {
  const [, m, d] = String(iso || '').split('-').map(Number);
  return m && d ? `${d} de ${MESES[m - 1]}` : '';
}

/** Igual que en el servidor: "15% de descuento · en compras desde $10.000 · válido hasta el 30 de noviembre". */
export function resumenCupon(c) {
  if (!c?.valor) return '';
  const partes = [c.tipo === 'monto' ? `${clp(c.valor)} de descuento` : `${c.valor}% de descuento`];
  if (c.minimo) partes.push(`en compras desde ${clp(c.minimo)}`);
  if (c.hasta) partes.push(`válido hasta el ${fechaLarga(c.hasta)}`);
  if (c.unoPorCliente) partes.push('una vez por cliente');
  return partes.join(' · ');
}

export const ESTADOS_CUPON = {
  vigente: { nombre: 'Vigente', clase: 'ok' },
  programado: { nombre: 'Programado', clase: 'info' },
  agotado: { nombre: 'Agotado', clase: 'warn' },
  vencido: { nombre: 'Vencido', clase: 'bad' },
  pausado: { nombre: 'Pausado', clase: 'plum' },
};
