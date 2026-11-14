import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { MAX_OWNED_BUSINESSES } from '../src/controllers/account.js';
import { USERS, createKeys, createMemoryRepos, startApp } from './helpers.js';

describe('API de cuenta, negocios, catálogo y ventas', () => {
  let app;
  let state;
  let tokens;
  let businessId;
  let tacosId;

  before(async () => {
    const keys = await createKeys();
    const memory = createMemoryRepos();
    state = memory.state;
    app = await startApp({ repos: memory.repos, jwks: keys.jwks });
    tokens = {
      owner: await keys.token(USERS.owner),
      cashier: await keys.token(USERS.cashier),
      stranger: await keys.token(USERS.stranger)
    };
  });
  after(() => app.close());

  test('crear negocio deja al usuario del token como dueño', async () => {
    const res = await app.request('POST', '/api/businesses', { token: tokens.owner, body: { nombre: '  Tacos   Juanita ', tipo_negocio: 'puesto' } });
    assert.equal(res.status, 201);
    assert.equal(res.body.nombre, 'Tacos Juanita');
    assert.equal(res.body.role, 'owner');
    businessId = res.body.id;
    state.members.push({ business_id: businessId, user_id: USERS.cashier, role: 'cashier' });
  });

  test('no se puede fijar owner_id desde el cliente (campo desconocido)', async () => {
    const res = await app.request('POST', '/api/businesses', { token: tokens.owner, body: { nombre: 'Otro', owner_id: USERS.stranger } });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    assert.ok(res.body.error.details.some(d => d.message.includes('owner_id')));
  });

  test('JSON malformado responde 400', async () => {
    const res = await app.request('POST', '/api/businesses', { token: tokens.owner, body: '{"nombre":' });
    assert.equal(res.status, 400);
  });

  test('GET /me lista los negocios con su rol', async () => {
    const res = await app.request('GET', '/api/me', { token: tokens.cashier });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.businesses.map(b => [b.id, b.role]), [[businessId, 'cashier']]);
  });

  test('PATCH /me guarda el perfil propio', async () => {
    const res = await app.request('PATCH', '/api/me', { token: tokens.owner, body: { nombre_completo: 'Juana López', telefono: '5512345678' } });
    assert.equal(res.status, 200);
    assert.equal(res.body.id, USERS.owner);
    const bad = await app.request('PATCH', '/api/me', { token: tokens.owner, body: { telefono: '+52 55' } });
    assert.equal(bad.status, 400);
  });

  test('un usuario ajeno recibe 404 (no se revela que el negocio existe)', async () => {
    for (const path of ['', '/products', '/sales']) {
      const res = await app.request('GET', `/api/businesses/${businessId}${path}`, { token: tokens.stranger });
      assert.equal(res.status, 404, path);
    }
    const notUuid = await app.request('GET', '/api/businesses/123/products', { token: tokens.owner });
    assert.equal(notUuid.status, 404);
  });

  test('el dueño crea productos; el cajero no', async () => {
    const created = await app.request('POST', `/api/businesses/${businessId}/products`, {
      token: tokens.owner, body: { nombre: 'Tacos', precio_actual_centavos: 2000 }
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.precio_actual_centavos, 2000);
    assert.equal(created.body.business_id, undefined, 'no expone columnas internas');
    tacosId = created.body.id;

    const denied = await app.request('POST', `/api/businesses/${businessId}/products`, {
      token: tokens.cashier, body: { nombre: 'Agua', precio_actual_centavos: 1500 }
    });
    assert.equal(denied.status, 403);
    assert.equal(denied.body.error.code, 'FORBIDDEN');
  });

  test('validación de precios: enteros en centavos dentro del rango', async () => {
    for (const precio of [20.5, 0, -100, 100_000_000, '2000']) {
      const res = await app.request('POST', `/api/businesses/${businessId}/products`, {
        token: tokens.owner, body: { nombre: 'Prueba', precio_actual_centavos: precio }
      });
      assert.equal(res.status, 400, `precio ${precio}`);
    }
  });

  test('producto duplicado (sin importar acentos ni mayúsculas) responde 409', async () => {
    const res = await app.request('POST', `/api/businesses/${businessId}/products`, {
      token: tokens.owner, body: { nombre: 'TACOS', precio_actual_centavos: 1000 }
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'PRODUCT_EXISTS');
  });

  test('el cajero consulta el catálogo con búsqueda sin acentos', async () => {
    await app.request('POST', `/api/businesses/${businessId}/products`, {
      token: tokens.owner, body: { nombre: 'Café de olla', precio_actual_centavos: 2500 }
    });
    const res = await app.request('GET', `/api/businesses/${businessId}/products?q=cafe`, { token: tokens.cashier });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.items.map(p => p.nombre), ['Café de olla']);
    const injection = await app.request('GET', `/api/businesses/${businessId}/products?q=${encodeURIComponent('a%,id.eq.1')}`, { token: tokens.cashier });
    assert.equal(injection.status, 400, 'la búsqueda no acepta sintaxis de filtros');
  });

  test('PATCH de producto no permite cambiar el precio (debe usarse /price)', async () => {
    const res = await app.request('PATCH', `/api/businesses/${businessId}/products/${tacosId}`, {
      token: tokens.owner, body: { precio_actual_centavos: 1 }
    });
    assert.equal(res.status, 400);
    const ok = await app.request('PATCH', `/api/businesses/${businessId}/products/${tacosId}`, {
      token: tokens.owner, body: { activo: false }
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.activo, false);
  });

  test('cambio de precio usa al usuario del token como autor y conserva el historial', async () => {
    const res = await app.request('PUT', `/api/businesses/${businessId}/products/${tacosId}/price`, {
      token: tokens.owner, body: { precio_centavos: 2500, origen: 'voz' }
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.precio_actual_centavos, 2500);
    const call = state.calls.find(c => c.method === 'setPrice');
    assert.deepEqual(call.args, { businessId, productId: tacosId, actorId: USERS.owner, precioCentavos: 2500, origen: 'voz' });

    const spoof = await app.request('PUT', `/api/businesses/${businessId}/products/${tacosId}/price`, {
      token: tokens.owner, body: { precio_centavos: 2600, actor_id: USERS.cashier }
    });
    assert.equal(spoof.status, 400, 'no se acepta un autor enviado por el cliente');

    const cashier = await app.request('PUT', `/api/businesses/${businessId}/products/${tacosId}/price`, {
      token: tokens.cashier, body: { precio_centavos: 100 }
    });
    assert.equal(cashier.status, 403);

    const history = await app.request('GET', `/api/businesses/${businessId}/products/${tacosId}/price-history`, { token: tokens.cashier });
    assert.equal(history.status, 200);
    assert.equal(history.body.items[0].precio_anterior_centavos, 2000);
    assert.equal(history.body.items[0].origen, 'voz');
  });

  test('producto inexistente responde 404', async () => {
    const res = await app.request('GET', `/api/businesses/${businessId}/products/${randomUUID()}/price-history`, { token: tokens.owner });
    assert.equal(res.status, 404);
  });

  test('historial de ventas: filtros válidos e inválidos', async () => {
    state.sales.push({ id: randomUUID(), business_id: businessId, total_centavos: 5800, estado_pago: 'PAID', sale_items: [] });
    const res = await app.request('GET', `/api/businesses/${businessId}/sales?estado=PAID&limit=10`, { token: tokens.cashier });
    assert.equal(res.status, 200);
    assert.equal(res.body.items.length, 1);
    for (const query of ['estado=PAGADO', 'limit=500', 'desde=ayer', 'cursor=%7B%7D']) {
      const bad = await app.request('GET', `/api/businesses/${businessId}/sales?${query}`, { token: tokens.cashier });
      assert.equal(bad.status, 400, query);
    }
    const missing = await app.request('GET', `/api/businesses/${businessId}/sales/${randomUUID()}`, { token: tokens.owner });
    assert.equal(missing.status, 404);
  });

  test('solo dueño o admin editan el negocio', async () => {
    const denied = await app.request('PATCH', `/api/businesses/${businessId}`, { token: tokens.cashier, body: { nombre: 'Cambiado' } });
    assert.equal(denied.status, 403);
    const ok = await app.request('PATCH', `/api/businesses/${businessId}`, { token: tokens.owner, body: { nombre: 'Tacos Juanita Centro' } });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.nombre, 'Tacos Juanita Centro');
  });

  test(`límite de ${MAX_OWNED_BUSINESSES} negocios propios por usuario`, async () => {
    for (let i = 0; i < MAX_OWNED_BUSINESSES; i++) {
      await app.request('POST', '/api/businesses', { token: tokens.stranger, body: { nombre: `Negocio ${i}` } });
    }
    const res = await app.request('POST', '/api/businesses', { token: tokens.stranger, body: { nombre: 'Uno más' } });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'BUSINESS_LIMIT');
  });

  test('ruta inexistente responde 404 con formato uniforme', async () => {
    const res = await app.request('GET', '/api/no-existe', { token: tokens.owner });
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'NOT_FOUND');
  });
});
