import { useEffect, useRef, useState } from 'preact/hooks';

/** Ruta basada en el hash (#/pedido/abc). Funciona en cualquier hosting y offline. */
export function useRuta() {
  const leer = () => (window.location.hash.replace(/^#/, '') || '/').split('?')[0];
  const [ruta, setRuta] = useState(leer);
  useEffect(() => {
    const f = () => setRuta(leer());
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return ruta;
}

export function navegar(ruta, { reemplazar = false } = {}) {
  const destino = `#${ruta}`;
  if (reemplazar) {
    history.replaceState(null, '', destino);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = ruta;
  }
}

/** Ejecuta `fn` cada `ms` mientras la pestaña está visible; al volver a ella, ejecuta de inmediato. */
export function useSondeo(fn, ms, activo = true) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!activo) return undefined;
    let timer = null;
    const tick = () => {
      if (document.visibilityState === 'visible') ref.current();
    };
    const programar = () => {
      clearInterval(timer);
      timer = setInterval(tick, ms);
    };
    const alVolver = () => {
      if (document.visibilityState === 'visible') {
        ref.current();
        programar();
      }
    };
    programar();
    document.addEventListener('visibilitychange', alVolver);
    window.addEventListener('online', alVolver);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener('online', alVolver);
    };
  }, [ms, activo]);
}

/** Fuerza un re-render cada `ms` (para relojes y "hace X min"). */
export function useAhora(ms = 30_000) {
  const [ahora, setAhora] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return ahora;
}

export function useEnLinea() {
  const [enLinea, setEnLinea] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setEnLinea(true);
    const off = () => setEnLinea(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return enLinea;
}

/** Escucha mensajes del service worker (push recibido, navegar desde una notificación). */
export function useMensajesSW(fn) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;
    const h = (e) => ref.current(e.data || {});
    navigator.serviceWorker.addEventListener('message', h);
    return () => navigator.serviceWorker.removeEventListener('message', h);
  }, []);
}
