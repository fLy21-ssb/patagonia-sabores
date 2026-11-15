// Pedido grupal (oficinas): crear, invitar, ver lo que eligió cada uno y enviarlo como un solo pedido.
import { useCallback, useEffect, useState } from 'preact/hooks';
import { ArrowRight, Copy, MessageCircle, Pencil, Share2, Trash2, Users, X } from 'lucide-preact';
import { api } from '../shared/api.js';
import { clp, hora } from '../shared/format.js';
import { navegar, useSondeo } from '../shared/hooks.js';
import { useStore } from '../shared/store.js';
import { Vacio, confirmar, toast } from '../shared/ui.jsx';
import { Cargando, Rombo } from '../shared/simbolos.jsx';
import { BarraVolver } from './Checkout.jsx';
import {
  agregarAlCarrito,
  carrito,
  datosGrupo,
  grupoActivo,
  grupoAPagar,
  guardarDatosGrupo,
  misDatos,
  misGrupos,
  parteIdDe,
} from './estado.js';

const aMin = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
};
const aHHMM = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const linkGrupo = (token) => `${location.origin}/#/grupo/${token}`;

/** Horas de hoy para cerrar el grupo: desde 15 min más hasta el cierre del local, cada 15 min. */
function horasDeCierre(menu) {
  const hoy = menu.local.horario[menu.estado.dow];
  const ahora = aMin(hora(new Date().toISOString()));
  let fin = hoy?.abierto ? aMin(hoy.hasta) : 24 * 60;
  if (!hoy?.abierto || fin <= aMin(hoy.desde)) fin = 24 * 60;
  const lista = [];
  for (let m = Math.ceil((ahora + 15) / 15) * 15; m <= Math.min(fin, 23 * 60 + 45); m += 15) lista.push(aHHMM(m));
  return lista;
}

/** Envía (o reemplaza) lo que elegí en un pedido grupal. */
export async function enviarMiParte(token, nombre, lineas) {
  const parteId = parteIdDe(token);
  await api(`/api/grupos/${token}/partes/${parteId}`, {
    method: 'PUT',
    body: {
      nombre,
      clave: datosGrupo(token)?.clave,
      items: lineas.map((l) => ({
        productoId: l.productoId,
        cantidad: l.cantidad,
        acompanamientoId: l.acompanamientoId,
        comentario: l.comentario,
      })),
    },
  });
  guardarDatosGrupo(token, { nombre });
}

async function invitar(token, organizador) {
  const texto = `Estoy armando un pedido en Patagonia Sabores. Elige lo tuyo aquí y llega todo junto:`;
  const url = linkGrupo(token);
  try {
    if (navigator.share) {
      await navigator.share({ title: `Pedido grupal de ${organizador}`, text: texto, url });
      return;
    }
    await navigator.clipboard.writeText(`${texto} ${url}`);
    toast('Enlace copiado. Pégalo en el chat de la oficina.', 'ok');
  } catch {
    /* cancelado */
  }
}

export function CrearGrupo({ menu }) {
  const datos = useStore(misDatos);
  const [nombre, setNombre] = useState(datos.nombre || '');
  const [cierra, setCierra] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  if (!menu) return <Cargando />;
  if (!menu.local.grupos) {
    return (
      <div class="page">
        <BarraVolver titulo="Pedido grupal" />
        <Vacio titulo="No disponible por ahora" texto="Los pedidos grupales están desactivados. Puedes pedir de forma normal desde el menú." />
      </div>
    );
  }
  const horas = horasDeCierre(menu);

  async function crear(e) {
    e.preventDefault();
    if (!nombre.trim()) {
      setError('Cuéntanos tu nombre.');
      return;
    }
    setEnviando(true);
    try {
      const r = await api('/api/grupos', { method: 'POST', body: { organizador: nombre.trim(), cierra: cierra || null } });
      guardarDatosGrupo(r.token, { clave: r.clave, nombre: nombre.trim(), organizador: nombre.trim() });
      navegar(`/grupo/${r.token}`, { reemplazar: true });
      setTimeout(() => invitar(r.token, nombre.trim()), 300);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form class="page grupo" onSubmit={crear} noValidate>
      <BarraVolver titulo="Pedido grupal" />
      <section class="card card-pad stack grupo-intro">
        <h2 class="card-title">Ideal para la oficina</h2>
        <ol class="grupo-pasos">
          <li>
            <span class="paso-n">1</span> Creas el pedido y compartes el enlace por WhatsApp.
          </li>
          <li>
            <span class="paso-n">2</span> Cada uno elige lo suyo desde su celular.
          </li>
          <li>
            <span class="paso-n">3</span> Tú lo envías y llega todo junto, con el nombre de cada uno.
          </li>
        </ol>
      </section>
      <section class="card card-pad stack">
        <label class="field">
          <span class="label">Tu nombre</span>
          <input
            class={`input${error ? ' invalid' : ''}`}
            maxLength={40}
            autoComplete="name"
            value={nombre}
            placeholder="Así te verán los demás"
            onInput={(e) => {
              setNombre(e.currentTarget.value);
              setError('');
            }}
          />
          {error && <span class="error-text">{error}</span>}
        </label>
        <label class="field">
          <span class="label">¿Hasta qué hora se pueden sumar?</span>
          <select class="input" value={cierra} onChange={(e) => setCierra(e.currentTarget.value)}>
            <option value="">Sin límite (lo cierras tú)</option>
            {horas.map((h) => (
              <option key={h} value={h}>
                Hasta las {h}
              </option>
            ))}
          </select>
          <span class="hint">Después de esa hora nadie más puede agregar, y tú envías el pedido.</span>
        </label>
        <button class="btn btn-primary btn-lg btn-block" type="submit" disabled={enviando}>
          {enviando ? <span class="spinner" /> : <Users size={20} />} Crear y compartir
        </button>
      </section>
    </form>
  );
}

export function VerGrupo({ token, menu }) {
  const mios = useStore(misGrupos)[token] || {};
  const esOrganizador = Boolean(mios.clave);
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const yo = datosGrupo(token)?.parteId || '';
      const r = await api(`/api/grupos/${token}${yo ? `?yo=${encodeURIComponent(yo)}` : ''}`);
      setD(r);
      setError(null);
      if (!datosGrupo(token)?.organizador) guardarDatosGrupo(token, { organizador: r.grupo.organizador });
    } catch (e) {
      setError(e);
    }
  }, [token]);

  useEffect(() => {
    setD(null);
    cargar();
  }, [cargar]);
  const vivo = !d || ['abierto', 'cerrado'].includes(d.grupo.estado);
  useSondeo(cargar, 10_000, vivo);

  if (error && !d) {
    return (
      <div class="page">
        <BarraVolver titulo="Pedido grupal" />
        <Vacio titulo="No encontramos este pedido grupal" texto={error.message}>
          <a class="btn btn-primary" href="#/">
            Ir al menú
          </a>
        </Vacio>
      </div>
    );
  }
  if (!d) return <Cargando texto="Juntando a la oficina…" />;

  const { grupo: g, partes, total } = d;
  const mia = partes.find((p) => p.mia);
  const puedoElegir = g.estado === 'abierto' || (g.estado === 'cerrado' && esOrganizador);
  const unidades = partes.reduce((n, p) => n + p.items.reduce((m, i) => m + i.cantidad, 0), 0);

  function elegir() {
    grupoActivo.set({ token, organizador: g.organizador });
    navegar('/');
  }

  function cambiarLoMio() {
    if (!menu || !mia) return;
    const porId = new Map(menu.productos.map((p) => [p.id, p]));
    const acomps = new Map(menu.acompanamientos.map((a) => [a.id, a]));
    carrito.set([]);
    mia.items.forEach((it) => {
      const p = porId.get(it.productoId);
      if (!p || p.agotado) return;
      agregarAlCarrito(p, { cantidad: it.cantidad, acompanamiento: acomps.get(it.acompanamientoId) || null, comentario: it.comentario });
    });
    elegir();
  }

  async function accion(fn, mensaje) {
    setOcupado(true);
    try {
      await fn();
      if (mensaje) toast(mensaje, 'ok');
      await cargar();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setOcupado(false);
    }
  }

  async function quitarLoMio() {
    if (!(await confirmar({ titulo: '¿Quitar lo tuyo?', texto: 'Ya no vas a estar en este pedido.', ok: 'Quitar', peligro: true }))) return;
    accion(() => api(`/api/grupos/${token}/partes/${datosGrupo(token).parteId}`, { method: 'DELETE' }), 'Quitamos lo tuyo');
  }

  async function quitarA(p) {
    if (!(await confirmar({ titulo: `¿Quitar a ${p.nombre}?`, texto: 'Se borra lo que eligió.', ok: 'Quitar', peligro: true }))) return;
    accion(() => api(`/api/grupos/${token}/quitar`, { method: 'POST', body: { clave: mios.clave, num: p.num } }), `Quitamos a ${p.nombre}`);
  }

  async function cancelarGrupo() {
    if (!(await confirmar({ titulo: '¿Cancelar el pedido grupal?', texto: 'Nadie más podrá agregar y no se envía nada al local.', ok: 'Cancelar pedido', cancelar: 'Volver', peligro: true }))) return;
    accion(() => api(`/api/grupos/${token}/cancelar`, { method: 'POST', body: { clave: mios.clave } }), 'Pedido grupal cancelado');
  }

  function hacerPedido() {
    grupoAPagar.set({ token });
    navegar('/pedir');
  }

  const estadoTexto = {
    abierto: g.cierra ? `Pueden sumarse hasta las ${g.cierra}` : 'Abierto: pueden sumarse',
    cerrado: esOrganizador ? 'Ya pasó la hora de cierre: envíalo cuando quieras' : g.mensaje,
    pedido: 'Enviado al local',
    vencido: g.mensaje,
    cancelado: g.mensaje,
  }[g.estado];

  return (
    <div class="page grupo">
      <BarraVolver titulo="Pedido grupal" />

      <section class="card card-pad grupo-cabecera">
        <Rombo color="sol">
          <Users size={20} />
        </Rombo>
        <div class="grow">
          <h2 class="card-title">Pedido de {g.organizador}</h2>
          <p class={`grupo-estado ${g.estado}`}>{estadoTexto}</p>
        </div>
      </section>

      {g.estado === 'pedido' && g.pedidoToken && (
        <a class="notice ok grupo-enviado" href={`#/pedido/${g.pedidoToken}`}>
          <span class="grow">El pedido ya está en el local. Puedes ver cómo va.</span>
          <span class="btn btn-sm">
            Seguir el pedido <ArrowRight size={16} />
          </span>
        </a>
      )}

      {g.estado === 'abierto' && (
        <section class="card card-pad stack grupo-invitar">
          <div>
            <strong>Invita a los demás</strong>
            <small class="block muted">Cada uno abre el enlace, elige lo suyo y listo.</small>
          </div>
          <div class="row wrap">
            <a
              class="btn btn-whatsapp btn-sm"
              href={`https://wa.me/?text=${encodeURIComponent(`Estoy armando un pedido en Patagonia Sabores. Elige lo tuyo aquí y llega todo junto: ${linkGrupo(token)}`)}`}
              target="_blank"
              rel="noopener"
            >
              <MessageCircle size={16} /> WhatsApp
            </a>
            <button class="btn btn-sm" onClick={() => invitar(token, g.organizador)}>
              <Share2 size={16} /> Compartir
            </button>
            <button
              class="btn btn-sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(linkGrupo(token));
                  toast('Enlace copiado', 'ok');
                } catch {
                  toast('No se pudo copiar', 'error');
                }
              }}
            >
              <Copy size={16} /> Copiar enlace
            </button>
          </div>
        </section>
      )}

      {puedoElegir && (
        <div class="grupo-mio">
          {mia ? (
            <div class="row wrap">
              <button class="btn btn-primary grow" onClick={cambiarLoMio} disabled={ocupado || !menu}>
                <Pencil size={18} /> Cambiar lo mío
              </button>
              <button class="btn btn-ghost" onClick={quitarLoMio} disabled={ocupado}>
                <Trash2 size={18} /> Quitar lo mío
              </button>
            </div>
          ) : (
            <button class="btn btn-primary btn-lg btn-block" onClick={elegir}>
              Elegir lo mío <ArrowRight size={20} />
            </button>
          )}
        </div>
      )}

      <section class="card card-pad stack">
        <div class="row-between">
          <h2 class="card-title">¿Qué pidió cada uno?</h2>
          <span class="subtle small">
            {partes.length} {partes.length === 1 ? 'persona' : 'personas'}
            {unidades > 0 && ` · ${unidades} ${unidades === 1 ? 'producto' : 'productos'}`}
          </span>
        </div>
        {partes.length === 0 ? (
          <p class="muted">Todavía nadie elige. Comparte el enlace para que se sumen.</p>
        ) : (
          <ul class="grupo-partes">
            {partes.map((p) => (
              <li key={p.num} class={`grupo-parte${p.mia ? ' mia' : ''}`}>
                <div class="row-between">
                  <strong>
                    {p.nombre} {p.mia && <span class="pill sun">Tú</span>}
                  </strong>
                  <span class="row">
                    <span class="num">{clp(p.total)}</span>
                    {esOrganizador && !p.mia && ['abierto', 'cerrado'].includes(g.estado) && (
                      <button class="icon-btn sm" aria-label={`Quitar a ${p.nombre}`} onClick={() => quitarA(p)} disabled={ocupado}>
                        <X size={15} />
                      </button>
                    )}
                  </span>
                </div>
                <ul class="grupo-items">
                  {p.items.map((it, i) => (
                    <li key={i}>
                      {it.cantidad}× {it.nombre}
                      {it.acompanamiento && <small> con {it.acompanamiento}</small>}
                      {it.comentario && <small class="comment"> “{it.comentario}”</small>}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
        {partes.length > 0 && (
          <div class="row-between total-final">
            <span>Total</span>
            <span class="num">{clp(total)}</span>
          </div>
        )}
      </section>

      {esOrganizador && ['abierto', 'cerrado'].includes(g.estado) ? (
        <div class="stack">
          <button class="btn btn-primary btn-lg btn-block" onClick={hacerPedido} disabled={!partes.length || ocupado}>
            Hacer el pedido · <span class="num">{clp(total)}</span>
          </button>
          <p class="hint center">Revisas la entrega y el pago, y lo envías al local. El envío se suma al final si es delivery.</p>
          <button class="btn btn-ghost btn-sm" onClick={cancelarGrupo} disabled={ocupado}>
            Cancelar pedido grupal
          </button>
        </div>
      ) : (
        ['abierto', 'cerrado'].includes(g.estado) && (
          <p class="hint center">Cuando todos elijan, {g.organizador} envía el pedido al local.</p>
        )
      )}
    </div>
  );
}

/** Aviso en el menú mientras eliges lo tuyo para un pedido grupal. */
export function AvisoGrupo() {
  const activo = useStore(grupoActivo);
  if (!activo) return null;
  return (
    <div class="aviso-grupo">
      <Rombo color="sol" chico>
        <Users size={15} />
      </Rombo>
      <div class="grow">
        <strong>Pedido grupal de {activo.organizador}</strong>
        <small>Elige lo tuyo y toca "Agregar lo mío" en tu carro.</small>
      </div>
      <a class="btn btn-dark btn-sm" href={`#/grupo/${activo.token}`}>
        Ver grupo
      </a>
      <button
        class="icon-btn sm"
        aria-label="Salir del pedido grupal"
        onClick={async () => {
          if (await confirmar({ titulo: '¿Salir del pedido grupal?', texto: 'Tu carro vuelve a ser un pedido normal. Lo que ya agregaste al grupo se mantiene.', ok: 'Salir' })) {
            grupoActivo.set(null);
          }
        }}
      >
        <X size={16} />
      </button>
    </div>
  );
}

/** Invitación a armar un pedido grupal, al final del menú. */
export function TarjetaGrupo() {
  return (
    <section class="tarjeta-grupo">
      <Rombo color="magenta">
        <Users size={20} />
      </Rombo>
      <div class="grow">
        <strong>¿Piden varios en la oficina?</strong>
        <small>Arma un pedido grupal: cada uno elige lo suyo desde su celular y llega todo junto.</small>
      </div>
      <a class="btn btn-dark btn-sm" href="#/grupo/nuevo">
        Armar pedido
      </a>
    </section>
  );
}

/** Pie del carro en modo grupo: tu nombre y "Agregar lo mío". */
export function PieCarroGrupo({ lineas, onListo }) {
  const activo = useStore(grupoActivo);
  const datos = useStore(misDatos);
  const [nombre, setNombre] = useState(datosGrupo(activo?.token)?.nombre || datos.nombre || '');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  if (!activo) return null;

  async function enviar() {
    if (!nombre.trim()) {
      setError('Escribe tu nombre para que sepan que es tuyo.');
      return;
    }
    if (lineas.length > 8) {
      toast('Puedes elegir hasta 8 productos distintos en un pedido grupal.', 'error');
      return;
    }
    setEnviando(true);
    try {
      await enviarMiParte(activo.token, nombre.trim(), lineas);
      carrito.set([]);
      grupoActivo.set(null);
      onListo();
      toast('Listo: lo tuyo quedó en el pedido grupal', 'ok');
      navegar(`/grupo/${activo.token}`);
    } catch (e) {
      toast(e.message, 'error', { ms: 6000 });
      if (e.data?.grupo) grupoActivo.set(null);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div class="stack">
      <label class="field">
        <span class="label">Tu nombre</span>
        <input
          class={`input${error ? ' invalid' : ''}`}
          maxLength={40}
          value={nombre}
          placeholder="Para que sepan que es tuyo"
          onInput={(e) => {
            setNombre(e.currentTarget.value);
            setError('');
          }}
        />
        {error && <span class="error-text">{error}</span>}
      </label>
      <button class="btn btn-primary btn-lg btn-block" onClick={enviar} disabled={enviando}>
        {enviando ? <span class="spinner" /> : null} Agregar lo mío al pedido de {activo.organizador}
      </button>
    </div>
  );
}
