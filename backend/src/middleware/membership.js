import { forbidden, notFound } from '../lib/errors.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Verifica que el usuario autenticado pertenezca al negocio de la ruta (:bid).
// Si no pertenece, responde 404 para no revelar que el negocio existe.
export function loadMembership(repos) {
  return async (req, _res, next) => {
    const businessId = String(req.params.bid || '').toLowerCase();
    if (!UUID.test(businessId)) throw notFound('No encontramos ese negocio.');
    const role = await repos.memberships.getRole(req.ctx, businessId);
    if (!role) throw notFound('No encontramos ese negocio.');
    req.business = { id: businessId, role };
    next();
  };
}

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.business || !roles.includes(req.business.role)) throw forbidden();
    next();
  };
}
