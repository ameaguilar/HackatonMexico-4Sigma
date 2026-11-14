import { conflict, notFound } from '../lib/errors.js';

// Límite de negocios propios por usuario en la demo (evita abuso de un registro abierto).
export const MAX_OWNED_BUSINESSES = 5;

export function accountController({ repos }) {
  return {
    async getMe(req, res) {
      const [profile, businesses] = await Promise.all([
        repos.profiles.get(req.ctx),
        repos.businesses.listForUser(req.ctx)
      ]);
      res.json({
        user: { id: req.auth.userId, phone: req.auth.phone, email: req.auth.email },
        profile,
        businesses
      });
    },

    async updateMe(req, res) {
      res.json(await repos.profiles.save(req.ctx, req.valid.body));
    },

    async createBusiness(req, res) {
      const current = await repos.businesses.listForUser(req.ctx);
      if (current.filter(business => business.role === 'owner').length >= MAX_OWNED_BUSINESSES) {
        throw conflict('BUSINESS_LIMIT', `Puedes registrar hasta ${MAX_OWNED_BUSINESSES} negocios.`);
      }
      const business = await repos.businesses.create(req.ctx, req.valid.body);
      res.status(201).json({ ...business, role: 'owner' });
    },

    async getBusiness(req, res) {
      const business = await repos.businesses.get(req.ctx, req.business.id);
      if (!business) throw notFound('No encontramos ese negocio.');
      res.json({ ...business, role: req.business.role });
    },

    async updateBusiness(req, res) {
      const business = await repos.businesses.update(req.ctx, req.business.id, req.valid.body);
      res.json({ ...business, role: req.business.role });
    }
  };
}
