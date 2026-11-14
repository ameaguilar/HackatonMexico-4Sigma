// Construcción de la aplicación Express con dependencias inyectadas (facilita las pruebas).
import express from 'express';
import helmet from 'helmet';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { AppError, notFound } from './lib/errors.js';
import { authenticate } from './middleware/auth.js';
import { cors } from './middleware/cors.js';
import { errorHandler } from './middleware/error-handler.js';
import { requestContext } from './middleware/request-context.js';
import { apiRoutes } from './routes/index.js';

export const VERSION = '0.1.0';

export function createApp({ config, logger, repos, verifyToken, createUserDb }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use(helmet());
  app.use(requestContext(logger));
  app.use(cors(config.corsOrigins));
  app.use(express.json({ limit: '32kb' }));

  // Pública y sin dependencias externas: sirve para el healthcheck de Docker.
  app.get('/api/health', (_req, res) => {
    res.set('Cache-Control', 'no-store').json({ status: 'ok', version: VERSION });
  });

  const api = express.Router();
  api.use(authenticate({ verifyToken, createUserDb }));
  api.use(rateLimit({
    windowMs: 60_000,
    limit: config.rateLimitPerMinute,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    // Límite por usuario autenticado (o por IP si algo falla antes de identificarlo).
    keyGenerator: req => req.auth?.userId ?? ipKeyGenerator(req.ip ?? ''),
    handler: (_req, _res, next) => next(new AppError(429, 'RATE_LIMITED', 'Demasiadas solicitudes. Espera un momento.'))
  }));
  api.use(apiRoutes({ repos }));
  app.use('/api', api);

  app.use((_req, _res, next) => next(notFound('Ruta no encontrada.')));
  app.use(errorHandler());
  return app;
}
