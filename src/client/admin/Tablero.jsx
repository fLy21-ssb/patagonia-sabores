import { Fragment } from 'preact';
import { useState } from 'preact/hooks';
import {
  CalendarClock,
  Users,
  Archive,
  ArrowRight,
  BellRing,
  Bike,
  ChefHat,
  Mail,
  NotebookPen,
  PackageCheck,
  TicketPercent,
  Clock,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Phone,
  Printer,
  Store,
  UtensilsCrossed,
  Volume2,
  VolumeX,
} from 'lucide-preact';
import {
  aMinutos,
  clp,
  ESTADOS,
  fechaCorta,
  hace,
  hora,
  linkWhatsapp,
  minutoDelDia,
  minutosDesde,
  minutosHasta,
  PAGOS,
  porPersona,
  TIPOS,
} from '../shared/format.js';
import { useAhora } from '../shared/hooks.js';
import { useStore } from '../shared/store.js';
import { Sheet, Switch, Vacio, confirmar, toast } from '../shared/ui.jsx';
import {
  ANTERIOR,
  SIGUIENTE,
  ajustesStore,
  cambiarEstadoPedido,
  eliminarPedido,
  guardarAjustes,
  preferencias,
  restaurarPedido,
  tablero,
} from './estado.js';
import { imprimirTicket } from './imprimir.jsx';
import { AvisosDispositivo } from './Avisos.jsx';

const COLUMNAS = [
  { id: 'nuevos', estado: 'pendiente', titulo: 'Nuevos', corto: 'Nuevos', Icono: BellRing, vacio: 'Sin pedidos nuevos' },
  { id: 'preparando', estado: 'preparando', titulo: 'En preparación', corto: 'Cocina', Icono: ChefHat, vacio: 'Nada en la cocina' },
  { id: 'listos', estado: 'listo', titulo: 'Listos', corto: 'Listos', Icono: PackageCheck, vacio: 'Nada esperando retiro' },
  { id: 'terminados', estado: null, titulo: 'Terminados hoy', corto: 'Hechos', Icono: Archive, vacio: 'Aún nada entregado hoy' },
];

const ICONO_TIPO = { retiro: Store, delivery: Bike, mesa: UtensilsCrossed };

/** Minuto del día en que el pedido tiene que estar listo: la hora pedida o la llegada + preparación. */
const horaObjetivo = (p, prep) => (p.programado ? aMinutos(p.programado) : minutoDelDia(p.creado) + prep);

/** Productos de un pedido; en los grupales, con el nombre de cada persona como encabezado. */
function ItemsPedido({ items, grande = false, precios = false }) {
  return (
    <ul class={`pitems${grande ? ' grande' : ''}`}>
      {porPersona(items).map((g) => (
        <Fragment key={g.persona || 'todos'}>
          {g.persona && <li class="pitems-persona">{g.persona}</li>}
          {g.items.map((it) => (
            <li key={it.id}>
              <span class="q">{it.cantidad}</span>
              <span class="grow">
                {it.nombre}
                {it.acompanamiento && <small class="acomp">+ {it.acompanamiento}</small>}
                {it.comentario && <small class="coment">“{it.comentario}”</small>}
              </span>
              {precios && <span class="num">{clp(it.total)}</span>}
            </li>
          ))}
        </Fragment>
      ))}
    </ul>
  );
}

export function Tablero() {
  const t = useStore(tablero);
  const ajustes = useStore(ajustesStore);
  const prefs = useStore(preferencias);
  const ahora = useAhora(20_000);
  const [detalle, setDetalle] = useState(null);

  const prep = ajustes?.tiempoPreparacion || 25;
  // Nuevos y en preparación: primero lo que hay que tener listo antes (los programados quedan en su hora).
  const de = (c) => {
    if (!c.estado) return t.lista.filter((p) => ['entregado', 'cancelado'].includes(p.estado)).reverse();
    const lista = t.lista.filter((p) => p.estado === c.estado);
    return c.estado === 'listo' ? lista : [...lista].sort((a, b) => horaObjetivo(a, prep) - horaObjetivo(b, prep));
  };
  const hoy = t.lista.filter((p) => p.fechaLocal === t.hoy && p.estado !== 'cancelado');
  const ventasHoy = hoy.reduce((n, p) => n + p.total, 0);
  const detalleActual = detalle ? t.lista.find((p) => p.id === detalle.id) || detalle : null;

  async function pausar(valor) {
    try {
      await guardarAjustes({ recibiendoPedidos: valor });
      toast(valor ? 'Volviste a recibir pedidos' : 'Pedidos en pausa. Los clientes verán el aviso.', 'ok');
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  return (
    <div class="tablero">
      <header class="page-head">
        <div>
          <h1>Pedidos en vivo</h1>
          <p class="muted">
            {t.hoy ? fechaCorta(t.hoy) : 'Hoy'} · <strong class="num">{hoy.length}</strong> pedidos ·{' '}
            <strong class="num">{clp(ventasHoy)}</strong>
            {t.error && <span class="pill bad">Sin conexión, reintentando…</span>}
          </p>
        </div>
        <div class="head-actions">
          {ajustes && (
            <label class={`toggle-recibir ${ajustes.recibiendoPedidos ? 'on' : 'off'}`}>
              <span>{ajustes.recibiendoPedidos ? 'Recibiendo pedidos' : 'Pedidos en pausa'}</span>
              <Switch checked={ajustes.recibiendoPedidos} onChange={pausar} etiqueta="Recibir pedidos" />
            </label>
          )}
          <button
            class={`icon-btn${prefs.sonido ? ' activo' : ''}`}
            onClick={() => preferencias.set({ ...prefs, sonido: !prefs.sonido })}
            aria-label={prefs.sonido ? 'Silenciar sonido' : 'Activar sonido'}
            title={prefs.sonido ? 'Sonido activado' : 'Sonido apagado'}
          >
            {prefs.sonido ? <Volume2 size={20} /> : <VolumeX size={20} />}
          </button>
          <button
            class={`icon-btn${prefs.autoImprimir ? ' activo' : ''}`}
            onClick={() => {
              preferencias.set({ ...prefs, autoImprimir: !prefs.autoImprimir });
              toast(!prefs.autoImprimir ? 'Se abrirá la impresión con cada pedido nuevo' : 'Impresión automática apagada', 'info');
            }}
            aria-label="Imprimir automáticamente los pedidos nuevos"
            title={prefs.autoImprimir ? 'Impresión automática activada' : 'Impresión automática apagada'}
          >
            <Printer size={20} />
          </button>
        </div>
      </header>

      <AvisosDispositivo compacto />

      <div class="tabs-moviles" role="tablist">
        {COLUMNAS.map((c) => (
          <button
            key={c.id}
            role="tab"
            aria-selected={prefs.vista === c.id}
            class={`tab-movil${prefs.vista === c.id ? ' on' : ''}`}
            onClick={() => preferencias.set({ ...prefs, vista: c.id })}
          >
            {c.corto} <span class="n">{de(c).length}</span>
          </button>
        ))}
      </div>

      {!t.cargado ? (
        <div class="page-center">
          <div class="spinner" />
        </div>
      ) : (
        <div class="board">
          {COLUMNAS.map((c) => {
            const pedidos = de(c);
            return (
              <section key={c.id} class={`col col-${c.id}${prefs.vista === c.id ? ' visible' : ''}`} aria-label={c.titulo}>
                <h2 class="col-head">
                  <c.Icono size={19} strokeWidth={2.4} /> {c.titulo} <span class="n">{pedidos.length}</span>
                </h2>
                {pedidos.length === 0 ? (
                  <p class="col-vacia">{c.vacio}</p>
                ) : (
                  pedidos.map((p) =>
                    c.estado ? (
                      <TarjetaPedido key={p.id} p={p} ahora={ahora} onDetalle={() => setDetalle(p)} ajustes={ajustes} />
                    ) : (
                      <button key={p.id} class="mini-pedido" onClick={() => setDetalle(p)}>
                        <span class="num">#{p.id}</span>
                        <span class="grow">{p.cliente.nombre}</span>
                        <span class={`pill ${ESTADOS[p.estado].clase}`}>{ESTADOS[p.estado].nombre}</span>
                        <span class="num">{clp(p.total)}</span>
                      </button>
                    ),
                  )
                )}
              </section>
            );
          })}
        </div>
      )}

      {t.cargado && t.lista.length === 0 && (
        <Vacio titulo="Todo tranquilo por ahora" texto="Cuando llegue un pedido sonará una campanita y aparecerá aquí." />
      )}

      {detalleActual && <DetallePedido p={detalleActual} onCerrar={() => setDetalle(null)} />}
    </div>
  );
}

function TarjetaPedido({ p, ahora, onDetalle, ajustes }) {
  const [ocupado, setOcupado] = useState(false);
  const min = minutosDesde(p.creado, ahora);
  const prep = ajustes?.tiempoPreparacion || 25;
  // Programado: la urgencia depende de cuánto falta para la hora pedida, no de cuándo llegó.
  const faltan = p.programado ? minutosHasta(p.programado, ahora) : null;
  const urgencia =
    p.estado === 'listo'
      ? ''
      : p.programado
        ? faltan <= 0
          ? 'bad'
          : faltan <= prep
            ? 'warn'
            : 'prog'
        : min >= 20
          ? 'bad'
          : min >= 10
            ? 'warn'
            : '';
  const siguiente = SIGUIENTE[p.estado];
  const Icono = ICONO_TIPO[p.tipo];
  const esNuevo = p.estado === 'pendiente' && ahora - new Date(p.creado).getTime() < 90_000;
  const wa = p.cliente.telefono && linkWhatsapp(p.cliente.telefono, `Hola ${p.cliente.nombre}, te escribimos de ${ajustes?.nombre || 'Patagonia Sabores'} por tu pedido #${p.id}.`);

  async function avanzar() {
    setOcupado(true);
    try {
      await cambiarEstadoPedido(p, siguiente.estado);
      if (siguiente.estado === 'listo') toast(`Pedido #${p.id} listo · avisamos al cliente`, 'ok');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <article class={`pcard${esNuevo ? ' nuevo' : ''}`}>
      <div class="pcard-head">
        <button class="pcard-num num" onClick={onDetalle} aria-label={`Ver detalle del pedido ${p.id}`}>
          #{p.id}
        </button>
        <span class={`pill tipo-${p.tipo}`}>
          <Icono size={14} /> {p.tipo === 'mesa' ? `Mesa ${p.mesa}` : TIPOS[p.tipo].corto}
        </span>
        {p.grupal && (
          <span class="pill grupal">
            <Users size={13} /> Grupal
          </span>
        )}
        {p.programado ? (
          <span class={`elapsed ${urgencia}`} title={`Llegó a las ${hora(p.creado)} · lo pidieron para las ${p.programado}`}>
            <CalendarClock size={14} /> {p.programado}
          </span>
        ) : (
          <span class={`elapsed ${urgencia}`} title={`Llegó a las ${hora(p.creado)}`}>
            <Clock size={14} /> {min < 1 ? 'recién' : `${min} min`}
          </span>
        )}
      </div>
      {p.programado && p.estado === 'pendiente' && (
        <p class={`pcard-programado ${urgencia}`}>
          {p.tipo === 'delivery' ? 'Entregar' : 'Listo'} a las <strong>{p.programado}</strong>
          {faltan > prep ? ` · empezar a las ${hora(new Date(ahora + (faltan - prep) * 60000).toISOString())}` : faltan > 0 ? ' · empezar ya' : ' · ¡ya es la hora!'}
        </p>
      )}
      <div class="pcard-cliente">
        <strong>{p.cliente.nombre}</strong>
        {p.cliente.telefono && (
          <span class="row tel">
            <a href={`tel:${p.cliente.telefono.replace(/[^\d+]/g, '')}`} aria-label="Llamar">
              <Phone size={14} /> {p.cliente.telefono}
            </a>
            {wa && (
              <a href={wa} target="_blank" rel="noopener" aria-label="WhatsApp">
                <MessageCircle size={14} />
              </a>
            )}
          </span>
        )}
      </div>
      {p.cupon && (
        <span class="pcard-cupon">
          <TicketPercent size={13} /> {p.cupon} · −{clp(p.descuento)}
        </span>
      )}
      <ItemsPedido items={p.items} />
      {p.tipo === 'delivery' && p.direccion && (
        <a class="pcard-dir" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.direccion)}`} target="_blank" rel="noopener">
          <MapPin size={14} /> {p.direccion}
        </a>
      )}
      {p.notas && <p class="pcard-notas">
          <NotebookPen size={15} /> {p.notas}
        </p>}
      <div class="pcard-total">
        <span class="muted">{PAGOS[p.metodoPago]?.nombre}</span>
        <strong class="num">{clp(p.total)}</strong>
      </div>
      <div class="pcard-acciones">
        {siguiente && (
          <button class={`btn ${p.estado === 'preparando' ? 'btn-ok' : 'btn-primary'} grow`} onClick={avanzar} disabled={ocupado}>
            {ocupado ? <span class="spinner" /> : null}
            {siguiente.texto} <ArrowRight size={18} />
          </button>
        )}
        <button
          class="icon-btn"
          onClick={() => imprimirTicket(p, { nombreLocal: ajustes?.nombre, ancho: ajustes?.ticketAncho || 80 })}
          aria-label="Imprimir ticket"
          title="Imprimir ticket"
        >
          <Printer size={18} />
        </button>
        <button class="icon-btn" onClick={onDetalle} aria-label="Más opciones" title="Más opciones">
          <MoreHorizontal size={18} />
        </button>
      </div>
    </article>
  );
}

/** Detalle completo con todas las acciones. Se usa en el tablero y en el historial. */
export function DetallePedido({ p, onCerrar, onCambio }) {
  const ajustes = useStore(ajustesStore);
  const [ocupado, setOcupado] = useState(false);
  const wa = p.cliente.telefono && linkWhatsapp(p.cliente.telefono, `Hola ${p.cliente.nombre}, te escribimos de ${ajustes?.nombre || 'Patagonia Sabores'} por tu pedido #${p.id}.`);
  const siguiente = !p.eliminado && SIGUIENTE[p.estado];
  const anterior = !p.eliminado && ANTERIOR[p.estado];

  async function ejecutar(fn, mensaje) {
    setOcupado(true);
    try {
      const r = await fn();
      if (mensaje) toast(mensaje, 'ok');
      onCambio?.(r);
      return r;
    } catch (e) {
      toast(e.message, 'error');
      return null;
    } finally {
      setOcupado(false);
    }
  }

  async function cancelar() {
    const motivo = await confirmar({
      titulo: `¿Cancelar el pedido #${p.id}?`,
      texto: 'El cliente verá el motivo y recibirá un aviso. Se devuelve el stock.',
      pedirTexto: true,
      placeholder: 'Motivo (opcional)',
      opcionesRapidas: ['Se nos acabó un producto', 'Fuera de la zona de delivery', 'Cliente no responde', 'Local cerrado'],
      ok: 'Cancelar pedido',
      cancelar: 'Volver',
      peligro: true,
    });
    if (motivo === false) return;
    await ejecutar(() => cambiarEstadoPedido(p, 'cancelado', motivo), `Pedido #${p.id} cancelado`);
  }

  async function eliminar() {
    const ok = await confirmar({
      titulo: `¿Eliminar el pedido #${p.id}?`,
      texto: 'Se mueve a la papelera del historial (se puede restaurar). No cuenta en las estadísticas.',
      ok: 'Eliminar',
      peligro: true,
    });
    if (!ok) return;
    const r = await ejecutar(() => eliminarPedido(p).then(() => ({ ...p, eliminado: true })), `Pedido #${p.id} eliminado`);
    if (r) onCerrar();
  }

  const tiempos = [
    ['Recibido', p.creado],
    ['En preparación', p.tiempos.preparando],
    ['Listo', p.tiempos.listo],
    ['Entregado', p.tiempos.entregado],
    ['Cancelado', p.tiempos.cancelado],
  ].filter(([, t]) => t);

  return (
    <Sheet
      abierto
      onCerrar={onCerrar}
      ancho
      titulo={`Pedido #${p.id}`}
      pie={
        <div class="row wrap">
          {p.eliminado ? (
            <button class="btn btn-primary grow" disabled={ocupado} onClick={() => ejecutar(() => restaurarPedido(p), 'Pedido restaurado')}>
              Restaurar pedido
            </button>
          ) : (
            <>
              {siguiente && (
                <button
                  class="btn btn-primary grow"
                  disabled={ocupado}
                  onClick={() => ejecutar(() => cambiarEstadoPedido(p, siguiente.estado), `Pedido #${p.id}: ${ESTADOS[siguiente.estado].nombre}`)}
                >
                  {siguiente.texto} <ArrowRight size={18} />
                </button>
              )}
              <button class="btn btn-outline" onClick={() => imprimirTicket(p, { nombreLocal: ajustes?.nombre, ancho: ajustes?.ticketAncho || 80 })}>
                <Printer size={18} /> Imprimir
              </button>
            </>
          )}
        </div>
      }
    >
      <div class="detalle stack">
        <div class="row wrap">
          <span class={`pill ${ESTADOS[p.estado].clase}`}>{ESTADOS[p.estado].nombre}</span>
          <span class="pill">{p.tipo === 'mesa' ? `Mesa ${p.mesa}` : TIPOS[p.tipo].nombre}</span>
          {p.programado && (
            <span class="pill sun">
              <CalendarClock size={13} /> Para las {p.programado}
            </span>
          )}
          {p.grupal && (
            <span class="pill grupal">
              <Users size={13} /> Grupal · {new Set(p.items.map((i) => i.persona)).size} personas
            </span>
          )}
          <span class="pill">{PAGOS[p.metodoPago]?.nombre}</span>
          {p.eliminado && <span class="pill bad">En la papelera</span>}
          <span class="subtle small">{hace(p.creado)}</span>
        </div>
        {p.motivoCancelacion && <div class="notice bad">Motivo: {p.motivoCancelacion}</div>}
        <div class="card card-pad stack">
          <div class="row-between">
            <strong>{p.cliente.nombre}</strong>
            <div class="row">
              {p.cliente.telefono && (
                <a class="btn btn-outline btn-sm" href={`tel:${p.cliente.telefono.replace(/[^\d+]/g, '')}`}>
                  <Phone size={16} /> {p.cliente.telefono}
                </a>
              )}
              {wa && (
                <a class="btn btn-whatsapp btn-sm" href={wa} target="_blank" rel="noopener">
                  <MessageCircle size={16} /> WhatsApp
                </a>
              )}
            </div>
          </div>
          {p.direccion && (
            <a class="pcard-dir" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.direccion)}`} target="_blank" rel="noopener">
              <MapPin size={16} /> {p.direccion}
            </a>
          )}
          {p.cliente.email && (
            <a class="pcard-dir" href={`mailto:${p.cliente.email}`}>
              <Mail size={16} /> {p.cliente.email}
              <small class="subtle"> · recibe avisos por correo</small>
            </a>
          )}
          {p.notas && <p class="pcard-notas">
          <NotebookPen size={15} /> {p.notas}
        </p>}
        </div>
        <ItemsPedido items={p.items} grande precios />
        <div class="totales-admin">
          {(p.costoEnvio > 0 || p.descuento > 0) && (
            <div class="row-between">
              <span>Subtotal</span>
              <span class="num">{clp(p.subtotal)}</span>
            </div>
          )}
          {p.costoEnvio > 0 && (
            <div class="row-between">
              <span>Envío</span>
              <span class="num">{clp(p.costoEnvio)}</span>
            </div>
          )}
          {p.descuento > 0 && (
            <div class="row-between linea-descuento">
              <span>Descuento · {p.cupon}</span>
              <span class="num">−{clp(p.descuento)}</span>
            </div>
          )}
          <div class="row-between total-final">
            <span>Total</span>
            <span class="num">{clp(p.total)}</span>
          </div>
        </div>
        <ol class="linea-tiempo">
          {tiempos.map(([nombre, t]) => (
            <li key={nombre}>
              <span class="num">{hora(t)}</span> {nombre}
            </li>
          ))}
        </ol>
        {!p.eliminado && (
          <div class="row wrap acciones-secundarias">
            {anterior && (
              <button
                class="btn btn-ghost btn-sm"
                disabled={ocupado}
                onClick={() => ejecutar(() => cambiarEstadoPedido(p, anterior), `Pedido #${p.id} volvió a "${ESTADOS[anterior].nombre}"`)}
              >
                ↩ Volver a “{ESTADOS[anterior].nombre}”
              </button>
            )}
            {!['entregado', 'cancelado'].includes(p.estado) && (
              <button class="btn btn-danger btn-sm" disabled={ocupado} onClick={cancelar}>
                Cancelar pedido
              </button>
            )}
            <button class="btn btn-ghost btn-sm" disabled={ocupado} onClick={eliminar}>
              Eliminar
            </button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
