import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { WifiOff } from 'lucide-preact';
import { api } from '../shared/api.js';
import { navegar, useEnLinea, useMensajesSW, useRuta, useSondeo } from '../shared/hooks.js';
import { ConfirmHost, Toasts, toast } from '../shared/ui.jsx';
import { cuponGuardado, limpiarCarrito, mesaActual } from './estado.js';
import { Menu } from './Menu.jsx';
import { Checkout } from './Checkout.jsx';
import { Seguimiento } from './Seguimiento.jsx';
import { MisPedidos } from './MisPedidos.jsx';
import { BajaCorreos } from './Promos.jsx';
import { CrearGrupo, VerGrupo } from './Grupo.jsx';

const CUPON_RE = /^[A-Za-z0-9_-]{3,20}$/;

/** Código que llega en el enlace de una promoción (?cupon=CODIGO): se guarda para aplicarlo al pagar. */
function guardarCuponDeUrl(url) {
  const codigo = (url.searchParams.get('cupon') || '').trim();
  if (!CUPON_RE.test(codigo)) return false;
  cuponGuardado.set({ codigo: codigo.toUpperCase() });
  toast(`Código ${codigo.toUpperCase()} guardado: se aplica al finalizar tu pedido.`, 'ok', { ms: 6000 });
  return true;
}

export function App() {
  const ruta = useRuta();
  const enLinea = useEnLinea();
  const [menu, setMenu] = useState(null);
  const [error, setError] = useState(null);
  const primeraCarga = useRef(true);

  const cargarMenu = useCallback(async () => {
    try {
      const m = await api('/api/menu');
      setMenu(m);
      setError(null);
      const quitados = limpiarCarrito(m);
      if (quitados.length && !primeraCarga.current) {
        toast(`Quitamos de tu carro: ${quitados.join(', ')} (ya no está disponible).`, 'info', { ms: 6000 });
      } else if (quitados.length) {
        toast(`Algunos productos de tu carro ya no están disponibles hoy y los quitamos.`, 'info', { ms: 6000 });
      }
      primeraCarga.current = false;
      return m;
    } catch (e) {
      setError(e);
      return null;
    }
  }, []);

  useEffect(() => {
    cargarMenu();
  }, [cargarMenu]);
  useSondeo(cargarMenu, 90_000);

  // Llegada desde el código QR de una mesa: /?mesa=3&k=firma
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    const n = qs.get('mesa');
    const k = qs.get('k');
    if (!n || !k) return;
    history.replaceState(null, '', window.location.pathname + window.location.hash);
    api(`/api/mesa?n=${encodeURIComponent(n)}&k=${encodeURIComponent(k)}`)
      .then((r) => {
        mesaActual.set({ numero: r.mesa, firma: k, nombre: r.nombre || '' });
        toast(`¡Bienvenido! Estás pidiendo para la mesa ${r.mesa}`, 'ok', { ms: 5000 });
      })
      .catch(() => toast('Este código QR de mesa no es válido. Pide ayuda al personal.', 'error', { ms: 6000 }));
  }, []);

  // Enlace de una promoción con código de descuento: /?cupon=CODIGO
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('cupon')) return;
    guardarCuponDeUrl(url);
    url.searchParams.delete('cupon');
    history.replaceState(null, '', url.pathname + url.search + url.hash);
  }, []);

  // Una notificación tocada con la app abierta nos pide navegar (a un pedido o al menú con un código)
  useMensajesSW((m) => {
    if (m.tipo === 'navegar' && m.url) {
      const url = new URL(m.url, window.location.origin);
      guardarCuponDeUrl(url);
      const hash = url.hash.replace(/^#/, '');
      navegar(hash || '/');
    }
  });

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [ruta]);

  // Versión nueva publicada mientras la app estaba abierta
  useEffect(() => {
    const aviso = () =>
      toast('Hay una versión nueva de la app', 'info', { ms: 15000, accion: { texto: 'Actualizar', fn: () => window.location.reload() } });
    window.addEventListener('ps-version-nueva', aviso);
    return () => window.removeEventListener('ps-version-nueva', aviso);
  }, []);

  let pagina;
  if (ruta.startsWith('/pedido/')) pagina = <Seguimiento token={ruta.slice('/pedido/'.length)} menu={menu} />;
  else if (ruta === '/pedir') pagina = <Checkout menu={menu} recargarMenu={cargarMenu} />;
  else if (ruta === '/mis-pedidos') pagina = <MisPedidos />;
  else if (ruta.startsWith('/baja/')) pagina = <BajaCorreos token={ruta.slice('/baja/'.length)} />;
  else if (ruta === '/grupo/nuevo') pagina = <CrearGrupo menu={menu} />;
  else if (ruta.startsWith('/grupo/')) pagina = <VerGrupo token={ruta.slice('/grupo/'.length)} menu={menu} />;
  else pagina = <Menu menu={menu} error={error} recargar={cargarMenu} />;

  return (
    <>
      {!enLinea && (
        <div class="offline-bar" role="status">
          <WifiOff size={16} /> Sin conexión · mostrando lo último guardado
        </div>
      )}
      {pagina}
      <Toasts />
      <ConfirmHost />
    </>
  );
}
