// Activar avisos push de pedidos nuevos en este dispositivo (teléfono del dueño, tablet de cocina, etc.).
import { useEffect, useState } from 'preact/hooks';
import { Bell, BellOff, BellRing, Send } from 'lucide-preact';
import { useStore } from '../shared/store.js';
import { toast } from '../shared/ui.jsx';
import { esIOS, esStandalone, mensajeErrorPush, pushSoportado, suscribirPush, suscripcionActual } from '../shared/pwa.js';
import { apiAdmin } from './estado.js';
import { crearStore } from '../shared/store.js';

const avisosLocal = crearStore('ps-panel-avisos-v1', { activo: false, endpoint: null });

export function AvisosDispositivo({ compacto = false }) {
  const estado = useStore(avisosLocal);
  const [ocupado, setOcupado] = useState(false);
  const [vapid, setVapid] = useState(null);
  const soportado = pushSoportado();

  useEffect(() => {
    apiAdmin('/api/admin/sesion')
      .then((r) => setVapid(r.vapidPublicKey))
      .catch(() => {});
    // Si el navegador perdió la suscripción, lo reflejamos
    suscripcionActual()
      .then((sub) => {
        if (!sub && avisosLocal.get().activo) avisosLocal.set({ activo: false, endpoint: null });
      })
      .catch(() => {});
  }, []);

  async function activar() {
    setOcupado(true);
    try {
      const sub = await suscribirPush(vapid);
      const nombre = `${/android/i.test(navigator.userAgent) ? 'Android' : esIOS() ? 'iPhone/iPad' : 'Computador'} · ${new Date().toLocaleDateString('es-CL')}`;
      await apiAdmin('/api/admin/suscripcion', { method: 'POST', body: { suscripcion: sub, nombre } });
      avisosLocal.set({ activo: true, endpoint: sub.endpoint });
      const r = await apiAdmin('/api/admin/suscripcion/prueba', { method: 'POST', body: { endpoint: sub.endpoint } });
      toast(r.enviadas ? 'Listo: te enviamos una notificación de prueba' : 'Avisos activados', 'ok');
    } catch (e) {
      toast(e.status ? e.message : mensajeErrorPush(e), 'error', { ms: 7000 });
    } finally {
      setOcupado(false);
    }
  }

  async function desactivar() {
    setOcupado(true);
    try {
      const sub = await suscripcionActual();
      if (sub) {
        await apiAdmin('/api/admin/suscripcion/borrar', { method: 'POST', body: { endpoint: sub.endpoint } });
        await sub.unsubscribe();
      }
      avisosLocal.set({ activo: false, endpoint: null });
      toast('Avisos desactivados en este dispositivo', 'info');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setOcupado(false);
    }
  }

  async function probar() {
    setOcupado(true);
    try {
      const r = await apiAdmin('/api/admin/suscripcion/prueba', { method: 'POST', body: { endpoint: estado.endpoint } });
      toast(r.enviadas ? 'Notificación de prueba enviada' : 'No se pudo enviar. Vuelve a activar los avisos.', r.enviadas ? 'ok' : 'error');
      if (!r.enviadas) avisosLocal.set({ activo: false, endpoint: null });
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setOcupado(false);
    }
  }

  if (compacto && estado.activo) return null;

  if (!soportado) {
    if (compacto) return null;
    return (
      <div class="notice info">
        <BellOff size={20} />
        <span>
          {esIOS() && !esStandalone()
            ? 'En iPhone/iPad: abre el panel en Safari, toca Compartir → Agregar a inicio, y activa los avisos desde esa app.'
            : 'Este navegador no permite notificaciones push. Usa Chrome, Edge, Firefox o Safari actualizados.'}
        </span>
      </div>
    );
  }

  if (compacto) {
    return (
      <div class="aviso-dispositivo">
        <Bell size={20} />
        <span class="grow">
          <strong>Recibe una notificación con cada pedido nuevo</strong>
          <small>Aunque tengas el panel cerrado o el teléfono bloqueado.</small>
        </span>
        <button class="btn btn-dark btn-sm" onClick={activar} disabled={ocupado || !vapid}>
          {ocupado ? <span class="spinner" /> : 'Activar'}
        </button>
      </div>
    );
  }

  return (
    <div class="stack">
      <div class="switch-row">
        <span class="row">
          {estado.activo ? <BellRing size={20} /> : <Bell size={20} />}
          <span>
            <strong>{estado.activo ? 'Avisos activos en este dispositivo' : 'Avisos apagados en este dispositivo'}</strong>
            <small class="block muted">Una notificación por cada pedido nuevo, aunque el panel esté cerrado.</small>
          </span>
        </span>
        <button class={`btn ${estado.activo ? 'btn-outline' : 'btn-primary'} btn-sm`} onClick={estado.activo ? desactivar : activar} disabled={ocupado || !vapid}>
          {ocupado ? <span class="spinner" /> : estado.activo ? 'Desactivar' : 'Activar'}
        </button>
      </div>
      {estado.activo && (
        <button class="btn btn-ghost btn-sm" onClick={probar} disabled={ocupado}>
          <Send size={16} /> Enviar notificación de prueba
        </button>
      )}
    </div>
  );
}
