// Dos tipos de acceso a Supabase:
//   * forUser(token): cliente con la publishable key y el JWT del usuario → RLS aplica.
//   * service: cliente con la secret key → ignora RLS. Solo para funciones financieras
//     (create_sale, apply_provider_transaction, set_product_price) y webhooks.
import { createClient } from '@supabase/supabase-js';

const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

export function createSupabaseClients({ url, publishableKey, secretKey }) {
  const service = createClient(url, secretKey, options);
  return {
    service,
    forUser(token) {
      return createClient(url, publishableKey, {
        ...options,
        global: { headers: { Authorization: `Bearer ${token}` } }
      });
    }
  };
}
