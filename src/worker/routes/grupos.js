// Pedidos grupales (oficinas): una persona arma el pedido y comparte el enlace, cada uno agrega lo suyo
// desde su celular y al final el organizador lo envía como un solo pedido, con el nombre de cada uno en sus platos.
import { HttpError, json, readJson } from '../http.js';
import { leerAjustes } from '../settings.js';
import { aMinutos, horaChile } from '../time.js';
import { ahoraIso, entero, texto, tokenAleatorio } from '../util.js';
import { limitar } from '../limits.js';

const TOKEN_RE = /^[A-Za-z0-9_-]{16,40}$/;
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const MAX_PARTES = 25;
export const MAX_LINEAS_PARTE = 8;
const ipDe = (request) => request.headers.get('cf-connecting-ip') || 'local';

export function rutasGrupos(router) {
  router.post('/api/grupos', crearGrupo);
  router.get('/api/grupos/:token', verGrupo);
  router.put('/api/grupos/:token/partes/:parte', guardarParte);
  router.delete('/api/grupos/:token/partes/:parte', borrarParte);
  router.post('/api/grupos/:token/quitar', quitarParte);
  router.post('/api/grupos/:token/cancelar', cancelarGrupo);
}

async function huella(clave) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(clave)));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function esOrganizador(g, clave) {
  return Boolean(clave) && (await huella(clave)) === g.clave_hash;
}

async function grupoPorToken(env, token) {
  if (!TOKEN_RE.test(String(token || ''))) throw new HttpError(404, 'No encontramos ese pedido grupal.');
  const g = await env.DB.prepare('SELECT * FROM grupos WHERE token = ?').bind(token).first();
  if (!g) throw new HttpError(404, 'No encontramos ese pedido grupal.');
  return g;
}

/** 'abierto' | 'cerrado' (pasó la hora: solo el organizador puede pedir) | 'vencido' | 'pedido' | 'cancelado' */
function situacion(g, ahora) {
  if (g.estado !== 'abierto') return g.estado;
  if (g.fecha_local !== ahora.fecha) return 'vencido';
  if (g.cierra && ahora.minutos >= aMinutos(g.cierra)) return 'cerrado';
  return 'abierto';
}

function mensajeSituacion(sit, g) {
  return {
    pedido: 'Este pedido grupal ya se envió al local.',
    cancelado: 'Este pedido grupal se canceló.',
    vencido: 'Este pedido grupal era de otro día. Armen uno nuevo.',
    cerrado: `Ya no se pueden sumar más personas: cerraba a las ${g.cierra}.`,
  }[sit] || 'Este pedido grupal no está disponible.';
}

function leerItems(json) {
  try {
    const l = JSON.parse(json || '[]');
    return Array.isArray(l) ? l : [];
  } catch {
    return [];
  }
}

/** Valida lo que eligió una persona contra la carta de hoy. Devuelve los ítems normalizados. */
async function validarItems(env, crudos, ahora) {
  if (!Array.isArray(crudos) || crudos.length === 0) throw new HttpError(400, 'Elige al menos un producto.');
  if (crudos.length > MAX_LINEAS_PARTE) throw new HttpError(400, `Puedes elegir hasta ${MAX_LINEAS_PARTE} productos distintos.`);
  const ids = [...new Set(crudos.map((i) => entero(i?.productoId, { min: 1, campo: 'un producto' })))];
  const [prodRes, acompRes] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM productos WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(ids)),
    env.DB.prepare('SELECT id FROM acompanamientos WHERE activo = 1'),
  ]);
  const productos = new Map(prodRes.results.map((p) => [p.id, p]));
  const acomps = new Set(acompRes.results.map((a) => a.id));
  const bitHoy = 1 << ahora.dow;
  return crudos.map((it) => {
    const p = productos.get(Number(it.productoId));
    if (!p || !p.activo || !(p.dias & bitHoy)) {
      throw new HttpError(409, 'Uno de los productos ya no está disponible hoy. Revisa lo que elegiste.', { productoId: Number(it.productoId) });
    }
    if (p.stock !== null && p.stock <= 0) throw new HttpError(409, `"${p.nombre}" se agotó.`, { productoId: p.id });
    const cantidad = entero(it.cantidad, { min: 1, max: 30, campo: `la cantidad de "${p.nombre}"` });
    let acompanamientoId = null;
    if (p.con_acompanamiento && acomps.size) {
      acompanamientoId = Number(it.acompanamientoId);
      if (!acomps.has(acompanamientoId)) throw new HttpError(400, `Elige el acompañamiento de "${p.nombre}".`, { productoId: p.id });
    }
    return { productoId: p.id, cantidad, acompanamientoId, comentario: texto(it.comentario, 140) };
  });
}

async function crearGrupo({ request, env }) {
  const b = await readJson(request, 2000);
  const aj = await leerAjustes(env);
  if (!aj.grupos) throw new HttpError(403, 'Los pedidos grupales no están disponibles por ahora.');
  await limitar(env, `grupo:${ipDe(request)}`, 10, 60 * 60);
  const organizador = texto(b.organizador, 40, { requerido: true, campo: 'tu nombre' });
  const ahora = horaChile();
  const cierra = b.cierra ? String(b.cierra) : null;
  if (cierra && !HHMM_RE.test(cierra)) throw new HttpError(400, 'Revisa la hora de cierre.');
  if (cierra && aMinutos(cierra) <= ahora.minutos) throw new HttpError(400, 'Esa hora ya pasó. Elige una más tarde.');
  const token = tokenAleatorio(12);
  const clave = tokenAleatorio(18);
  const ts = ahoraIso();
  await env.DB.prepare(
    'INSERT INTO grupos (token, clave_hash, organizador, cierra, fecha_local, creado, actualizado) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(token, await huella(clave), organizador, cierra, ahora.fecha, ts, ts)
    .run();
  return json({ token, clave }, 201);
}

async function verGrupo({ env, params, url }) {
  const g = await grupoPorToken(env, params.token);
  const yo = url.searchParams.get('yo') || '';
  const [partes, prods, acomps] = await env.DB.batch([
    env.DB.prepare('SELECT id, parte_id, nombre, items FROM grupo_partes WHERE grupo_id = ? ORDER BY id').bind(g.id),
    env.DB.prepare('SELECT id, nombre, precio, activo FROM productos'),
    env.DB.prepare('SELECT id, nombre FROM acompanamientos'),
  ]);
  const productos = new Map(prods.results.map((p) => [p.id, p]));
  const acompanamientos = new Map(acomps.results.map((a) => [a.id, a.nombre]));
  const lista = partes.results.map((pt) => {
    const items = leerItems(pt.items).map((it) => {
      const p = productos.get(it.productoId);
      const precio = p?.precio ?? 0;
      return {
        productoId: it.productoId,
        nombre: p?.nombre || 'Producto que ya no está',
        precio,
        cantidad: it.cantidad,
        acompanamientoId: it.acompanamientoId ?? null,
        acompanamiento: acompanamientos.get(it.acompanamientoId) || '',
        comentario: it.comentario || '',
        total: precio * it.cantidad,
      };
    });
    return {
      num: pt.id,
      nombre: pt.nombre,
      items,
      total: items.reduce((n, i) => n + i.total, 0),
      mia: Boolean(yo) && pt.parte_id === yo,
    };
  });
  const sit = situacion(g, horaChile());
  return json({
    grupo: {
      token: g.token,
      organizador: g.organizador,
      cierra: g.cierra,
      estado: sit,
      mensaje: sit === 'abierto' ? '' : mensajeSituacion(sit, g),
      pedidoToken: g.estado === 'pedido' ? g.pedido_token : null,
    },
    partes: lista,
    total: lista.reduce((n, p) => n + p.total, 0),
    limites: { personas: MAX_PARTES, productos: MAX_LINEAS_PARTE },
  });
}

async function guardarParte({ request, env, params }) {
  const g = await grupoPorToken(env, params.token);
  if (!TOKEN_RE.test(params.parte)) throw new HttpError(400, 'Solicitud no válida.');
  const b = await readJson(request, 8000);
  const ahora = horaChile();
  const sit = situacion(g, ahora);
  if (sit !== 'abierto' && !(sit === 'cerrado' && (await esOrganizador(g, b.clave)))) {
    throw new HttpError(409, mensajeSituacion(sit, g), { grupo: sit });
  }
  await limitar(env, `parte:${ipDe(request)}`, 60, 10 * 60);
  const nombre = texto(b.nombre, 40, { requerido: true, campo: 'tu nombre' });
  const items = await validarItems(env, b.items, ahora);
  const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM grupo_partes WHERE grupo_id = ? AND parte_id != ?')
    .bind(g.id, params.parte)
    .first();
  if (n >= MAX_PARTES) throw new HttpError(409, `Este pedido grupal ya tiene ${MAX_PARTES} personas.`);
  const ts = ahoraIso();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO grupo_partes (grupo_id, parte_id, nombre, items, creado, actualizado) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(grupo_id, parte_id) DO UPDATE SET nombre = excluded.nombre, items = excluded.items, actualizado = excluded.actualizado`,
    ).bind(g.id, params.parte, nombre, JSON.stringify(items), ts, ts),
    env.DB.prepare('UPDATE grupos SET actualizado = ? WHERE id = ?').bind(ts, g.id),
  ]);
  return json({ ok: true });
}

async function borrarParte({ env, params }) {
  const g = await grupoPorToken(env, params.token);
  if (!TOKEN_RE.test(params.parte)) throw new HttpError(400, 'Solicitud no válida.');
  const sit = situacion(g, horaChile());
  if (sit !== 'abierto' && sit !== 'cerrado') throw new HttpError(409, mensajeSituacion(sit, g), { grupo: sit });
  await env.DB.prepare('DELETE FROM grupo_partes WHERE grupo_id = ? AND parte_id = ?').bind(g.id, params.parte).run();
  return json({ ok: true });
}

/** El organizador quita lo de otra persona (por ejemplo, alguien que al final no almuerza). */
async function quitarParte({ request, env, params }) {
  const g = await grupoPorToken(env, params.token);
  const b = await readJson(request, 2000);
  if (!(await esOrganizador(g, b.clave))) throw new HttpError(403, 'Solo quien armó el pedido grupal puede quitar a otros.');
  const sit = situacion(g, horaChile());
  if (sit !== 'abierto' && sit !== 'cerrado') throw new HttpError(409, mensajeSituacion(sit, g), { grupo: sit });
  const num = entero(b.num, { min: 1, campo: 'la persona' });
  await env.DB.prepare('DELETE FROM grupo_partes WHERE id = ? AND grupo_id = ?').bind(num, g.id).run();
  return json({ ok: true });
}

async function cancelarGrupo({ request, env, params }) {
  const g = await grupoPorToken(env, params.token);
  const b = await readJson(request, 2000);
  if (!(await esOrganizador(g, b.clave))) throw new HttpError(403, 'Solo quien armó el pedido grupal puede cancelarlo.');
  await env.DB.prepare("UPDATE grupos SET estado = 'cancelado', actualizado = ? WHERE id = ? AND estado = 'abierto'").bind(ahoraIso(), g.id).run();
  return json({ ok: true });
}

/**
 * Para crear el pedido: verifica que lo envía el organizador y junta lo de todos,
 * con el nombre de cada persona en sus productos.
 */
export async function itemsDeGrupo(env, token, clave, ahora) {
  const g = await grupoPorToken(env, token);
  if (!(await esOrganizador(g, clave))) throw new HttpError(403, 'Solo quien armó el pedido grupal puede enviarlo.');
  const sit = situacion(g, ahora);
  if (sit !== 'abierto' && sit !== 'cerrado') throw new HttpError(409, mensajeSituacion(sit, g), { grupo: sit });
  const { results } = await env.DB.prepare('SELECT nombre, items FROM grupo_partes WHERE grupo_id = ? ORDER BY id').bind(g.id).all();
  const items = results.flatMap((pt) => leerItems(pt.items).map((it) => ({ ...it, persona: pt.nombre })));
  if (!items.length) throw new HttpError(409, 'Nadie ha elegido nada todavía.');
  return { grupo: g, items };
}
