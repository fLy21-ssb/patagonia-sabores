import { useEffect, useState } from 'preact/hooks';
import { Download, Search, Trash2 } from 'lucide-preact';
import { clp, ESTADOS, fechaHora, PAGOS, TIPOS } from '../shared/format.js';
import { Vacio, toast } from '../shared/ui.jsx';
import { apiAdmin } from './estado.js';
import { DetallePedido } from './Tablero.jsx';

const hoyChile = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
const restarDias = (fecha, n) => {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - n)).toISOString().slice(0, 10);
};

const RANGOS = [
  { id: 'hoy', nombre: 'Hoy', calc: (h) => [h, h] },
  { id: 'ayer', nombre: 'Ayer', calc: (h) => [restarDias(h, 1), restarDias(h, 1)] },
  { id: '7', nombre: '7 días', calc: (h) => [restarDias(h, 6), h] },
  { id: '30', nombre: '30 días', calc: (h) => [restarDias(h, 29), h] },
  { id: 'mes', nombre: 'Este mes', calc: (h) => [`${h.slice(0, 8)}01`, h] },
];

export function Historial() {
  const hoy = hoyChile();
  const [rango, setRango] = useState('7');
  const [desde, setDesde] = useState(restarDias(hoy, 6));
  const [hasta, setHasta] = useState(hoy);
  const [estado, setEstado] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [papelera, setPapelera] = useState(false);
  const [datos, setDatos] = useState({ pedidos: [], hayMas: false, resumen: null });
  const [cargando, setCargando] = useState(true);
  const [detalle, setDetalle] = useState(null);

  const parametros = (extra = {}) => {
    const q = new URLSearchParams({ desde, hasta, ...extra });
    if (estado) q.set('estado', estado);
    if (busqueda.trim()) q.set('q', busqueda.trim());
    if (papelera) q.set('eliminados', '1');
    return q.toString();
  };

  async function cargar() {
    setCargando(true);
    try {
      const r = await apiAdmin(`/api/admin/pedidos?${parametros()}`);
      setDatos(r);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(cargar, busqueda ? 350 : 0);
    return () => clearTimeout(t);
  }, [desde, hasta, estado, busqueda, papelera]);

  async function cargarMas() {
    const ultimo = datos.pedidos[datos.pedidos.length - 1];
    try {
      const r = await apiAdmin(`/api/admin/pedidos?${parametros({ antesDe: String(ultimo.id) })}`);
      setDatos((d) => ({ ...d, pedidos: [...d.pedidos, ...r.pedidos], hayMas: r.hayMas }));
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  function elegirRango(id) {
    setRango(id);
    const r = RANGOS.find((x) => x.id === id);
    const [a, b] = r.calc(hoy);
    setDesde(a);
    setHasta(b);
  }

  async function exportar() {
    try {
      let todos = [];
      let antesDe = null;
      for (let i = 0; i < 40; i++) {
        const r = await apiAdmin(`/api/admin/pedidos?${parametros(antesDe ? { antesDe: String(antesDe) } : {})}`);
        todos = todos.concat(r.pedidos);
        if (!r.hayMas) break;
        antesDe = r.pedidos[r.pedidos.length - 1].id;
      }
      const filas = [['Pedido', 'Fecha', 'Cliente', 'Teléfono', 'Correo', 'Tipo', 'Mesa', 'Dirección', 'Estado', 'Pago', 'Productos', 'Subtotal', 'Envío', 'Código', 'Descuento', 'Total']];
      for (const p of todos) {
        filas.push([
          p.id,
          fechaHora(p.creado),
          p.cliente.nombre,
          p.cliente.telefono,
          p.cliente.email,
          TIPOS[p.tipo].corto,
          p.mesa ?? '',
          p.direccion,
          ESTADOS[p.estado].nombre,
          PAGOS[p.metodoPago]?.nombre || p.metodoPago,
          p.items.map((i) => `${i.cantidad}x ${i.nombre}${i.acompanamiento ? ` (${i.acompanamiento})` : ''}`).join(' | '),
          p.subtotal,
          p.costoEnvio,
          p.cupon,
          p.descuento,
          p.total,
        ]);
      }
      const csv = filas.map((f) => f.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `pedidos_${desde}_a_${hasta}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast(`Exportados ${todos.length} pedidos (se abre en Excel)`, 'ok');
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  function alCambiar(p) {
    if (!p) return;
    setDatos((d) => ({
      ...d,
      pedidos: d.pedidos.map((x) => (x.id === p.id ? p : x)).filter((x) => Boolean(x.eliminado) === papelera),
    }));
    if (Boolean(p.eliminado) !== papelera) setDetalle(null);
    else setDetalle(p);
  }

  return (
    <div>
      <header class="page-head">
        <div>
          <h1>{papelera ? 'Papelera' : 'Historial'}</h1>
          {datos.resumen && (
            <p class="muted">
              <strong class="num">{datos.resumen.pedidos}</strong> pedidos · <strong class="num">{clp(datos.resumen.ventas)}</strong> en ventas
              (sin cancelados)
            </p>
          )}
        </div>
        <div class="head-actions">
          <button class={`btn btn-sm ${papelera ? 'btn-dark' : 'btn-outline'}`} onClick={() => setPapelera(!papelera)}>
            <Trash2 size={16} /> {papelera ? 'Volver al historial' : 'Papelera'}
          </button>
          <button class="btn btn-outline btn-sm" onClick={exportar} disabled={!datos.pedidos.length}>
            <Download size={16} /> Exportar a Excel
          </button>
        </div>
      </header>

      <div class="filtros card card-pad">
        <div class="row wrap">
          {RANGOS.map((r) => (
            <button key={r.id} class={`chip${rango === r.id ? ' on' : ''}`} onClick={() => elegirRango(r.id)}>
              {r.nombre}
            </button>
          ))}
        </div>
        <div class="filtros-grid">
          <label class="field">
            <span class="label">Desde</span>
            <input class="input" type="date" value={desde} max={hasta} onInput={(e) => (setRango(''), setDesde(e.currentTarget.value))} />
          </label>
          <label class="field">
            <span class="label">Hasta</span>
            <input class="input" type="date" value={hasta} min={desde} max={hoy} onInput={(e) => (setRango(''), setHasta(e.currentTarget.value))} />
          </label>
          <label class="field">
            <span class="label">Estado</span>
            <select class="select" value={estado} onChange={(e) => setEstado(e.currentTarget.value)}>
              <option value="">Todos</option>
              {Object.entries(ESTADOS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.nombre}
                </option>
              ))}
            </select>
          </label>
          <label class="field">
            <span class="label">Buscar</span>
            <div class="input-icono">
              <Search size={18} />
              <input class="input" placeholder="Nombre, teléfono, dirección o #número" value={busqueda} onInput={(e) => setBusqueda(e.currentTarget.value)} />
            </div>
          </label>
        </div>
      </div>

      {cargando && !datos.pedidos.length ? (
        <div class="page-center">
          <div class="spinner" />
        </div>
      ) : datos.pedidos.length === 0 ? (
        <Vacio titulo={papelera ? 'La papelera está vacía' : 'No hay pedidos con estos filtros'} />
      ) : (
        <div class="tabla-wrap card">
          <table class="tabla">
            <thead>
              <tr>
                <th>#</th>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Tipo</th>
                <th>Productos</th>
                <th>Estado</th>
                <th class="der">Total</th>
              </tr>
            </thead>
            <tbody>
              {datos.pedidos.map((p) => (
                <tr key={p.id} onClick={() => setDetalle(p)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setDetalle(p)}>
                  <td class="num fuerte">#{p.id}</td>
                  <td class="num">{fechaHora(p.creado)}</td>
                  <td>
                    <strong>{p.cliente.nombre}</strong>
                    {p.cliente.telefono && <small class="block muted">{p.cliente.telefono}</small>}
                  </td>
                  <td>{p.tipo === 'mesa' ? `Mesa ${p.mesa}` : TIPOS[p.tipo].corto}</td>
                  <td class="productos-celda">{p.items.map((i) => `${i.cantidad}× ${i.nombre}`).join(', ')}</td>
                  <td>
                    <span class={`pill ${ESTADOS[p.estado].clase}`}>{ESTADOS[p.estado].nombre}</span>
                  </td>
                  <td class="der num fuerte">{clp(p.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {datos.hayMas && (
        <div class="center-row">
          <button class="btn btn-outline" onClick={cargarMas}>
            Cargar más pedidos
          </button>
        </div>
      )}
      {detalle && <DetallePedido p={detalle} onCerrar={() => setDetalle(null)} onCambio={alCambiar} />}
    </div>
  );
}
