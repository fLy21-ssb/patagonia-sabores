// Estado global del panel: sesión, ajustes, tablero de pedidos en vivo y preferencias de este dispositivo.
import { api } from '../shared/api.js';
import { crearStore } from '../shared/store.js';

export const sesion = crearStore('sesion', { estado: 'verificando' }, { tipo: 'memoria' });
export const ajustesStore = crearStore('ajustes', null, { tipo: 'memoria' });
export const tablero = crearStore(
  'tablero',
  { lista: [], cursor: null, cargado: false, hoy: null, ultimoCompleto: 0, conocidos: new Set(), error: null },
  { tipo: 'memoria' },
);
export const preferencias = crearStore('ps-panel-prefs-v1', { sonido: true, repetir: true, autoImprimir: false, vista: 'nuevos' });

/** Llama a la API del panel; si la sesión expiró, vuelve a la pantalla de ingreso. */
export async function apiAdmin(path, opciones = {}) {
  try {
    return await api(path, { ...opciones, admin: true });
  } catch (e) {
    if (e.status === 401 && !path.endsWith('/login')) sesion.set({ estado: 'fuera' });
    throw e;
  }
}

export async function cargarAjustes() {
  const { ajustes } = await apiAdmin('/api/admin/ajustes');
  ajustesStore.set(ajustes);
  return ajustes;
}

export async function guardarAjustes(cambios) {
  const actual = ajustesStore.get() || (await cargarAjustes());
  const { ajustes } = await apiAdmin('/api/admin/ajustes', { method: 'PUT', body: { ...actual, ...cambios } });
  ajustesStore.set(ajustes);
  return ajustes;
}

const ACTIVOS = ['pendiente', 'preparando', 'listo'];

/**
 * Sincroniza el tablero. Cada 5 min hace una carga completa; entremedio pide solo lo que cambió.
 * Devuelve los pedidos nuevos (para sonar/avisar/imprimir).
 */
export async function sincronizarTablero() {
  const s = tablero.get();
  const completo = !s.cursor || Date.now() - s.ultimoCompleto > 5 * 60_000;
  const url = completo ? '/api/admin/tablero' : `/api/admin/tablero?since=${encodeURIComponent(s.cursor)}`;
  const r = await apiAdmin(url);
  const mapa = completo ? new Map() : new Map(s.lista.map((p) => [p.id, p]));
  for (const p of r.pedidos) mapa.set(p.id, p);
  const lista = [...mapa.values()]
    .filter((p) => !p.eliminado && (ACTIVOS.includes(p.estado) || p.fechaLocal === r.hoy))
    .sort((a, b) => a.id - b.id);
  const nuevos = s.cargado ? lista.filter((p) => !s.conocidos.has(p.id) && p.estado === 'pendiente') : [];
  const conocidos = new Set(s.conocidos);
  lista.forEach((p) => conocidos.add(p.id));
  tablero.set({
    lista,
    cursor: r.cursor,
    cargado: true,
    hoy: r.hoy,
    ultimoCompleto: completo ? Date.now() : s.ultimoCompleto,
    conocidos,
    error: null,
  });
  return nuevos;
}

/** Reemplaza un pedido en el tablero tras una acción (sin esperar la próxima sincronización). */
export function actualizarEnTablero(pedido) {
  tablero.set((s) => {
    const otros = s.lista.filter((p) => p.id !== pedido.id);
    const visible = !pedido.eliminado && (ACTIVOS.includes(pedido.estado) || pedido.fechaLocal === s.hoy);
    const lista = visible ? [...otros, pedido].sort((a, b) => a.id - b.id) : otros;
    const conocidos = new Set(s.conocidos);
    conocidos.add(pedido.id);
    return { ...s, lista, conocidos };
  });
}

export async function cambiarEstadoPedido(pedido, estado, motivo) {
  const r = await apiAdmin(`/api/admin/pedidos/${pedido.id}`, { method: 'PATCH', body: { estado, motivo } });
  actualizarEnTablero(r.pedido);
  return r.pedido;
}

export async function eliminarPedido(pedido) {
  await apiAdmin(`/api/admin/pedidos/${pedido.id}`, { method: 'DELETE' });
  actualizarEnTablero({ ...pedido, eliminado: true });
}

export async function restaurarPedido(pedido) {
  const r = await apiAdmin(`/api/admin/pedidos/${pedido.id}/restaurar`, { method: 'POST', body: {} });
  actualizarEnTablero(r.pedido);
  return r.pedido;
}

export const SIGUIENTE = {
  pendiente: { estado: 'preparando', texto: 'Aceptar' },
  preparando: { estado: 'listo', texto: 'Marcar listo' },
  listo: { estado: 'entregado', texto: 'Entregado' },
};

export const ANTERIOR = { preparando: 'pendiente', listo: 'preparando', entregado: 'listo' };
