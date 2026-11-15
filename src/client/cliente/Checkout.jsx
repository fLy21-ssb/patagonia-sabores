import { Fragment } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { ArrowLeft, Banknote, Bell, Bike, CreditCard, Landmark, Megaphone, Store, TicketPercent, UtensilsCrossed, X } from 'lucide-preact';
import { api } from '../shared/api.js';
import { clp, EMAIL_RE, PAGOS, porPersona, sugerirCorreo } from '../shared/format.js';
import { navegar } from '../shared/hooks.js';
import { useStore } from '../shared/store.js';
import { Switch, Vacio, toast } from '../shared/ui.jsx';
import { Rombo } from '../shared/simbolos.jsx';
import { esIOS, esStandalone, pushSoportado, suscribirPush } from '../shared/pwa.js';
import {
  carrito,
  cuponGuardado,
  datosGrupo,
  descuentoDe,
  grupoActivo,
  grupoAPagar,
  mesaActual,
  misDatos,
  precioDe,
  recordarPedido,
  totalCarrito,
  unidades,
} from './estado.js';

const ICONO_PAGO = { efectivo: Banknote, transferencia: Landmark, tarjeta: CreditCard };

export function Checkout({ menu, recargarMenu }) {
  if (!menu) {
    return (
      <div class="page-center">
        <div class="spinner" />
      </div>
    );
  }
  return <CheckoutListo menu={menu} recargarMenu={recargarMenu} />;
}

function CheckoutListo({ menu, recargarMenu }) {
  const { local, estado, productos } = menu;
  const lineas = useStore(carrito);
  const mesa = useStore(mesaActual);
  const datos = useStore(misDatos);
  const productosPorId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);

  // Pedido grupal: los productos vienen de lo que eligió cada persona (solo el organizador llega aquí).
  const grupoPago = useStore(grupoAPagar);
  const claveGrupo = grupoPago ? datosGrupo(grupoPago.token)?.clave : null;
  const [grupoDatos, setGrupoDatos] = useState(null);
  const [grupoError, setGrupoError] = useState(null);
  useEffect(() => {
    if (!grupoPago) return;
    if (!claveGrupo) {
      grupoAPagar.set(null);
      return;
    }
    setGrupoDatos(null);
    api(`/api/grupos/${grupoPago.token}`).then(setGrupoDatos).catch(setGrupoError);
  }, [grupoPago?.token]);

  // Para más tarde (mismo día)
  const programables = estado.programables || [];
  const puedeProgramar = Boolean(local.programar) && programables.length > 0;
  const [cuando, setCuando] = useState(estado.abierto ? 'ahora' : 'despues');
  const [horaProg, setHoraProg] = useState('');
  useEffect(() => {
    if (horaProg && !programables.includes(horaProg)) setHoraProg('');
  }, [programables.join(',')]);
  useEffect(() => {
    if (!estado.abierto && puedeProgramar) setCuando('despues');
  }, [estado.abierto, puedeProgramar]);

  const tiposDisponibles = ['retiro', 'delivery', 'mesa'].filter((t) => local.tipos[t] && (t !== 'mesa' || (mesa && !grupoPago)));
  const [tipo, setTipo] = useState(mesa && local.tipos.mesa && !grupoPago ? 'mesa' : tiposDisponibles.find((t) => t !== 'mesa') || tiposDisponibles[0]);
  const [nombre, setNombre] = useState(datos.nombre || (grupoPago && datosGrupo(grupoPago.token)?.nombre) || '');
  const [telefono, setTelefono] = useState(datos.telefono || '');
  const [email, setEmail] = useState(datos.email || '');
  const [direccion, setDireccion] = useState(datos.direccion || '');
  const [notas, setNotas] = useState('');
  const pagosDisponibles = Object.keys(PAGOS).filter((k) => local.pagos[k]);
  const [pago, setPago] = useState(pagosDisponibles[0]);
  const [recordar, setRecordar] = useState(datos.recordar !== false);
  const puedeAvisar = pushSoportado() && Boolean(menu.vapidPublicKey);
  const [avisarme, setAvisarme] = useState(puedeAvisar && Notification.permission !== 'denied');
  const [promos, setPromos] = useState(false);
  const [cupon, setCupon] = useState(null); // código ya validado por el servidor
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [trampa, setTrampa] = useState('');

  if (grupoPago && (grupoError || (grupoDatos && grupoDatos.partes.length === 0))) {
    return (
      <div class="page">
        <BarraVolver titulo="Enviar pedido grupal" />
        <Vacio titulo={grupoError ? 'No pudimos cargar el pedido grupal' : 'Nadie ha elegido todavía'} texto={grupoError?.message || 'Comparte el enlace para que se sumen.'}>
          <a class="btn btn-primary" href={`#/grupo/${grupoPago.token}`}>
            Volver al pedido grupal
          </a>
        </Vacio>
      </div>
    );
  }
  if (grupoPago && !grupoDatos) {
    return (
      <div class="page-center">
        <div class="spinner" />
      </div>
    );
  }
  if (!grupoPago && !lineas.length) {
    return (
      <div class="page">
        <BarraVolver titulo="Finalizar pedido" />
        <Vacio titulo="Tu carro está vacío" texto="Agrega algo rico del menú para continuar.">
          <a class="btn btn-primary" href="#/">
            Ver el menú
          </a>
        </Vacio>
      </div>
    );
  }

  // Lo que se va a pedir: el carro, o lo de todos en un pedido grupal (con el nombre de cada persona).
  const items = grupoPago
    ? grupoDatos.partes.flatMap((pt) =>
        pt.items.map((it, i) => ({
          clave: `${pt.num}-${i}`,
          productoId: it.productoId,
          nombre: it.nombre,
          precio: it.precio,
          cantidad: it.cantidad,
          acompanamiento: it.acompanamiento,
          comentario: it.comentario,
          persona: pt.nombre,
        })),
      )
    : lineas;
  const programando = tipo !== 'mesa' && cuando === 'despues' && puedeProgramar;

  const subtotal = totalCarrito(items, productosPorId);
  const envio = tipo === 'delivery' ? local.delivery.costo : 0;
  const descuento = descuentoDe(cupon, subtotal);
  const total = subtotal + envio - descuento;
  const faltaMinimo = tipo === 'delivery' && subtotal < local.delivery.minimo;
  const emailLimpio = email.trim().toLowerCase();
  const emailValido = EMAIL_RE.test(emailLimpio);
  const canalesPromo = [emailValido && 'correo', puedeAvisar && avisarme && 'notificación'].filter(Boolean);

  function validar() {
    const e = {};
    if (!nombre.trim()) e.nombre = 'Cuéntanos tu nombre.';
    const digitos = telefono.replace(/\D/g, '');
    if (tipo !== 'mesa' && digitos.length < 8) e.telefono = 'Necesitamos un teléfono para contactarte.';
    else if (digitos && (digitos.length < 8 || digitos.length > 15)) e.telefono = 'Revisa el teléfono.';
    if (emailLimpio && !emailValido) e.email = 'Revisa tu correo (ejemplo: nombre@gmail.com).';
    if (tipo === 'delivery' && !direccion.trim()) e.direccion = '¿A dónde te lo llevamos?';
    if (!pago) e.pago = 'Elige cómo pagas.';
    if (programando && !horaProg) e.programado = 'Elige a qué hora lo quieres.';
    setErrores(e);
    return Object.keys(e).length === 0;
  }

  async function confirmarPedido(ev) {
    ev.preventDefault();
    if (enviando) return;
    if (!validar()) {
      toast('Revisa los datos marcados en rojo.', 'error');
      document.querySelector('.invalid')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (faltaMinimo) return;
    setEnviando(true);
    // El permiso de notificaciones debe pedirse dentro del toque del usuario
    let permiso = null;
    if (avisarme && puedeAvisar && Notification.permission === 'default') {
      permiso = Notification.requestPermission().catch(() => 'default');
    }
    const conPromos = promos && canalesPromo.length > 0;
    try {
      const r = await api('/api/pedidos', {
        method: 'POST',
        body: {
          tipo,
          mesa: tipo === 'mesa' ? mesa?.numero : undefined,
          mesaFirma: tipo === 'mesa' ? mesa?.firma : undefined,
          cliente: { nombre: nombre.trim(), telefono: telefono.trim(), email: emailValido ? emailLimpio : '' },
          direccion: tipo === 'delivery' ? direccion.trim() : '',
          notas: notas.trim(),
          metodoPago: pago,
          cupon: cupon && descuento > 0 ? cupon.codigo : undefined,
          promos: conPromos && emailValido,
          programado: programando ? horaProg : undefined,
          grupo: grupoPago ? { token: grupoPago.token, clave: claveGrupo } : undefined,
          web: trampa,
          items: grupoPago
            ? []
            : lineas.map((l) => ({
                productoId: l.productoId,
                cantidad: l.cantidad,
                acompanamientoId: l.acompanamientoId,
                comentario: l.comentario,
              })),
        },
      });
      recordarPedido({ token: r.token, id: r.id, creado: new Date().toISOString(), total, estado: 'pendiente' });
      misDatos.set(
        recordar
          ? { nombre: nombre.trim(), telefono: telefono.trim(), email: emailValido ? emailLimpio : '', direccion: direccion.trim(), recordar: true }
          : { nombre: '', telefono: '', email: '', direccion: '', recordar: false },
      );
      if (grupoPago) {
        if (grupoActivo.get()?.token === grupoPago.token) grupoActivo.set(null);
        grupoAPagar.set(null);
      } else {
        carrito.set([]);
      }
      if (cupon && cuponGuardado.get()?.codigo === cupon.codigo) cuponGuardado.set(null);
      try {
        sessionStorage.setItem('ps-recien', r.token);
      } catch {
        /* sin almacenamiento */
      }
      if (avisarme && puedeAvisar) {
        try {
          await permiso;
          if (Notification.permission === 'granted') {
            const sub = await suscribirPush(menu.vapidPublicKey, { pedirPermiso: false });
            await api(`/api/pedidos/${r.token}/suscripcion`, { method: 'POST', body: sub });
            if (conPromos) await api('/api/promos/suscripcion', { method: 'POST', body: sub }).catch(() => {});
          }
        } catch (e) {
          console.warn('No se activaron los avisos', e);
        }
      }
      navegar(`/pedido/${r.token}`, { reemplazar: true });
    } catch (e) {
      if (e.data?.campo === 'programado') {
        setHoraProg('');
        setErrores((x) => ({ ...x, programado: e.message }));
      }
      if (e.data?.grupo && grupoPago) {
        toast(e.message, 'error', { ms: 6000 });
        const token = grupoPago.token;
        grupoAPagar.set(null);
        navegar(`/grupo/${token}`, { reemplazar: true });
        return;
      }
      if (e.data?.campo === 'cupon') {
        setCupon(null);
        setErrores((x) => ({ ...x, cupon: e.message }));
        document.querySelector('.cupon-campo')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      toast(e.message, 'error', { ms: 6000 });
      if (e.status === 409 && e.data?.campo !== 'cupon') recargarMenu();
    } finally {
      setEnviando(false);
    }
  }

  const iosSinInstalar = esIOS() && !esStandalone();
  const sugerencia = emailLimpio && emailValido ? sugerirCorreo(emailLimpio) : null;

  return (
    <form class="page checkout" onSubmit={confirmarPedido} noValidate>
      <BarraVolver titulo={grupoPago ? 'Enviar pedido grupal' : 'Finalizar pedido'} />

      {!estado.abierto &&
        (puedeProgramar && tipo !== 'mesa' ? (
          <div class="notice">{estado.mensaje}. Puedes dejar tu pedido programado para hoy.</div>
        ) : (
          <div class="notice bad">{estado.mensaje}</div>
        ))}

      <section class="card card-pad stack">
        <h2 class="card-title">
          <span class="paso-n">1</span> ¿Cómo lo quieres?
        </h2>
        <div class="options">
          {tiposDisponibles.map((t) => {
            const info = {
              retiro: { Icono: Store, titulo: 'Retiro en el local', detalle: local.direccion || 'Pasas a buscarlo cuando esté listo' },
              delivery: {
                Icono: Bike,
                titulo: 'Delivery',
                detalle: `${local.delivery.costo ? clp(local.delivery.costo) : 'Gratis'}${local.delivery.minimo ? ` · mínimo ${clp(local.delivery.minimo)}` : ''}`,
              },
              mesa: { Icono: UtensilsCrossed, titulo: `En la mesa ${mesa?.numero}`, detalle: 'Te lo llevamos a tu mesa' },
            }[t];
            return (
              <label key={t} class={`option${tipo === t ? ' on' : ''}`}>
                <input type="radio" name="tipo" checked={tipo === t} onChange={() => setTipo(t)} />
                <Rombo color={tipo === t ? 'magenta' : 'crema'}>
                  <info.Icono size={18} />
                </Rombo>
                <span class="grow">
                  <strong>{info.titulo}</strong>
                  <small>{info.detalle}</small>
                </span>
              </label>
            );
          })}
        </div>
        {tipo === 'delivery' && local.delivery.zona && <p class="hint">{local.delivery.zona}</p>}
        {tipo !== 'mesa' && puedeProgramar && (
          <div class="cuando stack">
            {estado.abierto && (
              <>
                <span class="label">¿Para cuándo?</span>
                <div class="options cols-2">
                  <label class={`option compact${cuando === 'ahora' ? ' on' : ''}`}>
                    <input type="radio" name="cuando" checked={cuando === 'ahora'} onChange={() => setCuando('ahora')} />
                    <span class="grow">
                      <strong>Lo antes posible</strong>
                      <small>En unos {local.tiempoPreparacion} min</small>
                    </span>
                  </label>
                  <label class={`option compact${cuando === 'despues' ? ' on' : ''}`}>
                    <input type="radio" name="cuando" checked={cuando === 'despues'} onChange={() => setCuando('despues')} />
                    <span class="grow">
                      <strong>Más tarde</strong>
                      <small>Hoy, a la hora que elijas</small>
                    </span>
                  </label>
                </div>
              </>
            )}
            {programando && (
              <label class="field">
                <span class="label">{tipo === 'delivery' ? '¿A qué hora te lo llevamos?' : '¿A qué hora lo retiras?'}</span>
                <select
                  class={`input${errores.programado ? ' invalid' : ''}`}
                  value={horaProg}
                  onChange={(e) => {
                    setHoraProg(e.currentTarget.value);
                    setErrores((x) => ({ ...x, programado: null }));
                  }}
                >
                  <option value="">Elige la hora</option>
                  {programables.map((h) => (
                    <option key={h} value={h}>
                      {tipo === 'delivery' ? `Cerca de las ${h}` : `Listo a las ${h}`}
                    </option>
                  ))}
                </select>
                {errores.programado && <span class="error-text">{errores.programado}</span>}
              </label>
            )}
          </div>
        )}
      </section>

      <section class="card card-pad stack">
        <h2 class="card-title">
          <span class="paso-n">2</span> Tus datos
        </h2>
        <label class="field">
          <span class="label">Nombre</span>
          <input
            class={`input${errores.nombre ? ' invalid' : ''}`}
            autoComplete="name"
            maxLength={60}
            value={nombre}
            placeholder="¿A nombre de quién?"
            onInput={(e) => setNombre(e.currentTarget.value)}
          />
          {errores.nombre && <span class="error-text">{errores.nombre}</span>}
        </label>
        <label class="field">
          <span class="label">
            Teléfono {tipo === 'mesa' && '(opcional)'}
          </span>
          <input
            class={`input${errores.telefono ? ' invalid' : ''}`}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            maxLength={25}
            value={telefono}
            placeholder="+56 9 1234 5678"
            onInput={(e) => setTelefono(e.currentTarget.value)}
          />
          {errores.telefono && <span class="error-text">{errores.telefono}</span>}
        </label>
        <div class="field">
          <label class="label" for="correo-cliente">
            Correo <span class="opcional">opcional</span>
          </label>
          <input
            id="correo-cliente"
            class={`input${errores.email ? ' invalid' : ''}`}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="off"
            spellcheck={false}
            maxLength={100}
            value={email}
            placeholder="nombre@gmail.com"
            onInput={(e) => setEmail(e.currentTarget.value)}
          />
          {sugerencia && (
            <button type="button" class="sugerencia-correo" onClick={() => setEmail(sugerencia)}>
              ¿Quisiste decir <strong>{sugerencia}</strong>?
            </button>
          )}
          {errores.email ? (
            <span class="error-text">{errores.email}</span>
          ) : (
            <span class="hint">Te escribimos cuando recibamos tu pedido y cuando esté {tipo === 'delivery' ? 'en camino' : 'listo'}.</span>
          )}
        </div>
        {tipo === 'delivery' && (
          <label class="field">
            <span class="label">Dirección de entrega</span>
            <input
              class={`input${errores.direccion ? ' invalid' : ''}`}
              autoComplete="street-address"
              maxLength={200}
              value={direccion}
              placeholder="Calle, número, depto y alguna referencia"
              onInput={(e) => setDireccion(e.currentTarget.value)}
            />
            {errores.direccion && <span class="error-text">{errores.direccion}</span>}
          </label>
        )}
        <div class="switch-row">
          <span class="muted small">Recordar mis datos en este dispositivo</span>
          <Switch checked={recordar} onChange={setRecordar} etiqueta="Recordar mis datos" />
        </div>
        <input class="trampa" tabIndex={-1} autoComplete="off" aria-hidden="true" value={trampa} onInput={(e) => setTrampa(e.currentTarget.value)} name="web" />
      </section>

      <section class="card card-pad stack">
        <h2 class="card-title">
          <span class="paso-n">3</span> ¿Cómo pagas?
        </h2>
        <div class="options">
          {pagosDisponibles.map((k) => {
            const Icono = ICONO_PAGO[k];
            return (
              <label key={k} class={`option${pago === k ? ' on' : ''}`}>
                <input type="radio" name="pago" checked={pago === k} onChange={() => setPago(k)} />
                <Rombo color={pago === k ? 'magenta' : 'crema'}>
                  <Icono size={18} />
                </Rombo>
                <span class="grow">
                  <strong>{PAGOS[k].nombre}</strong>
                  <small>{PAGOS[k].detalle}</small>
                </span>
              </label>
            );
          })}
        </div>
        {errores.pago && <span class="error-text">{errores.pago}</span>}
      </section>

      <section class="card card-pad stack">
        <h2 class="card-title">
          <span class="paso-n">4</span> Resumen
        </h2>
        <ul class="resumen">
          {porPersona(items).map((g) => (
            <Fragment key={g.persona || 'todos'}>
              {g.persona && <li class="resumen-persona">{g.persona}</li>}
              {g.items.map((l) => (
                <li key={l.clave}>
                  <span class="qty">{l.cantidad}×</span>
                  <span class="grow">
                    {l.nombre}
                    {l.acompanamiento && <small>Con {l.acompanamiento}</small>}
                    {l.comentario && <small class="comment">“{l.comentario}”</small>}
                  </span>
                  <span class="num">{clp(precioDe(l, productosPorId) * l.cantidad)}</span>
                </li>
              ))}
            </Fragment>
          ))}
        </ul>
        {grupoPago ? (
          <a class="btn btn-ghost btn-sm editar" href={`#/grupo/${grupoPago.token}`}>
            Volver al pedido grupal
          </a>
        ) : (
          <a class="btn btn-ghost btn-sm editar" href="#/">
            Agregar o cambiar productos
          </a>
        )}
        <CampoCupon
          subtotal={subtotal}
          cupon={cupon}
          setCupon={setCupon}
          error={errores.cupon}
          setError={(m) => setErrores((x) => ({ ...x, cupon: m }))}
          telefono={telefono}
          email={emailValido ? emailLimpio : ''}
        />
        <label class="field">
          <span class="label">
            Notas para el local (opcional)
          </span>
          <textarea
            class="textarea"
            rows={2}
            maxLength={300}
            value={notas}
            placeholder="Ej: paso a las 13:30, tocar el timbre 2 veces…"
            onInput={(e) => setNotas(e.currentTarget.value)}
          />
        </label>
        <div class="totales">
          <div class="row-between">
            <span>Subtotal</span>
            <span class="num">{clp(subtotal)}</span>
          </div>
          {tipo === 'delivery' && (
            <div class="row-between">
              <span>Envío</span>
              <span class="num">{envio ? clp(envio) : 'Gratis'}</span>
            </div>
          )}
          {descuento > 0 && (
            <div class="row-between linea-descuento">
              <span>Descuento · {cupon.codigo}</span>
              <span class="num">−{clp(descuento)}</span>
            </div>
          )}
          <div class="row-between total-final">
            <span>Total</span>
            <span class="num">{clp(total)}</span>
          </div>
        </div>
        {faltaMinimo && (
          <div class="notice">
            El mínimo para delivery es {clp(local.delivery.minimo)}. Te faltan {clp(local.delivery.minimo - subtotal)}.
          </div>
        )}
      </section>

      {(puedeAvisar || emailValido || iosSinInstalar) && (
        <section class="card card-pad stack avisos-checkout">
          {puedeAvisar && (
            <div class="aviso-push">
              <Rombo color="sol">
                <Bell size={18} />
              </Rombo>
              <div class="grow">
                <strong>Avísame cuando esté listo</strong>
                <small class="muted">Te llega una notificación aunque cierres la app.</small>
              </div>
              <Switch checked={avisarme} onChange={setAvisarme} etiqueta="Avisarme cuando esté listo" />
            </div>
          )}
          {!puedeAvisar && iosSinInstalar && (
            <div class="notice info">
              <Bell size={20} />
              <span>
                En iPhone, para recibir notificaciones agrega la app a tu inicio (Compartir → Agregar a inicio). {emailValido ? 'Igual te avisamos por correo.' : 'Igual puedes seguir tu pedido en vivo en esta página.'}
              </span>
            </div>
          )}
          {canalesPromo.length > 0 && (
            <div class="aviso-push">
              <Rombo color="magenta">
                <Megaphone size={17} />
              </Rombo>
              <div class="grow">
                <strong>Quiero recibir promociones</strong>
                <small class="muted">
                  Descuentos y novedades por {canalesPromo.join(' y ')}. Te das de baja cuando quieras.
                </small>
              </div>
              <Switch checked={promos} onChange={setPromos} etiqueta="Quiero recibir promociones" />
            </div>
          )}
        </section>
      )}

      <div class="checkout-bar">
        <button class="btn btn-primary btn-lg btn-block" type="submit" disabled={enviando || (!estado.abierto && !programando) || faltaMinimo}>
          {enviando ? (
            <>
              <span class="spinner" /> Enviando…
            </>
          ) : (
            <>
              Confirmar pedido · <span class="num">{clp(total)}</span>
            </>
          )}
        </button>
        <p class="hint center">
          {programando && horaProg ? `Para las ${horaProg} · ` : ''}
          {unidades(items)} productos · pagas al {tipo === 'delivery' ? 'recibir' : tipo === 'mesa' ? 'final' : 'retirar'}
          {pago === 'transferencia' ? ' o por transferencia' : ''}
          {descuento > 0 ? ` · ahorras ${clp(descuento)}` : ''}
        </p>
      </div>
    </form>
  );
}

/** Código de descuento: se valida con el servidor y se recalcula si cambia el carro. */
function CampoCupon({ subtotal, cupon, setCupon, error, setError, telefono, email }) {
  const guardado = useStore(cuponGuardado);
  const [abierto, setAbierto] = useState(Boolean(guardado));
  const [codigo, setCodigo] = useState(guardado?.codigo || '');
  const [validando, setValidando] = useState(false);
  const intentoGuardado = useRef(false);

  async function aplicar(valor = codigo, { silencioso = false } = {}) {
    const limpio = String(valor || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!limpio) {
      setError('Escribe tu código.');
      return;
    }
    setValidando(true);
    setError(null);
    try {
      const r = await api('/api/cupones/validar', { method: 'POST', body: { codigo: limpio, subtotal, telefono, email } });
      setCupon(r.cupon);
      setCodigo(r.cupon.codigo);
      if (!silencioso) toast(`Código ${r.cupon.codigo} aplicado: ahorras ${clp(r.cupon.descuento)}`, 'ok');
    } catch (e) {
      setCupon(null);
      setError(e.message);
    } finally {
      setValidando(false);
    }
  }

  // Código que llegó en una promoción: se intenta aplicar solo al entrar a pagar.
  useEffect(() => {
    if (guardado?.codigo && !cupon && !intentoGuardado.current) {
      intentoGuardado.current = true;
      setAbierto(true);
      setCodigo(guardado.codigo);
      aplicar(guardado.codigo, { silencioso: true });
    }
  }, [guardado]);

  if (cupon) {
    const bajoMinimo = subtotal < (cupon.minimo || 0);
    return (
      <div class={`cupon-campo cupon-aplicado${bajoMinimo ? ' en-pausa' : ''}`}>
        <Rombo color={bajoMinimo ? 'crema' : 'sol'} chico>
          <TicketPercent size={16} />
        </Rombo>
        <div class="grow">
          <strong class="cupon-codigo">{cupon.codigo}</strong>
          <small>{bajoMinimo ? `Agrega ${clp(cupon.minimo - subtotal)} más para usar este código.` : cupon.resumen}</small>
        </div>
        <button
          type="button"
          class="icon-btn sm"
          aria-label={`Quitar el código ${cupon.codigo}`}
          onClick={() => {
            setCupon(null);
            if (guardado?.codigo === cupon.codigo) cuponGuardado.set(null);
          }}
        >
          <X size={16} />
        </button>
      </div>
    );
  }

  if (!abierto) {
    return (
      <button type="button" class="cupon-campo cupon-abrir" onClick={() => setAbierto(true)}>
        <TicketPercent size={18} /> ¿Tienes un código de descuento?
      </button>
    );
  }

  return (
    <div class="cupon-campo field">
      <label class="label" for="codigo-descuento">
        Código de descuento
      </label>
      <div class="cupon-fila">
        <input
          id="codigo-descuento"
          class={`input cupon-input${error ? ' invalid' : ''}`}
          value={codigo}
          maxLength={20}
          autoCapitalize="characters"
          autoComplete="off"
          spellcheck={false}
          placeholder="EJ: BIENVENIDA"
          onInput={(e) => setCodigo(e.currentTarget.value.toUpperCase())}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              aplicar();
            }
          }}
        />
        <button type="button" class="btn btn-dark" onClick={() => aplicar()} disabled={validando}>
          {validando ? <span class="spinner" /> : 'Aplicar'}
        </button>
      </div>
      {error && <span class="error-text">{error}</span>}
    </div>
  );
}

export function BarraVolver({ titulo, destino = '/' }) {
  return (
    <div class="barra-volver">
      <button
        type="button"
        class="icon-btn"
        aria-label="Volver"
        onClick={() => (history.length > 1 ? history.back() : navegar(destino))}
      >
        <ArrowLeft size={20} />
      </button>
      <h1>{titulo}</h1>
    </div>
  );
}
