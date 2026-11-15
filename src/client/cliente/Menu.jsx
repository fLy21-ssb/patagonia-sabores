import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  ArrowRight,
  Bike,
  Clock,
  Download,
  MapPin,
  Megaphone,
  MessageCircle,
  Phone,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  Share,
  Store,
  Trash2,
  UtensilsCrossed,
  X,
} from 'lucide-preact';
import { clp, DIAS, linkWhatsapp, normalizar } from '../shared/format.js';
import { navegar } from '../shared/hooks.js';
import { useStore } from '../shared/store.js';
import { IconoInstagram, Sheet, Stepper, Vacio, confirmar } from '../shared/ui.jsx';
import { useInstalacion } from '../shared/pwa.js';
import { Atardecer, Cargando, Cordillera, Destello, IconoCategoria, Postal, Rombo } from '../shared/simbolos.jsx';
import {
  agregarAlCarrito,
  cambiarCantidad,
  carrito,
  instalarDescartado,
  mesaActual,
  misPedidos,
  precioDe,
  totalCarrito,
  unidades,
} from './estado.js';
import { AvisoCuponGuardado, TarjetaPromos } from './Promos.jsx';

export function Menu({ menu, error, recargar }) {
  if (!menu) return error ? <ErrorCarga error={error} recargar={recargar} /> : <MenuCargando />;
  return <MenuListo menu={menu} />;
}

function Portada({ acciones }) {
  return (
    <Atardecer class="portada">
      <div class="portada-top">{acciones}</div>
      <h1 class="portada-logo">
        <img src="/brand/logo.webp" alt="Patagonia Sabores" width="720" height="471" fetchpriority="high" />
      </h1>
    </Atardecer>
  );
}

function MenuCargando() {
  return (
    <div aria-busy="true">
      <Portada />
      <Cargando texto="Cebando el mate…" />
    </div>
  );
}

function ErrorCarga({ error, recargar }) {
  const [cargando, setCargando] = useState(false);
  return (
    <div>
      <Portada />
      <Vacio titulo="No pudimos cargar el menú" texto={error?.message || 'Intenta de nuevo en un momento.'}>
        <button
          class="btn btn-primary"
          disabled={cargando}
          onClick={async () => {
            setCargando(true);
            await recargar();
            setCargando(false);
          }}
        >
          <RefreshCw size={18} /> Reintentar
        </button>
      </Vacio>
    </div>
  );
}

function MenuListo({ menu }) {
  const { local, estado, categorias, productos, acompanamientos } = menu;
  const lineas = useStore(carrito);
  const mesa = useStore(mesaActual);
  const pedidos = useStore(misPedidos);
  const descartado = useStore(instalarDescartado);
  const instalacion = useInstalacion();
  const [productoAbierto, setProductoAbierto] = useState(null);
  const [carritoAbierto, setCarritoAbierto] = useState(false);
  const [iosAyuda, setIosAyuda] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [activa, setActiva] = useState(null);
  const [bump, setBump] = useState(false);
  const navRef = useRef(null);
  const totalUnidades = unidades(lineas);
  const totalPrevio = useRef(totalUnidades);

  const bitHoy = 1 << estado.dow;
  const productosPorId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);
  const disponibles = useMemo(() => productos.filter((p) => p.dias & bitHoy), [productos, bitHoy]);
  const visibles = useMemo(() => {
    const q = normalizar(busqueda.trim());
    return q ? disponibles.filter((p) => normalizar(`${p.nombre} ${p.descripcion}`).includes(q)) : disponibles;
  }, [disponibles, busqueda]);

  const secciones = useMemo(() => {
    const idsCat = new Set(categorias.map((c) => c.id));
    const lista = categorias
      .map((c) => ({ ...c, productos: visibles.filter((p) => p.categoriaId === c.id) }))
      .filter((s) => s.productos.length);
    const otros = visibles.filter((p) => !idsCat.has(p.categoriaId));
    if (otros.length) lista.push({ id: 'otros', nombre: 'Otros', emoji: 'estrella', productos: otros });
    return lista;
  }, [categorias, visibles]);

  const iconoDe = (p) => categorias.find((c) => c.id === p.categoriaId)?.emoji || 'plato';
  const destacados = busqueda ? [] : disponibles.filter((p) => p.destacado && !p.agotado);
  const enCarrito = useMemo(() => {
    const m = new Map();
    lineas.forEach((l) => m.set(l.productoId, (m.get(l.productoId) || 0) + l.cantidad));
    return m;
  }, [lineas]);
  const activos = pedidos.filter(
    (p) => !['entregado', 'cancelado'].includes(p.estado) && Date.now() - new Date(p.creado).getTime() < 12 * 3600e3,
  ).length;

  useEffect(() => {
    if (totalUnidades > totalPrevio.current) {
      setBump(true);
      const t = setTimeout(() => setBump(false), 450);
      totalPrevio.current = totalUnidades;
      return () => clearTimeout(t);
    }
    totalPrevio.current = totalUnidades;
    return undefined;
  }, [totalUnidades]);

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entradas) => {
        const visible = entradas.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActiva(visible.target.dataset.cat);
      },
      { rootMargin: '-90px 0px -60% 0px' },
    );
    document.querySelectorAll('[data-cat]').forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [secciones]);

  useEffect(() => {
    const chip = navRef.current?.querySelector(`[data-chip="${activa}"]`);
    chip?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [activa]);

  const irA = (id) => document.getElementById(`cat-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const agregarRapido = (p) => {
    if (p.agotado) return;
    if (p.conAcompanamiento && acompanamientos.length) {
      setProductoAbierto(p);
      return;
    }
    agregarAlCarrito(p, { cantidad: 1 });
    navigator.vibrate?.(12);
  };

  const wa = linkWhatsapp(local.whatsapp, `¡Hola ${local.nombre}!`);
  const mostrarInstalar = !descartado && (instalacion.puedeInstalar || instalacion.iosManual);

  return (
    <div class={`menu-page${totalUnidades ? ' con-carro' : ''}`}>
      <Portada
        acciones={
          <>
            {instalacion.puedeInstalar ? (
              <button class="icon-btn" onClick={instalacion.instalar} aria-label="Instalar la app">
                <Download size={19} />
              </button>
            ) : (
              <span />
            )}
            <a class="icon-btn" href="#/mis-pedidos" aria-label="Mis pedidos">
              <ReceiptText size={19} />
              {activos > 0 && <span class="badge">{activos}</span>}
            </a>
          </>
        }
      />

      <section class="boleto" aria-label="Estado del local">
        {local.eslogan && <p class="boleto-eslogan">{local.eslogan}</p>}
        <div class="boleto-fila">
          <span class={`estado-local ${estado.abierto ? 'abierto' : 'cerrado'}`}>
            <span class={`dot${estado.abierto ? ' pulse' : ''}`} />
            {estado.mensaje}
          </span>
        </div>
        <div class="boleto-datos">
          <span>
            <Clock size={16} /> ~{local.tiempoPreparacion} min
          </span>
          {local.tipos.retiro && (
            <span>
              <Store size={16} /> Retiro
            </span>
          )}
          {local.tipos.delivery && (
            <span>
              <Bike size={16} /> Delivery {local.delivery.costo ? clp(local.delivery.costo) : 'gratis'}
            </span>
          )}
          {local.tipos.mesa && (
            <span>
              <UtensilsCrossed size={16} /> En mesa
            </span>
          )}
        </div>
      </section>

      <div class="avisos">
        <AvisoCuponGuardado />
        {mesa && (
          <div class="aviso-mesa">
            <span class="mesa-num">{mesa.numero}</span>
            <div class="grow">
              <strong>Pidiendo para la mesa {mesa.numero}</strong>
              <small>Te lo llevamos directo a la mesa.</small>
            </div>
            <button
              class="icon-btn sm"
              aria-label="No estoy en una mesa"
              onClick={async () => {
                if (await confirmar({ titulo: '¿No estás en el local?', texto: 'Dejarás de pedir para esta mesa.', ok: 'Sí, quitar mesa' })) {
                  mesaActual.set(null);
                }
              }}
            >
              <X size={16} />
            </button>
          </div>
        )}
        {local.aviso && (
          <div class="aviso-cartel">
            <Rombo color="magenta" chico>
              <Megaphone size={15} />
            </Rombo>
            <span>{local.aviso}</span>
          </div>
        )}
        {mostrarInstalar && (
          <div class="aviso-instalar">
            <img src="/icons/icon-192.png" alt="" width="54" height="54" />
            <div class="grow">
              <strong>Lleva la app en tu celular</strong>
              <small>Pide en dos toques y te avisamos cuando tu pedido esté listo.</small>
            </div>
            {instalacion.puedeInstalar ? (
              <button class="btn btn-dark btn-sm" onClick={instalacion.instalar}>
                Instalar
              </button>
            ) : (
              <button class="btn btn-dark btn-sm" onClick={() => setIosAyuda(true)}>
                ¿Cómo?
              </button>
            )}
            <button class="cerrar-aviso" aria-label="Ahora no" onClick={() => instalarDescartado.set(true)}>
              <X size={16} />
            </button>
          </div>
        )}
      </div>

      {destacados.length >= 2 && (
        <section class="recomendados" aria-label="Recomendados de hoy">
          <h2 class="titulo-seccion pad">
            <Rombo color="sol" chico>
              <Destello size={14} />
            </Rombo>
            Recomendados de hoy
          </h2>
          <div class="postales">
            {destacados.map((p, i) => (
              <button key={p.id} class={`postal-card inclinada-${i % 3}`} onClick={() => setProductoAbierto(p)}>
                <div class="postal-foto">
                  {p.imagen ? <img src={p.imagen} alt="" loading="lazy" /> : <Postal clave={iconoDe(p)} grande />}
                  {enCarrito.get(p.id) > 0 && <span class="qty-badge">{enCarrito.get(p.id)}</span>}
                  <span class="sello">Recomendado</span>
                </div>
                <div class="postal-info">
                  <strong>{p.nombre}</strong>
                  <span class="precio-tag">{clp(p.precio)}</span>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      <nav class="catnav" aria-label="Categorías del menú">
        <div class="catnav-inner" ref={navRef}>
          <button
            class={`icon-btn sm${buscando ? ' on' : ''}`}
            aria-label={buscando ? 'Cerrar búsqueda' : 'Buscar en el menú'}
            onClick={() => {
              setBuscando(!buscando);
              setBusqueda('');
            }}
          >
            {buscando ? <X size={17} /> : <Search size={17} />}
          </button>
          {buscando ? (
            <input
              class="input search"
              type="search"
              placeholder="Buscar: empanada, pollo, jugo…"
              value={busqueda}
              autoFocus
              onInput={(e) => setBusqueda(e.currentTarget.value)}
              aria-label="Buscar en el menú"
            />
          ) : (
            secciones.map((s) => (
              <button key={s.id} data-chip={s.id} class={`chip${String(activa) === String(s.id) ? ' on' : ''}`} onClick={() => irA(s.id)}>
                <IconoCategoria clave={s.emoji} size={16} strokeWidth={2.4} /> {s.nombre}
              </button>
            ))
          )}
        </div>
      </nav>

      <main>
        {secciones.length === 0 && (
          <Vacio titulo={busqueda ? 'No encontramos eso' : 'Hoy no hay productos disponibles'} texto={busqueda ? 'Prueba con otra palabra.' : estado.mensaje} />
        )}
        {secciones.map((s) => (
          <section key={s.id} class="seccion" id={`cat-${s.id}`} data-cat={s.id}>
            <h2 class="titulo-seccion">
              <Rombo color="boina">
                <IconoCategoria clave={s.emoji} size={20} strokeWidth={2.4} />
              </Rombo>
              <span>{s.nombre}</span>
            </h2>
            <Cordillera class="bajo-titulo" />
            <div class="grilla">
              {s.productos.map((p) => (
                <TarjetaProducto
                  key={p.id}
                  p={p}
                  icono={s.emoji}
                  cantidad={enCarrito.get(p.id) || 0}
                  onAbrir={() => setProductoAbierto(p)}
                  onAgregar={() => agregarRapido(p)}
                />
              ))}
            </div>
          </section>
        ))}
      </main>

      <TarjetaPromos vapidPublicKey={menu.vapidPublicKey} onAyudaIOS={() => setIosAyuda(true)} />

      <footer class="pie">
        <svg class="pie-cordillera" viewBox="0 0 1440 90" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 90 L0 52 L120 20 L200 46 L320 8 L420 44 L540 18 L650 56 L760 22 L880 50 L1000 14 L1110 48 L1230 24 L1340 54 L1440 30 L1440 90 Z" />
          <path class="cresta" d="M0 52 L120 20 L200 46 L320 8 L420 44 L540 18 L650 56 L760 22 L880 50 L1000 14 L1110 48 L1230 24 L1340 54 L1440 30" vector-effect="non-scaling-stroke" />
        </svg>
        <div class="pie-contenido">
          <img class="pie-logo" src="/brand/logo-claro.webp" alt={local.nombre} width="720" height="471" loading="lazy" />
          {local.direccion && (
            <a class="pie-link" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(local.direccion)}`} target="_blank" rel="noopener">
              <MapPin size={16} /> {local.direccion}
            </a>
          )}
          <div class="row wrap center">
            {local.telefono && (
              <a class="btn btn-sm" href={`tel:${local.telefono.replace(/[^\d+]/g, '')}`}>
                <Phone size={16} /> Llamar
              </a>
            )}
            {wa && (
              <a class="btn btn-sm" href={wa} target="_blank" rel="noopener">
                <MessageCircle size={16} /> WhatsApp
              </a>
            )}
            {local.instagram && (
              <a class="btn btn-sm" href={`https://instagram.com/${local.instagram}`} target="_blank" rel="noopener">
                <IconoInstagram size={16} /> @{local.instagram}
              </a>
            )}
          </div>
          <details class="horario">
            <summary>
              <Clock size={16} /> Horario de atención
            </summary>
            <ul>
              {local.horario.map((h, i) => (
                <li key={i} class={i === estado.dow ? 'hoy' : ''}>
                  <span>{DIAS[i]}</span>
                  <span>{!h.abierto ? 'Cerrado' : h.desde === h.hasta ? 'Todo el día' : `${h.desde} – ${h.hasta}`}</span>
                </li>
              ))}
            </ul>
          </details>
          <p class="pie-firma">
            <Destello size={12} /> Hecho en la Patagonia <Destello size={12} />
          </p>
        </div>
      </footer>

      {totalUnidades > 0 && (
        <button class={`cart-fab${bump ? ' bump' : ''}`} onClick={() => setCarritoAbierto(true)}>
          <span class="fab-oveja">
            <img src="/brand/oveja-cara.webp" alt="" width="46" height="28" />
            <span class="fab-n">{totalUnidades}</span>
          </span>
          <span class="fab-texto">Ver mi pedido</span>
          <span class="fab-total num">{clp(totalCarrito(lineas, productosPorId))}</span>
        </button>
      )}

      {productoAbierto && (
        <ProductoSheet
          key={productoAbierto.id}
          producto={productoAbierto}
          icono={iconoDe(productoAbierto)}
          acompanamientos={acompanamientos}
          onCerrar={() => setProductoAbierto(null)}
        />
      )}

      <CarritoSheet abierto={carritoAbierto} onCerrar={() => setCarritoAbierto(false)} lineas={lineas} productosPorId={productosPorId} estado={estado} />

      <Sheet abierto={iosAyuda} onCerrar={() => setIosAyuda(false)} titulo="Instalar en iPhone">
        <ol class="pasos-ios">
          <li>
            Toca el botón <strong>Compartir</strong> <Share size={18} /> abajo en Safari.
          </li>
          <li>
            Elige <strong>“Agregar a inicio”</strong>.
          </li>
          <li>
            Abre <strong>Patagonia</strong> desde tu pantalla de inicio. Desde ahí te podemos avisar cuando tu pedido esté listo.
          </li>
        </ol>
      </Sheet>
    </div>
  );
}

function TarjetaProducto({ p, icono, cantidad, onAbrir, onAgregar }) {
  return (
    <article class={`sticker-prod${p.agotado ? ' agotado' : ''}`}>
      <button class="card-hit" onClick={onAbrir} aria-label={`Ver ${p.nombre}`} />
      <div class="sp-info">
        <h3>{p.nombre}</h3>
        {p.descripcion && <p class="sp-desc">{p.descripcion}</p>}
        <div class="sp-pie">
          <span class="precio-tag">{clp(p.precio)}</span>
          {p.agotado && <span class="pill bad">Agotado</span>}
          {!p.agotado && p.quedan && <span class="pill warn">Quedan {p.quedan}</span>}
        </div>
      </div>
      <div class="sp-foto">
        {p.imagen ? <img src={p.imagen} alt="" loading="lazy" width="216" height="216" /> : <Postal clave={icono} />}
        {cantidad > 0 && <span class="qty-badge">{cantidad}</span>}
        {!p.agotado && (
          <button class="btn-mas" onClick={onAgregar} aria-label={`Agregar ${p.nombre}`}>
            <Plus size={20} strokeWidth={3.2} />
          </button>
        )}
      </div>
    </article>
  );
}

function ProductoSheet({ producto, icono, acompanamientos, onCerrar }) {
  const [cantidad, setCantidad] = useState(1);
  const [acomp, setAcomp] = useState(null);
  const [comentario, setComentario] = useState('');
  const [error, setError] = useState('');
  const requiere = producto.conAcompanamiento && acompanamientos.length > 0;
  const maximo = producto.quedan || 30;

  const agregar = () => {
    if (requiere && !acomp) {
      setError('Elige un acompañamiento para continuar.');
      return;
    }
    agregarAlCarrito(producto, { cantidad, acompanamiento: acomp, comentario });
    navigator.vibrate?.(15);
    onCerrar();
  };

  return (
    <Sheet
      abierto
      onCerrar={onCerrar}
      sinCabecera
      etiqueta={producto.nombre}
      pie={
        <div class="row">
          <Stepper valor={cantidad} onCambio={setCantidad} min={1} max={maximo} grande />
          <button class="btn btn-primary btn-lg grow" disabled={producto.agotado} onClick={agregar}>
            {producto.agotado ? 'Agotado' : `Agregar · ${clp(producto.precio * cantidad)}`}
          </button>
        </div>
      }
    >
      <div class="ps-media">
        {producto.imagen ? <img src={producto.imagen} alt="" /> : <Postal clave={icono} grande />}
        {producto.imagen && producto.imagenCredito && (
          <a class="ps-credito" href={producto.imagenFuente || undefined} target="_blank" rel="noopener noreferrer">
            {producto.imagenCredito}
          </a>
        )}
        <button class="icon-btn close-float" onClick={onCerrar} aria-label="Cerrar">
          <X size={20} />
        </button>
      </div>
      <div class="stack">
        <div>
          <h2 class="ps-title">{producto.nombre}</h2>
          {producto.descripcion && <p class="muted ps-desc">{producto.descripcion}</p>}
          <div class="row" style={{ marginTop: '10px' }}>
            <span class="precio-tag grande">{clp(producto.precio)}</span>
            {producto.quedan && <span class="pill warn">Quedan {producto.quedan}</span>}
          </div>
        </div>
        {requiere && (
          <fieldset class="fieldset">
            <legend>
              Elige tu acompañamiento <span class="pill brand">Obligatorio</span>
            </legend>
            <div class="options cols-2">
              {acompanamientos.map((a) => (
                <label key={a.id} class={`option compact${acomp?.id === a.id ? ' on' : ''}`}>
                  <input
                    type="radio"
                    name="acompanamiento"
                    checked={acomp?.id === a.id}
                    onChange={() => {
                      setAcomp(a);
                      setError('');
                    }}
                  />
                  <span>{a.nombre}</span>
                </label>
              ))}
            </div>
            {error && <p class="error-text">{error}</p>}
          </fieldset>
        )}
        <label class="field">
          <span class="label">¿Algún detalle? (opcional)</span>
          <textarea
            class="textarea"
            rows={2}
            maxLength={140}
            placeholder="Ej: sin cebolla, bien cocido, salsa aparte…"
            value={comentario}
            onInput={(e) => setComentario(e.currentTarget.value)}
          />
        </label>
      </div>
    </Sheet>
  );
}

function CarritoSheet({ abierto, onCerrar, lineas, productosPorId, estado }) {
  const total = totalCarrito(lineas, productosPorId);
  return (
    <Sheet
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Tu pedido"
      pie={
        lineas.length > 0 && (
          <div class="stack">
            <div class="row-between total-row">
              <span class="label">Subtotal</span>
              <strong class="display num">{clp(total)}</strong>
            </div>
            {!estado.abierto && <p class="notice bad">{estado.mensaje}</p>}
            <button
              class="btn btn-primary btn-lg btn-block"
              disabled={!estado.abierto}
              onClick={() => {
                onCerrar();
                navegar('/pedir');
              }}
            >
              Continuar <ArrowRight size={20} />
            </button>
          </div>
        )
      }
    >
      {lineas.length === 0 ? (
        <Vacio titulo="Tu carro está vacío" texto="Agrega algo rico del menú." />
      ) : (
        <>
          <ul class="cart-lines">
            {lineas.map((l) => (
              <li key={l.clave} class="cart-line">
                <div class="grow">
                  <strong>{l.nombre}</strong>
                  {l.acompanamiento && <small>Con {l.acompanamiento}</small>}
                  {l.comentario && <small class="comment">“{l.comentario}”</small>}
                  <span class="num line-price">{clp(precioDe(l, productosPorId) * l.cantidad)}</span>
                </div>
                <Stepper valor={l.cantidad} onCambio={(n) => cambiarCantidad(l.clave, n)} min={0} max={30} etiqueta={`Cantidad de ${l.nombre}`} />
              </li>
            ))}
          </ul>
          <button
            class="btn btn-ghost btn-sm vaciar"
            onClick={async () => {
              if (await confirmar({ titulo: '¿Vaciar el carro?', ok: 'Vaciar', peligro: true })) carrito.set([]);
            }}
          >
            <Trash2 size={16} /> Vaciar carro
          </button>
        </>
      )}
    </Sheet>
  );
}
