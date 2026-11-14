// CORS mínimo con lista blanca. En producción el frontend llega por el proxy de Netlify (mismo origen)
// y esta lista puede quedar vacía; sirve para desarrollo local (p. ej. http://localhost:8000).
export function cors(allowedOrigins = []) {
  const allowed = new Set(allowedOrigins);
  return (req, res, next) => {
    const origin = req.get('origin');
    if (origin && allowed.has(origin)) {
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Vary', 'Origin');
      res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, Idempotency-Key, X-Request-Id');
      res.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
      res.set('Access-Control-Expose-Headers', 'X-Request-Id');
      res.set('Access-Control-Max-Age', '600');
    }
    if (req.method === 'OPTIONS') return res.status(origin && allowed.has(origin) ? 204 : 403).end();
    next();
  };
}
