// Impresión: ticket térmico (58/80 mm) para cocina/caja y hojas con códigos QR de las mesas.
import { render } from 'preact';
import qrcode from 'qrcode-generator';
import { clp, PAGOS, porPersona, TIPOS } from '../shared/format.js';

export function qrSVG(texto) {
  const qr = qrcode(0, 'M');
  qr.addData(texto);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}

export function QR({ texto, class: clase = 'qr' }) {
  return <div class={clase} dangerouslySetInnerHTML={{ __html: qrSVG(texto) }} />;
}

/** Imprime un componente usando el diálogo del navegador. `pagina`: '80mm auto', '58mm auto' o 'A4'. */
export function imprimir(contenido, { pagina = 'A4', margen = '10mm' } = {}) {
  let cont = document.getElementById('zona-impresion');
  if (!cont) {
    cont = document.createElement('div');
    cont.id = 'zona-impresion';
    document.body.appendChild(cont);
  }
  let estilo = document.getElementById('estilo-pagina');
  if (!estilo) {
    estilo = document.createElement('style');
    estilo.id = 'estilo-pagina';
    document.head.appendChild(estilo);
  }
  estilo.textContent = `@page { size: ${pagina}; margin: ${margen}; }`;
  render(contenido, cont);
  document.body.classList.add('imprimiendo');
  const limpiar = () => {
    document.body.classList.remove('imprimiendo');
    window.removeEventListener('afterprint', limpiar);
  };
  window.addEventListener('afterprint', limpiar);
  // Deja que el navegador pinte el contenido antes de abrir el diálogo
  requestAnimationFrame(() => setTimeout(() => window.print(), 50));
}

const fechaTicket = (iso) =>
  new Date(iso).toLocaleString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Santiago',
  });

export function Ticket({ p, nombreLocal }) {
  return (
    <div class="ticket">
      <div class="t-center t-local">{nombreLocal}</div>
      <div class="t-sep" />
      <div class="t-row t-big">
        <span>PEDIDO #{p.id}</span>
        <span>{fechaTicket(p.creado)}</span>
      </div>
      <div class="t-tipo">
        {p.tipo === 'mesa' ? `MESA ${p.mesa}` : TIPOS[p.tipo].corto.toUpperCase()}
        {p.grupal ? ' · GRUPAL' : ''}
      </div>
      {p.programado && <div class="t-tipo">PARA LAS {p.programado}</div>}
      <div>Cliente: {p.cliente.nombre}</div>
      {p.cliente.telefono && <div>Tel: {p.cliente.telefono}</div>}
      {p.direccion && <div>Dir: {p.direccion}</div>}
      <div class="t-sep" />
      {porPersona(p.items).map((g) => (
        <div key={g.persona || 'todos'}>
          {g.persona && <div class="t-persona">{g.persona.toUpperCase()}</div>}
          {g.items.map((it) => (
            <div key={it.id} class="t-item">
              <div class="t-row">
                <strong>
                  {it.cantidad} x {it.nombre}
                </strong>
                <span>{clp(it.total)}</span>
              </div>
              {it.acompanamiento && <div class="t-sub">&gt; {it.acompanamiento}</div>}
              {it.comentario && <div class="t-sub t-coment">* {it.comentario}</div>}
            </div>
          ))}
        </div>
      ))}
      <div class="t-sep" />
      {(p.costoEnvio > 0 || p.descuento > 0) && (
        <div class="t-row">
          <span>Subtotal</span>
          <span>{clp(p.subtotal)}</span>
        </div>
      )}
      {p.costoEnvio > 0 && (
        <div class="t-row">
          <span>Envío</span>
          <span>{clp(p.costoEnvio)}</span>
        </div>
      )}
      {p.descuento > 0 && (
        <div class="t-row">
          <span>Dcto. {p.cupon}</span>
          <span>-{clp(p.descuento)}</span>
        </div>
      )}
      <div class="t-row t-big">
        <span>TOTAL</span>
        <span>{clp(p.total)}</span>
      </div>
      <div>Pago: {PAGOS[p.metodoPago]?.nombre || p.metodoPago}</div>
      {p.notas && (
        <div class="t-notas">
          <strong>Notas:</strong> {p.notas}
        </div>
      )}
      <div class="t-sep" />
      <div class="t-center">¡Gracias por tu pedido!</div>
    </div>
  );
}

export function imprimirTicket(p, { nombreLocal = 'Patagonia Sabores', ancho = 80 } = {}) {
  imprimir(
    <div class={`zona-ticket w${ancho}`}>
      <Ticket p={p} nombreLocal={nombreLocal} />
    </div>,
    { pagina: `${ancho}mm auto`, margen: '2mm' },
  );
}

export function HojaQR({ mesas, origen, nombreLocal }) {
  return (
    <div class="hoja-qr">
      {mesas.map((m) => (
        <div key={m.id ?? 'menu'} class="qr-tarjeta">
          <img src="/brand/logo.webp" alt="" class="qr-logo" />
          <QR texto={`${origen}${m.link}`} class="qr-grande" />
          <div class="qr-titulo">{m.numero ? `Mesa ${m.numero}` : nombreLocal}</div>
          {m.nombre && <div class="qr-sub">{m.nombre}</div>}
          <div class="qr-texto">{m.numero ? 'Escanea y pide desde tu celular' : 'Escanea para ver el menú y pedir'}</div>
        </div>
      ))}
    </div>
  );
}
