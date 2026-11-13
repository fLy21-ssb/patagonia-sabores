// Utilidades HTTP: errores con código, respuestas JSON, lectura segura del cuerpo y un router mínimo.

export class HttpError extends Error {
  constructor(status, message, extra = undefined) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const BASE_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
};

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...BASE_HEADERS, ...headers } });
}

export function errorJson(err) {
  if (err instanceof HttpError) {
    return json({ error: err.message, ...(err.extra || {}) }, err.status);
  }
  console.error('Error no controlado:', err?.stack || err);
  return json({ error: 'Ocurrió un error inesperado. Intenta nuevamente.' }, 500);
}

export async function readJson(request, maxBytes = 32_000) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > maxBytes) throw new HttpError(413, 'La solicitud es demasiado grande.');
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, 'La solicitud es demasiado grande.');
  if (!text) return {};
  try {
    const data = JSON.parse(text);
    if (data === null || typeof data !== 'object') throw new Error('no es objeto');
    return data;
  } catch {
    throw new HttpError(400, 'El formato de la solicitud no es válido.');
  }
}

export class Router {
  constructor() {
    this.routes = [];
  }

  add(method, pattern, handler) {
    const keys = [];
    const source = pattern.replace(/:([a-zA-Z_]+)/g, (_, key) => {
      keys.push(key);
      return '([^/]+)';
    });
    this.routes.push({ method, regex: new RegExp(`^${source}/?$`), keys, handler });
    return this;
  }

  get(p, h) { return this.add('GET', p, h); }
  post(p, h) { return this.add('POST', p, h); }
  put(p, h) { return this.add('PUT', p, h); }
  patch(p, h) { return this.add('PATCH', p, h); }
  delete(p, h) { return this.add('DELETE', p, h); }

  async handle(ctx) {
    const { request, url } = ctx;
    let pathMatched = false;
    for (const route of this.routes) {
      const match = route.regex.exec(url.pathname);
      if (!match) continue;
      pathMatched = true;
      if (route.method !== request.method) continue;
      const params = {};
      route.keys.forEach((key, i) => {
        params[key] = decodeURIComponent(match[i + 1]);
      });
      return route.handler({ ...ctx, params });
    }
    if (pathMatched) throw new HttpError(405, 'Método no permitido.');
    throw new HttpError(404, 'Recurso no encontrado.');
  }
}
