import pino from 'pino';

// Registros estructurados (JSON). Nunca registran tokens, claves ni datos bancarios.
export function createLogger({ level = 'info' } = {}) {
  return pino({
    level,
    base: { service: 'cobravoz-backend' },
    redact: {
      paths: [
        'req.headers.authorization', 'req.headers.cookie', 'headers.authorization',
        '*.clabe', '*.token', '*.access_token', '*.refresh_token', '*.secretKey', '*.apiKey'
      ],
      censor: '[oculto]'
    },
    timestamp: pino.stdTimeFunctions.isoTime
  });
}
