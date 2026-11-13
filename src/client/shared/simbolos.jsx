// Símbolos propios de la marca (en lugar de emojis): rombos como los del cielo del logo,
// montañas con borde amarillo, destellos, sol, la ovejita y "postales" del atardecer.
import {
  Beef,
  CakeSlice,
  Coffee,
  CookingPot,
  Croissant,
  CupSoda,
  Drumstick,
  Fish,
  Flame,
  IceCreamCone,
  Leaf,
  Pizza,
  Salad,
  Sandwich,
  Soup,
  Star,
  UtensilsCrossed,
  Wine,
  Beer,
} from 'lucide-preact';

function Empanada({ size = 24, strokeWidth = 2 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={strokeWidth} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M2.5 17.5a9.5 8 0 0 1 19 0z" />
      <path d="M5.4 12.6l1.2 1.1M8 10.6l.8 1.4M11.2 9.6l.4 1.6M14.6 9.8l-.2 1.6M17.6 11.1l-.6 1.5M19.6 13.4l-1 1.2" />
    </svg>
  );
}

function Mate({ size = 24, strokeWidth = 2 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={strokeWidth} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M6.5 10h9l-.4 1.6a6.4 6.4 0 0 1 2.4 5A6.2 6.2 0 0 1 11 22a6.2 6.2 0 0 1-6.5-5.4 6.4 6.4 0 0 1 2.4-5z" />
      <path d="M13.5 10l3.2-7.5H19" />
      <path d="M7.5 15.5c1.8 1 5.2 1 7 0" />
    </svg>
  );
}

export const ICONOS_CATEGORIA = {
  olla: { nombre: 'Olla / cazuela', C: Soup },
  guiso: { nombre: 'Guiso', C: CookingPot },
  plato: { nombre: 'Plato de fondo', C: UtensilsCrossed },
  empanada: { nombre: 'Empanada', C: Empanada },
  ensalada: { nombre: 'Ensalada', C: Salad },
  bebida: { nombre: 'Bebida', C: CupSoda },
  postre: { nombre: 'Postre', C: CakeSlice },
  sandwich: { nombre: 'Sándwich', C: Sandwich },
  cafe: { nombre: 'Café', C: Coffee },
  mate: { nombre: 'Mate', C: Mate },
  pescado: { nombre: 'Pescado', C: Fish },
  carne: { nombre: 'Carne', C: Beef },
  pollo: { nombre: 'Pollo', C: Drumstick },
  pizza: { nombre: 'Pizza', C: Pizza },
  pan: { nombre: 'Pan / masas', C: Croissant },
  helado: { nombre: 'Helado', C: IceCreamCone },
  vino: { nombre: 'Vino', C: Wine },
  cerveza: { nombre: 'Cerveza', C: Beer },
  picante: { nombre: 'Picante', C: Flame },
  verde: { nombre: 'Vegetariano', C: Leaf },
  estrella: { nombre: 'Especial', C: Star },
};

export function IconoCategoria({ clave, size = 22, strokeWidth = 2.2 }) {
  const def = ICONOS_CATEGORIA[clave] || ICONOS_CATEGORIA.plato;
  const C = def.C;
  return <C size={size} strokeWidth={strokeWidth} />;
}

/** Rombo (como los del cielo del logo) que contiene un ícono. */
export function Rombo({ children, color = 'sol', chico = false }) {
  return (
    <span class={`rombo rombo-${color}${chico ? ' chico' : ''}`} aria-hidden="true">
      <span class="rombo-in">{children}</span>
    </span>
  );
}

/** Destello de 4 puntas. */
export function Destello({ size = 16, class: clase = '' }) {
  return (
    <svg class={`destello ${clase}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 0c1 8 4 11 12 12-8 1-11 4-12 12-1-8-4-11-12-12 8-1 11-4 12-12z" fill="currentColor" />
    </svg>
  );
}

/** Línea de cordillera para subrayar títulos. */
export function Cordillera({ ancho = 132, class: clase = '' }) {
  return (
    <svg class={`cordillera ${clase}`} width={ancho} height="14" viewBox="0 0 132 14" aria-hidden="true" preserveAspectRatio="none">
      <path d="M1 12 L14 4 L22 9 L36 2 L47 10 L58 5 L70 11 L84 3 L95 9 L106 4 L119 11 L131 6" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
    </svg>
  );
}

/** "Postal" del atardecer: reemplaza la foto cuando un producto no tiene imagen. */
export function Postal({ clave, grande = false }) {
  return (
    <div class={`postal${grande ? ' grande' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 120 120" preserveAspectRatio="xMidYMid slice">
        <circle cx="60" cy="56" r="30" fill="#ffc21a" />
        <circle cx="60" cy="56" r="38" fill="#ffc21a" opacity=".25" />
        <path d="M0 94 L18 80 L30 88 L48 70 L62 84 L78 72 L96 90 L120 78 L120 120 L0 120 Z" fill="#2b0f30" />
        <path d="M0 94 L18 80 L30 88 L48 70 L62 84 L78 72 L96 90 L120 78" fill="none" stroke="#ffc21a" stroke-width="3.5" stroke-linejoin="round" />
        <path d="M14 32 l4 -4 4 4 -4 4z M98 24 l3 -3 3 3 -3 3z" fill="#fff" opacity=".35" />
      </svg>
      <span class="postal-icono">
        <IconoCategoria clave={clave} size={grande ? 46 : 26} strokeWidth={2.4} />
      </span>
    </div>
  );
}

/** La ovejita de la marca. `cara` muestra solo la cabeza con la boina. */
export function Oveja({ cara = false, ancho = 120, class: clase = '' }) {
  return (
    <img
      class={`oveja ${clase}`}
      src={cara ? '/brand/oveja-cara.webp' : '/brand/oveja.webp'}
      alt=""
      width={ancho}
      height={cara ? Math.round(ancho * 0.6) : Math.round(ancho * 1.12)}
      loading="lazy"
      decoding="async"
    />
  );
}

export function Cargando({ texto = 'Cebando el mate…' }) {
  return (
    <div class="cargando" role="status" aria-live="polite">
      <Oveja cara ancho={110} class="oveja-salta" />
      <p>{texto}</p>
    </div>
  );
}

/** Cielo del atardecer con sol, rombos, destellos, nubes y cordillera (portada, seguimiento, ingreso). */
export function Atardecer({ children, class: clase = '', variante = 'tarde' }) {
  return (
    <div class={`atardecer atardecer-${variante} ${clase}`}>
      <div class="cielo" aria-hidden="true">
        <span class="sol" />
        <span class="rombo-cielo r1" />
        <span class="rombo-cielo r2" />
        <span class="rombo-cielo r3" />
        <span class="rombo-cielo r4" />
        <Destello size={10} class="d1" />
        <Destello size={14} class="d2" />
        <Destello size={8} class="d3" />
        <Destello size={12} class="d4" />
        <Destello size={9} class="d5" />
        <svg class="nube n1" viewBox="0 0 120 40">
          <path d="M8 38h104c4 0 6-3 4-7-2-5-8-6-12-4-1-9-9-15-18-13-4-10-17-14-27-8-8 4-12 12-11 20-8-4-18 1-20 8-1 2 0 4 2 4z" />
        </svg>
        <svg class="nube n2" viewBox="0 0 120 40">
          <path d="M8 38h104c4 0 6-3 4-7-2-5-8-6-12-4-1-9-9-15-18-13-4-10-17-14-27-8-8 4-12 12-11 20-8-4-18 1-20 8-1 2 0 4 2 4z" />
        </svg>
      </div>
      <div class="atardecer-contenido">{children}</div>
      <svg class="cordillera-fondo" viewBox="0 0 1440 220" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 150 L120 96 L210 132 L330 70 L430 120 L560 60 L690 128 L800 84 L930 140 L1060 76 L1180 126 L1300 88 L1440 120 L1440 220 L0 220 Z" class="capa-lejana" />
        <path d="M0 176 L90 138 L170 160 L290 112 L380 150 L500 104 L610 158 L720 118 L820 154 L960 108 L1070 150 L1190 116 L1310 156 L1440 132 L1440 220 L0 220 Z" class="capa-media" />
        <path d="M0 200 L110 168 L170 186 L290 146 L370 178 L470 150 L560 188 L660 160 L720 174 L820 140 L930 182 L1010 158 L1100 188 L1200 152 L1290 180 L1360 164 L1440 184 L1440 220 L0 220 Z" class="capa-cercana" />
        <path d="M0 200 L110 168 L170 186 L290 146 L370 178 L470 150 L560 188 L660 160 L720 174 L820 140 L930 182 L1010 158 L1100 188 L1200 152 L1290 180 L1360 164 L1440 184" class="cresta" vector-effect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
