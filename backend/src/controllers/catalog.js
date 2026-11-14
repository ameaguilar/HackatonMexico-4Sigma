import { notFound } from '../lib/errors.js';

export function catalogController({ repos }) {
  return {
    async list(req, res) {
      const items = await repos.products.list(req.ctx, req.business.id, req.valid.query);
      res.json({ items });
    },

    async create(req, res) {
      const product = await repos.products.create(req.ctx, req.business.id, req.valid.body);
      res.status(201).json(product);
    },

    async update(req, res) {
      const product = await repos.products.update(req.ctx, req.business.id, req.valid.params.id, req.valid.body);
      res.json(product);
    },

    // Cambio de precio habitual. Las ventas pasadas conservan su precio (sale_items).
    // El autor es el usuario del JWT; nunca un valor enviado por el cliente.
    async setPrice(req, res) {
      const product = await repos.products.setPrice({
        businessId: req.business.id,
        productId: req.valid.params.id,
        actorId: req.auth.userId,
        precioCentavos: req.valid.body.precio_centavos,
        origen: req.valid.body.origen
      });
      res.json(product);
    },

    async priceHistory(req, res) {
      const product = await repos.products.get(req.ctx, req.business.id, req.valid.params.id);
      if (!product) throw notFound('No encontramos ese producto.');
      const items = await repos.products.priceHistory(req.ctx, req.business.id, product.id);
      res.json({ product, items });
    }
  };
}
