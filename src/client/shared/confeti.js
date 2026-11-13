// Confeti liviano en canvas (sin librerías). Respeta "reducir movimiento".
const COLORES = ['#8e3a8c', '#d6335f', '#ef6c2a', '#ffb81c', '#ffd84a', '#ffffff'];

export function lanzarConfeti({ cantidad = 140, duracion = 2600 } = {}) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: 100 });
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = (canvas.width = window.innerWidth * dpr);
  const H = (canvas.height = window.innerHeight * dpr);
  const piezas = Array.from({ length: cantidad }, () => ({
    x: W / 2 + (Math.random() - 0.5) * W * 0.3,
    y: H * 0.35,
    vx: (Math.random() - 0.5) * 26 * dpr,
    vy: (-Math.random() * 22 - 8) * dpr,
    giro: Math.random() * Math.PI,
    vgiro: (Math.random() - 0.5) * 0.35,
    w: (6 + Math.random() * 6) * dpr,
    h: (8 + Math.random() * 10) * dpr,
    color: COLORES[(Math.random() * COLORES.length) | 0],
  }));
  const inicio = performance.now();
  function cuadro(t) {
    const avance = (t - inicio) / duracion;
    ctx.clearRect(0, 0, W, H);
    for (const p of piezas) {
      p.vy += 0.9 * dpr;
      p.vx *= 0.985;
      p.x += p.vx;
      p.y += p.vy * 0.5;
      p.giro += p.vgiro;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - avance * 0.9);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.giro);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (avance < 1) requestAnimationFrame(cuadro);
    else canvas.remove();
  }
  requestAnimationFrame(cuadro);
}
