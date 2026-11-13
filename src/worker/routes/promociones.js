// Códigos de descuento, promociones (notificación + correo) y configuración del correo del local.
import { HttpError, json, readJson } from '../http.js';
import { soloAdmin } from '../auth.js';
import { leerAjustes } from '../settings.js';
import { horaChile } from '../time.js';
import { ahoraIso, bit, bool, email, entero, texto } from '../util.js';
import { limitar } from '../limits.js';
import { suscripcionValida } from '../push.js';
import { enviarATodos } from '../notify.js';
import { CODIGO_RE, cuponPublico, estadoCupon, evaluarCupon, normalizarCodigo } from '../cupones.js';
import {
  borrarConfigCorreo,
  configPublica,
  correoPromo,
  correoPrueba,
  enviarCorreos,
  guardarConfigCorreo,
  leerConfigCorreo,
  mensajeErrorCorreo,
  probarCredenciales,
  resumenCupon,
} from '../correo.js';

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const TOKEN_BAJA_RE = /^[A-Za-z0-9_-]{20,40}$/;
const TANDA = { push: 20, correo: 15 }; // por llamada: respeta los límites del plan gratis (50 subrequests, 10 ms de CPU)
const subjectDe = (env, url) => env.VAPID_SUBJECT || url.origin;
const ipDe = (request) => request.headers.get('cf-connecting-ip') || 'local';

export function rutasPromociones(router) {
  // Clientes
  router.post('/api/cupones/validar', validarCupon);
  router.post('/api/promos/suscripcion', suscribirPromos);
  router.post('/api/promos/suscripcion/borrar', desuscribirPromos);
  router.post('/api/promos/suscripcion/estado', estadoSuscripcion);
  router.get('/api/promos/baja', irABaja);
  router.post('/api/promos/baja', darDeBaja);
  router.post('/api/promos/alta', volverAAlta);

  // Panel
  router.get('/api/admin/cupones', soloAdmin(listarCupones));
  router.post('/api/admin/cupones', soloAdmin(crearCupon));
  router.put('/api/admin/cupones/:id', soloAdmin(editarCupon));
  router.delete('/api/admin/cupones/:id', soloAdmin(eliminarCupon));

  router.get('/api/admin/promos', soloAdmin(verPromos));
  router.post('/api/admin/promos', soloAdmin(crearPromo));
  router.post('/api/admin/promos/:id/enviar', soloAdmin(enviarPromo));
  router.delete('/api/admin/promos/:id', soloAdmin(eliminarPromo));

  router.get('/api/admin/correo', soloAdmin(verCorreo));
  router.put('/api/admin/correo', soloAdmin(guardarCorreo));
  router.delete('/api/admin/correo', soloAdmin(quitarCorreo));
  router.post('/api/admin/correo/prueba', soloAdmin(probarCorreo));
}

// ---------- Clientes: código de descuento ----------

async function validarCupon({ request, env }) {
  await limitar(env, `cupon:${ipDe(request)}`, 30, 15 * 60); // evita adivinar códigos a la fuerza
  const b = await readJson(request, 2000);
  const subtotal = entero(b.subtotal, { min: 0, max: 100_000_000, campo: 'el subtotal' });
  let correo = '';
  try {
    correo = email(b.email);
  } catch {
    /* el correo se valida al confirmar el pedido */
  }
  const r = await evaluarCupon(env, b.codigo, { subtotal, telefono: typeof b.telefono === 'string' ? b.telefono : '', email: correo });
  return json({ cupon: cuponPublico(r.cupon, r.descuento) });
}

// ---------- Clientes: notificaciones de promociones ----------

async function suscribirPromos({ request, env }) {
  await limitar(env, `promo-sub:${ipDe(request)}`, 20, 15 * 60);
  const sub = suscripcionValida(await readJson(request, 4000));
  if (!sub) throw new HttpError(400, 'Este navegador no entregó una suscripción válida.');
  await env.DB.prepare(
    `INSERT INTO suscripciones_promo (endpoint, p256dh, auth, creado) VALUES (?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth`,
  )
    .bind(sub.endpoint, sub.p256dh, sub.auth, ahoraIso())
    .run();
  return json({ suscrito: true }, 201);
}

async function desuscribirPromos({ request, env }) {
  const b = await readJson(request, 4000);
  await env.DB.prepare('DELETE FROM suscripciones_promo WHERE endpoint = ?').bind(String(b.endpoint || '').slice(0, 1000)).run();
  return json({ suscrito: false });
}

async function estadoSuscripcion({ request, env }) {
  const b = await readJson(request, 4000);
  const fila = await env.DB.prepare('SELECT 1 AS ok FROM suscripciones_promo WHERE endpoint = ?')
    .bind(String(b.endpoint || '').slice(0, 1000))
    .first();
  return json({ suscrito: Boolean(fila) });
}

// ---------- Clientes: darse de baja de los correos de promociones ----------

function ocultarEmail(e) {
  const [usuario, dominio] = String(e).split('@');
  return `${usuario.slice(0, 2)}${'•'.repeat(Math.max(2, Math.min(6, usuario.length - 2)))}@${dominio}`;
}

/** Enlace "darse de baja" abierto en el navegador: muestra la página de confirmación de la app. */
async function irABaja({ url }) {
  const t = url.searchParams.get('t') || '';
  return new Response(null, { status: 302, headers: { location: `/#/baja/${TOKEN_BAJA_RE.test(t) ? t : ''}` } });
}

async function tokenDe(request, url) {
  const t = url.searchParams.get('t');
  if (t) return t; // baja con un clic desde Gmail/Apple Mail (RFC 8058): el cuerpo no es JSON
  return String((await readJson(request, 1000)).token || '');
}

async function cambiarSuscripcionCorreo(env, token, acepta) {
  if (!TOKEN_BAJA_RE.test(token)) throw new HttpError(404, 'Este enlace no es válido.');
  const fila = await env.DB.prepare('UPDATE contactos SET acepta_promos = ?, actualizado = ? WHERE token_baja = ? RETURNING email')
    .bind(acepta, ahoraIso(), token)
    .first();
  if (!fila) throw new HttpError(404, 'Este enlace no es válido o ya no existe.');
  return json({ ok: true, acepta: Boolean(acepta), email: ocultarEmail(fila.email) });
}

async function darDeBaja({ request, env, url }) {
  return cambiarSuscripcionCorreo(env, await tokenDe(request, url), 0);
}

async function volverAAlta({ request, env, url }) {
  return cambiarSuscripcionCorreo(env, await tokenDe(request, url), 1);
}

// ---------- Panel: códigos de descuento ----------

function cuponDTO(c, hoy, stats) {
  const r = resumenCupon(c);
  return {
    id: c.id,
    codigo: c.codigo,
    descripcion: c.descripcion,
    tipo: c.tipo,
    valor: c.valor,
    minimo: c.minimo,
    maxUsos: c.max_usos,
    usos: c.usos,
    unoPorCliente: Boolean(c.uno_por_cliente),
    desde: c.desde,
    hasta: c.hasta,
    activo: Boolean(c.activo),
    creado: c.creado,
    estado: estadoCupon(c, hoy),
    resumen: [r.base, ...r.condiciones].join(' · '),
    pedidos: stats?.pedidos || 0,
    descontado: stats?.descontado || 0,
    ventas: stats?.ventas || 0,
  };
}

function leerCupon(b, { conCodigo }) {
  const datos = {};
  if (conCodigo) {
    datos.codigo = normalizarCodigo(b.codigo);
    if (!CODIGO_RE.test(datos.codigo)) {
      throw new HttpError(400, 'El código debe tener entre 3 y 20 letras o números, sin espacios (puede llevar - o _).');
    }
  }
  datos.descripcion = texto(b.descripcion, 120);
  datos.tipo = b.tipo === 'monto' ? 'monto' : 'porcentaje';
  datos.valor =
    datos.tipo === 'porcentaje'
      ? entero(b.valor, { min: 1, max: 100, campo: 'el porcentaje (entre 1 y 100)' })
      : entero(b.valor, { min: 1, max: 1_000_000, campo: 'el monto del descuento' });
  datos.minimo = entero(b.minimo ?? 0, { min: 0, max: 10_000_000, campo: 'la compra mínima' });
  datos.max_usos = entero(b.maxUsos, { min: 1, max: 1_000_000, campo: 'el máximo de usos', nulo: true });
  datos.uno_por_cliente = bit(b.unoPorCliente);
  const fecha = (v, campo) => {
    if (v === null || v === undefined || v === '') return null;
    if (!FECHA_RE.test(String(v))) throw new HttpError(400, `Revisa ${campo}.`);
    return String(v);
  };
  datos.desde = fecha(b.desde, 'la fecha de inicio');
  datos.hasta = fecha(b.hasta, 'la fecha de término');
  if (datos.desde && datos.hasta && datos.desde > datos.hasta) throw new HttpError(400, 'La fecha de término es anterior a la de inicio.');
  datos.activo = b.activo === undefined ? 1 : bit(b.activo);
  return datos;
}

async function statsCupones(env) {
  const { results } = await env.DB.prepare(
    `SELECT cupon, COUNT(*) AS pedidos, SUM(descuento) AS descontado, SUM(total) AS ventas FROM pedidos
     WHERE cupon != '' AND eliminado = 0 AND estado != 'cancelado' GROUP BY cupon`,
  ).all();
  return new Map(results.map((r) => [r.cupon, r]));
}

async function listarCupones({ env }) {
  const [{ results }, stats] = await Promise.all([env.DB.prepare('SELECT * FROM cupones ORDER BY activo DESC, id DESC').all(), statsCupones(env)]);
  const hoy = horaChile().fecha;
  const orden = { vigente: 0, programado: 1, agotado: 2, pausado: 3, vencido: 4 };
  const cupones = results.map((c) => cuponDTO(c, hoy, stats.get(c.codigo))).sort((a, b) => orden[a.estado] - orden[b.estado] || b.id - a.id);
  return json({ cupones });
}

async function crearCupon({ request, env }) {
  const d = leerCupon(await readJson(request, 4000), { conCodigo: true });
  try {
    const fila = await env.DB.prepare(
      `INSERT INTO cupones (codigo, descripcion, tipo, valor, minimo, max_usos, uno_por_cliente, desde, hasta, activo, creado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
    )
      .bind(d.codigo, d.descripcion, d.tipo, d.valor, d.minimo, d.max_usos, d.uno_por_cliente, d.desde, d.hasta, d.activo, ahoraIso())
      .first();
    return json({ cupon: cuponDTO(fila, horaChile().fecha) }, 201);
  } catch (e) {
    if (String(e?.message || e).includes('UNIQUE')) throw new HttpError(409, `Ya existe el código ${d.codigo}.`);
    throw e;
  }
}

async function editarCupon({ request, env, params }) {
  const id = entero(params.id, { min: 1, campo: 'el código' });
  const d = leerCupon(await readJson(request, 4000), { conCodigo: false }); // el código en sí no cambia (queda en los pedidos)
  let fila;
  try {
    fila = await env.DB.prepare(
      `UPDATE cupones SET descripcion = ?, tipo = ?, valor = ?, minimo = ?, max_usos = ?, uno_por_cliente = ?, desde = ?, hasta = ?, activo = ?
       WHERE id = ? RETURNING *`,
    )
      .bind(d.descripcion, d.tipo, d.valor, d.minimo, d.max_usos, d.uno_por_cliente, d.desde, d.hasta, d.activo, id)
      .first();
  } catch (e) {
    if (String(e?.message || e).includes('cupon_agotado')) {
      const c = await env.DB.prepare('SELECT usos FROM cupones WHERE id = ?').bind(id).first();
      throw new HttpError(400, `Este código ya se usó ${c?.usos ?? 'varias'} veces: el máximo no puede ser menor.`);
    }
    throw e;
  }
  if (!fila) throw new HttpError(404, 'Código no encontrado.');
  const stats = await statsCupones(env);
  return json({ cupon: cuponDTO(fila, horaChile().fecha, stats.get(fila.codigo)) });
}

async function eliminarCupon({ env, params }) {
  const id = entero(params.id, { min: 1, campo: 'el código' });
  await env.DB.prepare('DELETE FROM cupones WHERE id = ?').bind(id).run();
  return json({ ok: true });
}

// ---------- Panel: promociones ----------

function promoDTO(p) {
  return {
    id: p.id,
    titulo: p.titulo,
    mensaje: p.mensaje,
    cupon: p.cupon,
    push: Boolean(p.push),
    correo: Boolean(p.correo),
    pushFin: Boolean(p.push_fin),
    emailFin: Boolean(p.email_fin),
    pushTotal: p.push_total,
    pushHechos: p.push_hechos,
    pushOk: p.push_ok,
    emailTotal: p.email_total,
    emailHechos: p.email_hechos,
    emailOk: p.email_ok,
    creado: p.creado,
    enviada: p.enviada,
    pendiente: (Boolean(p.push) && !p.push_fin) || (Boolean(p.correo) && !p.email_fin),
  };
}

async function audiencia(env) {
  const [push, correo] = await env.DB.batch([
    env.DB.prepare('SELECT COUNT(*) AS n FROM suscripciones_promo'),
    env.DB.prepare('SELECT COUNT(*) AS n FROM contactos WHERE acepta_promos = 1'),
  ]);
  return { push: push.results[0].n, correo: correo.results[0].n };
}

async function verPromos({ env }) {
  const [aud, cfg, lista, cupones] = await Promise.all([
    audiencia(env),
    leerConfigCorreo(env),
    env.DB.prepare('SELECT * FROM promos ORDER BY id DESC LIMIT 30').all(),
    env.DB.prepare('SELECT * FROM cupones WHERE activo = 1 ORDER BY id DESC').all(),
  ]);
  const hoy = horaChile().fecha;
  return json({
    audiencia: aud,
    correo: configPublica(cfg),
    promos: lista.results.map(promoDTO),
    cupones: cupones.results
      .filter((c) => ['vigente', 'programado'].includes(estadoCupon(c, hoy)))
      .map((c) => ({ codigo: c.codigo, resumen: cuponDTO(c, hoy).resumen })),
  });
}

async function crearPromo({ request, env }) {
  const b = await readJson(request, 8000);
  const titulo = texto(b.titulo, 70, { requerido: true, campo: 'el título' });
  const mensaje = texto(b.mensaje, 600, { requerido: true, campo: 'el mensaje', multilinea: true });
  const cupon = b.cupon ? normalizarCodigo(b.cupon) : '';
  if (cupon) {
    const existe = await env.DB.prepare('SELECT 1 AS ok FROM cupones WHERE codigo = ? AND activo = 1').bind(cupon).first();
    if (!existe) throw new HttpError(400, `El código ${cupon} no existe o está pausado. Créalo primero en "Códigos".`);
  }
  const push = bool(b.push);
  const correo = bool(b.correo);
  if (!push && !correo) throw new HttpError(400, 'Elige cómo enviarla: notificación, correo o ambos.');
  const aud = await audiencia(env);
  if (correo && !(await leerConfigCorreo(env))) {
    throw new HttpError(409, 'Para enviar por correo, primero conecta el Gmail del local en Ajustes → Correo para avisos.');
  }
  if ((!push || !aud.push) && (!correo || !aud.correo)) {
    throw new HttpError(409, 'Todavía no hay clientes suscritos a ese canal.');
  }
  const fila = await env.DB.prepare(
    `INSERT INTO promos (titulo, mensaje, cupon, push, correo, push_fin, email_fin, push_total, email_total, creado)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
  )
    .bind(
      titulo,
      mensaje,
      cupon,
      push ? 1 : 0,
      correo ? 1 : 0,
      push && aud.push ? 0 : 1,
      correo && aud.correo ? 0 : 1,
      push ? aud.push : 0,
      correo ? aud.correo : 0,
      ahoraIso(),
    )
    .first();
  return json({ promo: promoDTO(fila) }, 201);
}

const COLUMNAS = {
  push: { activo: 'push', cursor: 'push_cursor', fin: 'push_fin', hechos: 'push_hechos', ok: 'push_ok' },
  correo: { activo: 'correo', cursor: 'email_cursor', fin: 'email_fin', hechos: 'email_hechos', ok: 'email_ok' },
};

function textoPush(promo) {
  const cuerpo = promo.mensaje.replace(/\s+/g, ' ').trim();
  const recorte = cuerpo.length > 150 ? `${cuerpo.slice(0, 147)}…` : cuerpo;
  return promo.cupon ? `${recorte} Código: ${promo.cupon}` : recorte;
}

/** Envía la siguiente tanda de una promoción por un canal. El panel la llama en bucle hasta que `listo` sea true. */
async function enviarPromo({ request, env, params, url }) {
  const id = entero(params.id, { min: 1, campo: 'la promoción' });
  const b = await readJson(request, 1000);
  const canal = b.canal === 'correo' ? 'correo' : 'push';
  const col = COLUMNAS[canal];
  const promo = await env.DB.prepare('SELECT * FROM promos WHERE id = ?').bind(id).first();
  if (!promo) throw new HttpError(404, 'Promoción no encontrada.');
  if (!promo[col.activo] || promo[col.fin]) return json({ promo: promoDTO(promo), listo: true });

  let cfg = null;
  if (canal === 'correo') {
    cfg = await leerConfigCorreo(env);
    if (!cfg) throw new HttpError(409, 'Conecta el Gmail del local en Ajustes → Correo para avisos.');
  }

  const tanda = TANDA[canal];
  const destinatarios = (
    canal === 'push'
      ? await env.DB.prepare('SELECT id, endpoint, p256dh, auth FROM suscripciones_promo WHERE id > ? ORDER BY id LIMIT ?')
          .bind(promo.push_cursor, tanda)
          .all()
      : await env.DB.prepare('SELECT id, email, token_baja FROM contactos WHERE acepta_promos = 1 AND id > ? ORDER BY id LIMIT ?')
          .bind(promo.email_cursor, tanda)
          .all()
  ).results;
  const ultimo = destinatarios.length ? destinatarios[destinatarios.length - 1].id : promo[col.cursor];
  const fin = destinatarios.length < tanda ? 1 : 0;

  // Reserva la tanda: si el panel está abierto en dos lugares, nadie recibe la promo dos veces.
  const reserva = await env.DB.prepare(
    `UPDATE promos SET ${col.cursor} = ?, ${col.fin} = ? WHERE id = ? AND ${col.cursor} = ? AND ${col.fin} = 0`,
  )
    .bind(ultimo, fin, id, promo[col.cursor])
    .run();
  if (!reserva.meta.changes) {
    const actual = await env.DB.prepare('SELECT * FROM promos WHERE id = ?').bind(id).first();
    return json({ promo: promoDTO(actual), listo: Boolean(actual[col.fin]), ocupado: true });
  }

  let hechos = destinatarios.length;
  let ok = 0;
  let error = null;
  if (destinatarios.length && canal === 'push') {
    const datos = {
      title: promo.titulo,
      body: textoPush(promo),
      url: promo.cupon ? `/?cupon=${encodeURIComponent(promo.cupon)}` : '/',
      tag: `promo-${promo.id}`,
    };
    const r = await enviarATodos(env, 'suscripciones_promo', destinatarios, datos, {
      subject: subjectDe(env, url),
      ttl: 2 * 86_400,
      urgencia: 'normal',
      topic: `promo${promo.id}`,
    });
    ok = r.enviadas;
  } else if (destinatarios.length) {
    const aj = await leerAjustes(env);
    const cupon = promo.cupon ? await env.DB.prepare('SELECT * FROM cupones WHERE codigo = ?').bind(promo.cupon).first() : null;
    const mensajes = destinatarios.map((d) => ({
      id: d.id,
      para: d.email,
      ...correoPromo({ promo, cupon, aj, origen: url.origin, tokenBaja: d.token_baja }),
    }));
    const r = await enviarCorreos(env, cfg, mensajes, url.origin);
    ok = r.resultados.filter((x) => x.ok).length;
    hechos = r.resultados.length;
    if (r.error) {
      error = mensajeErrorCorreo(r.error);
      // Los que no alcanzaron a salir vuelven a la fila (se reintentan al continuar el envío).
      const cursor = r.resultados.length ? r.resultados[r.resultados.length - 1].id : promo.email_cursor;
      await env.DB.prepare('UPDATE promos SET email_cursor = ?, email_fin = 0 WHERE id = ?').bind(cursor, id).run();
    }
  }

  const final = await env.DB.prepare(
    `UPDATE promos SET ${col.hechos} = ${col.hechos} + ?, ${col.ok} = ${col.ok} + ?,
       enviada = CASE WHEN enviada IS NULL AND (push = 0 OR push_fin = 1) AND (correo = 0 OR email_fin = 1) THEN ? ELSE enviada END
     WHERE id = ? RETURNING *`,
  )
    .bind(hechos, ok, ahoraIso(), id)
    .first();
  if (error) throw new HttpError(503, error, { promo: promoDTO(final) });
  return json({ promo: promoDTO(final), listo: Boolean(final[col.fin]) });
}

async function eliminarPromo({ env, params }) {
  const id = entero(params.id, { min: 1, campo: 'la promoción' });
  await env.DB.prepare('DELETE FROM promos WHERE id = ?').bind(id).run();
  return json({ ok: true });
}

// ---------- Panel: correo del local (Gmail) ----------

async function verCorreo({ env }) {
  return json(configPublica(await leerConfigCorreo(env)));
}

async function guardarCorreo({ request, env, url }) {
  await limitar(env, `correo:${ipDe(request)}`, 10, 15 * 60);
  const b = await readJson(request, 2000);
  const usuario = email(b.usuario, { requerido: true, campo: 'el correo de Gmail' });
  const actual = await leerConfigCorreo(env);
  let password = String(b.password ?? '').replace(/\s+/g, '');
  if (!password && actual?.usuario === usuario) password = actual.password; // solo cambia el nombre del remitente
  if (!password) throw new HttpError(400, 'Pega la contraseña de aplicación (16 letras).');
  if (password.length < 8 || password.length > 64) throw new HttpError(400, 'La contraseña de aplicación de Google tiene 16 letras. Revísala.');
  const remitente = texto(b.remitente, 60) || (await leerAjustes(env)).nombre;
  const cfg = { usuario, password, remitente };
  try {
    await probarCredenciales(env, cfg, url.origin);
  } catch (e) {
    throw new HttpError(400, mensajeErrorCorreo(e));
  }
  await guardarConfigCorreo(env, cfg);
  return json(configPublica(cfg));
}

async function quitarCorreo({ env }) {
  await borrarConfigCorreo(env);
  return json(configPublica(null));
}

async function probarCorreo({ request, env, url }) {
  await limitar(env, `correo-prueba:${ipDe(request)}`, 10, 15 * 60);
  const b = await readJson(request, 1000);
  const cfg = await leerConfigCorreo(env);
  if (!cfg) throw new HttpError(409, 'Primero conecta el Gmail del local.');
  const para = email(b.para) || cfg.usuario;
  const aj = await leerAjustes(env);
  const { resultados, error } = await enviarCorreos(env, cfg, [{ id: 0, para, ...correoPrueba({ aj, origen: url.origin }) }], url.origin);
  if (error) throw new HttpError(502, mensajeErrorCorreo(error));
  if (!resultados[0]?.ok) throw new HttpError(502, `Gmail rechazó el envío a ${para}: ${resultados[0]?.motivo || 'motivo desconocido'}`);
  return json({ ok: true, para });
}
