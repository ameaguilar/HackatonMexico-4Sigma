// Esquemas de entrada. Objetos estrictos: un campo desconocido (p. ej. owner_id, business_id, user_id)
// se rechaza en lugar de ignorarse, para que nadie crea que puede fijar identidades desde el cliente.
import { z } from 'zod';

// Mensajes de validación en español para los errores genéricos de zod.
z.config(z.locales.es());

export const MAX_CENTAVOS = 99_999_999;
export const SALE_STATUSES = ['CREATED', 'QR_GENERATED', 'PENDING', 'PAID', 'EXPIRED', 'CANCELLED', 'FAILED'];

const cleanText = (min, max) => z.string()
  .transform(value => value.replace(/\s+/g, ' ').trim())
  .pipe(z.string().min(min, `Debe tener al menos ${min} caracteres`).max(max, `Debe tener como máximo ${max} caracteres`));

const centavos = z.number({ error: 'Debe ser un número entero de centavos' })
  .int('Debe ser un número entero de centavos')
  .min(1, 'Debe ser mayor a cero')
  .max(MAX_CENTAVOS, 'Supera el máximo permitido ($999,999.99)');

// Texto de búsqueda: letras, números y espacios. Evita comodines y sintaxis de filtros de PostgREST.
const searchText = z.string().trim().min(1).max(40)
  .regex(/^[\p{L}\p{N} ]+$/u, 'Solo letras, números y espacios');

const atLeastOne = object => Object.keys(object).length > 0;

export const uuidParam = z.object({ id: z.uuid('Identificador inválido') }).loose();

export const profileUpdate = z.strictObject({
  nombre_completo: cleanText(1, 120).optional(),
  telefono: z.string().regex(/^[0-9]{10}$/, 'Celular de 10 dígitos').optional()
}).refine(atLeastOne, 'Envía al menos un campo');

export const businessCreate = z.strictObject({
  nombre: cleanText(2, 70),
  tipo_negocio: cleanText(1, 60).nullable().optional()
});

export const businessUpdate = z.strictObject({
  nombre: cleanText(2, 70).optional(),
  tipo_negocio: cleanText(1, 60).nullable().optional()
}).refine(atLeastOne, 'Envía al menos un campo');

export const productCreate = z.strictObject({
  nombre: cleanText(1, 60),
  precio_actual_centavos: centavos
});

// El precio NO se cambia aquí: se usa PUT .../price para que quede el origen en el historial.
export const productUpdate = z.strictObject({
  nombre: cleanText(1, 60).optional(),
  activo: z.boolean().optional()
}).refine(atLeastOne, 'Envía al menos un campo');

export const priceUpdate = z.strictObject({
  precio_centavos: centavos,
  origen: z.enum(['manual', 'voz']).default('manual')
});

export const productListQuery = z.object({
  activo: z.enum(['true', 'false']).transform(value => value === 'true').optional(),
  q: searchText.optional()
});

export const salesListQuery = z.object({
  estado: z.enum(SALE_STATUSES).optional(),
  desde: z.iso.datetime({ offset: true }).optional(),
  hasta: z.iso.datetime({ offset: true }).optional(),
  q: searchText.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().max(200).regex(/^[A-Za-z0-9_-]+$/).optional()
});

// Normalización equivalente a private.normalize_name() en la base de datos.
export function normalizeName(value) {
  return String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}
