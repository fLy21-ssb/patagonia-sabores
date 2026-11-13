import { useEffect, useState } from 'preact/hooks';
import { Copy, Download, Info, Plus, Printer, Trash2 } from 'lucide-preact';
import { useStore } from '../shared/store.js';
import { Switch, Vacio, confirmar, toast } from '../shared/ui.jsx';
import { ajustesStore, apiAdmin } from './estado.js';
import { HojaQR, QR, imprimir, qrSVG } from './imprimir.jsx';

async function descargarPNG(texto, nombreArchivo) {
  const svg = qrSVG(texto).replace('<svg ', '<svg width="1024" height="1024" ');
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 1024, 1024);
  ctx.drawImage(img, 0, 0, 1024, 1024);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombreArchivo;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function Mesas() {
  const ajustes = useStore(ajustesStore);
  const [mesas, setMesas] = useState(null);
  const [numero, setNumero] = useState('');
  const [nombre, setNombre] = useState('');
  const origen = window.location.origin;
  const nombreLocal = ajustes?.nombre || 'Patagonia Sabores';

  async function cargar() {
    try {
      const r = await apiAdmin('/api/admin/mesas');
      setMesas(r.mesas);
    } catch (e) {
      toast(e.message, 'error');
    }
  }
  useEffect(() => {
    cargar();
  }, []);

  async function crear(e) {
    e.preventDefault();
    try {
      await apiAdmin('/api/admin/mesas', { method: 'POST', body: { numero: Number(numero), nombre } });
      setNumero('');
      setNombre('');
      await cargar();
      toast('Mesa agregada con su código QR', 'ok');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  const sugerido = mesas ? Math.max(0, ...mesas.map((m) => m.numero)) + 1 : '';

  return (
    <div>
      <header class="page-head">
        <div>
          <h1>Mesas y códigos QR</h1>
          <p class="muted">El cliente escanea el QR de su mesa, pide desde su celular y el pedido llega con el número de mesa.</p>
        </div>
        <div class="head-actions">
          <button
            class="btn btn-primary"
            disabled={!mesas?.length}
            onClick={() => imprimir(<HojaQR mesas={mesas.filter((m) => m.activo)} origen={origen} nombreLocal={nombreLocal} />, { pagina: 'A4', margen: '10mm' })}
          >
            <Printer size={18} /> Imprimir todos los QR
          </button>
        </div>
      </header>

      {!ajustes?.tipos?.mesa && (
        <div class="notice info aviso-mesas">
          <Info size={20} />
          <span>
            Los pedidos en la mesa están desactivados. Cuando tengan mesas, actívalos en{' '}
            <a href="#/ajustes" class="link-fuerte">
              Ajustes → Tipos de pedido
            </a>{' '}
            y estos QR empezarán a funcionar.
          </span>
        </div>
      )}

      <section class="card card-pad qr-menu">
        <QR texto={`${origen}/`} class="qr-chico" />
        <div class="grow stack">
          <div>
            <h2 class="card-title">QR del menú (para llevar y delivery)</h2>
            <p class="muted">Ponlo en el mostrador, en tus redes o en volantes. Lleva al menú sin mesa asignada.</p>
          </div>
          <div class="row wrap">
            <button class="btn btn-outline btn-sm" onClick={() => descargarPNG(`${origen}/`, 'qr-menu.png')}>
              <Download size={16} /> Descargar PNG
            </button>
            <button
              class="btn btn-outline btn-sm"
              onClick={() => imprimir(<HojaQR mesas={[{ id: 'menu', link: '/' }]} origen={origen} nombreLocal={nombreLocal} />, { pagina: 'A4' })}
            >
              <Printer size={16} /> Imprimir
            </button>
            <button
              class="btn btn-outline btn-sm"
              onClick={() => navigator.clipboard.writeText(`${origen}/`).then(() => toast('Link copiado', 'ok'))}
            >
              <Copy size={16} /> Copiar link
            </button>
          </div>
        </div>
      </section>

      <form class="card card-pad row wrap agregar-mesa" onSubmit={crear}>
        <label class="field">
          <span class="label">N° de mesa</span>
          <input class="input num" type="number" min="1" max="9999" required value={numero} placeholder={String(sugerido)} onInput={(e) => setNumero(e.currentTarget.value)} />
        </label>
        <label class="field grow">
          <span class="label">
            Nombre <span class="subtle">(opcional)</span>
          </span>
          <input class="input" maxLength={40} value={nombre} placeholder="Ej: Terraza, Ventana…" onInput={(e) => setNombre(e.currentTarget.value)} />
        </label>
        <button class="btn btn-primary" disabled={!numero}>
          <Plus size={18} /> Agregar mesa
        </button>
      </form>

      {!mesas ? (
        <div class="page-center">
          <div class="spinner" />
        </div>
      ) : mesas.length === 0 ? (
        <Vacio titulo="Aún no hay mesas" texto="Agrega la primera arriba." />
      ) : (
        <div class="grid-mesas">
          {mesas.map((m) => (
            <article key={m.id} class={`card mesa-card${m.activo ? '' : ' pausado'}`}>
              <QR texto={`${origen}${m.link}`} class="qr-mesa" />
              <div class="mesa-info">
                <strong class="display">Mesa {m.numero}</strong>
                {m.nombre && <small class="muted">{m.nombre}</small>}
              </div>
              <div class="row wrap center-row">
                <button class="icon-btn sm" onClick={() => descargarPNG(`${origen}${m.link}`, `qr-mesa-${m.numero}.png`)} aria-label={`Descargar QR mesa ${m.numero}`} title="Descargar PNG">
                  <Download size={16} />
                </button>
                <button
                  class="icon-btn sm"
                  onClick={() => imprimir(<HojaQR mesas={[m]} origen={origen} nombreLocal={nombreLocal} />, { pagina: 'A4' })}
                  aria-label={`Imprimir QR mesa ${m.numero}`}
                  title="Imprimir"
                >
                  <Printer size={16} />
                </button>
                <Switch
                  checked={m.activo}
                  onChange={(v) => apiAdmin(`/api/admin/mesas/${m.id}`, { method: 'PUT', body: { nombre: m.nombre, activo: v } }).then(cargar).catch((e) => toast(e.message, 'error'))}
                  etiqueta={`Mesa ${m.numero} activa`}
                />
                <button
                  class="icon-btn sm"
                  aria-label={`Eliminar mesa ${m.numero}`}
                  title="Eliminar"
                  onClick={async () => {
                    if (await confirmar({ titulo: `¿Eliminar la mesa ${m.numero}?`, texto: 'Su código QR dejará de funcionar.', ok: 'Eliminar', peligro: true })) {
                      apiAdmin(`/api/admin/mesas/${m.id}`, { method: 'DELETE' }).then(cargar).catch((e) => toast(e.message, 'error'));
                    }
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
