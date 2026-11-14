// Configuración validada al arrancar: si falta algo, el proceso termina con un mensaje claro.
import { z } from 'zod';

const csv = z.string().default('').transform(value =>
  value.split(',').map(item => item.trim()).filter(Boolean));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().default('127.0.0.1'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  // Saltos de proxy de confianza (Netlify + Tailscale Funnel = 2) para obtener la IP real del cliente.
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
  // Orígenes permitidos para CORS. En producción el frontend llega por el proxy de Netlify (mismo origen).
  CORS_ORIGINS: csv,
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(10).max(10000).default(120),

  SUPABASE_URL: z.url().transform(value => value.replace(/\/+$/, '')),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  SUPABASE_SECRET_KEY: z.string().min(20),
  // Solo para proyectos que aún firman JWT con el secreto compartido (HS256, esquema legado).
  SUPABASE_JWT_SECRET: z.string().min(32).optional()
});

export function loadConfig(source = process.env) {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues.map(issue => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n');
    throw new Error(`Configuración inválida. Revisa backend/.env:\n${problems}`);
  }
  const env = parsed.data;
  return Object.freeze({
    env: env.NODE_ENV,
    port: env.PORT,
    host: env.HOST,
    logLevel: env.LOG_LEVEL,
    trustProxy: env.TRUST_PROXY,
    corsOrigins: env.CORS_ORIGINS,
    rateLimitPerMinute: env.RATE_LIMIT_PER_MINUTE,
    supabase: Object.freeze({
      url: env.SUPABASE_URL,
      publishableKey: env.SUPABASE_PUBLISHABLE_KEY,
      secretKey: env.SUPABASE_SECRET_KEY,
      jwtSecret: env.SUPABASE_JWT_SECRET ?? null,
      issuer: `${env.SUPABASE_URL}/auth/v1`,
      jwksUrl: `${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`
    })
  });
}
