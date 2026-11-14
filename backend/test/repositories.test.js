// Verifica las consultas que los repositorios construyen con supabase-js, sin red:
// un doble registra cada llamada del query builder y devuelve resultados preparados.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { AppError } from '../src/lib/errors.js';
import { createSupabaseRepositories, decodeCursor, encodeCursor } from '../src/repositories/supabase.js';

const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BUSINESS = '11111111-1111-4111-8111-111111111111';
const PRODUCT = '22222222-2222-4222-8222-222222222222';

function recorder(results = []) {
  const queries = [];
  const chain = first => {
    const calls = [first];
    queries.push(calls);
    const proxy = new Proxy({}, {
      get(_target, prop) {
        if (prop === 'then') {
          const result = results.shift() ?? { data: null, error: null };
          return (resolve, reject) => Promise.resolve(result).then(resolve, reject);
        }
        return (...args) => { calls.push([prop, ...args]); return proxy; };
      }
    });
    return proxy;
  };
  return {
    queries,
    db: { from: table => chain(['from', table]) },
    service: { rpc: (name, args) => chain(['rpc', name, args]) }
  };
}

const has = (calls, ...expected) => calls.some(call => JSON.stringify(call) === JSON.stringify(expected));

describe('repositorios Supabase', () => {
  test('membresía: filtra por negocio y por el usuario del contexto', async () => {
    const r = recorder([{ data: { role: 'admin' }, error: null }]);
    const repos = createSupabaseRepositories({ service: r.service });
    assert.equal(await repos.memberships.getRole({ db: r.db, userId: OWNER }, BUSINESS), 'admin');
    const [calls] = r.queries;
    assert.ok(has(calls, 'from', 'business_members'));
    assert.ok(has(calls, 'eq', 'business_id', BUSINESS));
    assert.ok(has(calls, 'eq', 'user_id', OWNER));
  });

  test('crear negocio usa owner_id del contexto aunque el objeto traiga otro', async () => {
    const r = recorder([{ data: { id: BUSINESS }, error: null }]);
    const repos = createSupabaseRepositories({ service: r.service });
    await repos.businesses.create({ db: r.db, userId: OWNER }, { nombre: 'Tacos', owner_id: 'otro' });
    const insert = r.queries[0].find(call => call[0] === 'insert');
    assert.deepEqual(insert[1], { owner_id: OWNER, nombre: 'Tacos', tipo_negocio: null });
  });

  test('catálogo: siempre acota por business_id y busca sobre el nombre normalizado', async () => {
    const r = recorder([{ data: [], error: null }]);
    const repos = createSupabaseRepositories({ service: r.service });
    await repos.products.list({ db: r.db, userId: OWNER }, BUSINESS, { activo: true, q: 'Café ' });
    const [calls] = r.queries;
    assert.ok(has(calls, 'eq', 'business_id', BUSINESS));
    assert.ok(has(calls, 'eq', 'activo', true));
    assert.ok(has(calls, 'ilike', 'nombre_normalizado', '%cafe%'));
  });

  test('actualizar producto acota por negocio e id; 0 filas es 404', async () => {
    const r = recorder([{ data: null, error: null }]);
    const repos = createSupabaseRepositories({ service: r.service });
    await assert.rejects(
      repos.products.update({ db: r.db, userId: OWNER }, BUSINESS, PRODUCT, { activo: false }),
      error => error instanceof AppError && error.status === 404
    );
    const [calls] = r.queries;
    assert.ok(has(calls, 'eq', 'business_id', BUSINESS));
    assert.ok(has(calls, 'eq', 'id', PRODUCT));
  });

  test('cambio de precio llama a la función de servicio con el actor indicado', async () => {
    const row = { id: PRODUCT, nombre: 'Tacos', precio_actual_centavos: 2500, activo: true, business_id: BUSINESS,
      nombre_normalizado: 'tacos', created_at: 'x', updated_at: 'y' };
    const r = recorder([{ data: row, error: null }]);
    const repos = createSupabaseRepositories({ service: r.service });
    const result = await repos.products.setPrice({ businessId: BUSINESS, productId: PRODUCT, actorId: OWNER, precioCentavos: 2500, origen: 'voz' });
    assert.deepEqual(r.queries[0][0], ['rpc', 'set_product_price', {
      p_product_id: PRODUCT, p_business_id: BUSINESS, p_actor_id: OWNER, p_new_price_centavos: 2500, p_origen: 'voz'
    }]);
    assert.equal(result.business_id, undefined, 'no expone columnas internas');
    assert.equal(result.nombre_normalizado, undefined);
  });

  test('traducción de errores de PostgreSQL', async () => {
    const cases = [
      [{ code: '23505', message: 'duplicate key' }, 409, 'PRODUCT_EXISTS'],
      [{ code: '42501', message: 'new row violates row-level security policy' }, 403, 'FORBIDDEN'],
      [{ code: 'XX000', message: 'detalle interno de la base' }, 500, 'INTERNAL_ERROR']
    ];
    for (const [error, status, code] of cases) {
      const r = recorder([{ data: null, error }]);
      const repos = createSupabaseRepositories({ service: r.service });
      await assert.rejects(
        repos.products.create({ db: r.db, userId: OWNER }, BUSINESS, { nombre: 'Tacos', precio_actual_centavos: 100 }),
        e => e instanceof AppError && e.status === status && e.code === code && !e.message.includes('detalle interno'),
        code
      );
    }
  });

  test('ventas: paginación por cursor estable (created_at, id)', async () => {
    const rows = [3, 2, 1].map(n => ({
      id: `0000000${n}-0000-4000-8000-000000000000`,
      created_at: `2026-11-15T18:0${n}:00.123456+00:00`,
      sale_items: [{ posicion: 1, nombre_producto_snapshot: 'b' }, { posicion: 0, nombre_producto_snapshot: 'a' }]
    }));
    const r = recorder([{ data: rows, error: null }, { data: [], error: null }]);
    const repos = createSupabaseRepositories({ service: r.service });
    const ctx = { db: r.db, userId: OWNER };

    const first = await repos.sales.list(ctx, BUSINESS, { limit: 2, estado: 'PAID' });
    assert.equal(first.items.length, 2);
    assert.deepEqual(first.items[0].sale_items.map(i => i.nombre_producto_snapshot), ['a', 'b'], 'partidas ordenadas');
    assert.ok(first.next_cursor);
    assert.ok(has(r.queries[0], 'eq', 'business_id', BUSINESS));
    assert.ok(has(r.queries[0], 'eq', 'estado_pago', 'PAID'));
    assert.ok(has(r.queries[0], 'limit', 3), 'pide una fila extra para saber si hay más');

    await repos.sales.list(ctx, BUSINESS, { limit: 2, cursor: first.next_cursor });
    const orFilter = r.queries[1].find(call => call[0] === 'or');
    assert.equal(orFilter[1],
      'created_at.lt."2026-11-15T18:02:00.123456+00:00",and(created_at.eq."2026-11-15T18:02:00.123456+00:00",id.lt.00000002-0000-4000-8000-000000000000)');
  });

  test('cursor manipulado se rechaza', async () => {
    const forged = Buffer.from(JSON.stringify({ t: '2026-01-01",id.gt.0', id: 'x' })).toString('base64url');
    assert.equal(decodeCursor(forged), null);
    assert.equal(decodeCursor('no-es-base64-json'), null);
    const good = encodeCursor({ created_at: '2026-11-15T18:00:00+00:00', id: '00000001-0000-4000-8000-000000000000' });
    assert.deepEqual(decodeCursor(good), { t: '2026-11-15T18:00:00+00:00', id: '00000001-0000-4000-8000-000000000000' });

    const r = recorder();
    const repos = createSupabaseRepositories({ service: r.service });
    await assert.rejects(repos.sales.list({ db: r.db, userId: OWNER }, BUSINESS, { cursor: forged }),
      e => e instanceof AppError && e.status === 400);
  });
});
