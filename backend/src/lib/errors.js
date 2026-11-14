// Errores de aplicación con código estable para el frontend y mensaje en español para el comerciante.

export class AppError extends Error {
  constructor(status, code, message, { details, cause } = {}) {
    super(message, { cause });
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message, details) => new AppError(400, 'VALIDATION_ERROR', message, { details });
export const unauthenticated = (message = 'Inicia sesión para continuar.') => new AppError(401, 'UNAUTHENTICATED', message);
export const forbidden = (message = 'Tu rol no permite esta acción.') => new AppError(403, 'FORBIDDEN', message);
export const notFound = (message = 'No encontramos lo que buscas.') => new AppError(404, 'NOT_FOUND', message);
export const conflict = (code, message) => new AppError(409, code, message);

// Traduce errores de PostgreSQL / PostgREST (supabase-js) sin exponer detalles internos.
export function fromDatabaseError(error, fallbackMessage = 'No se pudo completar la operación.') {
  if (!error) return null;
  if (error instanceof AppError) return error;
  const code = error.code;
  const message = String(error.message || '');
  if (code === 'PGRST116') return notFound();
  if (code === '23505') return conflict('ALREADY_EXISTS', 'Ya existe un registro con esos datos.');
  if (code === '23503' || code === 'P0002') return notFound();
  if (code === '42501') {
    // RLS al insertar/actualizar o privilegio de columna revocado.
    return forbidden();
  }
  if (code === '23514' || code === '22P02' || code === '22003') {
    return badRequest('Los datos no cumplen las reglas del negocio.');
  }
  return new AppError(500, 'INTERNAL_ERROR', fallbackMessage, { cause: Object.assign(new Error(message), { code }) });
}
