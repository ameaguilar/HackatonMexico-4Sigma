import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { SignJWT, generateKeyPair } from 'jose';
import { JWT_SECRET, USERS, createKeys, createMemoryRepos, startApp } from './helpers.js';

describe('autenticación con JWT de Supabase', () => {
  let keys;
  let app;

  before(async () => {
    keys = await createKeys();
    app = await startApp({ repos: createMemoryRepos().repos, jwks: keys.jwks });
  });
  after(() => app.close());

  test('/api/health es público', async () => {
    const res = await app.request('GET', '/api/health');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { status: 'ok', version: '0.1.0' });
  });

  test('sin token responde 401 con formato de error uniforme y request_id', async () => {
    const res = await app.request('GET', '/api/me');
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'UNAUTHENTICATED');
    assert.equal(res.body.error.request_id, res.headers.get('x-request-id'));
  });

  test('token válido identifica al usuario por el claim sub', async () => {
    const res = await app.request('GET', '/api/me', { token: await keys.token(USERS.owner) });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.id, USERS.owner);
    assert.equal(res.body.user.phone, '525512345678');
  });

  const rejected = [
    ['firma de otra llave', async () => {
      const other = await generateKeyPair('ES256');
      return keys.token(USERS.owner, { key: other.privateKey });
    }],
    ['token expirado', () => keys.token(USERS.owner, { exp: Math.floor(Date.now() / 1000) - 60 })],
    ['emisor distinto', () => keys.token(USERS.owner, { iss: 'https://otro-proyecto.supabase.co/auth/v1' })],
    ['audiencia distinta', () => keys.token(USERS.owner, { aud: 'anon' })],
    ['rol anon', () => keys.token(USERS.owner, { claims: { role: 'anon' } })],
    ['usuario anónimo', () => keys.token(USERS.owner, { claims: { is_anonymous: true } })],
    ['sub que no es UUID', () => keys.token('admin')],
    ['HS256 sin secreto configurado', () => new SignJWT({ role: 'authenticated' })
      .setProtectedHeader({ alg: 'HS256' }).setIssuer('https://test-project.supabase.co/auth/v1')
      .setAudience('authenticated').setSubject(USERS.owner).setExpirationTime('1h')
      .sign(new TextEncoder().encode(JWT_SECRET))],
    ['alg none', async () => {
      const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({ sub: USERS.owner, role: 'authenticated' })).toString('base64url');
      return `${header}.${payload}.firma`;
    }],
    ['texto que no es JWT', async () => 'no-es-un-token.abc.def']
  ];

  for (const [name, makeToken] of rejected) {
    test(`rechaza: ${name}`, async () => {
      const res = await app.request('GET', '/api/me', { token: await makeToken() });
      assert.equal(res.status, 401, JSON.stringify(res.body));
      assert.equal(res.body.error.code, 'UNAUTHENTICATED');
    });
  }

  test('acepta HS256 cuando el proyecto usa el JWT secret legado', async () => {
    const legacy = await startApp({ repos: createMemoryRepos().repos, jwks: keys.jwks, jwtSecret: JWT_SECRET });
    try {
      const token = await new SignJWT({ role: 'authenticated' })
        .setProtectedHeader({ alg: 'HS256' }).setIssuer('https://test-project.supabase.co/auth/v1')
        .setAudience('authenticated').setSubject(USERS.owner).setExpirationTime('1h')
        .sign(new TextEncoder().encode(JWT_SECRET));
      const res = await legacy.request('GET', '/api/me', { token });
      assert.equal(res.status, 200);
    } finally {
      await legacy.close();
    }
  });

  test('límite de solicitudes por usuario responde 429', async () => {
    const limited = await startApp({ repos: createMemoryRepos().repos, jwks: keys.jwks, rateLimitPerMinute: 10 });
    try {
      const token = await keys.token(USERS.owner);
      const statuses = [];
      for (let i = 0; i < 12; i++) statuses.push((await limited.request('GET', '/api/me', { token })).status);
      assert.deepEqual(statuses.slice(0, 10), Array(10).fill(200));
      assert.equal(statuses[11], 429);
    } finally {
      await limited.close();
    }
  });

  test('CORS solo para orígenes permitidos', async () => {
    const withCors = await startApp({ repos: createMemoryRepos().repos, jwks: keys.jwks, corsOrigins: ['http://localhost:8000'] });
    try {
      const ok = await withCors.request('OPTIONS', '/api/me', { headers: { origin: 'http://localhost:8000' } });
      assert.equal(ok.status, 204);
      assert.equal(ok.headers.get('access-control-allow-origin'), 'http://localhost:8000');
      const denied = await withCors.request('OPTIONS', '/api/me', { headers: { origin: 'https://sitio-malicioso.example' } });
      assert.equal(denied.status, 403);
      assert.equal(denied.headers.get('access-control-allow-origin'), null);
    } finally {
      await withCors.close();
    }
  });
});
