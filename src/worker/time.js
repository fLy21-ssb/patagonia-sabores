// Hora de Chile (America/Santiago, con horario de verano) y estado abierto/cerrado del local.

export const ZONA = 'America/Santiago';
export const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

const formato = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  weekday: 'short',
  hourCycle: 'h23',
});
const DOW = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

/** Fecha y hora actuales en Chile. dow: 0 = lunes ... 6 = domingo. */
export function horaChile(fecha = new Date()) {
  const p = {};
  for (const { type, value } of formato.formatToParts(fecha)) p[type] = value;
  const hora = Number(p.hour) % 24;
  const minuto = Number(p.minute);
  return {
    fecha: `${p.year}-${p.month}-${p.day}`,
    dow: DOW[p.weekday],
    hora,
    minuto,
    minutos: hora * 60 + minuto,
  };
}

export function sumarDias(fecha, n) {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function aMinutos(hhmm) {
  const [h, m] = String(hhmm || '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function dentroDeRango(min, desde, hasta) {
  const a = aMinutos(desde);
  const b = aMinutos(hasta);
  if (a === b) return true; // abierto todo el día
  return a < b ? min >= a && min < b : min >= a || min < b; // soporta cierres después de medianoche
}

function proximaApertura(horario, ahora) {
  const hoy = horario[ahora.dow];
  if (hoy?.abierto && ahora.minutos < aMinutos(hoy.desde)) return `hoy a las ${hoy.desde}`;
  for (let i = 1; i <= 7; i++) {
    const d = (ahora.dow + i) % 7;
    const h = horario[d];
    if (h?.abierto) return `${i === 1 ? 'mañana' : 'el ' + DIAS[d].toLowerCase()} a las ${h.desde}`;
  }
  return null;
}

/** ¿Se pueden recibir pedidos ahora? Devuelve también un mensaje para mostrar. */
export function estadoLocal(ajustes, ahora = horaChile()) {
  const hoy = ajustes.horario[ahora.dow];
  const enHorario = Boolean(hoy?.abierto) && dentroDeRango(ahora.minutos, hoy.desde, hoy.hasta);
  if (!ajustes.recibiendoPedidos) {
    return { abierto: false, enHorario, pausado: true, mensaje: ajustes.mensajePausa || 'Por ahora no estamos recibiendo pedidos.' };
  }
  if (enHorario) {
    const todoElDia = aMinutos(hoy.desde) === aMinutos(hoy.hasta);
    return { abierto: true, enHorario, pausado: false, mensaje: todoElDia ? 'Abierto' : `Abierto · hasta las ${hoy.hasta}` };
  }
  const prox = proximaApertura(ajustes.horario, ahora);
  return { abierto: false, enHorario, pausado: false, mensaje: prox ? `Cerrado · abrimos ${prox}` : 'Cerrado por ahora' };
}
