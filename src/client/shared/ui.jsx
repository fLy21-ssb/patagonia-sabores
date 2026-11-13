// Componentes de interfaz compartidos: hoja modal, toasts, confirmación, switch, stepper.
import { useEffect, useRef, useState } from 'preact/hooks';
import { AlertCircle, CheckCircle2, Info, Minus, Plus, X } from 'lucide-preact';
import { crearStore, useStore } from './store.js';

const ENFOCABLES = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Hoja inferior en el teléfono, modal centrado en pantallas grandes. Se cierra con Escape, clic afuera o deslizando. */
export function Sheet({ abierto, onCerrar, titulo, children, pie, ancho = false, etiqueta, sinCabecera = false }) {
  const ref = useRef(null);
  const inicioY = useRef(null);
  const [arrastre, setArrastre] = useState(0);

  useEffect(() => {
    if (!abierto) return undefined;
    const previo = document.activeElement;
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCerrar?.();
      }
      if (e.key === 'Tab' && ref.current) {
        const nodos = [...ref.current.querySelectorAll(ENFOCABLES)].filter((n) => n.offsetParent !== null);
        if (!nodos.length) return;
        const primero = nodos[0];
        const ultimo = nodos[nodos.length - 1];
        if (e.shiftKey && document.activeElement === primero) {
          e.preventDefault();
          ultimo.focus();
        } else if (!e.shiftKey && document.activeElement === ultimo) {
          e.preventDefault();
          primero.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const raf = requestAnimationFrame(() => ref.current?.focus({ preventScroll: true }));
    return () => {
      cancelAnimationFrame(raf);
      document.body.style.overflow = overflowPrevio;
      document.removeEventListener('keydown', onKey);
      if (previo && typeof previo.focus === 'function') previo.focus({ preventScroll: true });
    };
  }, [abierto]);

  if (!abierto) return null;

  const tocar = {
    onTouchStart: (e) => {
      if (window.innerWidth >= 720) return;
      inicioY.current = e.touches[0].clientY;
    },
    onTouchMove: (e) => {
      if (inicioY.current === null) return;
      setArrastre(Math.max(0, e.touches[0].clientY - inicioY.current));
    },
    onTouchEnd: () => {
      if (inicioY.current === null) return;
      inicioY.current = null;
      if (arrastre > 90) onCerrar?.();
      setArrastre(0);
    },
  };

  return (
    <>
      <div class="sheet-backdrop" onClick={onCerrar} />
      <div
        class={`sheet${ancho ? ' wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={etiqueta || titulo}
        tabIndex={-1}
        ref={ref}
        style={arrastre ? { transform: `translateY(${arrastre}px)`, transition: 'none' } : undefined}
      >
        <div class="sheet-handle" {...tocar} />
        {!sinCabecera && (
          <div class="sheet-head" {...tocar}>
            <h2>{titulo}</h2>
            <button type="button" class="icon-btn sm" onClick={onCerrar} aria-label="Cerrar">
              <X size={18} />
            </button>
          </div>
        )}
        <div class="sheet-body">{children}</div>
        {pie && <div class="sheet-foot">{pie}</div>}
      </div>
    </>
  );
}

// ---------- Toasts ----------
const toasts = crearStore('toasts', [], { tipo: 'memoria' });
let siguienteId = 0;

export function toast(mensaje, tipo = 'info', { ms = 3800, accion } = {}) {
  const t = { id: ++siguienteId, mensaje, tipo, accion };
  toasts.set((l) => [...l.slice(-2), t]);
  setTimeout(() => toasts.set((l) => l.filter((x) => x.id !== t.id)), ms);
}

const ICONO_TOAST = { ok: CheckCircle2, error: AlertCircle, info: Info };

export function Toasts() {
  const lista = useStore(toasts);
  return (
    <div class="toasts" role="status" aria-live="polite">
      {lista.map((t) => {
        const Icono = ICONO_TOAST[t.tipo] || Info;
        return (
          <div key={t.id} class={`toast ${t.tipo}`}>
            <Icono size={20} />
            <span>{t.mensaje}</span>
            {t.accion && (
              <button
                type="button"
                onClick={() => {
                  t.accion.fn();
                  toasts.set((l) => l.filter((x) => x.id !== t.id));
                }}
              >
                {t.accion.texto}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------- Confirmación (reemplaza window.confirm) ----------
const confirmacion = crearStore('confirmacion', null, { tipo: 'memoria' });

/** Devuelve true/false, o el texto ingresado si `pedirTexto` (false si se cancela). */
export function confirmar(opciones) {
  return new Promise((resolve) => confirmacion.set({ ...opciones, resolve }));
}

export function ConfirmHost() {
  const c = useStore(confirmacion);
  const [texto, setTexto] = useState('');
  useEffect(() => setTexto(c?.valorInicial || ''), [c]);
  if (!c) return null;
  const cerrar = (valor) => {
    confirmacion.set(null);
    c.resolve(valor);
  };
  return (
    <Sheet
      abierto
      onCerrar={() => cerrar(false)}
      titulo={c.titulo}
      pie={
        <div class="row">
          <button type="button" class="btn btn-ghost grow" onClick={() => cerrar(false)}>
            {c.cancelar || 'Volver'}
          </button>
          <button
            type="button"
            class={`btn grow ${c.peligro ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => cerrar(c.pedirTexto ? texto.trim() : true)}
          >
            {c.ok || 'Confirmar'}
          </button>
        </div>
      }
    >
      <div class="stack">
        {c.texto && <p class="muted">{c.texto}</p>}
        {c.pedirTexto && (
          <input
            class="input"
            placeholder={c.placeholder || ''}
            value={texto}
            maxLength={140}
            onInput={(e) => setTexto(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && cerrar(texto.trim())}
          />
        )}
        {c.opcionesRapidas && (
          <div class="row wrap">
            {c.opcionesRapidas.map((o) => (
              <button type="button" class="chip" key={o} onClick={() => setTexto(o)}>
                {o}
              </button>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  );
}

// ---------- Controles ----------
export function Switch({ checked, onChange, etiqueta, disabled }) {
  return (
    <label class="switch">
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        aria-label={etiqueta}
        onChange={(e) => onChange(e.currentTarget.checked)}
      />
      <span class="track" />
    </label>
  );
}

export function Stepper({ valor, onCambio, min = 0, max = 30, grande = false, etiqueta = 'Cantidad' }) {
  return (
    <div class={`stepper${grande ? ' lg' : ''}`} role="group" aria-label={etiqueta}>
      <button type="button" onClick={() => onCambio(Math.max(min, valor - 1))} disabled={valor <= min} aria-label="Quitar uno">
        <Minus size={18} strokeWidth={2.6} />
      </button>
      <output aria-live="polite">{valor}</output>
      <button type="button" onClick={() => onCambio(Math.min(max, valor + 1))} disabled={valor >= max} aria-label="Agregar uno">
        <Plus size={18} strokeWidth={2.6} />
      </button>
    </div>
  );
}

/** Estado vacío con la ovejita de la marca (sin emojis). */
export function Vacio({ titulo, texto, children, oveja = true }) {
  return (
    <div class="empty">
      {oveja && <img class="oveja" src="/brand/oveja-cara.webp" alt="" width="120" height="72" loading="lazy" />}
      {titulo && <h3>{titulo}</h3>}
      {texto && <p>{texto}</p>}
      {children}
    </div>
  );
}

/** Ícono de Instagram (lucide ya no incluye marcas). */
export function IconoInstagram({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
    </svg>
  );
}
