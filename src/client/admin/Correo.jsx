// Ajustes → Correo para avisos: conecta el Gmail del local con una contraseña de aplicación.
import { useEffect, useState } from 'preact/hooks';
import { CheckCircle2, ExternalLink, Eye, EyeOff, Mail, Send } from 'lucide-preact';
import { useStore } from '../shared/store.js';
import { confirmar, toast } from '../shared/ui.jsx';
import { Rombo } from '../shared/simbolos.jsx';
import { ajustesStore, apiAdmin } from './estado.js';

export function CorreoLocal() {
  const ajustes = useStore(ajustesStore);
  const [cfg, setCfg] = useState(null);
  const [editando, setEditando] = useState(false);
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [remitente, setRemitente] = useState('');
  const [ver, setVer] = useState(false);
  const [ocupado, setOcupado] = useState('');

  useEffect(() => {
    apiAdmin('/api/admin/correo')
      .then(setCfg)
      .catch((e) => toast(e.message, 'error'));
  }, []);

  function abrirFormulario() {
    setUsuario(cfg?.usuario || '');
    setRemitente(cfg?.remitente || ajustes?.nombre || 'Patagonia Sabores');
    setPassword('');
    setEditando(true);
  }

  async function conectar(e) {
    e.preventDefault();
    setOcupado('conectar');
    try {
      const r = await apiAdmin('/api/admin/correo', { method: 'PUT', body: { usuario, password, remitente } });
      setCfg(r);
      setEditando(false);
      setPassword('');
      toast('Gmail conectado. Ya puedes enviar correos a tus clientes.', 'ok', { ms: 5000 });
    } catch (err) {
      toast(err.message, 'error', { ms: 9000 });
    } finally {
      setOcupado('');
    }
  }

  async function probar() {
    setOcupado('probar');
    try {
      const r = await apiAdmin('/api/admin/correo/prueba', { method: 'POST', body: {} });
      toast(`Te enviamos un correo de prueba a ${r.para}. Revisa tu bandeja.`, 'ok', { ms: 6000 });
    } catch (err) {
      toast(err.message, 'error', { ms: 9000 });
    } finally {
      setOcupado('');
    }
  }

  async function desconectar() {
    const ok = await confirmar({
      titulo: '¿Desconectar el Gmail?',
      texto: 'Los clientes dejarán de recibir correos de sus pedidos y no podrás enviar promociones por correo.',
      ok: 'Desconectar',
      peligro: true,
    });
    if (!ok) return;
    try {
      setCfg(await apiAdmin('/api/admin/correo', { method: 'DELETE' }));
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  if (!cfg) return <div class="spinner" />;

  if (cfg.configurado && !editando) {
    return (
      <div class="stack">
        <div class="correo-estado">
          <Rombo color="verde">
            <CheckCircle2 size={18} />
          </Rombo>
          <span class="grow">
            <strong>Conectado: {cfg.usuario}</strong>
            <small class="block muted">
              Los correos salen como “{cfg.remitente}”. Avisamos cuando recibes un pedido, cuando está listo y si se cancela.
            </small>
          </span>
        </div>
        <div class="row wrap">
          <button type="button" class="btn btn-outline btn-sm" onClick={probar} disabled={Boolean(ocupado)}>
            {ocupado === 'probar' ? <span class="spinner" /> : <Send size={16} />} Enviarme un correo de prueba
          </button>
          <button type="button" class="btn btn-ghost btn-sm" onClick={abrirFormulario}>
            Cambiar
          </button>
          <button type="button" class="btn btn-ghost btn-sm" onClick={desconectar}>
            Desconectar
          </button>
        </div>
        <p class="muted small">Gmail permite enviar hasta unos 500 correos al día desde una cuenta normal.</p>
      </div>
    );
  }

  if (!editando) {
    return (
      <div class="stack">
        <div class="correo-estado apagado">
          <Rombo color="crema">
            <Mail size={18} />
          </Rombo>
          <span class="grow">
            <strong>Aún no conectas un correo</strong>
            <small class="block muted">
              Si el cliente deja su correo al pedir, le avisamos por ahí que recibimos su pedido y cuando está listo. También sirve para enviar promociones. Es gratis
              y sale desde el Gmail del local.
            </small>
          </span>
        </div>
        <button type="button" class="btn btn-primary" onClick={abrirFormulario}>
          <Mail size={18} /> Conectar el Gmail del local
        </button>
      </div>
    );
  }

  return (
    <form class="stack" onSubmit={conectar}>
      <ol class="pasos-gmail">
        <li>
          Entra a la cuenta de Google del local y activa la{' '}
          <a href="https://myaccount.google.com/signinoptions/two-step-verification" target="_blank" rel="noopener">
            verificación en 2 pasos <ExternalLink size={13} />
          </a>{' '}
          (si ya la tienes, sigue al paso 2).
        </li>
        <li>
          Abre{' '}
          <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener">
            Contraseñas de aplicaciones <ExternalLink size={13} />
          </a>
          , escribe el nombre <strong>Patagonia</strong> y toca <strong>Crear</strong>.
        </li>
        <li>Google te mostrará una clave de 16 letras: cópiala y pégala aquí abajo.</li>
      </ol>
      <div class="dos-columnas">
        <label class="field">
          <span class="label">Gmail del local</span>
          <input
            class="input"
            type="email"
            autoComplete="username"
            inputMode="email"
            value={usuario}
            placeholder="patagoniasabores@gmail.com"
            onInput={(e) => setUsuario(e.currentTarget.value.trim())}
          />
        </label>
        <label class="field">
          <span class="label">Nombre del remitente</span>
          <input class="input" maxLength={60} value={remitente} onInput={(e) => setRemitente(e.currentTarget.value)} />
        </label>
      </div>
      <label class="field">
        <span class="label">Contraseña de aplicación</span>
        <span class="input-con-boton">
          <input
            class="input clave-app"
            type={ver ? 'text' : 'password'}
            autoComplete="new-password"
            spellcheck={false}
            value={password}
            placeholder={cfg.configurado && usuario === cfg.usuario ? 'Déjala vacía para mantener la actual' : 'xxxx xxxx xxxx xxxx'}
            onInput={(e) => setPassword(e.currentTarget.value)}
          />
          <button type="button" class="icon-btn sm" aria-label={ver ? 'Ocultar clave' : 'Mostrar clave'} onClick={() => setVer(!ver)}>
            {ver ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </span>
        <span class="hint">No es la contraseña normal del Gmail. Se guarda cifrada y nunca se muestra de nuevo.</span>
      </label>
      <div class="row wrap">
        <button class="btn btn-primary" type="submit" disabled={ocupado === 'conectar' || !usuario}>
          {ocupado === 'conectar' ? (
            <>
              <span class="spinner" /> Probando con Gmail…
            </>
          ) : (
            'Conectar y probar'
          )}
        </button>
        <button type="button" class="btn btn-ghost" onClick={() => setEditando(false)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
