import { notFound } from '../lib/errors.js';

// Fase 4: solo lectura del historial. La creación de cobros llega con la integración de Pey (Fase 5).
export function salesController({ repos }) {
  return {
    async list(req, res) {
      res.json(await repos.sales.list(req.ctx, req.business.id, req.valid.query));
    },

    async get(req, res) {
      const sale = await repos.sales.get(req.ctx, req.business.id, req.valid.params.id);
      if (!sale) throw notFound('No encontramos ese cobro.');
      res.json(sale);
    }
  };
}
