// Panel: promociones (notificación + correo) y códigos de descuento.
import { useEffect, useRef, useState } from 'preact/hooks';
import { BellRing, Copy, Mail, Megaphone, Pencil, Plus, RotateCw, Send, TicketPercent, Trash2, Users } from 'lucide-preact';
import { clp, ESTADOS_CUPON, fechaHora, plural, resumenCupon } from '../shared/format.js';
import { navegar, useRuta } from '../shared/hooks.js';
import { crearStore, useStore } from '../shared/store.js';
import { Sheet, Switch, Vacio, confirmar, toast } from '../shared/ui.jsx';
import { Rombo } from '../shared/simbolos.jsx';
import { ajustesStore, apiAdmin } from './estado.js';

/** Código elegido desde la lista de códigos para mandarlo en una promo. */
const cuponParaPromo = crearStore('cupon-para-promo', '', { tipo: 'memoria' });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

export function Promos() {
  const ruta = useRuta();
  const pestana = ruta.startsWith('/promos/codigos') ? 'codigos' : 'enviar';
  return (
    <div class="promos-admin">
      <header class="page-head">
        <div>
          <h1>Promociones</h1>
          <p class="muted">Avisa a tus clientes de descuentos y novedades, y crea códigos de descuento.</p>
        </div>
      </header>
      <div class="segmentado pestanas" role="tablist" aria-label="Promociones">
        <button role="tab" aria-selected={pestana === 'enviar'} class={pestana === 'enviar' ? 'on' : ''} onClick={() => navegar('/promos')}>
          <Megaphone size={16} /> Enviar promo
        </button>
        <button role="tab" aria-selected={pestana === 'codigos'} class={pestana === 'codigos' ? 'on' : ''} onClick={() => navegar('/promos/codigos')}>
          <TicketPercent size={16} /> Códigos
        </button>
      </div>
      {pestana === 'enviar' ? <EnviarPromo /> : <Codigos />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Enviar promoción
// ---------------------------------------------------------------------------

const VACIA = { titulo: '', mensaje: '', cupon: '', push: true, correo: true };

function EnviarPromo() {
  const ajustes = useStore(ajustesStore);
  const [datos, setDatos] = useState(null);
  const [f, setF] = useState(() => ({ ...VACIA, cupon: cuponParaPromo.get() || '' }));
  const [envio, setEnvio] = useState(null); // { promo, canal, activo, error, terminado }
  const [creando, setCreando] = useState(false);
  const enviando = Boolean(envio?.activo);

  async function cargar() {
    const r = await apiAdmin('/api/admin/promos');
    setDatos(r);
    return r;
  }
  useEffect(() => {
    cargar().catch((e) => toast(e.message, 'error'));
    cuponParaPromo.set('');
  }, []);

  // Avisar si se intenta cerrar la página en pleno envío
  useEffect(() => {
    if (!enviando) return undefined;
    const f2 = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', f2);
    return () => window.removeEventListener('beforeunload', f2);
  }, [enviando]);

  if (!datos) {
    return (
      <div class="page-center">
        <div class="spinner" />
      </div>
    );
  }

  const { audiencia, correo: cfgCorreo, promos, cupones } = datos;
  const puedePush = audiencia.push > 0;
  const puedeCorreo = audiencia.correo > 0 && cfgCorreo.configurado;
  const usarPush = f.push && puedePush;
  const usarCorreo = f.correo && puedeCorreo;
  const personas = (usarPush ? audiencia.push : 0) + (usarCorreo ? audiencia.correo : 0);
  const completo = f.titulo.trim() && f.mensaje.trim();
  const set = (c) => setF((x) => ({ ...x, ...c }));
  const cuponElegido = cupones.find((c) => c.codigo === f.cupon);

  async function enviarCanales(promo) {
    let actual = promo;
    try {
      for (const canal of ['push', 'correo']) {
        const pendiente = canal === 'push' ? actual.push && !actual.pushFin : actual.correo && !actual.emailFin;
        if (!pendiente) continue;
        let listo = false;
        let vueltas = 0;
        while (!listo && vueltas < 400) {
          setEnvio({ promo: actual, canal, activo: true });
          const r = await apiAdmin(`/api/admin/promos/${actual.id}/enviar`, { method: 'POST', body: { canal } });
          actual = r.promo;
          listo = r.listo;
          vueltas++;
          if (r.ocupado) await esperar(1500);
        }
      }
      setEnvio({ promo: actual, activo: false, terminado: true });
      toast('Promoción enviada', 'ok');
    } catch (e) {
      setEnvio({ promo: e.data?.promo || actual, activo: false, error: e.message });
      toast(e.message, 'error', { ms: 9000 });
    } finally {
      cargar().catch(() => {});
    }
  }

  async function enviar(ev) {
    ev.preventDefault();
    if (!completo || !personas || enviando) return;
    const partes = [usarPush && plural(audiencia.push, 'teléfono', 'teléfonos'), usarCorreo && plural(audiencia.correo, 'correo', 'correos')].filter(Boolean);
    const ok = await confirmar({
      titulo: '¿Enviar esta promoción?',
      texto: `Le llegará a ${partes.join(' y ')}. Una vez enviada no se puede deshacer.`,
      ok: 'Sí, enviar',
    });
    if (!ok) return;
    setCreando(true);
    try {
      const r = await apiAdmin('/api/admin/promos', { method: 'POST', body: { ...f, push: usarPush, correo: usarCorreo } });
      setF(VACIA);
      setCreando(false);
      await enviarCanales(r.promo);
    } catch (e) {
      toast(e.message, 'error', { ms: 7000 });
      setCreando(false);
    }
  }

  async function eliminar(p) {
    const ok = await confirmar({ titulo: 'Quitar del historial', texto: `“${p.titulo}” se quitará de la lista (a los clientes ya les llegó).`, ok: 'Quitar', peligro: true });
    if (!ok) return;
    try {
      await apiAdmin(`/api/admin/promos/${p.id}`, { method: 'DELETE' });
      if (envio?.promo?.id === p.id) setEnvio(null);
      cargar();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  return (
    <div class="stack-lg">
      <div class="audiencia">
        <div class="aud-item">
          <Rombo color="sol">
            <BellRing size={18} />
          </Rombo>
          <span>
            <strong class="num">{audiencia.push}</strong>
            <small>{audiencia.push === 1 ? 'teléfono con avisos' : 'teléfonos con avisos'}</small>
          </span>
        </div>
        <div class="aud-item">
          <Rombo color="magenta">
            <Mail size={18} />
          </Rombo>
          <span>
            <strong class="num">{audiencia.correo}</strong>
            <small>{audiencia.correo === 1 ? 'cliente por correo' : 'clientes por correo'}</small>
          </span>
        </div>
        <p class="aud-nota small">
          <Users size={15} /> Se suman cuando un cliente acepta recibir promociones al pedir o desde el menú.
        </p>
      </div>

      {!cfgCorreo.configurado && (
        <div class="notice info">
          <Mail size={20} />
          <span>
            Para enviar promociones (y avisos de pedidos) por correo, conecta el Gmail del local en{' '}
            <a href="#/ajustes" class="link-fuerte">
              Ajustes → Correo para avisos
            </a>
            .
          </span>
        </div>
      )}

      {envio && <ProgresoEnvio envio={envio} onContinuar={() => enviarCanales(envio.promo)} onCerrar={() => setEnvio(null)} />}

      <div class="promo-grid">
        <form class="card card-pad stack" onSubmit={enviar}>
          <h2 class="card-title">Nueva promoción</h2>
          <label class="field">
            <span class="label">Título</span>
            <input
              class="input"
              maxLength={70}
              value={f.titulo}
              placeholder="Ej: Martes de empanadas"
              onInput={(e) => set({ titulo: e.currentTarget.value })}
            />
          </label>
          <label class="field">
            <span class="label">Mensaje</span>
            <textarea
              class="textarea"
              rows={4}
              maxLength={600}
              value={f.mensaje}
              placeholder="Ej: Hoy la docena de empanadas de pino a $12.000. Pide online y retira sin esperar."
              onInput={(e) => set({ mensaje: e.currentTarget.value })}
            />
            <span class="hint num">{f.mensaje.length}/600 · En la notificación se ven las primeras líneas.</span>
          </label>
          <label class="field">
            <span class="label">Código de descuento (opcional)</span>
            <select class="select" value={f.cupon} onChange={(e) => set({ cupon: e.currentTarget.value })}>
              <option value="">Sin código</option>
              {cupones.map((c) => (
                <option key={c.codigo} value={c.codigo}>
                  {c.codigo} · {c.resumen}
                </option>
              ))}
            </select>
            <span class="hint">
              {cupones.length ? (
                'El cliente toca la promo y el código queda listo en su carro.'
              ) : (
                <>
                  Aún no tienes códigos vigentes.{' '}
                  <a href="#/promos/codigos" class="link-fuerte">
                    Crear uno
                  </a>
                </>
              )}
            </span>
          </label>
          <div class="field">
            <span class="label">¿Por dónde la envías?</span>
            <div class="canales">
              <label class={`option compact${usarPush ? ' on' : ''}${!puedePush ? ' disabled' : ''}`}>
                <input type="checkbox" checked={usarPush} disabled={!puedePush} onChange={(e) => set({ push: e.currentTarget.checked })} />
                <BellRing size={18} />
                <span class="grow">
                  <strong>Notificación</strong>
                  <small>{puedePush ? plural(audiencia.push, 'teléfono', 'teléfonos') : 'Nadie suscrito aún'}</small>
                </span>
              </label>
              <label class={`option compact${usarCorreo ? ' on' : ''}${!puedeCorreo ? ' disabled' : ''}`}>
                <input type="checkbox" checked={usarCorreo} disabled={!puedeCorreo} onChange={(e) => set({ correo: e.currentTarget.checked })} />
                <Mail size={18} />
                <span class="grow">
                  <strong>Correo</strong>
                  <small>{!cfgCorreo.configurado ? 'Conecta tu Gmail' : puedeCorreo ? plural(audiencia.correo, 'cliente', 'clientes') : 'Nadie suscrito aún'}</small>
                </span>
              </label>
            </div>
          </div>
          <button class="btn btn-primary btn-lg" type="submit" disabled={!completo || !personas || enviando || creando}>
            {creando || enviando ? <span class="spinner" /> : <Send size={18} />}
            {personas ? ` Enviar a ${plural(personas, 'persona', 'personas')}` : ' Aún no hay a quién enviarla'}
          </button>
        </form>

        <VistaPrevia f={f} cupon={cuponElegido} nombreLocal={ajustes?.nombre || 'Patagonia Sabores'} />
      </div>

      <section class="stack">
        <h2 class="titulo-bloque">Promociones enviadas</h2>
        {promos.length === 0 ? (
          <div class="card card-pad">
            <Vacio titulo="Todavía no envías promociones" texto="Cuando envíes una, aquí verás a cuántos les llegó." />
          </div>
        ) : (
          <div class="lista-promos">
            {promos.map((p) => (
              <article key={p.id} class="card card-pad promo-fila">
                <div class="grow">
                  <div class="row wrap promo-titulo">
                    <strong>{p.titulo}</strong>
                    {p.cupon && <span class="pill sun">{p.cupon}</span>}
                    {p.pendiente && <span class="pill warn">Envío pausado</span>}
                  </div>
                  <p class="muted small promo-msg">{p.mensaje}</p>
                  <div class="row wrap promo-datos">
                    <span class="small subtle">{fechaHora(p.creado)}</span>
                    {p.push && (
                      <span class="pill">
                        <BellRing size={13} /> {p.pushOk} de {Math.max(p.pushTotal, p.pushHechos)}
                      </span>
                    )}
                    {p.correo && (
                      <span class="pill">
                        <Mail size={13} /> {p.emailOk} de {Math.max(p.emailTotal, p.emailHechos)}
                      </span>
                    )}
                  </div>
                </div>
                <div class="promo-acciones">
                  {p.pendiente && !enviando && (
                    <button class="btn btn-dark btn-sm" onClick={() => enviarCanales(p)}>
                      <RotateCw size={15} /> Continuar
                    </button>
                  )}
                  <button class="icon-btn sm" aria-label="Quitar del historial" onClick={() => eliminar(p)} disabled={enviando}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function BarraCanal({ icono: Icono, nombre, hechos, total, ok, fin, activo }) {
  const base = Math.max(total, hechos, 1);
  const pct = fin ? 100 : Math.min(100, Math.round((hechos / base) * 100));
  return (
    <div class={`canal-progreso${activo ? ' activo' : ''}`}>
      <div class="row-between">
        <span class="row">
          <Icono size={16} /> <strong>{nombre}</strong>
        </span>
        <span class="num small">
          {fin ? `${ok} entregadas` : `${hechos} de ${Math.max(total, hechos)}`}
        </span>
      </div>
      <span class="barra" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <i style={{ width: `${pct}%` }} />
      </span>
    </div>
  );
}

function ProgresoEnvio({ envio, onContinuar, onCerrar }) {
  const p = envio.promo;
  const titulo = envio.activo ? `Enviando “${p.titulo}”…` : envio.error ? 'El envío quedó en pausa' : '¡Promoción enviada!';
  return (
    <section class={`card card-pad stack progreso-envio${envio.error ? ' con-error' : ''}${envio.terminado ? ' terminado' : ''}`} aria-live="polite">
      <div class="row-between">
        <h2 class="card-title">{titulo}</h2>
        {!envio.activo && (
          <button class="btn btn-ghost btn-sm" onClick={onCerrar}>
            Cerrar
          </button>
        )}
      </div>
      {p.push && (
        <BarraCanal icono={BellRing} nombre="Notificaciones" hechos={p.pushHechos} total={p.pushTotal} ok={p.pushOk} fin={p.pushFin} activo={envio.activo && envio.canal === 'push'} />
      )}
      {p.correo && (
        <BarraCanal icono={Mail} nombre="Correos" hechos={p.emailHechos} total={p.emailTotal} ok={p.emailOk} fin={p.emailFin} activo={envio.activo && envio.canal === 'correo'} />
      )}
      {envio.activo && <p class="muted small">No cierres esta página hasta que termine.</p>}
      {envio.error && (
        <>
          <div class="notice bad">
            <span>{envio.error}</span>
          </div>
          <button class="btn btn-dark" onClick={onContinuar}>
            <RotateCw size={17} /> Continuar el envío
          </button>
        </>
      )}
    </section>
  );
}

function textoNotificacion(f) {
  const cuerpo = f.mensaje.replace(/\s+/g, ' ').trim();
  const recorte = cuerpo.length > 150 ? `${cuerpo.slice(0, 147)}…` : cuerpo;
  return f.cupon ? `${recorte} Código: ${f.cupon}` : recorte;
}

function VistaPrevia({ f, cupon, nombreLocal }) {
  const titulo = f.titulo.trim() || 'Título de la promoción';
  const mensaje = f.mensaje.trim() || 'Aquí va el mensaje para tus clientes.';
  return (
    <aside class="vista-previa stack" aria-label="Vista previa">
      <span class="label">Así la verán tus clientes</span>
      <div class="noti-mock">
        <img src="/icons/icon-192.png" alt="" width="40" height="40" />
        <div class="grow">
          <span class="noti-app">{nombreLocal} · ahora</span>
          <strong>{titulo}</strong>
          <p>{textoNotificacion({ ...f, mensaje })}</p>
        </div>
      </div>
      <div class="correo-mock">
        <img class="correo-logo" src="/brand/logo-correo.png" alt="" width="120" height="79" />
        <div class="correo-franja" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
        <h3>{titulo}</h3>
        {mensaje.split(/\n{2,}/).map((parrafo, i) => (
          <p key={i}>{parrafo}</p>
        ))}
        {f.cupon && (
          <div class="correo-cupon">
            <small>Tu código</small>
            <strong>{f.cupon}</strong>
            {cupon && <span>{cupon.resumen}</span>}
          </div>
        )}
        <span class="correo-boton">{f.cupon ? 'Pedir con mi código' : 'Ver el menú'}</span>
        <small class="correo-pie">Incluye un enlace para dejar de recibir promociones.</small>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Códigos de descuento
// ---------------------------------------------------------------------------

function Codigos() {
  const [cupones, setCupones] = useState(null);
  const [editando, setEditando] = useState(null); // null | {} (nuevo) | cupón

  async function cargar() {
    try {
      const r = await apiAdmin('/api/admin/cupones');
      setCupones(r.cupones);
    } catch (e) {
      toast(e.message, 'error');
    }
  }
  useEffect(() => {
    cargar();
  }, []);

  async function alternar(c, activo) {
    try {
      const r = await apiAdmin(`/api/admin/cupones/${c.id}`, { method: 'PUT', body: { ...c, activo } });
      setCupones((l) => l.map((x) => (x.id === c.id ? r.cupon : x)));
      toast(activo ? `${c.codigo} activado` : `${c.codigo} en pausa`, 'ok');
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function eliminar(c) {
    const ok = await confirmar({
      titulo: `¿Eliminar ${c.codigo}?`,
      texto: c.pedidos ? 'Los pedidos que ya lo usaron conservan su descuento. Si solo quieres dejar de ofrecerlo, ponlo en pausa.' : 'Esto no se puede deshacer.',
      ok: 'Eliminar',
      peligro: true,
    });
    if (!ok) return;
    try {
      await apiAdmin(`/api/admin/cupones/${c.id}`, { method: 'DELETE' });
      setCupones((l) => l.filter((x) => x.id !== c.id));
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  function guardado(c, nuevo) {
    setEditando(null);
    setCupones((l) => (nuevo ? [c, ...l] : l.map((x) => (x.id === c.id ? c : x))));
    toast(nuevo ? `Código ${c.codigo} creado` : 'Cambios guardados', 'ok');
  }

  if (!cupones) {
    return (
      <div class="page-center">
        <div class="spinner" />
      </div>
    );
  }

  return (
    <div class="stack-lg">
      <div class="row-between wrap">
        <p class="nota-pagina">El cliente lo escribe al finalizar su pedido y el descuento se calcula solo.</p>
        <button class="btn btn-primary" onClick={() => setEditando({})}>
          <Plus size={18} /> Nuevo código
        </button>
      </div>

      {cupones.length === 0 ? (
        <div class="card card-pad">
          <Vacio titulo="Aún no tienes códigos" texto="Crea uno para Instagram, para clientes nuevos o para un día flojo.">
            <button class="btn btn-primary" onClick={() => setEditando({})}>
              <Plus size={18} /> Crear mi primer código
            </button>
          </Vacio>
        </div>
      ) : (
        <div class="grilla-cupones">
          {cupones.map((c) => (
            <TicketCupon key={c.id} c={c} onAlternar={alternar} onEditar={() => setEditando(c)} onEliminar={() => eliminar(c)} />
          ))}
        </div>
      )}

      {editando && <FormularioCupon cupon={editando} onCerrar={() => setEditando(null)} onGuardado={guardado} />}
    </div>
  );
}

function TicketCupon({ c, onAlternar, onEditar, onEliminar }) {
  const estado = ESTADOS_CUPON[c.estado] || ESTADOS_CUPON.vigente;
  const pct = c.maxUsos ? Math.min(100, Math.round((c.usos / c.maxUsos) * 100)) : 0;
  const valor = c.tipo === 'porcentaje' ? `${c.valor}%` : clp(c.valor);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(c.codigo);
      toast(`Código ${c.codigo} copiado`, 'ok');
    } catch {
      toast('No se pudo copiar', 'error');
    }
  }
  return (
    <article class={`ticket-cupon estado-${c.estado}`}>
      <div class="tc-talon" aria-hidden="true">
        <span class={`tc-valor largo-${Math.min(valor.length, 8)}`}>{valor}</span>
        <small>dcto.</small>
      </div>
      <div class="tc-cuerpo">
        <div class="row-between tc-cabeza">
          <button type="button" class="tc-codigo" onClick={copiar} title="Copiar código">
            {c.codigo} <Copy size={14} />
          </button>
          <span class={`pill ${estado.clase}`}>{estado.nombre}</span>
        </div>
        <p class="tc-resumen">{c.resumen}</p>
        {c.descripcion && <p class="tc-nota">{c.descripcion}</p>}
        <div class="tc-usos">
          <span class="num small">
            <strong>{c.maxUsos ? `${c.usos} de ${c.maxUsos}` : c.usos}</strong> {c.maxUsos ? 'usos' : c.usos === 1 ? 'uso' : 'usos'} · {plural(c.pedidos, 'pedido', 'pedidos')} ·{' '}
            {clp(c.descontado)} descontados
          </span>
          {c.maxUsos ? (
            <span class="barra">
              <i style={{ width: `${pct}%` }} />
            </span>
          ) : null}
        </div>
        <div class="tc-acciones">
          <span class="row">
            <Switch checked={c.activo} onChange={(v) => onAlternar(c, v)} etiqueta={`Código ${c.codigo} activo`} />
            <span class="small">{c.activo ? 'Activo' : 'En pausa'}</span>
          </span>
          <span class="row">
            {c.activo && ['vigente', 'programado'].includes(c.estado) && (
              <button
                class="icon-btn sm"
                aria-label={`Enviar ${c.codigo} en una promoción`}
                title="Enviar en una promoción"
                onClick={() => {
                  cuponParaPromo.set(c.codigo);
                  navegar('/promos');
                }}
              >
                <Megaphone size={16} />
              </button>
            )}
            <button class="icon-btn sm" aria-label={`Editar ${c.codigo}`} onClick={onEditar}>
              <Pencil size={16} />
            </button>
            <button class="icon-btn sm" aria-label={`Eliminar ${c.codigo}`} onClick={onEliminar}>
              <Trash2 size={16} />
            </button>
          </span>
        </div>
      </div>
    </article>
  );
}

function FormularioCupon({ cupon, onCerrar, onGuardado }) {
  const nuevo = !cupon.id;
  const [f, setF] = useState(() => ({
    codigo: cupon.codigo || '',
    descripcion: cupon.descripcion || '',
    tipo: cupon.tipo || 'porcentaje',
    valor: cupon.valor ?? 10,
    minimo: cupon.minimo ?? 0,
    maxUsos: cupon.maxUsos ?? '',
    unoPorCliente: Boolean(cupon.unoPorCliente),
    desde: cupon.desde || '',
    hasta: cupon.hasta || '',
    activo: cupon.activo ?? true,
  }));
  const [guardando, setGuardando] = useState(false);
  const inicio = useRef(null);
  useEffect(() => {
    if (nuevo) setTimeout(() => inicio.current?.focus(), 120);
  }, []);
  const set = (c) => setF((x) => ({ ...x, ...c }));
  const numero = (v) => Number(String(v).replace(/\D/g, '') || 0);

  async function guardar(e) {
    e?.preventDefault();
    setGuardando(true);
    const body = {
      ...f,
      valor: numero(f.valor),
      minimo: numero(f.minimo),
      maxUsos: f.maxUsos === '' ? null : numero(f.maxUsos),
      desde: f.desde || null,
      hasta: f.hasta || null,
    };
    try {
      const r = nuevo
        ? await apiAdmin('/api/admin/cupones', { method: 'POST', body })
        : await apiAdmin(`/api/admin/cupones/${cupon.id}`, { method: 'PUT', body });
      onGuardado(r.cupon, nuevo);
    } catch (err) {
      toast(err.message, 'error', { ms: 6000 });
    } finally {
      setGuardando(false);
    }
  }

  const resumen = resumenCupon({ ...f, valor: numero(f.valor), minimo: numero(f.minimo) });

  return (
    <Sheet
      abierto
      onCerrar={onCerrar}
      titulo={nuevo ? 'Nuevo código de descuento' : `Editar ${cupon.codigo}`}
      pie={
        <div class="row">
          <button type="button" class="btn btn-ghost grow" onClick={onCerrar}>
            Cancelar
          </button>
          <button type="button" class="btn btn-primary grow" onClick={guardar} disabled={guardando || !f.codigo.trim() || !numero(f.valor)}>
            {guardando ? <span class="spinner" /> : nuevo ? 'Crear código' : 'Guardar'}
          </button>
        </div>
      }
    >
      <form class="stack" onSubmit={guardar}>
        <label class="field">
          <span class="label">Código</span>
          <input
            ref={inicio}
            class="input cupon-input"
            maxLength={20}
            value={f.codigo}
            disabled={!nuevo}
            autoCapitalize="characters"
            autoComplete="off"
            spellcheck={false}
            placeholder="EJ: BIENVENIDA10"
            onInput={(e) => set({ codigo: e.currentTarget.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '') })}
          />
          <span class="hint">{nuevo ? 'Letras y números, sin espacios. Es lo que escribe el cliente.' : 'El código no se puede cambiar: crea uno nuevo si necesitas otro.'}</span>
        </label>
        <div class="field">
          <span class="label">Tipo de descuento</span>
          <div class="segmentado">
            <button type="button" class={f.tipo === 'porcentaje' ? 'on' : ''} onClick={() => set({ tipo: 'porcentaje', valor: numero(f.valor) > 0 && numero(f.valor) <= 100 ? numero(f.valor) : 10 })}>
              Porcentaje %
            </button>
            <button type="button" class={f.tipo === 'monto' ? 'on' : ''} onClick={() => set({ tipo: 'monto', valor: numero(f.valor) > 100 ? f.valor : 2000 })}>
              Monto fijo $
            </button>
          </div>
        </div>
        <div class="dos-columnas">
          <label class="field">
            <span class="label">{f.tipo === 'porcentaje' ? 'Porcentaje' : 'Monto'}</span>
            <span class="input-sufijo">
              {f.tipo === 'monto' && <i>$</i>}
              <input
                class="input num"
                inputMode="numeric"
                value={f.tipo === 'monto' ? numero(f.valor).toLocaleString('es-CL') : f.valor}
                onInput={(e) => set({ valor: e.currentTarget.value.replace(/\D/g, '').slice(0, f.tipo === 'monto' ? 7 : 3) })}
              />
              {f.tipo === 'porcentaje' && <i>%</i>}
            </span>
          </label>
          <label class="field">
            <span class="label">Compra mínima</span>
            <span class="input-sufijo">
              <i>$</i>
              <input
                class="input num"
                inputMode="numeric"
                value={numero(f.minimo).toLocaleString('es-CL')}
                onInput={(e) => set({ minimo: e.currentTarget.value.replace(/\D/g, '').slice(0, 8) })}
              />
            </span>
          </label>
          <label class="field">
            <span class="label">Máximo de usos</span>
            <input
              class="input num"
              inputMode="numeric"
              value={f.maxUsos}
              placeholder="Sin límite"
              onInput={(e) => set({ maxUsos: e.currentTarget.value.replace(/\D/g, '').slice(0, 6) })}
            />
          </label>
          <label class="field">
            <span class="label">Nota interna (opcional)</span>
            <input class="input" maxLength={120} value={f.descripcion} placeholder="Ej: Para Instagram" onInput={(e) => set({ descripcion: e.currentTarget.value })} />
          </label>
          <label class="field">
            <span class="label">Válido desde</span>
            <input class="input" type="date" value={f.desde} onInput={(e) => set({ desde: e.currentTarget.value })} />
          </label>
          <label class="field">
            <span class="label">Válido hasta</span>
            <input class="input" type="date" value={f.hasta} min={f.desde || undefined} onInput={(e) => set({ hasta: e.currentTarget.value })} />
          </label>
        </div>
        <div class="switch-row">
          <span>
            <strong>Una vez por cliente</strong>
            <small class="block muted">Se reconoce por su teléfono o correo.</small>
          </span>
          <Switch checked={f.unoPorCliente} onChange={(v) => set({ unoPorCliente: v })} etiqueta="Una vez por cliente" />
        </div>
        <div class="switch-row">
          <span>
            <strong>Activo</strong>
            <small class="block muted">En pausa, el código no sirve hasta que lo actives.</small>
          </span>
          <Switch checked={f.activo} onChange={(v) => set({ activo: v })} etiqueta="Código activo" />
        </div>
        {resumen && (
          <div class="resumen-cupon">
            <TicketPercent size={18} />
            <span>
              <strong>{f.codigo || 'CÓDIGO'}</strong> · {resumen}
            </span>
          </div>
        )}
        <button type="submit" hidden />
      </form>
    </Sheet>
  );
}
