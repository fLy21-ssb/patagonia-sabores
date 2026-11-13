import { useState } from 'preact/hooks';
import { Eye, EyeOff, LogIn } from 'lucide-preact';
import { api } from '../shared/api.js';
import { Atardecer } from '../shared/simbolos.jsx';
import { sesion } from './estado.js';

export function Login() {
  const [password, setPassword] = useState('');
  const [ver, setVer] = useState(false);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  async function entrar(e) {
    e.preventDefault();
    if (!password) return;
    setCargando(true);
    setError('');
    try {
      await api('/api/admin/login', { method: 'POST', admin: true, body: { password } });
      sesion.set({ estado: 'ok' });
    } catch (err) {
      setError(err.message);
      setPassword('');
    } finally {
      setCargando(false);
    }
  }

  return (
    <Atardecer class="login">
      <img src="/brand/logo.webp" alt="Patagonia Sabores" width="720" height="471" class="login-logo" />
      <form class="login-card" onSubmit={entrar}>
        <span class="label-espaciada">Panel del local</span>
        <h1>Bienvenido de vuelta</h1>
        <label class="field">
          <span class="label">Contraseña</span>
          <div class="input-con-boton">
            <input
              class={`input${error ? ' invalid' : ''}`}
              type={ver ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              autoFocus
              onInput={(e) => setPassword(e.currentTarget.value)}
            />
            <button type="button" class="icon-btn sm" onClick={() => setVer(!ver)} aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
              {ver ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {error && <span class="error-text">{error}</span>}
        </label>
        <button class="btn btn-primary btn-lg btn-block" disabled={cargando || !password}>
          {cargando ? <span class="spinner" /> : <LogIn size={20} />} Ingresar
        </button>
        <a class="small" href="/">
          Ir al menú público
        </a>
      </form>
    </Atardecer>
  );
}
