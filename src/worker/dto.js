// Conversión de filas de la base de datos a objetos de la API.

export const imagenUrl = (clave) => (clave ? `/img/${clave}` : null);

/** Crédito de la foto (solo fotos de referencia con licencia libre; las propias no llevan). */
const creditoFoto = (p) => (p.imagen && p.imagen_credito ? p.imagen_credito : '');
const fuenteFoto = (p) => (p.imagen && /^https:\/\//.test(p.imagen_fuente || '') ? p.imagen_fuente : '');

export function productoDTO(p) {
  return {
    id: p.id,
    nombre: p.nombre,
    descripcion: p.descripcion,
    precio: p.precio,
    categoriaId: p.categoria_id,
    stock: p.stock,
    imagen: imagenUrl(p.imagen),
    imagenClave: p.imagen,
    imagenCredito: creditoFoto(p),
    imagenFuente: fuenteFoto(p),
    conAcompanamiento: Boolean(p.con_acompanamiento),
    dias: p.dias,
    destacado: Boolean(p.destacado),
    activo: Boolean(p.activo),
    orden: p.orden,
  };
}

/** Para clientes: sin stock exacto, solo si está agotado o quedan pocos. */
export function productoPublicoDTO(p) {
  return {
    id: p.id,
    nombre: p.nombre,
    descripcion: p.descripcion,
    precio: p.precio,
    categoriaId: p.categoria_id,
    imagen: imagenUrl(p.imagen),
    imagenCredito: creditoFoto(p),
    imagenFuente: fuenteFoto(p),
    conAcompanamiento: Boolean(p.con_acompanamiento),
    dias: p.dias,
    destacado: Boolean(p.destacado),
    agotado: p.stock !== null && p.stock <= 0,
    quedan: p.stock !== null && p.stock > 0 && p.stock <= 5 ? p.stock : null,
  };
}

export function itemDTO(i) {
  return {
    id: i.id,
    productoId: i.producto_id,
    nombre: i.nombre,
    precio: i.precio,
    cantidad: i.cantidad,
    acompanamiento: i.acompanamiento,
    comentario: i.comentario,
    total: i.total,
  };
}

export function pedidoDTO(p, items = []) {
  return {
    id: p.id,
    token: p.token,
    estado: p.estado,
    tipo: p.tipo,
    mesa: p.mesa,
    cliente: { nombre: p.cliente_nombre, telefono: p.cliente_telefono, email: p.cliente_email || '' },
    direccion: p.direccion,
    notas: p.notas,
    metodoPago: p.metodo_pago,
    subtotal: p.subtotal,
    costoEnvio: p.costo_envio,
    cupon: p.cupon || '',
    descuento: p.descuento || 0,
    total: p.total,
    motivoCancelacion: p.motivo_cancelacion,
    eliminado: Boolean(p.eliminado),
    fechaLocal: p.fecha_local,
    creado: p.creado,
    actualizado: p.actualizado,
    tiempos: {
      preparando: p.preparando_en,
      listo: p.listo_en,
      entregado: p.entregado_en,
      cancelado: p.cancelado_en,
    },
    items: items.map(itemDTO),
  };
}

/** Lo que ve el cliente en el seguimiento: un pedido eliminado por el local se muestra como cancelado. */
export function pedidoPublicoDTO(p, items = []) {
  const dto = pedidoDTO(p, items);
  delete dto.eliminado;
  if (p.eliminado && p.estado !== 'entregado') dto.estado = 'cancelado';
  return dto;
}
