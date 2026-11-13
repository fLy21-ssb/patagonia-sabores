import { useEffect, useState } from 'preact/hooks';
import { RefreshCw } from 'lucide-preact';
import { clp, fechaCorta, TIPOS } from '../shared/format.js';
import { Vacio, toast } from '../shared/ui.jsx';
import { apiAdmin } from './estado.js';
import { Rombo } from '../shared/simbolos.jsx';

const compacto = (n) => (n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1).replace('.', ',')}M` : n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`);

export function Estadisticas() {
  const [d, setD] = useState(null);
  const [ranking, setRanking] = useState('semana');
  const [cargando, setCargando] = useState(false);

  async function cargar() {
    setCargando(true);
    try {
      setD(await apiAdmin('/api/admin/estadisticas'));
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setCargando(false);
    }
  }
  useEffect(() => {
    cargar();
  }, []);

  if (!d) {
    return (
      <div class="page-center">
        <div class="spinner" />
      </div>
    );
  }

  const top = ranking === 'semana' ? d.topSemana : d.topMes;
  const maxTop = Math.max(1, ...top.map((t) => t.cantidad));
  const totalTipos = d.tipos.reduce((n, t) => n + t.pedidos, 0);

  return (
    <div class="stats">
      <header class="page-head">
        <div>
          <h1>Estadísticas</h1>
          <p class="muted">No incluyen pedidos cancelados ni eliminados.</p>
        </div>
        <button class="btn btn-outline btn-sm" onClick={cargar} disabled={cargando}>
          <RefreshCw size={16} class={cargando ? 'girando' : ''} /> Actualizar
        </button>
      </header>

      <div class="kpis">
        <Kpi titulo="Hoy" valor={clp(d.hoy.ventas)} detalle={`${d.hoy.pedidos} pedidos`} destacado />
        <Kpi titulo="Esta semana" valor={clp(d.semana.ventas)} detalle={`${d.semana.pedidos} pedidos`} />
        <Kpi titulo="Este mes" valor={clp(d.mes.ventas)} detalle={`${d.mes.pedidos} pedidos`} />
        <Kpi titulo="Ticket promedio" valor={clp(d.ticketPromedio)} detalle="últimos 30 días" />
        <Kpi titulo="Últimos 7 días" valor={clp(d.ult7.ventas)} detalle={`${d.ult7.pedidos} pedidos`} />
        <Kpi titulo="Últimos 30 días" valor={clp(d.ult30.ventas)} detalle={`${d.ult30.pedidos} pedidos · ${d.cancelados30} cancelados`} />
      </div>

      {d.descuentos30?.pedidos > 0 && (
        <p class="nota-descuentos">
          En los últimos 30 días, <strong>{d.descuentos30.pedidos}</strong> {d.descuentos30.pedidos === 1 ? 'pedido usó' : 'pedidos usaron'} un código de descuento:{' '}
          <strong>{clp(d.descuentos30.monto)}</strong> descontados. <a href="#/promos/codigos">Ver códigos</a>
        </p>
      )}

      <section class="card card-pad">
        <h2 class="card-title">Ventas de los últimos 30 días</h2>
        <GraficoBarras serie={d.serie} />
      </section>

      <div class="stats-grid">
        <section class="card card-pad">
          <div class="row-between">
            <h2 class="card-title">Lo más pedido</h2>
            <div class="segmentado">
              <button class={ranking === 'semana' ? 'on' : ''} onClick={() => setRanking('semana')}>
                Semana
              </button>
              <button class={ranking === 'mes' ? 'on' : ''} onClick={() => setRanking('mes')}>
                Mes
              </button>
            </div>
          </div>
          {top.length === 0 ? (
            <Vacio titulo="Aún sin ventas en este periodo" />
          ) : (
            <ol class="ranking">
              {top.map((t, i) => (
                <li key={`${t.id}-${t.nombre}`}>
                  <span class="pos">
                    <Rombo color={['sol', 'crema', 'boina'][i] || 'crema'} chico>
                      <strong class="display">{i + 1}</strong>
                    </Rombo>
                  </span>
                  <span class="grow">
                    <span class="row-between">
                      <strong>{t.nombre}</strong>
                      <span class="num">{t.cantidad} un.</span>
                    </span>
                    <span class="barra">
                      <i style={{ width: `${(t.cantidad / maxTop) * 100}%` }} />
                    </span>
                    <small class="muted num">{clp(t.ventas)}</small>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section class="card card-pad">
          <h2 class="card-title">Pedidos por tipo · 30 días</h2>
          {totalTipos === 0 ? (
            <Vacio titulo="Sin pedidos aún" />
          ) : (
            <div class="tipos">
              <div class="tipos-barra">
                {d.tipos.map((t) => (
                  <i key={t.tipo} class={`t-${t.tipo}`} style={{ width: `${(t.pedidos / totalTipos) * 100}%` }} title={`${TIPOS[t.tipo].corto}: ${t.pedidos}`} />
                ))}
              </div>
              {d.tipos.map((t) => (
                <div key={t.tipo} class="row-between tipo-fila">
                  <span class="row">
                    <span class={`cuadro t-${t.tipo}`} /> {TIPOS[t.tipo].corto}
                  </span>
                  <span class="num">
                    {t.pedidos} · {Math.round((t.pedidos / totalTipos) * 100)}% · {clp(t.ventas)}
                  </span>
                </div>
              ))}
            </div>
          )}
          <h2 class="card-title" style={{ marginTop: '22px' }}>
            Menos pedidos esta semana
          </h2>
          <ul class="menos">
            {d.menosSemana.map((m) => (
              <li key={m.id} class="row-between">
                <span>{m.nombre}</span>
                <span class="num muted">{m.cantidad} un.</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section class="card card-pad">
        <h2 class="card-title">Horas punta · 30 días</h2>
        <GraficoHoras horas={d.horas} />
      </section>
    </div>
  );
}

function Kpi({ titulo, valor, detalle, destacado }) {
  return (
    <div class={`kpi${destacado ? ' destacado' : ''}`}>
      <span class="kpi-titulo">{titulo}</span>
      <strong class="kpi-valor num">{valor}</strong>
      <span class="kpi-detalle">{detalle}</span>
    </div>
  );
}

function GraficoBarras({ serie }) {
  const [activo, setActivo] = useState(null);
  const max = Math.max(1, ...serie.map((s) => s.ventas));
  const W = 900;
  const H = 220;
  const ancho = W / serie.length;
  const sel = activo !== null ? serie[activo] : null;
  const total = serie.reduce((n, s) => n + s.ventas, 0);
  if (!total) return <Vacio titulo="Aquí verás tus ventas día a día" texto="Aún no hay ventas en los últimos 30 días." />;
  return (
    <div class="grafico">
      <div class="grafico-info">
        {sel ? (
          <>
            <strong>{fechaCorta(sel.fecha)}</strong> · <span class="num">{clp(sel.ventas)}</span> · {sel.pedidos} pedidos
          </>
        ) : (
          <span class="muted">Toca o pasa el mouse sobre una barra para ver el detalle</span>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H + 24}`} class="svg-grafico" role="img" aria-label="Ventas diarias de los últimos 30 días" onMouseLeave={() => setActivo(null)}>
        <defs>
          <linearGradient id="gBarra" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stop-color="#ef6c2a" />
            <stop offset="1" stop-color="#d6335f" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1="0" x2={W} y1={H - H * f} y2={H - H * f} class="linea-guia" />
            <text x="2" y={H - H * f - 4} class="eje">
              {compacto(Math.round(max * f))}
            </text>
          </g>
        ))}
        {serie.map((s, i) => {
          const h = Math.max(s.ventas ? 3 : 0, (s.ventas / max) * (H - 8));
          return (
            <g key={s.fecha} onMouseEnter={() => setActivo(i)} onClick={() => setActivo(i)}>
              <rect x={i * ancho} y="0" width={ancho} height={H} fill="transparent" />
              <rect x={i * ancho + ancho * 0.18} y={H - h} width={ancho * 0.64} height={h} rx="4" fill="url(#gBarra)" opacity={activo === null || activo === i ? 1 : 0.45} />
              {i % 5 === 4 && (
                <text x={i * ancho + ancho / 2} y={H + 18} text-anchor="middle" class="eje">
                  {s.fecha.slice(8)}/{s.fecha.slice(5, 7)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function GraficoHoras({ horas }) {
  const desde = Math.max(0, horas.findIndex((n) => n > 0) - 1);
  const hastaIdx = horas.length - 1 - [...horas].reverse().findIndex((n) => n > 0);
  const hasta = Math.min(23, hastaIdx + 1);
  const rango = horas.some((n) => n > 0) ? horas.slice(desde, hasta + 1) : [];
  if (!rango.length) return <Vacio emoji="⏰" titulo="Aún sin datos de horarios" />;
  const max = Math.max(1, ...rango);
  return (
    <div class="horas">
      {rango.map((n, i) => (
        <div key={i} class="hora-col" title={`${desde + i}:00 · ${n} pedidos`}>
          <span class="hora-n num">{n || ''}</span>
          <span class="hora-barra" style={{ height: `${(n / max) * 100}%` }} />
          <span class="hora-l num">{desde + i}h</span>
        </div>
      ))}
    </div>
  );
}
