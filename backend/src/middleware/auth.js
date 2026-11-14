import { unauthenticated } from '../lib/errors.js';

const BEARER = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/;

// Exige un JWT válido de Supabase. La identidad (userId) sale SOLO del token verificado.
// req.ctx se pasa a los repositorios: incluye un cliente de base de datos con el JWT del usuario,
// de modo que RLS también se aplica (defensa en profundidad).
export function authenticate({ verifyToken, createUserDb }) {
  return async (req, _res, next) => {
    const match = BEARER.exec(req.get('authorization') || '');
    if (!match) throw unauthenticated();
    const token = match[1];
    const identity = await verifyToken(token);
    req.auth = identity;
    let db;
    req.ctx = {
      userId: identity.userId,
      token,
      get db() {
        db ??= createUserDb(token);
        return db;
      }
    };
    next();
  };
}
