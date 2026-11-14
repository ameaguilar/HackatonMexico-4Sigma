// Punto de entrada: arma las dependencias reales y levanta el servidor HTTP.
import { createApp } from './app.js';
import { loadConfig } from './config/env.js';
import { createSupabaseClients } from './integrations/supabase/clients.js';
import { createTokenVerifier, remoteJwks } from './integrations/supabase/token-verifier.js';
import { createLogger } from './lib/logger.js';
import { createSupabaseRepositories } from './repositories/supabase.js';

let config;
try {
  config = loadConfig();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const logger = createLogger({ level: config.logLevel });
const supabase = createSupabaseClients(config.supabase);
const app = createApp({
  config,
  logger,
  repos: createSupabaseRepositories({ service: supabase.service }),
  verifyToken: createTokenVerifier({
    issuer: config.supabase.issuer,
    jwks: remoteJwks(config.supabase.jwksUrl),
    jwtSecret: config.supabase.jwtSecret
  }),
  createUserDb: token => supabase.forUser(token)
});

const server = app.listen(config.port, config.host, () => {
  logger.info({ host: config.host, port: config.port, env: config.env }, 'CobraVoz backend escuchando');
});
server.headersTimeout = 15_000;
server.requestTimeout = 30_000;

function shutdown(signal) {
  logger.info({ signal }, 'Cerrando servidor');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', error => logger.error({ err: error }, 'Promesa rechazada sin manejar'));
