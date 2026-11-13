// PWA: registro del service worker, instalación y suscripción a notificaciones push.
import { useEffect, useState } from 'preact/hooks';

export function registrarSW() {
  if (!('serviceWorker' in navigator)) return;
  // Cuando se publica una versión nueva, el service worker nuevo toma el control:
  // si la app recién se abrió, se recarga sola; si no, se avisa con un botón.
  const habiaControlador = Boolean(navigator.serviceWorker.controller);
  let recargando = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!habiaControlador || recargando) return;
    if (performance.now() < 20_000) {
      recargando = true;
      window.location.reload();
    } else {
      window.dispatchEvent(new CustomEvent('ps-version-nueva'));
    }
  });
  const registrar = () => navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('SW no registrado', e));
  if (document.readyState === 'complete') registrar();
  else window.addEventListener('load', registrar, { once: true });
}

export const esStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

export const esIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const pushSoportado = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

// ---------- Instalación ----------
let eventoInstalar = null;
const oyentes = new Set();
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  eventoInstalar = e;
  oyentes.forEach((f) => f());
});
window.addEventListener('appinstalled', () => {
  eventoInstalar = null;
  oyentes.forEach((f) => f());
});

export function useInstalacion() {
  const [, forzar] = useState(0);
  useEffect(() => {
    const f = () => forzar((n) => n + 1);
    oyentes.add(f);
    return () => oyentes.delete(f);
  }, []);
  const standalone = esStandalone();
  return {
    instalada: standalone,
    puedeInstalar: Boolean(eventoInstalar) && !standalone,
    iosManual: esIOS() && !standalone,
    async instalar() {
      if (!eventoInstalar) return false;
      eventoInstalar.prompt();
      const { outcome } = await eventoInstalar.userChoice;
      eventoInstalar = null;
      oyentes.forEach((f) => f());
      return outcome === 'accepted';
    },
  };
}

// ---------- Push ----------
function claveABytes(base64) {
  const relleno = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + relleno).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function mismaClave(sub, bytes) {
  const actual = sub.options?.applicationServerKey;
  if (!actual) return true;
  const a = new Uint8Array(actual);
  return a.length === bytes.length && a.every((v, i) => v === bytes[i]);
}

/**
 * Pide permiso (si corresponde) y devuelve la suscripción push de este dispositivo.
 * Errores posibles: 'no-soportado', 'denegado', 'sin-permiso'.
 */
export async function suscribirPush(vapidPublicKey, { pedirPermiso = true } = {}) {
  if (!pushSoportado() || !vapidPublicKey) throw new Error('no-soportado');
  let permiso = Notification.permission;
  if (permiso === 'default' && pedirPermiso) permiso = await Notification.requestPermission();
  if (permiso !== 'granted') throw new Error(permiso === 'denied' ? 'denegado' : 'sin-permiso');
  const reg = await navigator.serviceWorker.ready;
  const clave = claveABytes(vapidPublicKey);
  let sub = await reg.pushManager.getSubscription();
  if (sub && !mismaClave(sub, clave)) {
    await sub.unsubscribe();
    sub = null;
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: clave });
  return sub.toJSON();
}

export async function suscripcionActual() {
  if (!pushSoportado()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

export function mensajeErrorPush(e) {
  switch (e?.message) {
    case 'no-soportado':
      return esIOS() && !esStandalone()
        ? 'En iPhone, primero agrega la app a tu pantalla de inicio (Compartir → Agregar a inicio) y ábrela desde ahí.'
        : 'Este navegador no permite notificaciones.';
    case 'denegado':
      return 'Bloqueaste las notificaciones. Actívalas en la configuración del navegador para este sitio.';
    case 'sin-permiso':
      return 'No diste permiso para notificaciones.';
    default:
      return 'No pudimos activar los avisos en este dispositivo.';
  }
}

/** Sonido corto generado (sin archivos): campanita de dos notas. */
let audioCtx = null;
export function campanita({ volumen = 0.25 } = {}) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const t = audioCtx.currentTime;
    [
      [880, 0],
      [1318.5, 0.16],
    ].forEach(([freq, delay]) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t + delay);
      gain.gain.exponentialRampToValueAtTime(volumen, t + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + delay + 0.6);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t + delay);
      osc.stop(t + delay + 0.65);
    });
  } catch {
    /* sin audio disponible */
  }
}
