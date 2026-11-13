// Códigos de descuento: validación y cálculo (lo usan el carro del cliente y la creación del pedido).
import { HttpError } from './http.js';
import { horaChile } from './time.js';
import { clp } from './util.js';
import { fechaLarga, resumenCupon } from './correo.js';

export const CODIGO_RE = /^[A-Z0-9][A-Z0-9_-]{2,19}$/;
export const normalizarCodigo = (v) =>
  String(v ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');

export function calcularDescuento(c, subtotal) {
  if (c.tipo === 'porcentaje') return Math.min(subtotal, Math.round((subtotal * c.valor) / 100));
  return Math.min(c.valor, subtotal);
}

const ultimos9 = (tel) => String(tel || '').replace(/\D/g, '').slice(-9);

/** Estado del código en una fecha (para el panel). */
export function estadoCupon(c, hoy = horaChile().fecha) {
  if (!c.activo) return 'pausado';
  if (c.hasta && hoy > c.hasta) return 'vencido';
  if (c.max_usos !== null && c.usos >= c.max_usos) return 'agotado';
  if (c.desde && hoy < c.desde) return 'programado';
  return 'vigente';
}

export function cuponPublico(c, descuento) {
  const r = resumenCupon(c);
  return {
    codigo: c.codigo,
    tipo: c.tipo,
    valor: c.valor,
    minimo: c.minimo,
    descripcion: c.descripcion,
    resumen: [r.base, ...r.condiciones].join(' · '),
    descuento,
  };
}

/**
 * Revisa si el código se puede usar con este subtotal (y este cliente, si se conoce).
 * Devuelve { cupon, codigo, descuento } o lanza HttpError con un mensaje claro para el cliente.
 */
export async function evaluarCupon(env, codigoIngresado, { subtotal, telefono = '', email = '', ahora = horaChile() }) {
  const codigo = normalizarCodigo(codigoIngresado);
  if (!codigo) throw new HttpError(400, 'Escribe tu código de descuento.', { campo: 'cupon' });
  const noExiste = () => new HttpError(404, `El código ${codigo.slice(0, 20)} no existe. Revisa que esté bien escrito.`, { campo: 'cupon' });
  if (!CODIGO_RE.test(codigo)) throw noExiste();
  const c = await env.DB.prepare('SELECT * FROM cupones WHERE codigo = ?').bind(codigo).first();
  if (!c || !c.activo) throw noExiste();
  if (c.desde && ahora.fecha < c.desde) {
    throw new HttpError(409, `El código ${codigo} se puede usar desde el ${fechaLarga(c.desde)}.`, { campo: 'cupon' });
  }
  if (c.hasta && ahora.fecha > c.hasta) throw new HttpError(409, `El código ${codigo} ya venció.`, { campo: 'cupon' });
  if (c.max_usos !== null && c.usos >= c.max_usos) throw new HttpError(409, `El código ${codigo} ya se agotó.`, { campo: 'cupon' });
  if (subtotal < c.minimo) {
    throw new HttpError(409, `El código ${codigo} es para compras desde ${clp(c.minimo)}. Te faltan ${clp(c.minimo - subtotal)}.`, {
      campo: 'cupon',
      minimo: c.minimo,
    });
  }
  if (c.uno_por_cliente) {
    const tel = ultimos9(telefono);
    const correo = String(email || '').toLowerCase();
    if (tel.length >= 8 || correo) {
      const { results } = await env.DB.prepare(
        "SELECT cliente_telefono, cliente_email FROM pedidos WHERE cupon = ? AND eliminado = 0 AND estado != 'cancelado'",
      )
        .bind(codigo)
        .all();
      const yaLoUso = results.some(
        (r) => (tel.length >= 8 && ultimos9(r.cliente_telefono) === tel) || (correo && r.cliente_email === correo),
      );
      if (yaLoUso) throw new HttpError(409, `Ya usaste el código ${codigo}. Es válido una vez por cliente.`, { campo: 'cupon' });
    }
  }
  return { cupon: c, codigo, descuento: calcularDescuento(c, subtotal) };
}
