-- CobraVoz: esquema de autenticación, perfiles, cuentas de cobro y transacciones con RLS.

-- Función auxiliar SECURITY INVOKER para actualizar updated_at sin omitir RLS.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- 1. Perfiles de usuario vinculados a auth.users
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  dob date not null,
  phone text not null unique,
  adult_consent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_phone_format_chk check (phone ~ '^\+52\d{10}$')
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.profiles force row level security;

create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "profiles_insert_own"
  on public.profiles
  for insert
  to authenticated
  with check ((select auth.uid()) = id);

create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- 2. Cuentas bancarias / CoDi del comerciante
create table if not exists public.merchant_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  email text not null,
  entity_type text not null,
  holder_name text not null,
  clabe_last4 text not null,
  rfc text,
  status text not null default 'pendiente',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint merchant_accounts_entity_type_chk check (entity_type in ('person', 'business')),
  constraint merchant_accounts_clabe_last4_chk check (clabe_last4 ~ '^\d{4}$'),
  constraint merchant_accounts_status_chk check (status in ('pendiente', 'en_proceso', 'activa', 'error'))
);

create index if not exists merchant_accounts_user_id_idx
  on public.merchant_accounts (user_id);

create trigger merchant_accounts_set_updated_at
  before update on public.merchant_accounts
  for each row
  execute function public.set_updated_at();

alter table public.merchant_accounts enable row level security;
alter table public.merchant_accounts force row level security;

create policy "merchant_accounts_select_own"
  on public.merchant_accounts
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "merchant_accounts_insert_own"
  on public.merchant_accounts
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "merchant_accounts_update_own"
  on public.merchant_accounts
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- 3. Transacciones de cobro protegidas por usuario e idempotentes
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  amount_cents bigint not null,
  currency text not null default 'MXN',
  description text not null default '',
  source text not null,
  status text not null default 'pending',
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  constraint transactions_amount_positive_chk check (amount_cents > 0),
  constraint transactions_currency_chk check (currency = 'MXN'),
  constraint transactions_source_chk check (source in ('voice', 'calculator')),
  constraint transactions_status_chk check (status in ('pending', 'paid', 'cancelled'))
);

create index if not exists transactions_user_id_idx
  on public.transactions (user_id);

alter table public.transactions enable row level security;
alter table public.transactions force row level security;

create policy "transactions_select_own"
  on public.transactions
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "transactions_insert_own"
  on public.transactions
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "transactions_update_own"
  on public.transactions
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Permisos explícitos para Data API: solo rol authenticated con RLS activo.
revoke all on public.profiles, public.merchant_accounts, public.transactions from public, anon;
grant usage on schema public to authenticated;
grant select, insert, update on public.profiles, public.merchant_accounts, public.transactions to authenticated;
