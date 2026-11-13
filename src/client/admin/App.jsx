import { useEffect, useRef } from 'preact/hooks';
import {
  ChartColumn,
  ClipboardList,
  ExternalLink,
  History,
  LogOut,
  Megaphone,
  QrCode,
  Settings,
  UtensilsCrossed,
} from 'lucide-preact';
import { api } from '../shared/api.js';
import { navegar, useMensajesSW, useRuta } from '../shared/hooks.js';
import { useStore } from '../shared/store.js';
import { ConfirmHost, Toasts, toast } from '../shared/ui.jsx';
import { campanita } from '../shared/pwa.js';
import { ajustesStore, cargarAjustes, preferencias, sesion, sincronizarTablero, tablero } from './estado.js';
import { imprimirTicket } from './imprimir.jsx';
import { Login } from './Login.jsx';
import { Tablero } from './Tablero.jsx';
import { Historial } from './Historial.jsx';
import { Carta } from './Carta.jsx';
import { Mesas } from './Mesas.jsx';
import { Estadisticas } from './Estadisticas.jsx';
import { Ajustes } from './Ajustes.jsx';
import { Promos } from './Promos.jsx';

const NAV = [
  { ruta: '/pedidos', nombre: 'Pedidos', Icono: ClipboardList },
  { ruta: '/historial', nombre: 'Historial', Icono: History },
  { ruta: '/carta', nombre: 'Carta', Icono: UtensilsCrossed },
  { ruta: '/promos', nombre: 'Promos', Icono: Megaphone },
  { ruta: '/mesas', nombre: 'Mesas', Icono: QrCode, soloSiMesas: true },
  { ruta: '/estadisticas', nombre: 'Estadísticas', corto: 'Stats', Icono: ChartColumn },
  { ruta: '/ajustes', nombre: 'Ajustes', Icono: Settings },
];

export function App() {
  const s = useStore(sesion);

  useEffect(() => {
    api('/api/admin/sesion')
      .then(() => sesion.set({ estado: 'ok' }))
      .catch(() => sesion.set({ estado: 'fuera' }));
  }, []);

  if (s.estado === 'verificando') {
    return (
      <div class="page-center">
        <div class="spinner" />
      </div>
    );
  }
  return (
    <>
      {s.estado === 'ok' ? <Panel /> : <Login />}
      <Toasts />
      <ConfirmHost />
    </>
  );
}

function Panel() {
  const ruta = useRuta();
  const ajustes = useStore(ajustesStore);
  const t = useStore(tablero);
  const pendientes = t.lista.filter((p) => p.estado === 'pendiente').length;
  const ultimoRecordatorio = useRef(0);

  useEffect(() => {
    if (!window.location.hash) navegar('/pedidos', { reemplazar: true });
    cargarAjustes().catch(() => {});
  }, []);

  // Sincronización del tablero en todo el panel (suena aunque estés en otra sección)
  useEffect(() => {
    let vivo = true;
    let ocupado = false;
    async function tick() {
      if (ocupado || !vivo) return;
      ocupado = true;
      try {
        const nuevos = await sincronizarTablero();
        if (nuevos.length) alLlegarNuevos(nuevos);
      } catch (e) {
        tablero.set((x) => ({ ...x, error: e.message }));
      } finally {
        ocupado = false;
      }
    }
    tick();
    const timer = setInterval(tick, 5000);
    const alVolver = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', alVolver);
    window.addEventListener('online', tick);
    return () => {
      vivo = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener('online', tick);
    };
  }, []);

  // Recordatorio sonoro mientras haya pedidos nuevos sin aceptar
  useEffect(() => {
    const timer = setInterval(() => {
      const prefs = preferencias.get();
      const hayEsperando = tablero.get().lista.some((p) => p.estado === 'pendiente' && Date.now() - new Date(p.creado) > 45_000);
      if (prefs.sonido && prefs.repetir && hayEsperando && Date.now() - ultimoRecordatorio.current > 30_000) {
        ultimoRecordatorio.current = Date.now();
        campanita({ volumen: 0.18 });
      }
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  // Título de la pestaña y globito del ícono de la app con los pedidos nuevos
  useEffect(() => {
    document.title = pendientes ? `(${pendientes}) Nuevos pedidos · Panel` : 'Panel · Patagonia Sabores';
    if ('setAppBadge' in navigator) {
      (pendientes ? navigator.setAppBadge(pendientes) : navigator.clearAppBadge()).catch(() => {});
    }
  }, [pendientes]);

  useMensajesSW((m) => {
    if (m.tipo === 'push') sincronizarTablero().then((n) => n.length && alLlegarNuevos(n)).catch(() => {});
    if (m.tipo === 'navegar' && m.url) {
      const hash = new URL(m.url, window.location.origin).hash.replace(/^#/, '');
      if (hash) navegar(hash);
    }
  });

  function alLlegarNuevos(nuevos) {
    const prefs = preferencias.get();
    if (prefs.sonido) campanita();
    navigator.vibrate?.([120, 60, 120]);
    ultimoRecordatorio.current = Date.now();
    const p = nuevos[nuevos.length - 1];
    toast(`Nuevo pedido #${p.id} · ${p.cliente.nombre}`, 'ok', { ms: 6000, accion: { texto: 'Ver', fn: () => navegar('/pedidos') } });
    if (prefs.autoImprimir) {
      const aj = ajustesStore.get();
      imprimirTicket(p, { nombreLocal: aj?.nombre, ancho: aj?.ticketAncho || 80 });
    }
  }

  async function salir() {
    await api('/api/admin/logout', { method: 'POST', admin: true, body: {} }).catch(() => {});
    sesion.set({ estado: 'fuera' });
  }

  const seccion = '/' + (ruta.split('/')[1] || 'pedidos');
  let pagina;
  switch (seccion) {
    case '/historial':
      pagina = <Historial />;
      break;
    case '/carta':
      pagina = <Carta />;
      break;
    case '/mesas':
      pagina = <Mesas />;
      break;
    case '/promos':
      pagina = <Promos />;
      break;
    case '/estadisticas':
      pagina = <Estadisticas />;
      break;
    case '/ajustes':
      pagina = <Ajustes />;
      break;
    default:
      pagina = <Tablero />;
  }

  return (
    <div class="admin-shell">
      <aside class="sidebar">
        <div class="brand">
          <img class="brand-logo" src="/brand/logo-claro.webp" alt={ajustes?.nombre || 'Patagonia Sabores'} width="720" height="471" />
          <small class="brand-sub">Panel del local</small>
        </div>
        <nav aria-label="Secciones">
          {NAV.map(({ ruta: r, nombre, Icono }) => (
            <a key={r} href={`#${r}`} class={`nav-item${seccion === r ? ' on' : ''}`} aria-current={seccion === r ? 'page' : undefined}>
              <Icono size={20} />
              <span>{nombre}</span>
              {r === '/pedidos' && pendientes > 0 && <span class="count">{pendientes}</span>}
            </a>
          ))}
        </nav>
        <svg class="sidebar-cordillera" viewBox="0 0 252 60" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 60 L0 40 L30 18 L52 34 L84 8 L112 30 L140 14 L170 38 L198 16 L226 32 L252 20 L252 60 Z" />
          <path class="cresta" d="M0 40 L30 18 L52 34 L84 8 L112 30 L140 14 L170 38 L198 16 L226 32 L252 20" />
        </svg>
        <div class="sidebar-bottom">
          {ajustes && (
            <div class={`estado-local ${ajustes.recibiendoPedidos ? 'on' : 'off'}`}>
              <span class="dot pulse" /> {ajustes.recibiendoPedidos ? 'Recibiendo pedidos' : 'Pedidos en pausa'}
            </div>
          )}
          <a class="nav-item" href="/" target="_blank" rel="noopener">
            <ExternalLink size={20} /> <span>Ver menú público</span>
          </a>
          <button class="nav-item" onClick={salir}>
            <LogOut size={20} /> <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>
      <main class="main">{pagina}</main>
      <nav class="bottom-nav" aria-label="Secciones">
        {NAV.filter((n) => !n.soloSiMesas || ajustes?.tipos?.mesa || seccion === n.ruta).map(({ ruta: r, nombre, corto, Icono }) => (
          <a key={r} href={`#${r}`} class={`bnav-item${seccion === r ? ' on' : ''}`} aria-current={seccion === r ? 'page' : undefined}>
            <Icono size={21} />
            <span>{corto || nombre}</span>
            {r === '/pedidos' && pendientes > 0 && <span class="bnav-count">{pendientes}</span>}
          </a>
        ))}
      </nav>
    </div>
  );
}
