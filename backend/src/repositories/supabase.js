// Acceso a datos con supabase-js.
//
// Todas las operaciones de usuario usan ctx.db (cliente con el JWT del usuario), así RLS filtra por negocio
// aunque el backend tuviera un error. Solo set_product_price usa el cliente de servicio, porque debe registrar
// el origen del cambio ('voz' o 'manual') y es una función restringida a service_role.
import { badRequest, conflict, fromDatabaseError, notFound } from '../lib/errors.js';
import { normalizeName } from '../validators/schemas.js';

const PRODUCT_FIELDS = 'id, nombre, precio_actual_centavos, activo, created_at, updated_at';
const BUSINESS_FIELDS = 'id, nombre, tipo_negocio, moneda, created_at, updated_at';
const PROFILE_FIELDS = 'id, nombre_completo, telefono, created_at, updated_at';
const SALE_ITEM_FIELDS = 'tipo, nombre_producto_snapshot, cantidad, precio_unitario_centavos, subtotal_centavos, posicion';
const SALE_FIELDS = `id, total_centavos, moneda, concepto, origen, num_ref, estado_pago, expires_at, paid_at,
  paid_amount_centavos, cancelled_at, paid_after_close, created_at, sale_items(${SALE_ITEM_FIELDS})`;

function unwrap({ data, error }, fallbackMessage) {
  if (error) throw fromDatabaseError(error, fallbackMessage);
  return data;
}

const sortItems = sale => sale && ({
  ...sale,
  sale_items: [...(sale.sale_items ?? [])].sort((a, b) => a.posicion - b.posicion)
});

export function encodeCursor(row) {
  return Buffer.from(JSON.stringify({ t: row.created_at, id: row.id })).toString('base64url');
}

export function decodeCursor(cursor) {
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    const validTime = typeof value.t === 'string' && !Number.isNaN(Date.parse(value.t)) && /^[0-9T:.+\- ]+$/.test(value.t);
    const validId = typeof value.id === 'string' && /^[0-9a-f-]{36}$/i.test(value.id);
    return validTime && validId ? value : null;
  } catch {
    return null;
  }
}

export function createSupabaseRepositories({ service }) {
  return {
    memberships: {
      async getRole(ctx, businessId) {
        const row = unwrap(await ctx.db.from('business_members').select('role')
          .eq('business_id', businessId).eq('user_id', ctx.userId).maybeSingle());
        return row?.role ?? null;
      }
    },

    profiles: {
      async get(ctx) {
        return unwrap(await ctx.db.from('profiles').select(PROFILE_FIELDS).eq('id', ctx.userId).maybeSingle());
      },
      async save(ctx, changes) {
        // No se usa upsert: PostgREST incluiría "id" en el UPDATE y ese privilegio está revocado.
        const updated = unwrap(await ctx.db.from('profiles').update(changes).eq('id', ctx.userId)
          .select(PROFILE_FIELDS).maybeSingle());
        if (updated) return updated;
        return unwrap(await ctx.db.from('profiles').insert({ id: ctx.userId, ...changes })
          .select(PROFILE_FIELDS).single());
      }
    },

    businesses: {
      async listForUser(ctx) {
        const rows = unwrap(await ctx.db.from('business_members')
          .select(`role, businesses(${BUSINESS_FIELDS})`).eq('user_id', ctx.userId));
        return rows.filter(row => row.businesses).map(row => ({ ...row.businesses, role: row.role }))
          .sort((a, b) => a.created_at.localeCompare(b.created_at));
      },
      async create(ctx, { nombre, tipo_negocio = null }) {
        // owner_id sale del JWT verificado; RLS además exige owner_id = auth.uid().
        return unwrap(await ctx.db.from('businesses').insert({ owner_id: ctx.userId, nombre, tipo_negocio })
          .select(BUSINESS_FIELDS).single(), 'No se pudo crear el negocio.');
      },
      async get(ctx, businessId) {
        return unwrap(await ctx.db.from('businesses').select(BUSINESS_FIELDS).eq('id', businessId).maybeSingle());
      },
      async update(ctx, businessId, changes) {
        const row = unwrap(await ctx.db.from('businesses').update(changes).eq('id', businessId)
          .select(BUSINESS_FIELDS).maybeSingle());
        if (!row) throw notFound('No encontramos ese negocio.');
        return row;
      }
    },

    products: {
      async list(ctx, businessId, { activo, q } = {}) {
        let query = ctx.db.from('products').select(PRODUCT_FIELDS).eq('business_id', businessId);
        if (activo !== undefined) query = query.eq('activo', activo);
        if (q) query = query.ilike('nombre_normalizado', `%${normalizeName(q)}%`);
        return unwrap(await query.order('nombre_normalizado').limit(500));
      },
      async get(ctx, businessId, productId) {
        return unwrap(await ctx.db.from('products').select(PRODUCT_FIELDS)
          .eq('business_id', businessId).eq('id', productId).maybeSingle());
      },
      async create(ctx, businessId, { nombre, precio_actual_centavos }) {
        const result = await ctx.db.from('products')
          .insert({ business_id: businessId, nombre, precio_actual_centavos })
          .select(PRODUCT_FIELDS).single();
        if (result.error?.code === '23505') {
          throw conflict('PRODUCT_EXISTS', 'Ya tienes un producto con ese nombre.');
        }
        return unwrap(result, 'No se pudo crear el producto.');
      },
      async update(ctx, businessId, productId, changes) {
        const result = await ctx.db.from('products').update(changes)
          .eq('business_id', businessId).eq('id', productId).select(PRODUCT_FIELDS).maybeSingle();
        if (result.error?.code === '23505') {
          throw conflict('PRODUCT_EXISTS', 'Ya tienes un producto con ese nombre.');
        }
        const row = unwrap(result);
        if (!row) throw notFound('No encontramos ese producto.');
        return row;
      },
      async setPrice({ businessId, productId, actorId, precioCentavos, origen }) {
        const row = unwrap(await service.rpc('set_product_price', {
          p_product_id: productId,
          p_business_id: businessId,
          p_actor_id: actorId,
          p_new_price_centavos: precioCentavos,
          p_origen: origen
        }).single(), 'No se pudo actualizar el precio.');
        return {
          id: row.id, nombre: row.nombre, precio_actual_centavos: row.precio_actual_centavos,
          activo: row.activo, created_at: row.created_at, updated_at: row.updated_at
        };
      },
      async priceHistory(ctx, businessId, productId) {
        return unwrap(await ctx.db.from('product_price_history')
          .select('precio_anterior_centavos, precio_nuevo_centavos, origen, changed_by, created_at')
          .eq('business_id', businessId).eq('product_id', productId)
          .order('created_at', { ascending: false }).limit(100));
      }
    },

    sales: {
      async list(ctx, businessId, { estado, desde, hasta, q, limit = 20, cursor } = {}) {
        let query = ctx.db.from('sales').select(SALE_FIELDS).eq('business_id', businessId);
        if (estado) query = query.eq('estado_pago', estado);
        if (desde) query = query.gte('created_at', desde);
        if (hasta) query = query.lt('created_at', hasta);
        if (q) {
          query = /^[0-9]{1,7}$/.test(q)
            ? query.or(`num_ref.eq.${q},concepto.ilike.*${q}*`)
            : query.ilike('concepto', `%${q}%`);
        }
        if (cursor) {
          const position = decodeCursor(cursor);
          if (!position) throw badRequest('El cursor de paginación no es válido.');
          query = query.or(`created_at.lt."${position.t}",and(created_at.eq."${position.t}",id.lt.${position.id})`);
        }
        const rows = unwrap(await query.order('created_at', { ascending: false }).order('id', { ascending: false })
          .limit(limit + 1));
        const page = rows.slice(0, limit).map(sortItems);
        return { items: page, next_cursor: rows.length > limit ? encodeCursor(page[page.length - 1]) : null };
      },
      async get(ctx, businessId, saleId) {
        const row = unwrap(await ctx.db.from('sales').select(SALE_FIELDS)
          .eq('business_id', businessId).eq('id', saleId).maybeSingle());
        return sortItems(row);
      }
    }
  };
}
