-- Esquema preliminar de cuentas, cobros y acceso seguro para Supabase/PostgreSQL.
-- Requiere 20261114140000_auth_and_protected_schema.sql.
--
-- Supabase Auth administra contrasenas, correo e identidades OAuth de Google.
-- El OTP SMS de seis digitos tambien lo administra Auth: es temporal, se verifica
-- contra el telefono y no se almacena en tablas publicas. profiles.phone es unico.
-- Nunca se almacenan plantillas biometricas; passkey_credentials solo guarda
-- credenciales WebAuthn publicas. La clave para cifrar CLABE vive fuera de la BD.
--
-- Mapeo: usuarios = auth.users + profiles + merchant_accounts;
-- cobro = charges; historia_cobros = transactions / charge_history.

-- La declaracion del usuario no equivale a una verificacion de edad.
alter table public.profiles
  add column if not exists adult_verified_at timestamptz;

comment on column public.profiles.adult_verified_at is
  'Fecha de verificacion de mayoria de edad; solo la establece el backend.';

revoke insert, update on public.profiles from authenticated;
grant insert (id, full_name, dob, phone, adult_consent)
  on public.profiles to authenticated;
grant update (full_name, dob, phone, adult_consent)
  on public.profiles to authenticated;

-- Datos bancarios adicionales. El valor completo de CLABE se guarda cifrado por
-- el backend; clabe_last4 es el unico fragmento legible para el cliente.
alter table public.merchant_accounts
  add column if not exists clabe_ciphertext bytea,
  add column if not exists bank_code text;

comment on column public.merchant_accounts.clabe_ciphertext is
  'CLABE cifrada por el backend; la clave de cifrado no debe guardarse en PostgreSQL.';
comment on column public.merchant_accounts.bank_code is
  'Clave de institucion bancaria, si el proveedor la requiere.';

-- No exponer el ciphertext ni datos de integracion al cliente autenticado.
revoke select on public.merchant_accounts from authenticated;
grant select (
  id, user_id, email, entity_type, holder_name, clabe_last4, rfc,
  status, created_at, updated_at, bank_code
) on public.merchant_accounts to authenticated;

-- Solicitudes de cobro. qr_payload contiene el payload del QR, no una imagen.
create table if not exists public.charges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  total numeric(12, 2) not null,
  currency text not null default 'MXN',
  concept text,
  qr_payload text,
  status text not null default 'pending',
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  paid_at timestamptz,
  constraint charges_total_positive_chk check (total > 0),
  constraint charges_currency_chk check (currency = 'MXN'),
  constraint charges_status_chk check (status in ('pending', 'paid', 'cancelled', 'expired')),
  constraint charges_paid_at_chk check (status <> 'paid' or paid_at is not null),
  constraint charges_expiration_chk check (expires_at > created_at),
  constraint charges_user_idempotency_key_uq unique (user_id, idempotency_key)
);

create index if not exists charges_user_created_at_idx
  on public.charges (user_id, created_at desc);

alter table public.charges enable row level security;
alter table public.charges force row level security;

drop policy if exists "charges_select_own" on public.charges;
create policy "charges_select_own"
  on public.charges
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Solo el backend puede crear/modificar solicitudes o marcar un cobro pagado.
revoke all on public.charges from public, anon, authenticated;
grant select on public.charges to authenticated;

-- Vincula la solicitud QR con el registro de transaccion existente.
alter table public.transactions
  add column if not exists charge_id uuid
    references public.charges (id) on delete set null,
  add column if not exists completed_at timestamptz;

create unique index if not exists transactions_charge_id_uq
  on public.transactions (charge_id)
  where charge_id is not null;

create index if not exists transactions_user_completed_at_idx
  on public.transactions (user_id, completed_at desc);

comment on table public.transactions is
  'Registro de transacciones; las escrituras las realiza el backend o un webhook validado.';
comment on column public.transactions.amount_cents is
  'Total en centavos de MXN; se expone como decimal en charge_history.';
comment on column public.transactions.description is
  'Concepto opcional del cobro; cadena vacia equivale a NULL en charge_history.';

-- La vista presenta solo cobros pagados y conserva RLS de transactions.
create or replace view public.charge_history
with (security_invoker = true)
as
select
  t.id,
  coalesce(t.completed_at, t.created_at) as transaction_date,
  (t.amount_cents::numeric / 100)::numeric(12, 2) as total,
  nullif(t.description, '') as concept,
  t.user_id,
  t.charge_id
from public.transactions as t
where t.status = 'paid';

comment on view public.charge_history is
  'Vista de historia_cobros; solo incluye transacciones con estado paid.';
revoke all on public.charge_history from public, anon, authenticated;
grant select on public.charge_history to authenticated;

-- El cliente puede consultar su historial, pero no fabricar ni actualizar pagos.
drop policy if exists "transactions_insert_own" on public.transactions;
drop policy if exists "transactions_update_own" on public.transactions;
revoke insert, update on public.transactions from authenticated;

-- La cuenta bancaria solo puede permanecer pendiente cuando la crea el usuario.
drop policy if exists "merchant_accounts_insert_own" on public.merchant_accounts;
create policy "merchant_accounts_insert_own_pending"
  on public.merchant_accounts
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id and status = 'pendiente');

drop policy if exists "merchant_accounts_update_own" on public.merchant_accounts;
create policy "merchant_accounts_update_own_pending"
  on public.merchant_accounts
  for update
  to authenticated
  using ((select auth.uid()) = user_id and status = 'pendiente')
  with check ((select auth.uid()) = user_id and status = 'pendiente');

-- CLABE cifrada y estado bancario quedan reservados al backend.
revoke insert, update on public.merchant_accounts from authenticated;
grant insert (user_id, email, entity_type, holder_name, clabe_last4, rfc)
  on public.merchant_accounts to authenticated;
grant update (email, entity_type, holder_name, rfc)
  on public.merchant_accounts to authenticated;

-- Passkeys WebAuthn: public key y metadatos, nunca rostro, huella ni PIN.
create table if not exists public.passkey_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  credential_id text not null unique,
  public_key bytea not null,
  sign_count bigint not null default 0,
  transports text[] not null default '{}',
  display_name text not null default 'Dispositivo',
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  constraint passkey_sign_count_chk check (sign_count >= 0)
);

create index if not exists passkey_credentials_user_id_idx
  on public.passkey_credentials (user_id);

alter table public.passkey_credentials enable row level security;
alter table public.passkey_credentials force row level security;

drop policy if exists "passkey_credentials_select_own" on public.passkey_credentials;
create policy "passkey_credentials_select_own"
  on public.passkey_credentials
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "passkey_credentials_delete_own" on public.passkey_credentials;
create policy "passkey_credentials_delete_own"
  on public.passkey_credentials
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- El backend valida el desafio WebAuthn antes de registrar/actualizar credenciales.
revoke all on public.passkey_credentials from public, anon, authenticated;
grant select, delete on public.passkey_credentials to authenticated;
