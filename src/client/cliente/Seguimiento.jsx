import { Fragment } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { ArrowLeft, Bell, BellRing, Clock, Copy, Mail, MapPin, MessageCircle, RefreshCw, RotateCcw, Share, Users } from 'lucide-preact';
import { api } from '../shared/api.js';
import { clp, fechaHora, hora, linkWhatsapp, PAGOS, porPersona } from '../shared/format.js';
import { navegar, useMensajesSW, useSondeo } from '../shared/hooks.js';
import { Vacio, toast } from '../shared/ui.jsx';
import { campanita, esIOS, esStandalone, mensajeErrorPush, pushSoportado, suscribirPush } from '../shared/pwa.js';
import { lanzarConfeti } from '../shared/confeti.js';
import { Atardecer, Cargando, Oveja, Rombo } from '../shared/simbolos.jsx';
import { agregarAlCarrito, misPedidos } from './estado.js';
import { BarraVolver } from './Checkout.jsx';

const PASOS = ['pendiente', 'preparando', 'listo', 'entregado'];
// Sendero de montaña: los hitos (índices 1, 3, 5, 7) van subiendo
const PUNTOS = [
  [8, 62],
  [50, 44],
  [100, 58],
  [150, 30],
  [200, 52],
  [250, 22],
  [300, 46],
  [350, 8],
  [392, 34],
];
const HITOS = [1, 3, 5, 7];

function textos(p) {
  const listo = {
    retiro: { titulo: '¡Tu pedido está listo!', texto: 'Ya puedes pasar a retirarlo.' },
    delivery: { titulo: '¡Va en camino!', texto: 'Tu pedido ya salió. Atento a la puerta.' },
    mesa: { titulo: '¡Está listo!', texto: `Ya va camino a tu mesa ${p.mesa}.` },
  }[p.tipo];
  const pendiente = p.programado
    ? { titulo: '¡Pedido agendado!', texto: p.tipo === 'delivery' ? `Te lo llevamos cerca de las ${p.programado}.` : `Lo tendremos listo a las ${p.programado}.` }
    : { titulo: '¡Recibimos tu pedido!', texto: 'En un ratito lo empezamos a preparar.' };
  return {
    pendiente,
    preparando: { titulo: 'Estamos cocinando', texto: 'Tu pedido está en preparación.' },
    listo,
    entregado: { titulo: '¡Que lo disfrutes!', texto: 'Gracias por preferirnos. ¡Te esperamos pronto!' },
    cancelado: { titulo: 'Pedido cancelado', texto: p.motivoCancelacion || 'Si tienes dudas, escríbenos.' },
  }[p.estado];
}

const CIELO = { pendiente: 'tarde', preparando: 'tarde', listo: 'dorado', entregado: 'noche', cancelado: 'gris' };

function Sendero({ estado, tipo }) {
  const actual = PASOS.indexOf(estado);
  const nombres = ['Recibido', 'Cocinando', tipo === 'delivery' ? 'En camino' : 'Listo', 'Entregado'];
  const hasta = HITOS[Math.max(0, actual)];
  const linea = (pts) => pts.map(([x, y]) => `${x},${y}`).join(' ');
  const [mx, my] = PUNTOS[hasta];
  return (
    <div class="sendero" aria-label={`Estado: ${nombres[actual]}`}>
      <div style={{ position: 'relative' }}>
        <svg class="sendero-svg" viewBox="0 0 400 70" preserveAspectRatio="none" aria-hidden="true">
          <polyline class="camino" points={linea(PUNTOS)} vector-effect="non-scaling-stroke" />
          <polyline class="recorrido-borde" points={linea(PUNTOS.slice(0, hasta + 1))} vector-effect="non-scaling-stroke" />
          <polyline class="recorrido" points={linea(PUNTOS.slice(0, hasta + 1))} vector-effect="non-scaling-stroke" />
        </svg>
        {HITOS.map((idx, i) => {
          const [x, y] = PUNTOS[idx];
          return (
            <span key={idx} class={`hito-rombo${i <= actual ? ' hecho' : ''}`} style={{ left: `${(x / 400) * 100}%`, top: `${y}px` }} />
          );
        })}
        <img class="marcador" src="/brand/oveja-cara.webp" alt="" width="56" height="34" style={{ left: `${(mx / 400) * 100}%`, top: `${my - 40}px` }} />
      </div>
      <div class="sendero-etiquetas" role="list">
        {nombres.map((n, i) => (
          <span key={n} role="listitem" class={i === actual ? 'actual' : ''}>
            {n}
          </span>
        ))}
      </div>
    </div>
  );
}

export function Seguimiento({ token, menu }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [activando, setActivando] = useState(false);
  const [avisosAqui, setAvisosAqui] = useState(false);
  const estadoPrevio = useRef(null);
  const recien = useRef(false);

  useEffect(() => {
    try {
      recien.current = sessionStorage.getItem('ps-recien') === token;
      if (recien.current) sessionStorage.removeItem('ps-recien');
    } catch {
      recien.current = false;
    }
  }, [token]);

  const cargar = useCallback(async () => {
    try {
      const d = await api(`/api/pedidos/${token}`);
      const anterior = estadoPrevio.current;
      const nuevo = d.pedido.estado;
      if (anterior && anterior !== nuevo) {
        if (nuevo === 'listo') {
          lanzarConfeti();
          campanita();
          navigator.vibrate?.([200, 100, 200]);
        } else if (nuevo === 'preparando') {
          navigator.vibrate?.(80);
        }
      } else if (!anterior && recien.current) {
        lanzarConfeti({ cantidad: 90, duracion: 2000 });
        recien.current = false;
      }
      estadoPrevio.current = nuevo;
      setDatos(d);
      setError(null);
      misPedidos.set((l) => {
        const existe = l.some((x) => x.token === token);
        const resumen = { token, id: d.pedido.id, creado: d.pedido.creado, total: d.pedido.total, estado: nuevo };
        return existe ? l.map((x) => (x.token === token ? { ...x, ...resumen } : x)) : [resumen, ...l].slice(0, 25);
      });
    } catch (e) {
      setError(e);
    }
  }, [token]);

  useEffect(() => {
    estadoPrevio.current = null;
    setDatos(null);
    cargar();
  }, [cargar]);

  const final = datos && ['entregado', 'cancelado'].includes(datos.pedido.estado);
  useSondeo(cargar, 8000, !final);
  useMensajesSW((m) => {
    if (m.tipo === 'push') cargar();
  });

  if (error && !datos) {
    return (
      <div class="page">
        <BarraVolver titulo="Tu pedido" />
        <Vacio titulo={error.status === 404 ? 'No encontramos ese pedido' : 'No pudimos cargar tu pedido'} texto={error.message}>
          <button class="btn btn-primary" onClick={cargar}>
            <RefreshCw size={18} /> Reintentar
          </button>
        </Vacio>
      </div>
    );
  }
  if (!datos) return <Cargando texto="Buscando tu pedido…" />;

  const { pedido: p, local, adelante } = datos;
  const t = textos(p);
  const estimado = new Date(new Date(p.creado).getTime() + local.tiempoPreparacion * 60000);
  const wa = linkWhatsapp(local.whatsapp, `¡Hola! Hice el pedido #${p.id} a nombre de ${p.cliente.nombre}.`);
  const yaSuscrito = avisosAqui || datos.suscripciones > 0;

  async function activarAvisos() {
    setActivando(true);
    try {
      const sub = await suscribirPush(menu?.vapidPublicKey || (await api('/api/menu')).vapidPublicKey);
      await api(`/api/pedidos/${token}/suscripcion`, { method: 'POST', body: sub });
      setAvisosAqui(true);
      toast('Listo: te avisaremos en este dispositivo', 'ok');
    } catch (e) {
      toast(mensajeErrorPush(e), 'error', { ms: 7000 });
    } finally {
      setActivando(false);
    }
  }

  function pedirDeNuevo() {
    if (!menu) return;
    const bitHoy = 1 << menu.estado.dow;
    const porId = new Map(menu.productos.map((x) => [x.id, x]));
    const acomps = new Map(menu.acompanamientos.map((a) => [a.nombre, a]));
    let agregados = 0;
    p.items.forEach((it) => {
      const prod = porId.get(it.productoId);
      if (!prod || prod.agotado || !(prod.dias & bitHoy)) return;
      const acomp = it.acompanamiento ? acomps.get(it.acompanamiento) || null : null;
      if (prod.conAcompanamiento && menu.acompanamientos.length && !acomp) return;
      agregarAlCarrito(prod, { cantidad: it.cantidad, acompanamiento: acomp, comentario: it.comentario });
      agregados++;
    });
    if (agregados) {
      toast(agregados === p.items.length ? 'Agregamos todo a tu carro' : 'Agregamos lo que está disponible hoy', 'ok');
      navegar('/');
    } else toast('Esos productos no están disponibles hoy', 'error');
  }

  async function compartir() {
    const url = `${location.origin}/#/pedido/${token}`;
    try {
      if (navigator.share) await navigator.share({ title: `Pedido #${p.id}`, url });
      else {
        await navigator.clipboard.writeText(url);
        toast('Link del pedido copiado', 'ok');
      }
    } catch {
      /* cancelado */
    }
  }

  return (
    <div class="page seguimiento">
      <Atardecer class="ruta-escena" variante={CIELO[p.estado]}>
        <div class="ruta-top">
          <a class="icon-btn" href="#/" aria-label="Volver al menú">
            <ArrowLeft size={18} />
          </a>
          <span class="ticket-num">
            <small>Pedido</small>
            <strong class="num">#{p.id}</strong>
          </span>
          <button class="icon-btn" onClick={compartir} aria-label="Compartir seguimiento">
            <Share size={18} />
          </button>
        </div>
        <div class="ruta-oveja">
          <Oveja ancho={124} />
          <div class="globo" aria-live="polite">
            <h1>{t.titulo}</h1>
            <p>{t.texto}</p>
          </div>
        </div>
        {['pendiente', 'preparando'].includes(p.estado) && p.programado && (
          <p class="ruta-eta">
            <Clock size={16} /> {p.tipo === 'delivery' ? 'Llega cerca de las' : 'Listo a las'} <strong>{p.programado}</strong>
          </p>
        )}
        {['pendiente', 'preparando'].includes(p.estado) && !p.programado && (
          <p class="ruta-eta">
            <Clock size={16} /> Listo aprox. a las <strong>{hora(estimado)}</strong>
            {adelante > 0 && (
              <>
                {' '}
                · <Users size={16} /> {adelante} antes
              </>
            )}
          </p>
        )}
      </Atardecer>

      {p.estado !== 'cancelado' && <Sendero estado={p.estado} tipo={p.tipo} />}

      <div class="ruta-cuerpo">
        {['pendiente', 'preparando'].includes(p.estado) &&
          (yaSuscrito ? (
            <div class="notice ok">
              <BellRing size={20} />
              <span>
                Te avisaremos con una notificación cuando cambie tu pedido{p.cliente.email ? ` y también a ${p.cliente.email}` : ''}.
              </span>
            </div>
          ) : p.cliente.email && !pushSoportado() ? (
            <div class="notice ok">
              <Mail size={20} />
              <span>
                Te avisaremos a <strong>{p.cliente.email}</strong> cuando tu pedido esté {p.tipo === 'delivery' ? 'en camino' : 'listo'}. Mientras, esta página se
                actualiza sola.
              </span>
            </div>
          ) : pushSoportado() ? (
            <div class="card card-pad aviso-push">
              <Rombo color="sol">
                <Bell size={18} />
              </Rombo>
              <div class="grow">
                <strong>¿Te avisamos cuando esté listo?</strong>
                <small class="muted">Puedes cerrar la app tranquilo.</small>
              </div>
              <button class="btn btn-primary btn-sm" onClick={activarAvisos} disabled={activando}>
                {activando ? <span class="spinner" /> : 'Avísame'}
              </button>
            </div>
          ) : esIOS() && !esStandalone() ? (
            <div class="notice info">
              <Bell size={20} />
              <span>
                Para recibir avisos en iPhone: toca <strong>Compartir → Agregar a inicio</strong> y abre la app desde ahí. Mientras, esta página se
                actualiza sola.
              </span>
            </div>
          ) : (
            <div class="notice info">
              <RefreshCw size={20} />
              <span>Deja esta página abierta: se actualiza sola.</span>
            </div>
          ))}

        {p.metodoPago === 'transferencia' && local.datosTransferencia && p.estado !== 'cancelado' && (
          <section class="card card-pad stack">
            <h2 class="card-title">Datos para transferir</h2>
            <pre class="transferencia">{local.datosTransferencia}</pre>
            <p class="muted small">
              Monto: <strong class="num">{clp(p.total)}</strong>
              {wa ? ' · Envía el comprobante por WhatsApp.' : ''}
            </p>
            <button
              class="btn btn-sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(`${local.datosTransferencia}\nMonto: ${clp(p.total)}`);
                  toast('Datos copiados', 'ok');
                } catch {
                  toast('No se pudo copiar', 'error');
                }
              }}
            >
              <Copy size={16} /> Copiar datos
            </button>
          </section>
        )}

        <section class="card card-pad stack">
          <div class="row-between">
            <h2 class="card-title">Detalle</h2>
            <span class="subtle small">{fechaHora(p.creado)}</span>
          </div>
          <ul class="resumen">
            {porPersona(p.items).map((g) => (
              <Fragment key={g.persona || 'todos'}>
                {g.persona && <li class="resumen-persona">{g.persona}</li>}
                {g.items.map((it) => (
                  <li key={it.id}>
                    <span class="qty">{it.cantidad}×</span>
                    <span class="grow">
                      {it.nombre}
                      {it.acompanamiento && <small>Con {it.acompanamiento}</small>}
                      {it.comentario && <small class="comment">“{it.comentario}”</small>}
                    </span>
                    <span class="num">{clp(it.total)}</span>
                  </li>
                ))}
              </Fragment>
            ))}
          </ul>
          <div class="totales">
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
          <dl class="meta">
            <div>
              <dt>Entrega</dt>
              <dd>{p.tipo === 'mesa' ? `Mesa ${p.mesa}` : p.tipo === 'delivery' ? p.direccion : 'Retiro en el local'}</dd>
            </div>
            <div>
              <dt>Pago</dt>
              <dd>{PAGOS[p.metodoPago]?.nombre || p.metodoPago}</dd>
            </div>
            <div>
              <dt>A nombre de</dt>
              <dd>{p.cliente.nombre}</dd>
            </div>
            {p.notas && (
              <div>
                <dt>Notas</dt>
                <dd>{p.notas}</dd>
              </div>
            )}
          </dl>
          {p.tipo === 'retiro' && local.direccion && (
            <a class="btn btn-sm" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(local.direccion)}`} target="_blank" rel="noopener">
              <MapPin size={16} /> Cómo llegar
            </a>
          )}
        </section>

        <div class="stack">
          {wa && (
            <a class="btn btn-whatsapp btn-block" href={wa} target="_blank" rel="noopener">
              <MessageCircle size={18} /> Escribir al local por WhatsApp
            </a>
          )}
          {final && menu && (
            <button class="btn btn-primary btn-block" onClick={pedirDeNuevo}>
              <RotateCcw size={18} /> Pedir lo mismo otra vez
            </button>
          )}
          <a class="btn btn-ghost btn-block" href="#/">
            Volver al menú
          </a>
        </div>
      </div>
    </div>
  );
}
