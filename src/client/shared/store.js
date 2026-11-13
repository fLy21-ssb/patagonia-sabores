// Estado global mínimo, persistido en localStorage/sessionStorage, con hook para Preact.
import { useEffect, useState } from 'preact/hooks';

function almacen(tipo) {
  if (tipo === 'memoria') return null;
  try {
    const s = tipo === 'session' ? window.sessionStorage : window.localStorage;
    const k = '__ps_test__';
    s.setItem(k, '1');
    s.removeItem(k);
    return s;
  } catch {
    return null; // modo privado o almacenamiento bloqueado: la app funciona igual, sin recordar
  }
}

export function crearStore(clave, inicial, { tipo = 'local' } = {}) {
  const storage = almacen(tipo);
  let estado = inicial;
  try {
    const guardado = storage?.getItem(clave);
    if (guardado) estado = JSON.parse(guardado);
  } catch {
    estado = inicial;
  }
  const subs = new Set();
  const store = {
    get: () => estado,
    set(siguiente) {
      estado = typeof siguiente === 'function' ? siguiente(estado) : siguiente;
      try {
        if (estado === null || estado === undefined) storage?.removeItem(clave);
        else storage?.setItem(clave, JSON.stringify(estado));
      } catch {
        /* sin espacio o bloqueado */
      }
      subs.forEach((f) => f(estado));
    },
    subscribe(f) {
      subs.add(f);
      return () => subs.delete(f);
    },
  };
  // Sincroniza entre pestañas
  if (storage && tipo === 'local') {
    window.addEventListener('storage', (e) => {
      if (e.key !== clave) return;
      try {
        estado = e.newValue ? JSON.parse(e.newValue) : inicial;
      } catch {
        estado = inicial;
      }
      subs.forEach((f) => f(estado));
    });
  }
  return store;
}

export function useStore(store) {
  const [valor, setValor] = useState(store.get());
  useEffect(() => {
    setValor(store.get());
    return store.subscribe(setValor);
  }, [store]);
  return valor;
}
