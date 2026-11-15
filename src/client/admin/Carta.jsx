import { useEffect, useMemo, useState } from 'preact/hooks';
import { ArrowDown, ArrowUp, Check, ImagePlus, Minus, Pencil, Plus, Search, Star, Trash2, X } from 'lucide-preact';
import { ICONOS_CATEGORIA, IconoCategoria, Postal, Rombo } from '../shared/simbolos.jsx';
import { clp, DIAS, DIAS_CORTOS, DIAS_LETRA, normalizar } from '../shared/format.js';
import { Sheet, Switch, Vacio, confirmar, toast } from '../shared/ui.jsx';
import { apiAdmin } from './estado.js';

const PESTANAS = [
  { id: 'productos', nombre: 'Productos' },
  { id: 'semana', nombre: 'Menú semanal' },
  { id: 'categorias', nombre: 'Categorías' },
  { id: 'acompanamientos', nombre: 'Acompañamientos' },
];

const hoyDow = () => {
  const d = new Date().toLocaleDateString('en-US', { weekday: 'short', timeZone: 'America/Santiago' });
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(d);
};

export function Carta() {
  const [pestana, setPestana] = useState('productos');
  const [carta, setCarta] = useState(null);

  async function cargar() {
    try {
      setCarta(await apiAdmin('/api/admin/carta'));
    } catch (e) {
      toast(e.message, 'error');
    }
  }
  useEffect(() => {
    cargar();
  }, []);

  const actualizarProducto = (p) =>
    setCarta((c) => ({ ...c, productos: c.productos.some((x) => x.id === p.id) ? c.productos.map((x) => (x.id === p.id ? p : x)) : [...c.productos, p] }));

  return (
    <div>
      <header class="page-head">
        <div>
          <h1>Carta</h1>
          <p class="muted">Productos, precios, stock, fotos y qué se vende cada día.</p>
        </div>
      </header>
      <div class="pestanas" role="tablist">
        {PESTANAS.map((p) => (
          <button key={p.id} role="tab" aria-selected={pestana === p.id} class={`pestana${pestana === p.id ? ' on' : ''}`} onClick={() => setPestana(p.id)}>
            {p.nombre}
          </button>
        ))}
      </div>
      {!carta ? (
        <div class="page-center">
          <div class="spinner" />
        </div>
      ) : pestana === 'productos' ? (
        <Productos carta={carta} recargar={cargar} actualizar={actualizarProducto} />
      ) : pestana === 'semana' ? (
        <MenuSemanal carta={carta} actualizar={actualizarProducto} />
      ) : pestana === 'categorias' ? (
        <Categorias carta={carta} recargar={cargar} />
      ) : (
        <Acompanamientos carta={carta} recargar={cargar} />
      )}
    </div>
  );
}

// ---------------- Productos ----------------

function Productos({ carta, recargar, actualizar }) {
  const [busqueda, setBusqueda] = useState('');
  const [categoria, setCategoria] = useState('');
  const [editando, setEditando] = useState(null);

  const grupos = useMemo(() => {
    const q = normalizar(busqueda);
    const lista = carta.productos.filter(
      (p) => (!q || normalizar(`${p.nombre} ${p.descripcion}`).includes(q)) && (!categoria || String(p.categoriaId ?? 'sin') === categoria),
    );
    const cats = [...carta.categorias, { id: null, nombre: 'Sin categoría', emoji: 'plato' }];
    return cats.map((c) => ({ ...c, productos: lista.filter((p) => (p.categoriaId ?? null) === c.id || (c.id === null && !carta.categorias.some((x) => x.id === p.categoriaId))) })).filter((g) => g.productos.length);
  }, [carta, busqueda, categoria]);

  async function ajustar(p, cambios) {
    try {
      const r = await apiAdmin(`/api/admin/productos/${p.id}`, { method: 'PATCH', body: cambios });
      actualizar(r.producto);
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  return (
    <div class="stack">
      <div class="toolbar">
        <div class="input-icono grow">
          <Search size={18} />
          <input class="input" placeholder="Buscar producto…" value={busqueda} onInput={(e) => setBusqueda(e.currentTarget.value)} />
        </div>
        <select class="select auto" value={categoria} onChange={(e) => setCategoria(e.currentTarget.value)} aria-label="Filtrar por categoría">
          <option value="">Todas las categorías</option>
          {carta.categorias.map((c) => (
            <option key={c.id} value={String(c.id)}>
              {c.nombre}
            </option>
          ))}
          <option value="sin">Sin categoría</option>
        </select>
        <button class="btn btn-primary" onClick={() => setEditando({})}>
          <Plus size={18} /> Nuevo producto
        </button>
      </div>

      {grupos.length === 0 && <Vacio titulo="No hay productos" texto="Crea el primero con “Nuevo producto”." />}

      {grupos.map((g) => (
        <section key={g.id ?? 'sin'} class="grupo-productos">
          <h2 class="grupo-titulo">
            <Rombo color="boina" chico>
              <IconoCategoria clave={g.emoji} size={15} />
            </Rombo>
            {g.nombre} <span class="pill">{g.productos.length}</span>
          </h2>
          <div class="lista-productos card">
            {g.productos.map((p) => (
              <div key={p.id} class={`fila-producto${p.activo ? '' : ' pausado'}`}>
                <button class="fp-thumb" onClick={() => setEditando(p)} aria-label={`Editar ${p.nombre}`}>
                  {p.imagen ? <img src={p.imagen} alt="" loading="lazy" /> : <Postal clave={g.emoji} />}
                </button>
                <div class="fp-info grow">
                  <div class="row">
                    <strong>{p.nombre}</strong>
                    {p.destacado && <Star size={14} class="estrella" fill="currentColor" />}
                  </div>
                  <span class="num precio">{clp(p.precio)}</span>
                  <span class="dias-mini" aria-label="Días disponibles">
                    {DIAS_LETRA.map((l, i) => (
                      <span key={i} class={p.dias & (1 << i) ? 'on' : ''} title={DIAS[i]}>
                        {l}
                      </span>
                    ))}
                  </span>
                </div>
                <div class="fp-stock">
                  {p.stock === null ? (
                    <span class="subtle small">Sin control</span>
                  ) : (
                    <div class="stock-ctrl">
                      <button class="icon-btn sm" onClick={() => ajustar(p, { sumarStock: -1 })} disabled={p.stock <= 0} aria-label="Restar 1 al stock">
                        <Minus size={14} />
                      </button>
                      <span class={`num stock-n${p.stock === 0 ? ' cero' : p.stock <= 5 ? ' bajo' : ''}`}>{p.stock}</span>
                      <button class="icon-btn sm" onClick={() => ajustar(p, { sumarStock: 1 })} aria-label="Sumar 1 al stock">
                        <Plus size={14} />
                      </button>
                    </div>
                  )}
                </div>
                <label class="fp-activo" title={p.activo ? 'Visible en el menú' : 'Oculto del menú'}>
                  <Switch checked={p.activo} onChange={(v) => ajustar(p, { activo: v })} etiqueta={`${p.nombre} disponible`} />
                  <small>{p.activo ? 'Visible' : 'Oculto'}</small>
                </label>
                <button class="icon-btn sm" onClick={() => setEditando(p)} aria-label={`Editar ${p.nombre}`}>
                  <Pencil size={16} />
                </button>
              </div>
            ))}
          </div>
        </section>
      ))}

      {editando && (
        <FormularioProducto
          producto={editando}
          categorias={carta.categorias}
          onCerrar={() => setEditando(null)}
          onGuardado={(p) => {
            actualizar(p);
            setEditando(null);
          }}
          onEliminado={() => {
            setEditando(null);
            recargar();
          }}
        />
      )}
    </div>
  );
}

async function comprimirImagen(archivo) {
  const MAX = 1100;
  let fuente = null;
  try {
    fuente = await createImageBitmap(archivo, { imageOrientation: 'from-image' });
  } catch {
    fuente = await new Promise((ok, mal) => {
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = () => mal(new Error('No se pudo leer la imagen.'));
      img.src = URL.createObjectURL(archivo);
    });
  }
  const escala = Math.min(1, MAX / Math.max(fuente.width, fuente.height));
  const w = Math.round(fuente.width * escala);
  const h = Math.round(fuente.height * escala);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(fuente, 0, 0, w, h);
  let blob = await new Promise((r) => canvas.toBlob(r, 'image/webp', 0.82));
  if (!blob || blob.type !== 'image/webp') blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
  return blob;
}

const PRESETS_DIAS = [
  { nombre: 'Todos', valor: 127 },
  { nombre: 'Lun a Vie', valor: 31 },
  { nombre: 'Lun a Sáb', valor: 63 },
  { nombre: 'Fin de semana', valor: 96 },
];

function FormularioProducto({ producto, categorias, onCerrar, onGuardado, onEliminado }) {
  const nuevo = !producto.id;
  const [f, setF] = useState({
    nombre: producto.nombre || '',
    descripcion: producto.descripcion || '',
    precio: producto.precio ?? '',
    categoriaId: producto.categoriaId ?? categorias[0]?.id ?? null,
    controlStock: producto.stock !== null && producto.stock !== undefined,
    stock: producto.stock ?? 20,
    imagenClave: producto.imagenClave || null,
    imagen: producto.imagen || null,
    conAcompanamiento: producto.conAcompanamiento || false,
    dias: producto.dias ?? 127,
    destacado: producto.destacado || false,
    sugerido: producto.sugerido || false,
    activo: producto.activo ?? true,
  });
  const [subiendo, setSubiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const set = (cambios) => setF((x) => ({ ...x, ...cambios }));

  async function subir(archivo) {
    if (!archivo || !archivo.type.startsWith('image/')) {
      toast('Elige un archivo de imagen (JPG, PNG o WebP).', 'error');
      return;
    }
    setSubiendo(true);
    try {
      const blob = await comprimirImagen(archivo);
      const r = await apiAdmin('/api/admin/imagenes', { method: 'POST', raw: true, body: blob, headers: { 'content-type': blob.type } });
      set({ imagenClave: r.clave, imagen: r.url });
    } catch (e) {
      toast(e.message || 'No se pudo subir la imagen', 'error');
    } finally {
      setSubiendo(false);
    }
  }

  async function guardar(e) {
    e?.preventDefault();
    const precio = Number(String(f.precio).replace(/\D/g, ''));
    if (!f.nombre.trim()) return toast('Ponle un nombre al producto.', 'error');
    if (!Number.isFinite(precio) || String(f.precio).trim() === '') return toast('Indica el precio.', 'error');
    setGuardando(true);
    try {
      const body = {
        nombre: f.nombre,
        descripcion: f.descripcion,
        precio,
        categoriaId: f.categoriaId,
        stock: f.controlStock ? Number(f.stock) || 0 : null,
        imagenClave: f.imagenClave,
        conAcompanamiento: f.conAcompanamiento,
        dias: f.dias,
        destacado: f.destacado,
        sugerido: f.sugerido,
        activo: f.activo,
      };
      const r = nuevo
        ? await apiAdmin('/api/admin/productos', { method: 'POST', body })
        : await apiAdmin(`/api/admin/productos/${producto.id}`, { method: 'PUT', body });
      toast(nuevo ? 'Producto creado' : 'Cambios guardados', 'ok');
      onGuardado(r.producto);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar() {
    const ok = await confirmar({
      titulo: `¿Eliminar “${producto.nombre}”?`,
      texto: 'Desaparece de la carta. Los pedidos antiguos lo siguen mostrando. Si solo quieres ocultarlo por un tiempo, usa “Visible”.',
      ok: 'Eliminar',
      peligro: true,
    });
    if (!ok) return;
    try {
      await apiAdmin(`/api/admin/productos/${producto.id}`, { method: 'DELETE' });
      toast('Producto eliminado', 'ok');
      onEliminado();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  return (
    <Sheet
      abierto
      onCerrar={onCerrar}
      ancho
      titulo={nuevo ? 'Nuevo producto' : 'Editar producto'}
      pie={
        <div class="row">
          {!nuevo && (
            <button type="button" class="btn btn-danger" onClick={eliminar}>
              <Trash2 size={16} /> Eliminar
            </button>
          )}
          <span class="grow" />
          <button type="button" class="btn btn-ghost" onClick={onCerrar}>
            Cancelar
          </button>
          <button type="button" class="btn btn-primary" onClick={guardar} disabled={guardando || subiendo}>
            {guardando ? <span class="spinner" /> : null} Guardar
          </button>
        </div>
      }
    >
      <form class="form-producto" onSubmit={guardar}>
        <div
          class={`foto-zona${arrastrando ? ' arrastrando' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setArrastrando(true);
          }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={(e) => {
            e.preventDefault();
            setArrastrando(false);
            subir(e.dataTransfer.files[0]);
          }}
        >
          {f.imagen ? (
            <>
              <img src={f.imagen} alt="Foto del producto" />
              <button type="button" class="icon-btn sm quitar-foto" onClick={() => set({ imagen: null, imagenClave: null })} aria-label="Quitar foto">
                <X size={16} />
              </button>
            </>
          ) : (
            <div class="foto-vacia">
              <ImagePlus size={34} />
              <span>Arrastra una foto o toca para elegir</span>
              <small>Se optimiza sola para que cargue rápido</small>
            </div>
          )}
          {f.imagen && producto.imagenCredito && f.imagenClave === producto.imagenClave && (
            <p class="foto-credito">
              {producto.imagenCredito}. Cámbiala por una foto de tu plato cuando la tengas.
            </p>
          )}
          <label class="foto-boton">
            <input type="file" accept="image/*" onChange={(e) => subir(e.currentTarget.files[0])} />
            {subiendo ? (
              <>
                <span class="spinner" /> Subiendo…
              </>
            ) : f.imagen ? (
              'Cambiar foto'
            ) : (
              'Elegir foto'
            )}
          </label>
        </div>

        <div class="form-campos">
          <label class="field">
            <span class="label">Nombre</span>
            <input class="input" maxLength={80} value={f.nombre} onInput={(e) => set({ nombre: e.currentTarget.value })} placeholder="Ej: Pastel de choclo" />
          </label>
          <label class="field">
            <span class="label">Descripción</span>
            <textarea class="textarea" rows={2} maxLength={300} value={f.descripcion} onInput={(e) => set({ descripcion: e.currentTarget.value })} placeholder="Ingredientes, tamaño, lo que lo hace especial…" />
          </label>
          <div class="dos-columnas">
            <label class="field">
              <span class="label">Precio (CLP)</span>
              <input
                class="input num"
                inputMode="numeric"
                value={f.precio === '' ? '' : Number(String(f.precio).replace(/\D/g, '') || 0).toLocaleString('es-CL')}
                onInput={(e) => set({ precio: e.currentTarget.value.replace(/\D/g, '') })}
                placeholder="6.900"
              />
            </label>
            <label class="field">
              <span class="label">Categoría</span>
              <select class="select" value={f.categoriaId ?? ''} onChange={(e) => set({ categoriaId: e.currentTarget.value ? Number(e.currentTarget.value) : null })}>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
                <option value="">Sin categoría</option>
              </select>
            </label>
          </div>

          <fieldset class="fieldset">
            <legend>Días en el menú</legend>
            <div class="dias-selector">
              {DIAS_CORTOS.map((d, i) => (
                <button
                  type="button"
                  key={d}
                  class={`dia${f.dias & (1 << i) ? ' on' : ''}`}
                  aria-pressed={Boolean(f.dias & (1 << i))}
                  onClick={() => set({ dias: f.dias ^ (1 << i) })}
                >
                  {d}
                </button>
              ))}
            </div>
            <div class="row wrap">
              {PRESETS_DIAS.map((p) => (
                <button type="button" key={p.nombre} class={`chip${f.dias === p.valor ? ' on' : ''}`} onClick={() => set({ dias: p.valor })}>
                  {p.nombre}
                </button>
              ))}
            </div>
            {f.dias === 0 && <p class="error-text">Sin días marcados no aparecerá nunca en el menú.</p>}
          </fieldset>

          <div class="ajustes-lista">
            <div class="switch-row">
              <span>
                <strong>Controlar stock</strong>
                <small class="block muted">Se descuenta con cada pedido y muestra “Agotado” al llegar a 0.</small>
              </span>
              <Switch checked={f.controlStock} onChange={(v) => set({ controlStock: v })} etiqueta="Controlar stock" />
            </div>
            {f.controlStock && (
              <label class="field stock-campo">
                <span class="label">Unidades disponibles</span>
                <input class="input num" type="number" min="0" max="100000" value={f.stock} onInput={(e) => set({ stock: e.currentTarget.value })} />
              </label>
            )}
            <div class="switch-row">
              <span>
                <strong>Pide acompañamiento</strong>
                <small class="block muted">El cliente debe elegir uno (arroz, papas, puré…).</small>
              </span>
              <Switch checked={f.conAcompanamiento} onChange={(v) => set({ conAcompanamiento: v })} etiqueta="Pide acompañamiento" />
            </div>
            <div class="switch-row">
              <span>
                <strong>Destacado</strong>
                <small class="block muted">Aparece en “Recomendados de hoy”.</small>
              </span>
              <Switch checked={f.destacado} onChange={(v) => set({ destacado: v })} etiqueta="Destacado" />
            </div>
            <div class="switch-row">
              <span>
                <strong>Sugerir en el carro</strong>
                <small class="block muted">Se ofrece en “¿Le sumas algo?” antes de pagar. Ideal para bebidas y postres.</small>
              </span>
              <Switch checked={f.sugerido} onChange={(v) => set({ sugerido: v })} etiqueta="Sugerir en el carro" />
            </div>
            <div class="switch-row">
              <span>
                <strong>Visible en el menú</strong>
                <small class="block muted">Apágalo para ocultarlo sin borrarlo.</small>
              </span>
              <Switch checked={f.activo} onChange={(v) => set({ activo: v })} etiqueta="Visible en el menú" />
            </div>
          </div>
        </div>
        <button type="submit" hidden />
      </form>
    </Sheet>
  );
}

// ---------------- Menú semanal ----------------

function MenuSemanal({ carta, actualizar }) {
  const hoy = hoyDow();
  const [guardando, setGuardando] = useState(null);
  const conteo = DIAS.map((_, i) => carta.productos.filter((p) => p.activo && p.dias & (1 << i)).length);

  async function alternar(p, i) {
    const dias = p.dias ^ (1 << i);
    actualizar({ ...p, dias });
    setGuardando(`${p.id}-${i}`);
    try {
      const r = await apiAdmin(`/api/admin/productos/${p.id}`, { method: 'PATCH', body: { dias } });
      actualizar(r.producto);
    } catch (e) {
      actualizar(p);
      toast(e.message, 'error');
    } finally {
      setGuardando(null);
    }
  }

  return (
    <div class="stack">
      <p class="muted">
        Toca una casilla para que un producto aparezca (o no) ese día. Los productos ocultos no se muestran aunque estén marcados.
      </p>
      <div class="tabla-wrap card">
        <table class="tabla semana">
          <thead>
            <tr>
              <th>Producto</th>
              {DIAS_CORTOS.map((d, i) => (
                <th key={d} class={`centro${i === hoy ? ' hoy' : ''}`}>
                  {d}
                  <small class="block">{conteo[i]}</small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {carta.categorias.concat([{ id: null, nombre: 'Sin categoría', emoji: 'plato' }]).map((c) => {
              const productos = carta.productos.filter((p) => (p.categoriaId ?? null) === c.id);
              if (!productos.length) return null;
              return [
                <tr key={`c${c.id}`} class="fila-cat">
                  <td colSpan={8}>
                    <span class="row">
                      <IconoCategoria clave={c.emoji} size={16} /> {c.nombre}
                    </span>
                  </td>
                </tr>,
                ...productos.map((p) => (
                  <tr key={p.id} class={p.activo ? '' : 'pausado'}>
                    <td>
                      <strong>{p.nombre}</strong>
                      {!p.activo && <small class="block muted">Oculto</small>}
                    </td>
                    {DIAS.map((d, i) => (
                      <td key={d} class={`centro${i === hoy ? ' hoy' : ''}`}>
                        <button
                          class={`celda-dia${p.dias & (1 << i) ? ' on' : ''}`}
                          aria-pressed={Boolean(p.dias & (1 << i))}
                          aria-label={`${p.nombre} el ${d}`}
                          disabled={guardando === `${p.id}-${i}`}
                          onClick={() => alternar(p, i)}
                        >
                          {p.dias & (1 << i) ? <Check size={18} strokeWidth={3.4} /> : ''}
                        </button>
                      </td>
                    ))}
                  </tr>
                )),
              ];
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------- Categorías ----------------

function Categorias({ carta, recargar }) {
  const [nueva, setNueva] = useState({ nombre: '', emoji: 'plato' });
  const [ocupado, setOcupado] = useState(false);

  async function crear(e) {
    e.preventDefault();
    if (!nueva.nombre.trim()) return;
    setOcupado(true);
    try {
      await apiAdmin('/api/admin/categorias', { method: 'POST', body: nueva });
      setNueva({ nombre: '', emoji: 'plato' });
      await recargar();
      toast('Categoría creada', 'ok');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setOcupado(false);
    }
  }

  async function mover(i, delta) {
    const ids = carta.categorias.map((c) => c.id);
    const j = i + delta;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    try {
      await apiAdmin('/api/admin/categorias-orden', { method: 'POST', body: { ids } });
      await recargar();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  return (
    <div class="stack max-640">
      <form class="card card-pad row wrap" onSubmit={crear}>
        <SelectorIcono valor={nueva.emoji} onCambio={(v) => setNueva({ ...nueva, emoji: v })} />
        <input class="input grow" placeholder="Nueva categoría (ej: Sándwiches)" maxLength={40} value={nueva.nombre} onInput={(e) => setNueva({ ...nueva, nombre: e.currentTarget.value })} />
        <button class="btn btn-primary" disabled={ocupado || !nueva.nombre.trim()}>
          <Plus size={18} /> Agregar
        </button>
      </form>
      <div class="card lista-simple">
        {carta.categorias.map((c, i) => (
          <FilaEditable
            key={c.id}
            item={c}
            conEmoji
            extra={
              <>
                <button class="icon-btn sm" onClick={() => mover(i, -1)} disabled={i === 0} aria-label="Subir">
                  <ArrowUp size={16} />
                </button>
                <button class="icon-btn sm" onClick={() => mover(i, 1)} disabled={i === carta.categorias.length - 1} aria-label="Bajar">
                  <ArrowDown size={16} />
                </button>
              </>
            }
            contar={carta.productos.filter((p) => p.categoriaId === c.id).length}
            onGuardar={(d) => apiAdmin(`/api/admin/categorias/${c.id}`, { method: 'PUT', body: d }).then(recargar)}
            onEliminar={async () => {
              const ok = await confirmar({
                titulo: `¿Eliminar “${c.nombre}”?`,
                texto: 'Sus productos no se borran: quedan “Sin categoría”.',
                ok: 'Eliminar',
                peligro: true,
              });
              if (ok) await apiAdmin(`/api/admin/categorias/${c.id}`, { method: 'DELETE' }).then(recargar);
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------- Acompañamientos ----------------

function Acompanamientos({ carta, recargar }) {
  const [nombre, setNombre] = useState('');
  async function crear(e) {
    e.preventDefault();
    if (!nombre.trim()) return;
    try {
      await apiAdmin('/api/admin/acompanamientos', { method: 'POST', body: { nombre } });
      setNombre('');
      await recargar();
    } catch (err) {
      toast(err.message, 'error');
    }
  }
  return (
    <div class="stack max-640">
      <p class="muted">Los productos que “piden acompañamiento” muestran esta lista al cliente. Apaga los que no tengas hoy.</p>
      <form class="card card-pad row" onSubmit={crear}>
        <input class="input grow" placeholder="Nuevo acompañamiento (ej: Fideos)" maxLength={40} value={nombre} onInput={(e) => setNombre(e.currentTarget.value)} />
        <button class="btn btn-primary" disabled={!nombre.trim()}>
          <Plus size={18} /> Agregar
        </button>
      </form>
      <div class="card lista-simple">
        {carta.acompanamientos.length === 0 && <Vacio titulo="Sin acompañamientos" />}
        {carta.acompanamientos.map((a) => (
          <FilaEditable
            key={a.id}
            item={a}
            onGuardar={(d) => apiAdmin(`/api/admin/acompanamientos/${a.id}`, { method: 'PUT', body: d }).then(recargar)}
            onEliminar={async () => {
              if (await confirmar({ titulo: `¿Eliminar “${a.nombre}”?`, ok: 'Eliminar', peligro: true })) {
                await apiAdmin(`/api/admin/acompanamientos/${a.id}`, { method: 'DELETE' }).then(recargar);
              }
            }}
          />
        ))}
      </div>
    </div>
  );
}

function FilaEditable({ item, conEmoji = false, extra, contar, onGuardar, onEliminar }) {
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(item.nombre);
  const [emoji, setEmoji] = useState(item.emoji || '');

  async function ejecutar(fn) {
    try {
      await fn();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  return (
    <div class={`fila-simple${item.activo ? '' : ' pausado'}`}>
      {editando ? (
        <form
          class="row grow"
          onSubmit={(e) => {
            e.preventDefault();
            ejecutar(async () => {
              await onGuardar({ nombre, emoji, activo: item.activo });
              setEditando(false);
            });
          }}
        >
          {conEmoji && <SelectorIcono valor={emoji} onCambio={setEmoji} />}
          <input class="input grow" value={nombre} maxLength={40} autoFocus onInput={(e) => setNombre(e.currentTarget.value)} />
          <button class="btn btn-primary btn-sm">Guardar</button>
          <button type="button" class="btn btn-ghost btn-sm" onClick={() => setEditando(false)}>
            Cancelar
          </button>
        </form>
      ) : (
        <>
          <span class="grow">
            {conEmoji && (
              <Rombo color="boina" chico>
                <IconoCategoria clave={item.emoji} size={15} />
              </Rombo>
            )}{' '}
            <strong>{item.nombre}</strong>
            {contar !== undefined && <small class="muted"> · {contar} productos</small>}
          </span>
          {extra}
          <Switch
            checked={item.activo}
            onChange={(v) => ejecutar(() => onGuardar({ nombre: item.nombre, emoji: item.emoji, activo: v }))}
            etiqueta={`${item.nombre} activo`}
          />
          <button class="icon-btn sm" onClick={() => setEditando(true)} aria-label={`Editar ${item.nombre}`}>
            <Pencil size={16} />
          </button>
          <button class="icon-btn sm" onClick={() => ejecutar(onEliminar)} aria-label={`Eliminar ${item.nombre}`}>
            <Trash2 size={16} />
          </button>
        </>
      )}
    </div>
  );
}

function SelectorIcono({ valor, onCambio }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div class="selector-icono">
      <button type="button" class="icon-btn" onClick={() => setAbierto(!abierto)} aria-label="Elegir ícono de la categoría" aria-expanded={abierto}>
        <IconoCategoria clave={valor} size={20} />
      </button>
      {abierto && (
        <div class="selector-grid" role="listbox" aria-label="Íconos">
          {Object.entries(ICONOS_CATEGORIA).map(([clave, def]) => (
            <button
              type="button"
              key={clave}
              role="option"
              aria-selected={clave === valor}
              class={`selector-op${clave === valor ? ' on' : ''}`}
              title={def.nombre}
              onClick={() => {
                onCambio(clave);
                setAbierto(false);
              }}
            >
              <IconoCategoria clave={clave} size={20} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
