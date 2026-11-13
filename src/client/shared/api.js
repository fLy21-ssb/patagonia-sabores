// Cliente HTTP de la API con mensajes de error en español.

export class ApiError extends Error {
  constructor(message, status, data = {}) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

/** Llama a la API. `admin: true` agrega la cabecera anti-CSRF que exige el panel en las escrituras. */
export async function api(path, { method = 'GET', body, admin = false, raw = false, headers = {}, signal } = {}) {
  const h = { ...headers };
  if (admin && method !== 'GET') h['x-ps-client'] = '1';
  let payload = body;
  if (body !== undefined && !raw) {
    h['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(path, { method, headers: h, body: payload, credentials: 'same-origin', signal });
  } catch (e) {
    if (e?.name === 'AbortError') throw e;
    throw new ApiError('Sin conexión. Revisa tu internet e intenta de nuevo.', 0);
  }
  const esJson = (res.headers.get('content-type') || '').includes('json');
  const data = esJson ? await res.json().catch(() => ({})) : {};
  if (!res.ok) throw new ApiError(data.error || `Error ${res.status}`, res.status, data);
  return data;
}
