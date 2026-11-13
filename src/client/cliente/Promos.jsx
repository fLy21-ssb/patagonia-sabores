// Promociones para clientes: tarjeta para activar avisos de promos, código guardado y página de baja de correos.
import { useEffect, useState } from 'preact/hooks';
import { BellOff, BellRing, MailCheck, MailX, Megaphone, TicketPercent, X } from 'lucide-preact';
import { api } from '../shared/api.js';
import { useStore } from '../shared/store.js';
import { toast } from '../shared/ui.jsx';
import { Atardecer, Rombo } from '../shared/simbolos.jsx';
import { esIOS, esStandalone, mensajeErrorPush, pushSoportado, suscribirPush, suscripcionActual } from '../shared/pwa.js';
import { cuponGuardado } from './estado.js';

/** Tarjeta del menú: "¿Te avisamos de las promos?" (notificaciones en este dispositivo). */
export function TarjetaPromos({ vapidPublicKey, onAyudaIOS }) {
  const soportado = pushSoportado() && Boolean(vapidPublicKey);
  const iosSinInstalar = esIOS() && !esStandalone();
  const [estado, setEstado] = useState(soportado ? 'cargando' : 'no'); // cargando | no | si
  const [ocupado, setOcupado] = useState(false);
  const bloqueado = soportado && Notification.permission === 'denied';

  useEffect(() => {
    if (!soportado) return;
    let vivo = true;
    (async () => {
      try {
        const sub = await suscripcionActual();
        if (!sub) {
          if (vivo) setEstado('no');
          return;
        }
        const r = await api('/api/promos/suscripcion/estado', { method: 'POST', body: { endpoint: sub.endpoint } });
        if (vivo) setEstado(r.suscrito ? 'si' : 'no');
      } catch {
        if (vivo) setEstado('no');
      }
    })();
    return () => {
      vivo = false;
    };
  }, [soportado]);

  if (!soportado && !iosSinInstalar) return null;

  async function activar() {
    setOcupado(true);
    try {
      const sub = await suscribirPush(vapidPublicKey);
      await api('/api/promos/suscripcion', { method: 'POST', body: sub });
      setEstado('si');
      toast('Listo: te avisaremos cuando haya promociones.', 'ok');
    } catch (e) {
      toast(e.status !== undefined ? e.message : mensajeErrorPush(e), 'error', { ms: 6000 });
    } finally {
      setOcupado(false);
    }
  }

  async function desactivar() {
    setOcupado(true);
    try {
      const sub = await suscripcionActual();
      if (sub) await api('/api/promos/suscripcion/borrar', { method: 'POST', body: { endpoint: sub.endpoint } });
      setEstado('no');
      toast('Ya no te enviaremos avisos de promociones.', 'info');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setOcupado(false);
    }
  }

  const activo = estado === 'si';
  return (
    <section class={`tarjeta-promos${activo ? ' activa' : ''}`} aria-label="Promociones">
      <div class="promos-sello" aria-hidden="true">
        <Megaphone size={22} />
      </div>
      <div class="promos-texto">
        <h2>{activo ? 'Te avisaremos de las promos' : '¿Te avisamos de las promos?'}</h2>
        <p>
          {activo
            ? 'Cuando el local lance un descuento o algo nuevo, te llega una notificación.'
            : 'Descuentos, platos del día y novedades del local, directo en tu celular. Sin spam.'}
        </p>
        {!soportado && iosSinInstalar ? (
          <button type="button" class="btn btn-dark btn-sm" onClick={onAyudaIOS}>
            Instala la app para activarlas
          </button>
        ) : bloqueado ? (
          <p class="promos-nota">
            <BellOff size={15} /> Bloqueaste las notificaciones en este navegador.
          </p>
        ) : activo ? (
          <button type="button" class="btn-link" onClick={desactivar} disabled={ocupado}>
            Desactivar avisos de promociones
          </button>
        ) : (
          <button type="button" class="btn btn-primary btn-sm" onClick={activar} disabled={ocupado || estado === 'cargando'}>
            {ocupado ? <span class="spinner" /> : <BellRing size={17} />} Avísame
          </button>
        )}
      </div>
    </section>
  );
}

/** Aviso en el menú cuando llegó un código desde una promoción. */
export function AvisoCuponGuardado() {
  const guardado = useStore(cuponGuardado);
  if (!guardado?.codigo) return null;
  return (
    <div class="aviso-cupon">
      <Rombo color="sol" chico>
        <TicketPercent size={15} />
      </Rombo>
      <div class="grow">
        <strong>
          Tienes el código <span class="cupon-codigo en-linea">{guardado.codigo}</span>
        </strong>
        <small>Se aplica solo al finalizar tu pedido.</small>
      </div>
      <button type="button" class="cerrar-aviso" aria-label="Descartar el código" onClick={() => cuponGuardado.set(null)}>
        <X size={16} />
      </button>
    </div>
  );
}

/** Página a la que lleva el enlace "No quiero recibir más promociones" de los correos. */
export function BajaCorreos({ token }) {
  const [estado, setEstado] = useState('confirmar'); // confirmar | enviando | baja | alta | error
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  async function cambiar(ruta, siguiente) {
    setEstado('enviando');
    try {
      const r = await api(ruta, { method: 'POST', body: { token } });
      setEmail(r.email);
      setEstado(siguiente);
    } catch (e) {
      setError(e.message);
      setEstado('error');
    }
  }

  const titulo = {
    confirmar: '¿Dejar de recibir promociones?',
    enviando: 'Un momento…',
    baja: 'Listo, no te enviaremos más promociones',
    alta: '¡Qué bueno tenerte de vuelta!',
    error: 'Este enlace no funcionó',
  }[estado];

  return (
    <div class="pagina-baja">
      <Atardecer variante={estado === 'baja' ? 'gris' : 'tarde'} class="baja-cielo">
        <img class="baja-logo" src="/brand/logo.webp" alt="Patagonia Sabores" width="720" height="471" />
      </Atardecer>
      <div class="card card-pad stack baja-card">
        <Rombo color={estado === 'error' ? 'crema' : estado === 'baja' ? 'ciruela' : 'magenta'}>
          {estado === 'baja' ? <MailX size={19} /> : <MailCheck size={19} />}
        </Rombo>
        <h1 class="card-title">{titulo}</h1>
        {estado === 'confirmar' && (
          <>
            <p class="muted">Seguirás recibiendo los avisos de tus pedidos (recibido y listo). Solo dejarás de recibir descuentos y novedades.</p>
            <button type="button" class="btn btn-primary btn-block" onClick={() => cambiar('/api/promos/baja', 'baja')}>
              Sí, darme de baja
            </button>
            <a class="btn btn-ghost btn-block" href="#/">
              No, volver al menú
            </a>
          </>
        )}
        {estado === 'baja' && (
          <>
            <p class="muted">{email} ya no recibirá promociones. Si fue un error, puedes volver a suscribirte.</p>
            <button type="button" class="btn btn-ghost btn-block" onClick={() => cambiar('/api/promos/alta', 'alta')}>
              Me arrepentí, quiero recibirlas
            </button>
            <a class="btn btn-primary btn-block" href="#/">
              Ver el menú
            </a>
          </>
        )}
        {estado === 'alta' && (
          <>
            <p class="muted">{email} volverá a recibir nuestras promociones.</p>
            <a class="btn btn-primary btn-block" href="#/">
              Ver el menú
            </a>
          </>
        )}
        {estado === 'error' && (
          <>
            <p class="muted">{error} Si quieres dejar de recibir correos, escríbenos y lo hacemos por ti.</p>
            <a class="btn btn-primary btn-block" href="#/">
              Ver el menú
            </a>
          </>
        )}
        {estado === 'enviando' && <div class="spinner" />}
      </div>
    </div>
  );
}
