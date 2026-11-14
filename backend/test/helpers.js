// Utilidades de prueba: llaves y tokens JWT locales, repositorios en memoria y arranque de la app.
import { randomUUID } from 'node:crypto';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import { createApp } from '../src/app.js';
import { createTokenVerifier } from '../src/integrations/supabase/token-verifier.js';
import { createLogger } from '../src/lib/logger.js';
import { conflict, notFound } from '../src/lib/errors.js';
import { normalizeName } from '../src/validators/schemas.js';

export const ISSUER = 'https://test-project.supabase.co/auth/v1';
export const JWT_SECRET = 'secreto-legado-de-pruebas-con-mas-de-32-caracteres';

export const USERS = {
  owner: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  cashier: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  stranger: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
};

export async function createKeys() {
  const { publicKey, privateKey } = await generateKeyPair('ES256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'ES256', use: 'sig' };
  const jwks = createLocalJWKSet({ keys: [jwk] });
  async function token(sub, overrides = {}) {
    const { alg = 'ES256', key = privateKey, kid = 'test-key', iss = ISSUER, aud = 'authenticated',
      exp = '1h', claims = {} } = overrides;
    return new SignJWT({ role: 'authenticated', phone: '525512345678', ...claims })
      .setProtectedHeader({ alg, kid })
      .setIssuer(iss).setAudience(aud).setSubject(sub).setIssuedAt().setExpirationTime(exp)
      .sign(key);
  }
  return { jwks, token, privateKey };
}

// Repositorio en memoria con las mismas reglas de pertenencia que RLS.
export function createMemoryRepos() {
  const state = {
    profiles: new Map(),
    businesses: new Map(),
    members: [],
    products: [],
    history: [],
    sales: [],
    calls: []
  };
  const isMember = (userId, businessId) => state.members.some(m => m.user_id === userId && m.business_id === businessId);
  const now = () => new Date().toISOString();
  const productView = ({ business_id: _b, nombre_normalizado: _n, ...rest }) => rest;

  const repos = {
    memberships: {
      async getRole(ctx, businessId) {
        return state.members.find(m => m.user_id === ctx.userId && m.business_id === businessId)?.role ?? null;
      }
    },
    profiles: {
      async get(ctx) { return state.profiles.get(ctx.userId) ?? null; },
      async save(ctx, changes) {
        const profile = { id: ctx.userId, nombre_completo: null, telefono: null, ...state.profiles.get(ctx.userId), ...changes };
        state.profiles.set(ctx.userId, profile);
        return profile;
      }
    },
    businesses: {
      async listForUser(ctx) {
        return state.members.filter(m => m.user_id === ctx.userId)
          .map(m => ({ ...state.businesses.get(m.business_id), role: m.role }));
      },
      async create(ctx, { nombre, tipo_negocio = null }) {
        const business = { id: randomUUID(), nombre, tipo_negocio, moneda: 'MXN', created_at: now(), updated_at: now() };
        state.businesses.set(business.id, business);
        state.members.push({ business_id: business.id, user_id: ctx.userId, role: 'owner' });
        return business;
      },
      async get(ctx, id) { return isMember(ctx.userId, id) ? state.businesses.get(id) ?? null : null; },
      async update(ctx, id, changes) {
        if (!isMember(ctx.userId, id)) throw notFound();
        const business = { ...state.businesses.get(id), ...changes, updated_at: now() };
        state.businesses.set(id, business);
        return business;
      }
    },
    products: {
      async list(ctx, businessId, { activo, q } = {}) {
        return state.products
          .filter(p => p.business_id === businessId && isMember(ctx.userId, businessId))
          .filter(p => activo === undefined || p.activo === activo)
          .filter(p => !q || p.nombre_normalizado.includes(normalizeName(q)))
          .map(productView);
      },
      async get(ctx, businessId, id) {
        const product = state.products.find(p => p.id === id && p.business_id === businessId && isMember(ctx.userId, businessId));
        return product ? productView(product) : null;
      },
      async create(_ctx, businessId, { nombre, precio_actual_centavos }) {
        const nombre_normalizado = normalizeName(nombre);
        if (state.products.some(p => p.business_id === businessId && p.nombre_normalizado === nombre_normalizado)) {
          throw conflict('PRODUCT_EXISTS', 'Ya tienes un producto con ese nombre.');
        }
        const product = { id: randomUUID(), business_id: businessId, nombre, nombre_normalizado, precio_actual_centavos,
          activo: true, created_at: now(), updated_at: now() };
        state.products.push(product);
        return productView(product);
      },
      async update(_ctx, businessId, id, changes) {
        const product = state.products.find(p => p.id === id && p.business_id === businessId);
        if (!product) throw notFound('No encontramos ese producto.');
        Object.assign(product, changes, changes.nombre ? { nombre_normalizado: normalizeName(changes.nombre) } : {});
        return productView(product);
      },
      async setPrice(args) {
        state.calls.push({ method: 'setPrice', args });
        const product = state.products.find(p => p.id === args.productId && p.business_id === args.businessId);
        if (!product) throw notFound('No encontramos ese producto.');
        state.history.push({ product_id: product.id, precio_anterior_centavos: product.precio_actual_centavos,
          precio_nuevo_centavos: args.precioCentavos, origen: args.origen, changed_by: args.actorId, created_at: now() });
        product.precio_actual_centavos = args.precioCentavos;
        return productView(product);
      },
      async priceHistory(_ctx, _businessId, productId) {
        return state.history.filter(h => h.product_id === productId).map(({ product_id: _p, ...rest }) => rest);
      }
    },
    sales: {
      async list(ctx, businessId, { estado, limit = 20 } = {}) {
        const items = state.sales.filter(s => s.business_id === businessId && isMember(ctx.userId, businessId))
          .filter(s => !estado || s.estado_pago === estado).slice(0, limit);
        return { items, next_cursor: null };
      },
      async get(ctx, businessId, id) {
        return state.sales.find(s => s.id === id && s.business_id === businessId && isMember(ctx.userId, businessId)) ?? null;
      }
    }
  };
  return { repos, state };
}

export async function startApp({ repos, jwks, rateLimitPerMinute = 1000, jwtSecret = null, corsOrigins = [] } = {}) {
  const config = { trustProxy: 0, corsOrigins, rateLimitPerMinute };
  const app = createApp({
    config,
    logger: createLogger({ level: 'silent' }),
    repos,
    verifyToken: createTokenVerifier({ issuer: ISSUER, jwks, jwtSecret }),
    createUserDb: () => ({})
  });
  const server = await new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  async function request(method, path, { token, body, headers = {} } = {}) {
    const response = await fetch(base + path, {
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...headers
      },
      body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body))
    });
    const text = await response.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    return { status: response.status, body: json, headers: response.headers };
  }

  return { base, request, close: () => new Promise(resolve => server.close(resolve)) };
}
