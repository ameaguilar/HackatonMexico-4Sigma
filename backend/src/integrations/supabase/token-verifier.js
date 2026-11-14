// Verificación local del JWT emitido por Supabase Auth.
//
// Proyectos nuevos firman con llaves asimétricas (ES256/RS256) publicadas en
//   <SUPABASE_URL>/auth/v1/.well-known/jwks.json
// Proyectos con el esquema legado firman con HS256 y el "JWT secret" del proyecto.
// Se verifica firma, emisor, audiencia y expiración; nunca se confía en datos del cuerpo de la petición.
import { createRemoteJWKSet, decodeProtectedHeader, errors, jwtVerify } from 'jose';
import { AppError, unauthenticated } from '../../lib/errors.js';

const ASYMMETRIC = ['ES256', 'RS256', 'EdDSA'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function remoteJwks(jwksUrl) {
  return createRemoteJWKSet(new URL(jwksUrl), { timeoutDuration: 5000, cooldownDuration: 30000, cacheMaxAge: 600000 });
}

export function createTokenVerifier({ issuer, jwks, jwtSecret = null }) {
  const sharedSecret = jwtSecret ? new TextEncoder().encode(jwtSecret) : null;

  return async function verifyToken(token) {
    let header;
    try {
      header = decodeProtectedHeader(token);
    } catch {
      throw unauthenticated('Tu sesión no es válida. Vuelve a iniciar sesión.');
    }

    let key;
    let algorithms;
    if (header.alg === 'HS256') {
      if (!sharedSecret) throw unauthenticated('Tu sesión no es válida. Vuelve a iniciar sesión.');
      key = sharedSecret;
      algorithms = ['HS256'];
    } else if (ASYMMETRIC.includes(header.alg)) {
      key = jwks;
      algorithms = ASYMMETRIC;
    } else {
      throw unauthenticated('Tu sesión no es válida. Vuelve a iniciar sesión.');
    }

    let payload;
    try {
      ({ payload } = await jwtVerify(token, key, {
        issuer,
        audience: 'authenticated',
        algorithms,
        clockTolerance: 5,
        requiredClaims: ['sub', 'exp']
      }));
    } catch (error) {
      if (error instanceof errors.JWTExpired) throw unauthenticated('Tu sesión expiró. Vuelve a iniciar sesión.');
      if (error instanceof errors.JWKSTimeout) {
        throw new AppError(503, 'AUTH_UNAVAILABLE', 'No pudimos validar tu sesión en este momento. Intenta de nuevo.', { cause: error });
      }
      if (error instanceof errors.JOSEError) throw unauthenticated('Tu sesión no es válida. Vuelve a iniciar sesión.');
      // Fallo de red al descargar las llaves públicas: no es culpa del usuario.
      throw new AppError(503, 'AUTH_UNAVAILABLE', 'No pudimos validar tu sesión en este momento. Intenta de nuevo.', { cause: error });
    }

    if (payload.role !== 'authenticated' || payload.is_anonymous === true || !UUID.test(String(payload.sub))) {
      throw unauthenticated('Tu sesión no es válida. Vuelve a iniciar sesión.');
    }

    return {
      userId: String(payload.sub).toLowerCase(),
      phone: typeof payload.phone === 'string' && payload.phone ? payload.phone : null,
      email: typeof payload.email === 'string' && payload.email ? payload.email : null
    };
  };
}
