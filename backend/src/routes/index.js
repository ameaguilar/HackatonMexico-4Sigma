import { Router } from 'express';
import { accountController } from '../controllers/account.js';
import { catalogController } from '../controllers/catalog.js';
import { salesController } from '../controllers/sales.js';
import { loadMembership, requireRole } from '../middleware/membership.js';
import { validate } from '../middleware/validate.js';
import {
  businessCreate, businessUpdate, priceUpdate, productCreate, productListQuery, productUpdate,
  profileUpdate, salesListQuery, uuidParam
} from '../validators/schemas.js';

// Rutas autenticadas (el middleware de autenticación se monta antes, en app.js).
export function apiRoutes({ repos }) {
  const router = Router();
  const account = accountController({ repos });
  const catalog = catalogController({ repos });
  const sales = salesController({ repos });
  const admins = requireRole('owner', 'admin');

  router.get('/me', account.getMe);
  router.patch('/me', validate({ body: profileUpdate }), account.updateMe);

  router.post('/businesses', validate({ body: businessCreate }), account.createBusiness);

  // Todo lo que cuelga de /businesses/:bid exige membresía verificada en la base de datos.
  router.use('/businesses/:bid', loadMembership(repos));
  router.get('/businesses/:bid', account.getBusiness);
  router.patch('/businesses/:bid', admins, validate({ body: businessUpdate }), account.updateBusiness);

  router.get('/businesses/:bid/products', validate({ query: productListQuery }), catalog.list);
  router.post('/businesses/:bid/products', admins, validate({ body: productCreate }), catalog.create);
  router.patch('/businesses/:bid/products/:id', admins, validate({ params: uuidParam, body: productUpdate }), catalog.update);
  router.put('/businesses/:bid/products/:id/price', admins, validate({ params: uuidParam, body: priceUpdate }), catalog.setPrice);
  router.get('/businesses/:bid/products/:id/price-history', validate({ params: uuidParam }), catalog.priceHistory);

  router.get('/businesses/:bid/sales', validate({ query: salesListQuery }), sales.list);
  router.get('/businesses/:bid/sales/:id', validate({ params: uuidParam }), sales.get);

  return router;
}
