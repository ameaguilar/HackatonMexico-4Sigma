import { AppError } from '../lib/errors.js';

// Respuesta de error uniforme: { error: { code, message, request_id, details? } }.
// Los errores inesperados se registran completos pero al cliente solo llega un mensaje genérico.
export function errorHandler() {
  return (error, req, res, _next) => {
    let appError = error;
    if (!(error instanceof AppError)) {
      if (error?.type === 'entity.parse.failed') {
        appError = new AppError(400, 'VALIDATION_ERROR', 'El cuerpo de la petición no es JSON válido.');
      } else if (error?.type === 'entity.too.large') {
        appError = new AppError(413, 'PAYLOAD_TOO_LARGE', 'La petición es demasiado grande.');
      } else {
        appError = new AppError(500, 'INTERNAL_ERROR', 'Ocurrió un error inesperado. Intenta de nuevo.', { cause: error });
      }
    }

    if (appError.status >= 500) {
      req.log?.error({ err: appError.cause ?? appError, code: appError.code }, 'error');
    }

    if (res.headersSent) return;
    res.status(appError.status).json({
      error: {
        code: appError.code,
        message: appError.message,
        request_id: req.id,
        ...(appError.details ? { details: appError.details } : {})
      }
    });
  };
}
