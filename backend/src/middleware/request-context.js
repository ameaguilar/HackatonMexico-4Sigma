import { randomUUID } from 'node:crypto';

const INCOMING_ID = /^[A-Za-z0-9_-]{8,64}$/;

// Asigna un identificador a cada petición y registra el resultado al terminar.
export function requestContext(logger) {
  return (req, res, next) => {
    const incoming = req.get('x-request-id');
    req.id = incoming && INCOMING_ID.test(incoming) ? incoming : randomUUID();
    res.set('X-Request-Id', req.id);
    req.log = logger.child({ requestId: req.id });

    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      const entry = {
        method: req.method,
        path: req.originalUrl.split('?')[0],
        status: res.statusCode,
        ms: Math.round(ms),
        userId: req.auth?.userId
      };
      if (res.statusCode >= 500) req.log.error(entry, 'request');
      else if (res.statusCode >= 400) req.log.warn(entry, 'request');
      else req.log.info(entry, 'request');
    });
    next();
  };
}
