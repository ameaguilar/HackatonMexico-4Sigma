// Prueba de integración contra un proyecto REAL de Supabase (opt-in).
//
//   cd backend && npm run test:integration
//
// Requiere backend/.env con SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY y SUPABASE_SECRET_KEY,
// las migraciones aplicadas (supabase db push) y el proveedor Email habilitado en Auth.
// Crea dos usuarios temporales (correo @cobravoz.test), un negocio y productos; al final los elimina.
// NO crea ventas ni llama a Pey.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/env.js';
import { createSupabaseClients } from '../../src/integrations/supabase/clients.js';
import { createTokenVerifier, remoteJwks } from '../../src/integrations/supabase/token-verifier.js';
import { createLogger } from '../../src/lib/logger.js';
import { createSupabaseRepositories } from '../../src/repositories/supabase.js';

const config = loadConfig();
const clients = createSupabaseClients(config.supabase);
const admin = clients.service;
const runId = randomUUID().slice(0, 8);
const created = { users: [], businesses: [] };

async function createUserAndToken(label) {
  const email = `integracion-${label}-${runId}@cobravoz.test`;
  const password = `Pw-${randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`No se pudo crear el usuario de prueba (${label}): ${error.message}`);
  created.users.push(data.user.id);
  const anon = createClient(config.supabase.url, config.supabase.publishableKey, { auth: { persistSession: false } });
  const session = await anon.auth.signInWithPassword({ email, password });
  if (session.error) throw new Error(`No se pudo iniciar sesión (${label}): ${session.error.message}. ¿Está habilitado el proveedor Email?`);
  return { id: data.user.id, token: session.data.session.access_token };
}

describe('integración con Supabase real', () => {
  let server;
  let base;
  let owner;
  let cashier;
  let stranger;
  let businessId;
  let productId;

  const call = async (method, path, token, body) => {
    const response = await fetch(base + path, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  };

  before(async () => {
    [owner, cashier, stranger] = await Promise.all(['owner', 'cashier', 'stranger'].map(createUserAndToken));
    const app = createApp({
      config: { trustProxy: 0, corsOrigins: [], rateLimitPerMinute: 1000 },
      logger: createLogger({ level: 'silent' }),
      repos: createSupabaseRepositories({ service: admin }),
      verifyToken: createTokenVerifier({
        issuer: config.supabase.issuer,
        jwks: remoteJwks(config.supabase.jwksUrl),
        jwtSecret: config.supabase.jwtSecret
      }),
      createUserDb: token => clients.forUser(token)
    });
    server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    server?.close();
    // Orden: negocios (cascada a miembros, productos e historial) y después usuarios.
    for (const id of created.businesses) await admin.from('businesses').delete().eq('id', id);
    for (const id of created.users) await admin.auth.admin.deleteUser(id);
  });

  test('el JWT real se verifica y /me responde', async () => {
    const res = await call('GET', '/api/me', owner.token);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.user.id, owner.id);
  });

  test('crear negocio (INSERT ... RETURNING bajo RLS)', async () => {
    const res = await call('POST', '/api/businesses', owner.token, { nombre: `Integración ${runId}` });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    businessId = res.body.id;
    created.businesses.push(businessId);
    // El equipo se administra desde el backend (aún sin endpoint); aquí se agrega el cajero con service role.
    const { error } = await admin.from('business_members').insert({ business_id: businessId, user_id: cashier.id, role: 'cashier' });
    assert.equal(error, null);
  });

  test('producto, cambio de precio por voz e historial', async () => {
    const createdProduct = await call('POST', `/api/businesses/${businessId}/products`, owner.token, { nombre: 'Tacos', precio_actual_centavos: 2000 });
    assert.equal(createdProduct.status, 201, JSON.stringify(createdProduct.body));
    productId = createdProduct.body.id;

    const duplicate = await call('POST', `/api/businesses/${businessId}/products`, owner.token, { nombre: 'TACOS', precio_actual_centavos: 100 });
    assert.equal(duplicate.status, 409);

    const price = await call('PUT', `/api/businesses/${businessId}/products/${productId}/price`, owner.token, { precio_centavos: 2500, origen: 'voz' });
    assert.equal(price.status, 200, JSON.stringify(price.body));
    assert.equal(price.body.precio_actual_centavos, 2500);

    const history = await call('GET', `/api/businesses/${businessId}/products/${productId}/price-history`, cashier.token);
    assert.equal(history.status, 200);
    assert.deepEqual(history.body.items.map(h => [h.origen, h.precio_nuevo_centavos]), [['voz', 2500], ['alta', 2000]]);
    assert.equal(history.body.items[0].changed_by, owner.id);
  });

  test('el cajero lee pero no modifica', async () => {
    const list = await call('GET', `/api/businesses/${businessId}/products?q=taco`, cashier.token);
    assert.equal(list.status, 200);
    assert.equal(list.body.items.length, 1);
    const denied = await call('PUT', `/api/businesses/${businessId}/products/${productId}/price`, cashier.token, { precio_centavos: 1 });
    assert.equal(denied.status, 403);
  });

  test('un usuario ajeno no ve nada del negocio (404), ni directo en la base con su JWT', async () => {
    for (const path of ['', '/products', '/sales', `/products/${productId}/price-history`]) {
      const res = await call('GET', `/api/businesses/${businessId}${path}`, stranger.token);
      assert.equal(res.status, 404, path);
    }
    const db = clients.forUser(stranger.token);
    const { data } = await db.from('products').select('id').eq('business_id', businessId);
    assert.deepEqual(data, [], 'RLS bloquea la lectura directa');
    const { error } = await db.from('sales').insert({ business_id: businessId });
    assert.ok(error, 'RLS/privilegios bloquean insertar ventas directamente');
  });

  test('historial de ventas vacío y paginable', async () => {
    const res = await call('GET', `/api/businesses/${businessId}/sales?limit=5`, owner.token);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body, { items: [], next_cursor: null });
  });
});
