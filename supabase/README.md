# Supabase · CobraVoz

Esquema PostgreSQL multi-negocio con Row Level Security. Diseño y decisiones en [`docs/ARQUITECTURA.md`](../docs/ARQUITECTURA.md).

## Migraciones

| Archivo | Contenido |
|---|---|
| `20261114200100_base.sql` | Extensiones, esquema `private`, enums (`sale_status`, `member_role`, `account_status`) |
| `20261114200200_tenancy.sql` | `profiles`, `businesses`, `business_members`, `private.is_member()` |
| `20261114200300_catalog.sql` | `products`, `product_price_history` (trigger), `set_product_price()` |
| `20261114200400_payments.sql` | `payment_accounts`, `sales` (máquina de estados), `sale_items`, `payment_transactions`, `payment_events` |
| `20261114200500_voice.sql` | `voice_commands` |
| `20261114200600_sale_functions.sql` | `create_sale()` y `apply_provider_transaction()`, atómicas e idempotentes |

Cada tabla activa RLS en la misma migración que la crea. Las tablas financieras no aceptan escritura del rol `authenticated`: solo escribe el backend con la secret key, a través de las funciones.

## Crear el proyecto (una vez)

1. En [supabase.com](https://supabase.com) crea un proyecto `cobravoz-demo` en una región de EE. UU. Guarda la contraseña de la base de datos en un gestor de contraseñas.
2. En **Project Settings → API Keys** encontrarás:
   - la **Project URL** y la **publishable key**, que van al frontend (son públicas);
   - la **secret key**, que va **solo** en `backend/.env`. Nunca en el repo ni en Netlify.
3. Para usar la CLI no hace falta instalarla: basta con `npx supabase`. La CLI no admite instalarse globalmente con `npm -g`. Si prefieres tenerla instalada, descarga el binario de las *releases* de `supabase/cli` en GitHub.
4. Desde la raíz del repo:
   ```bash
   npx supabase init
   ```
   ```bash
   npx supabase login
   ```
   ```bash
   npx supabase link --project-ref <ref-del-proyecto>
   ```
   ```bash
   npx supabase db push
   ```
   `supabase init` solo crea `supabase/config.toml` y respeta las migraciones existentes.

> No crees tablas desde el panel. Cada cambio de esquema debe ser una migración nueva en este directorio.

## Probar las migraciones

Con PostgreSQL local, sin Docker ni Supabase CLI:
```bash
scripts/test-db.sh
```
Requiere `postgresql` (Kali: `sudo apt install postgresql postgresql-contrib`; Arch: `sudo pacman -S postgresql`). Levanta una instancia temporal, aplica `tests/supabase_stub.sql`, las migraciones y las pruebas, y al final la borra. Debe ejecutarse con tu usuario normal, no como root.

Contra un Supabase local (`npx supabase start` y luego `npx supabase db reset`):
```bash
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres scripts/test-db.sh
```

Las pruebas corren dentro de una transacción que se revierte, así que no dejan datos.

## Inicio de sesión por SMS (teléfono +52)

El frontend ya envía y verifica códigos SMS con Supabase Auth (`/auth/v1/otp` y `/auth/v1/verify`). Para activarlo:

1. **Proveedor de SMS.** Supabase no envía SMS por sí mismo. Crea una cuenta en Twilio: la versión de prueba (*trial*) trae crédito gratuito, pero solo envía a números que verifiques en Twilio, lo cual basta para el equipo. Anota el *Account SID*, el *Auth Token* y un *Messaging Service SID* o un número remitente.
2. **Supabase → Authentication → Sign In / Providers → Phone**: habilítalo, elige Twilio y pega esas credenciales. Se guardan en Supabase, no en el repositorio.
3. **Números de prueba** (en esa misma pantalla, *Test Phone Numbers and OTPs*): por ejemplo `525512345678=123456`. Esos números entran con el código fijo y **no se envía ningún SMS**, ideal para presentaciones.
4. **Authentication → Rate Limits**: revisa el límite de SMS por hora para evitar abuso y costos.
5. El código debe ser de **6 dígitos**: es lo que espera el frontend.

> Cada SMS real tiene costo (unos centavos de dólar hacia México; revisa la tarifa vigente de Twilio).

## Prueba de integración del backend

Con las migraciones aplicadas y `backend/.env` completo:
```bash
cd backend && npm run test:integration
```
Crea usuarios temporales con correo `@cobravoz.test` (requiere el proveedor **Email** habilitado, que viene así por defecto), un negocio y productos. Al terminar, los borra. No crea ventas ni llama a Pey.
