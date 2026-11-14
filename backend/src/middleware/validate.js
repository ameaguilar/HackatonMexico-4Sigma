import { badRequest } from '../lib/errors.js';

// Valida body/query/params con un esquema zod y deja el resultado en req.valid.
// (En Express 5 req.query es de solo lectura, por eso no se sobrescribe.)
export function validate(schemas) {
  return (req, _res, next) => {
    req.valid ??= {};
    for (const [part, schema] of Object.entries(schemas)) {
      const result = schema.safeParse(req[part] ?? {});
      if (!result.success) {
        const details = result.error.issues.map(issue => ({
          field: issue.path.join('.') || part,
          message: issue.message
        }));
        throw badRequest('Revisa los datos enviados.', details);
      }
      req.valid[part] = result.data;
    }
    next();
  };
}
