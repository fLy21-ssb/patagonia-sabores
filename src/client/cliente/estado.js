// Estado del cliente: carro, datos recordados, pedidos hechos en este dispositivo y mesa (QR).
import { crearStore } from '../shared/store.js';

export const carrito = crearStore('ps-carrito-v1', []);
export const misDatos = crearStore('ps-datos-v1', { nombre: '', telefono: '', email: '', direccion: '', recordar: true });
/** Código de descuento que llegó en una promo (enlace ?cupon=...): se aplica solo al pagar. */
export const cuponGuardado = crearStore('ps-cupon-v1', null);
export const misPedidos = crearStore('ps-pedidos-v1', []);
export const mesaActual = crearStore('ps-mesa-v1', null, { tipo: 'session' });
export const instalarDescartado = crearStore('ps-instalar-cerrado-v1', false);

const claveLinea = (productoId, acompanamientoId, comentario) =>
  `${productoId}|${acompanamientoId ?? ''}|${comentario.trim().toLowerCase()}`;

export function agregarAlCarrito(producto, { cantidad = 1, acompanamiento = null, comentario = '' } = {}) {
  const clave = claveLinea(producto.id, acompanamiento?.id, comentario);
  carrito.set((lineas) => {
    const i = lineas.findIndex((l) => l.clave === clave);
    if (i >= 0) {
      const copia = [...lineas];
      copia[i] = { ...copia[i], cantidad: Math.min(30, copia[i].cantidad + cantidad) };
      return copia;
    }
    return [
      ...lineas,
      {
        clave,
        productoId: producto.id,
        nombre: producto.nombre,
        precio: producto.precio,
        cantidad,
        acompanamientoId: acompanamiento?.id ?? null,
        acompanamiento: acompanamiento?.nombre || '',
        comentario: comentario.trim(),
      },
    ];
  });
}

export function cambiarCantidad(clave, cantidad) {
  carrito.set((lineas) =>
    cantidad <= 0 ? lineas.filter((l) => l.clave !== clave) : lineas.map((l) => (l.clave === clave ? { ...l, cantidad } : l)),
  );
}

export const unidades = (lineas) => lineas.reduce((n, l) => n + l.cantidad, 0);

/** Usa el precio vigente del menú (por si cambió desde que se agregó). */
export const precioDe = (linea, productosPorId) => productosPorId?.get(linea.productoId)?.precio ?? linea.precio;
export const totalCarrito = (lineas, productosPorId) =>
  lineas.reduce((n, l) => n + precioDe(l, productosPorId) * l.cantidad, 0);

/**
 * Quita del carro lo que ya no se puede pedir hoy (producto pausado, agotado o de otro día).
 * Devuelve los nombres quitados.
 */
export function limpiarCarrito(menu) {
  const bitHoy = 1 << menu.estado.dow;
  const porId = new Map(menu.productos.map((p) => [p.id, p]));
  const quitados = [];
  carrito.set((lineas) =>
    lineas.filter((l) => {
      const p = porId.get(l.productoId);
      const ok = p && !p.agotado && p.dias & bitHoy;
      if (!ok) quitados.push(l.nombre);
      return ok;
    }),
  );
  return quitados;
}

export function recordarPedido(p) {
  misPedidos.set((l) => [p, ...l.filter((x) => x.token !== p.token)].slice(0, 25));
}

/** Mismo cálculo que el servidor (el servidor siempre tiene la última palabra). */
export function descuentoDe(cupon, subtotal) {
  if (!cupon || subtotal < (cupon.minimo || 0)) return 0;
  if (cupon.tipo === 'porcentaje') return Math.min(subtotal, Math.round((subtotal * cupon.valor) / 100));
  return Math.min(cupon.valor, subtotal);
}
