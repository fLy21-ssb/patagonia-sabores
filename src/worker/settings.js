// Ajustes del local: valores por defecto, lectura desde D1 y saneamiento.
import { texto, bool } from './util.js';

const HORARIO_DEFAULT = Array.from({ length: 7 }, () => ({ abierto: true, desde: '09:00', hasta: '23:00' }));

export const AJUSTES_DEFAULT = {
  nombre: 'Patagonia Sabores',
  eslogan: 'Comida casera con sabor del sur',
  telefono: '',
  whatsapp: '',
  direccion: '',
  instagram: '',
  aviso: '¡Ahora puedes pedir online! Retira en el local o pide delivery.',
  recibiendoPedidos: true,
  mensajePausa: 'Estamos con muchos pedidos. Vuelve a intentarlo en unos minutos.',
  tiempoPreparacion: 25,
  tipos: { retiro: true, delivery: true, mesa: false }, // pedidos en la mesa: listos para cuando tengan mesas
  programar: true, // el cliente puede elegir una hora más tarde (mismo día)
  grupos: true, // pedidos grupales: cada uno elige lo suyo desde un enlace compartido
  delivery: { costo: 2000, minimo: 8000, zona: 'Consulta por WhatsApp si llegamos a tu sector.' },
  pagos: { efectivo: true, transferencia: true, tarjeta: true },
  datosTransferencia: '',
  horario: HORARIO_DEFAULT,
  ticketAncho: 80,
};

function t(valor, max, opciones) {
  try {
    return texto(valor, max, opciones);
  } catch {
    return '';
  }
}

function entre(valor, min, max, def) {
  const n = Number(valor);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : def;
}

const boolO = (v, def) => (v === undefined || v === null ? def : bool(v));

function hhmm(valor, def) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(valor || ''));
  if (!m) return def;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return def;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

/** Devuelve ajustes completos y válidos a partir de cualquier objeto (guardado o enviado por el panel). */
export function normalizarAjustes(raw) {
  const d = AJUSTES_DEFAULT;
  const r = raw && typeof raw === 'object' ? raw : {};
  const tipos = r.tipos || {};
  const delivery = r.delivery || {};
  const pagos = r.pagos || {};
  const horario = Array.isArray(r.horario) && r.horario.length === 7 ? r.horario : d.horario;

  const resultado = {
    nombre: t(r.nombre ?? d.nombre, 60) || d.nombre,
    eslogan: t(r.eslogan ?? d.eslogan, 120),
    telefono: t(r.telefono, 25),
    whatsapp: String(r.whatsapp ?? '').replace(/\D/g, '').slice(0, 15),
    direccion: t(r.direccion, 160),
    instagram: t(r.instagram, 40).replace(/^@+/, '').replace(/[^\w.]/g, ''),
    aviso: t(r.aviso ?? d.aviso, 200),
    recibiendoPedidos: boolO(r.recibiendoPedidos, d.recibiendoPedidos),
    mensajePausa: t(r.mensajePausa ?? d.mensajePausa, 160),
    tiempoPreparacion: entre(r.tiempoPreparacion, 5, 180, d.tiempoPreparacion),
    tipos: {
      retiro: boolO(tipos.retiro, d.tipos.retiro),
      delivery: boolO(tipos.delivery, d.tipos.delivery),
      mesa: boolO(tipos.mesa, d.tipos.mesa),
    },
    programar: boolO(r.programar, d.programar),
    grupos: boolO(r.grupos, d.grupos),
    delivery: {
      costo: entre(delivery.costo, 0, 100_000, d.delivery.costo),
      minimo: entre(delivery.minimo, 0, 1_000_000, d.delivery.minimo),
      zona: t(delivery.zona ?? d.delivery.zona, 200),
    },
    pagos: {
      efectivo: boolO(pagos.efectivo, true),
      transferencia: boolO(pagos.transferencia, true),
      tarjeta: boolO(pagos.tarjeta, true),
    },
    datosTransferencia: t(r.datosTransferencia, 400, { multilinea: true }),
    horario: horario.map((h, i) => ({
      abierto: boolO(h?.abierto, d.horario[i].abierto),
      desde: hhmm(h?.desde, d.horario[i].desde),
      hasta: hhmm(h?.hasta, d.horario[i].hasta),
    })),
    ticketAncho: Number(r.ticketAncho) === 58 ? 58 : 80,
  };
  // Siempre debe quedar al menos un tipo de pedido y un medio de pago disponible.
  if (!Object.values(resultado.tipos).some(Boolean)) resultado.tipos.retiro = true;
  if (!Object.values(resultado.pagos).some(Boolean)) resultado.pagos.efectivo = true;
  return resultado;
}

export function parsearAjustes(datos) {
  try {
    return normalizarAjustes(JSON.parse(datos || '{}'));
  } catch {
    return normalizarAjustes({});
  }
}

export async function leerAjustes(env) {
  const row = await env.DB.prepare('SELECT datos FROM ajustes WHERE id = 1').first();
  return parsearAjustes(row?.datos);
}

export async function guardarAjustes(env, ajustes) {
  const limpio = normalizarAjustes(ajustes);
  await env.DB.prepare(
    `INSERT INTO ajustes (id, datos, actualizado) VALUES (1, ?1, ?2)
     ON CONFLICT(id) DO UPDATE SET datos = excluded.datos, actualizado = excluded.actualizado`,
  )
    .bind(JSON.stringify(limpio), new Date().toISOString())
    .run();
  return limpio;
}

/** Lo que ve el cliente (todo menos detalles internos como el ancho del ticket). */
export function ajustesPublicos(a) {
  const { ticketAncho, mensajePausa, recibiendoPedidos, ...resto } = a;
  return resto;
}
