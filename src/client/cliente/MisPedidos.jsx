import { useEffect, useState } from 'preact/hooks';
import { ChevronRight } from 'lucide-preact';
import { api } from '../shared/api.js';
import { clp, ESTADOS, fechaHora } from '../shared/format.js';
import { useStore } from '../shared/store.js';
import { Vacio } from '../shared/ui.jsx';
import { misPedidos } from './estado.js';
import { BarraVolver } from './Checkout.jsx';

export function MisPedidos() {
  const pedidos = useStore(misPedidos);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (!pedidos.length) return;
    setCargando(true);
    api('/api/pedidos/consulta', { method: 'POST', body: { tokens: pedidos.map((p) => p.token) } })
      .then(({ pedidos: lista }) => {
        const porToken = new Map(lista.map((p) => [p.token, p]));
        // Quita los que ya no existen y actualiza estados
        misPedidos.set((l) => l.filter((p) => porToken.has(p.token)).map((p) => ({ ...p, ...porToken.get(p.token) })));
      })
      .catch(() => {})
      .finally(() => setCargando(false));
  }, []);

  return (
    <div class="page">
      <BarraVolver titulo="Mis pedidos" />
      {pedidos.length === 0 ? (
        <Vacio titulo="Aún no tienes pedidos" texto="Cuando pidas desde este dispositivo, aparecerán aquí.">
          <a class="btn btn-primary" href="#/">
            Ver el menú
          </a>
        </Vacio>
      ) : (
        <ul class="lista-pedidos" aria-busy={cargando}>
          {pedidos.map((p) => {
            const e = ESTADOS[p.estado] || ESTADOS.pendiente;
            return (
              <li key={p.token}>
                <a class="card pedido-item" href={`#/pedido/${p.token}`}>
                  <span class="pedido-num num">#{p.id}</span>
                  <span class="grow">
                    <strong>{fechaHora(p.creado)}</strong>
                    <span class="num muted">{clp(p.total)}</span>
                  </span>
                  <span class={`pill ${e.clase}`}>{p.estado === 'listo' ? '¡Listo!' : e.nombre}</span>
                  <ChevronRight size={18} />
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
