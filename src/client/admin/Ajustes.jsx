import { useEffect, useState } from 'preact/hooks';
import { Copy, KeyRound, Printer, QrCode, Save, Share2 } from 'lucide-preact';
import { api } from '../shared/api.js';
import { DIAS } from '../shared/format.js';
import { useStore } from '../shared/store.js';
import { Switch, toast } from '../shared/ui.jsx';
import { useInstalacion } from '../shared/pwa.js';
import { ajustesStore, apiAdmin, cargarAjustes } from './estado.js';
import { AvisosDispositivo } from './Avisos.jsx';
import { CorreoLocal } from './Correo.jsx';
import { HojaQR, QR, imprimir } from './imprimir.jsx';

export function Ajustes() {
  const guardados = useStore(ajustesStore);
  const [f, setF] = useState(guardados);
  const [guardando, setGuardando] = useState(false);
  const instalacion = useInstalacion();

  useEffect(() => {
    if (!guardados) cargarAjustes().catch((e) => toast(e.message, 'error'));
  }, []);
  useEffect(() => {
    if (guardados && !f) setF(guardados);
  }, [guardados]);

  if (!f) {
    return (
      <div class="page-center">
        <div class="spinner" />
      </div>
    );
  }

  const sucio = JSON.stringify(f) !== JSON.stringify(guardados);
  const set = (cambios) => setF((x) => ({ ...x, ...cambios }));
  const setSub = (clave, cambios) => setF((x) => ({ ...x, [clave]: { ...x[clave], ...cambios } }));
  const setDia = (i, cambios) => setF((x) => ({ ...x, horario: x.horario.map((h, j) => (j === i ? { ...h, ...cambios } : h)) }));

  async function guardar() {
    setGuardando(true);
    try {
      const { ajustes } = await apiAdmin('/api/admin/ajustes', { method: 'PUT', body: f });
      ajustesStore.set(ajustes);
      setF(ajustes);
      toast('Ajustes guardados', 'ok');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setGuardando(false);
    }
  }

  const linkMenu = `${window.location.origin}/`;

  return (
    <div class="ajustes">
      <header class="page-head">
        <div>
          <h1>Ajustes</h1>
          <p class="muted">Lo que cambies aquí lo ven los clientes al instante.</p>
        </div>
      </header>

      <section class="card card-pad stack">
        <h2 class="card-title">Estado del local</h2>
        <div class="switch-row">
          <span>
            <strong>Recibiendo pedidos</strong>
            <small class="block muted">Apágalo si se te llenó la cocina: el menú se sigue viendo, pero no se puede pedir.</small>
          </span>
          <Switch checked={f.recibiendoPedidos} onChange={(v) => set({ recibiendoPedidos: v })} etiqueta="Recibiendo pedidos" />
        </div>
        <label class="field">
          <span class="label">Mensaje cuando está en pausa</span>
          <input class="input" maxLength={160} value={f.mensajePausa} onInput={(e) => set({ mensajePausa: e.currentTarget.value })} />
        </label>
      </section>

      <section class="card card-pad stack">
        <h2 class="card-title">Datos del local</h2>
        <div class="dos-columnas">
          <Campo etiqueta="Nombre" valor={f.nombre} max={60} onCambio={(v) => set({ nombre: v })} />
          <Campo etiqueta="Frase bajo el logo" valor={f.eslogan} max={120} onCambio={(v) => set({ eslogan: v })} />
          <Campo etiqueta="Dirección" valor={f.direccion} max={160} onCambio={(v) => set({ direccion: v })} placeholder="Ej: Av. Costanera 123, Coyhaique" />
          <Campo etiqueta="Teléfono" valor={f.telefono} max={25} onCambio={(v) => set({ telefono: v })} placeholder="+56 9 1234 5678" tipo="tel" />
          <Campo
            etiqueta="WhatsApp (con código de país)"
            valor={f.whatsapp}
            max={15}
            onCambio={(v) => set({ whatsapp: v.replace(/\D/g, '') })}
            placeholder="56912345678"
            tipo="tel"
            ayuda="Solo números. Los clientes podrán escribirte con un toque."
          />
          <Campo etiqueta="Instagram" valor={f.instagram} max={40} onCambio={(v) => set({ instagram: v.replace(/^@/, '') })} placeholder="patagoniasabores" />
        </div>
        <label class="field">
          <span class="label">Aviso destacado en el menú</span>
          <input class="input" maxLength={200} value={f.aviso} onInput={(e) => set({ aviso: e.currentTarget.value })} placeholder="Ej: ¡Hoy 2x1 en empanadas! (déjalo vacío para no mostrar nada)" />
        </label>
      </section>

      <section class="card card-pad stack">
        <h2 class="card-title">Tipos de pedido</h2>
        {[
          ['retiro', 'Retiro en el local', 'El cliente pasa a buscarlo.'],
          ['delivery', 'Delivery', 'Lo llevas a la dirección del cliente.'],
          ['mesa', 'Pedidos desde la mesa (QR)', 'Para cuando tengan mesas: el cliente escanea el QR de su mesa y pide desde su celular.'],
        ].map(([k, t, d]) => (
          <div key={k} class="switch-row">
            <span>
              <strong>{t}</strong>
              <small class="block muted">{d}</small>
            </span>
            <Switch checked={f.tipos[k]} onChange={(v) => setSub('tipos', { [k]: v })} etiqueta={t} />
          </div>
        ))}
        {f.tipos.mesa && (
          <a class="btn btn-outline btn-sm" href="#/mesas">
            <QrCode size={16} /> Administrar mesas y sus códigos QR
          </a>
        )}
        <div class="dos-columnas">
          <CampoNumero etiqueta="Tiempo de preparación (min)" valor={f.tiempoPreparacion} onCambio={(v) => set({ tiempoPreparacion: v })} />
          {f.tipos.delivery && (
            <>
              <CampoNumero etiqueta="Costo de delivery ($)" valor={f.delivery.costo} onCambio={(v) => setSub('delivery', { costo: v })} pesos />
              <CampoNumero etiqueta="Pedido mínimo delivery ($)" valor={f.delivery.minimo} onCambio={(v) => setSub('delivery', { minimo: v })} pesos />
            </>
          )}
        </div>
        {f.tipos.delivery && (
          <label class="field">
            <span class="label">Zona de delivery (texto para el cliente)</span>
            <input class="input" maxLength={200} value={f.delivery.zona} onInput={(e) => setSub('delivery', { zona: e.currentTarget.value })} />
          </label>
        )}
      </section>

      <section class="card card-pad stack">
        <h2 class="card-title">Medios de pago</h2>
        {[
          ['efectivo', 'Efectivo'],
          ['transferencia', 'Transferencia'],
          ['tarjeta', 'Tarjeta (débito/crédito al recibir)'],
        ].map(([k, t]) => (
          <div key={k} class="switch-row">
            <strong>{t}</strong>
            <Switch checked={f.pagos[k]} onChange={(v) => setSub('pagos', { [k]: v })} etiqueta={t} />
          </div>
        ))}
        {f.pagos.transferencia && (
          <label class="field">
            <span class="label">Datos para transferir (se muestran al cliente después de pedir)</span>
            <textarea
              class="textarea"
              rows={5}
              maxLength={400}
              value={f.datosTransferencia}
              onInput={(e) => set({ datosTransferencia: e.currentTarget.value })}
              placeholder={'Nombre: ...\nRUT: ...\nBanco: ...\nCuenta: ...\nCorreo: ...'}
            />
          </label>
        )}
      </section>

      <section class="card card-pad stack">
        <h2 class="card-title">Horario de atención</h2>
        <p class="muted small">Fuera de este horario el menú se ve, pero no se puede pedir. Usa la misma hora de apertura y cierre para “todo el día”.</p>
        <div class="horario-edit">
          {DIAS.map((d, i) => (
            <div key={d} class={`dia-fila${f.horario[i].abierto ? '' : ' cerrado'}`}>
              <strong>{d}</strong>
              <Switch checked={f.horario[i].abierto} onChange={(v) => setDia(i, { abierto: v })} etiqueta={`Abierto el ${d}`} />
              {f.horario[i].abierto ? (
                <span class="row">
                  <input class="input hora" type="time" value={f.horario[i].desde} onInput={(e) => setDia(i, { desde: e.currentTarget.value })} aria-label={`${d} desde`} />
                  <span class="muted">a</span>
                  <input class="input hora" type="time" value={f.horario[i].hasta} onInput={(e) => setDia(i, { hasta: e.currentTarget.value })} aria-label={`${d} hasta`} />
                </span>
              ) : (
                <span class="muted">Cerrado</span>
              )}
            </div>
          ))}
        </div>
      </section>

      <section class="card card-pad stack">
        <h2 class="card-title">Impresora de tickets</h2>
        <div class="segmentado">
          {[58, 80].map((a) => (
            <button key={a} class={f.ticketAncho === a ? 'on' : ''} onClick={() => set({ ticketAncho: a })}>
              {a} mm
            </button>
          ))}
        </div>
        <p class="muted small">
          Funciona con cualquier impresora instalada en el computador o tablet. Para imprimir sin que aparezca el diálogo, abre el panel en Chrome con la opción
          <code> --kiosk-printing</code>.
        </p>
      </section>

      <section class="card card-pad stack">
        <h2 class="card-title">Avisos de pedidos nuevos</h2>
        <AvisosDispositivo />
        {instalacion.puedeInstalar && (
          <button class="btn btn-outline btn-sm" onClick={instalacion.instalar}>
            Instalar el panel como app en este dispositivo
          </button>
        )}
      </section>

      <section class="card card-pad stack" id="correo">
        <h2 class="card-title">Correo para avisos</h2>
        <CorreoLocal />
      </section>

      <section class="card card-pad stack">
        <h2 class="card-title">Comparte tu menú</h2>
        <div class="link-copiar">
          <code>{linkMenu}</code>
          <button class="btn btn-outline btn-sm" onClick={() => navigator.clipboard.writeText(linkMenu).then(() => toast('Link copiado', 'ok'))}>
            <Copy size={16} /> Copiar
          </button>
          {navigator.share && (
            <button class="btn btn-outline btn-sm" onClick={() => navigator.share({ title: f.nombre, text: '¡Pide online!', url: linkMenu }).catch(() => {})}>
              <Share2 size={16} /> Compartir
            </button>
          )}
        </div>
        <div class="qr-menu">
          <QR texto={linkMenu} class="qr-chico" />
          <div class="stack">
            <p class="muted small">Pégalo en tu bio de Instagram y en tu estado de WhatsApp, o imprime el QR para el mostrador y los volantes.</p>
            <button
              class="btn btn-outline btn-sm boton-inicio"
              onClick={() => imprimir(<HojaQR mesas={[{ link: '/', nombre: '' }]} origen={window.location.origin} nombreLocal={f.nombre} />, { pagina: 'A4', margen: '10mm' })}
            >
              <Printer size={16} /> Imprimir cartel con QR
            </button>
          </div>
        </div>
      </section>

      <CambiarPassword />

      {sucio && (
        <div class="barra-guardar">
          <span>Tienes cambios sin guardar</span>
          <button class="btn btn-ghost btn-sm" onClick={() => setF(guardados)}>
            Descartar
          </button>
          <button class="btn btn-primary" onClick={guardar} disabled={guardando}>
            {guardando ? <span class="spinner" /> : <Save size={18} />} Guardar cambios
          </button>
        </div>
      )}
    </div>
  );
}

function Campo({ etiqueta, valor, max, onCambio, placeholder, tipo = 'text', ayuda }) {
  return (
    <label class="field">
      <span class="label">{etiqueta}</span>
      <input class="input" type={tipo} maxLength={max} value={valor} placeholder={placeholder} onInput={(e) => onCambio(e.currentTarget.value)} />
      {ayuda && <span class="hint">{ayuda}</span>}
    </label>
  );
}

function CampoNumero({ etiqueta, valor, onCambio, pesos = false }) {
  return (
    <label class="field">
      <span class="label">{etiqueta}</span>
      <input
        class="input num"
        inputMode="numeric"
        value={pesos ? Number(valor || 0).toLocaleString('es-CL') : valor}
        onInput={(e) => onCambio(Number(e.currentTarget.value.replace(/\D/g, '') || 0))}
      />
    </label>
  );
}

function CambiarPassword() {
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetir, setRepetir] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function cambiar(e) {
    e.preventDefault();
    if (nueva.length < 8) return toast('La nueva contraseña debe tener al menos 8 caracteres.', 'error');
    if (nueva !== repetir) return toast('Las contraseñas nuevas no coinciden.', 'error');
    setOcupado(true);
    try {
      await api('/api/admin/password', { method: 'POST', admin: true, body: { actual, nueva } });
      setActual('');
      setNueva('');
      setRepetir('');
      toast('Contraseña cambiada. Se cerraron las otras sesiones.', 'ok');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <form class="card card-pad stack" onSubmit={cambiar}>
      <h2 class="card-title">Seguridad</h2>
      <div class="dos-columnas">
        <label class="field">
          <span class="label">Contraseña actual</span>
          <input class="input" type="password" autoComplete="current-password" value={actual} onInput={(e) => setActual(e.currentTarget.value)} />
        </label>
        <span />
        <label class="field">
          <span class="label">Nueva contraseña</span>
          <input class="input" type="password" autoComplete="new-password" minLength={8} value={nueva} onInput={(e) => setNueva(e.currentTarget.value)} />
        </label>
        <label class="field">
          <span class="label">Repite la nueva</span>
          <input class="input" type="password" autoComplete="new-password" minLength={8} value={repetir} onInput={(e) => setRepetir(e.currentTarget.value)} />
        </label>
      </div>
      <button class="btn btn-outline" disabled={ocupado || !actual || !nueva}>
        <KeyRound size={18} /> Cambiar contraseña
      </button>
    </form>
  );
}
