-- CobraVoz · Migración 04: cuentas de cobro, ventas, partidas, transacciones y eventos del proveedor.
--
-- Reglas:
--   * Ningún usuario autenticado escribe en estas tablas: solo el backend con service_role.
--   * Nunca se guarda la CLABE completa ni credenciales bancarias.
--   * Un QR generado NO es un pago. PAID solo se asigna tras verificar con el proveedor.
--   * Las transiciones de estado se validan en la base de datos (trigger), no solo en el backend.

-- ---------------------------------------------------------------------------
-- payment_accounts: cuenta CLABE registrada en el proveedor (Pey POST /bank-account).
-- ---------------------------------------------------------------------------
create table public.payment_accounts (
  id                  uuid primary key default gen_random_uuid(),
  business_id         uuid not null references public.businesses (id) on delete restrict,
  provider            text not null default 'pey' check (provider in ('pey')),
  external_account_id text not null,                       -- ULID de Pey
  alias               text not null check (char_length(alias) between 1 and 255),
  titular_nombre      text not null check (char_length(titular_nombre) between 1 and 255),
  entidad             text not null check (entidad in ('PERSON', 'BUSINESS')),
  clabe_ultimos4      char(4) not null check (clabe_ultimos4 ~ '^[0-9]{4}$'),
  estado              public.account_status not null default 'PENDING',
  error_message       text,
  es_predeterminada   boolean not null default false,
  provider_created_at timestamptz,
  last_checked_at     timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (id, business_id),
  unique (provider, external_account_id)
);

create index payment_accounts_business_idx on public.payment_accounts (business_id);
create unique index payment_accounts_one_default on public.payment_accounts (business_id) where es_predeterminada;

create trigger payment_accounts_touch before update on public.payment_accounts
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- sales
-- ---------------------------------------------------------------------------
create table public.sales (
  id                   uuid primary key default gen_random_uuid(),
  business_id          uuid not null references public.businesses (id) on delete restrict,
  created_by           uuid references auth.users (id) on delete set null,
  total_centavos       bigint not null check (total_centavos between 1 and 99999999),
  moneda               char(3) not null default 'MXN' check (moneda = 'MXN'),
  concepto             text not null check (char_length(concepto) between 1 and 255),
  origen               text not null check (origen in ('voz', 'calculadora', 'manual')),
  -- NULL = cuenta ligada a la API key de la plataforma (solo modo demo, ver docs/ARQUITECTURA.md).
  payment_account_id   uuid,
  provider             text not null default 'pey' check (provider in ('pey', 'mock')),
  provider_qr_id       text,                               -- IDC devuelto por POST /codi/qr
  codi_transaction_id  text,                               -- ULID de la transacción PAID que liquidó la venta
  num_ref              text not null check (num_ref ~ '^[0-9]{1,7}$'),
  qr_string            text,
  expiration_seconds   integer not null default 600 check (expiration_seconds = 0 or expiration_seconds >= 360),
  expires_at           timestamptz,
  estado_pago          public.sale_status not null default 'CREATED',
  paid_amount_centavos bigint check (paid_amount_centavos is null or paid_amount_centavos > 0),
  paid_at              timestamptz,
  cancelled_at         timestamptz,
  failure_reason       text,
  -- Pago recibido después de EXPIRED/CANCELLED: el dinero es real y se registra, pero se marca para revisión.
  paid_after_close     boolean not null default false,
  idempotency_key      text not null check (char_length(idempotency_key) between 8 and 100),
  request_hash         text not null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (id, business_id),
  unique (business_id, idempotency_key),
  unique (provider, provider_qr_id),
  foreign key (payment_account_id, business_id) references public.payment_accounts (id, business_id),
  check (estado_pago <> 'PAID' or (paid_at is not null and paid_amount_centavos is not null and codi_transaction_id is not null)),
  check (estado_pago not in ('QR_GENERATED', 'PENDING') or (provider_qr_id is not null and qr_string is not null))
);

create index sales_business_created_idx on public.sales (business_id, created_at desc);
create index sales_business_status_idx on public.sales (business_id, estado_pago);
create index sales_open_expiry_idx on public.sales (expires_at) where estado_pago in ('QR_GENERATED', 'PENDING');

-- Máquina de estados. PAID y FAILED son terminales.
-- EXPIRED/CANCELLED -> PAID se permite porque Pey no permite anular un QR ya mostrado:
-- si el cliente paga tarde, el dinero existe y debe reflejarse (paid_after_close = true).
create or replace function private.sales_guard_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  allowed boolean;
begin
  -- Campos inmutables tras la creación.
  if new.business_id is distinct from old.business_id
     or new.total_centavos is distinct from old.total_centavos
     or new.idempotency_key is distinct from old.idempotency_key
     or new.request_hash is distinct from old.request_hash
     or new.num_ref is distinct from old.num_ref
     or new.created_at is distinct from old.created_at
     or new.created_by is distinct from old.created_by then
    raise exception 'Campos inmutables de la venta' using errcode = 'check_violation';
  end if;
  if old.provider_qr_id is not null and new.provider_qr_id is distinct from old.provider_qr_id then
    raise exception 'El QR de una venta no puede reemplazarse' using errcode = 'check_violation';
  end if;
  if old.codi_transaction_id is not null and new.codi_transaction_id is distinct from old.codi_transaction_id then
    raise exception 'La transacción de pago no puede reemplazarse' using errcode = 'check_violation';
  end if;

  if new.estado_pago is distinct from old.estado_pago then
    allowed := case old.estado_pago
      when 'CREATED'      then new.estado_pago in ('QR_GENERATED', 'FAILED', 'CANCELLED')
      when 'QR_GENERATED' then new.estado_pago in ('PENDING', 'PAID', 'EXPIRED', 'CANCELLED')
      -- Con un pago en curso no se cancela; EXPIRED solo lo aplica el backend tras un periodo de gracia.
      when 'PENDING'      then new.estado_pago in ('PAID', 'EXPIRED')
      when 'EXPIRED'      then new.estado_pago in ('PENDING', 'PAID')
      when 'CANCELLED'    then new.estado_pago in ('PENDING', 'PAID')
      else false
    end;
    if not allowed then
      raise exception 'Transición de estado inválida: % -> %', old.estado_pago, new.estado_pago
        using errcode = 'check_violation';
    end if;
    if old.estado_pago in ('EXPIRED', 'CANCELLED') then
      new.paid_after_close := true;
    end if;
    if new.estado_pago = 'CANCELLED' and new.cancelled_at is null then
      new.cancelled_at := now();
    end if;
  elsif old.estado_pago in ('PAID', 'FAILED') and row(new.*) is distinct from row(old.*) then
    raise exception 'Una venta en estado % no puede modificarse', old.estado_pago using errcode = 'check_violation';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger sales_guard_transition before update on public.sales
  for each row execute function private.sales_guard_transition();

-- ---------------------------------------------------------------------------
-- sale_items: detalle con precio congelado (snapshot).
-- ---------------------------------------------------------------------------
create table public.sale_items (
  id                       uuid primary key default gen_random_uuid(),
  sale_id                  uuid not null,
  business_id              uuid not null,
  product_id               uuid,
  tipo                     text not null default 'producto' check (tipo in ('producto', 'importe_libre', 'descuento')),
  nombre_producto_snapshot text not null check (char_length(nombre_producto_snapshot) between 1 and 60),
  cantidad                 integer not null check (cantidad between 1 and 1000),
  precio_unitario_centavos bigint not null check (precio_unitario_centavos between -99999999 and 99999999 and precio_unitario_centavos <> 0),
  subtotal_centavos        bigint not null,
  posicion                 smallint not null default 0,
  created_at               timestamptz not null default now(),
  foreign key (sale_id, business_id) references public.sales (id, business_id) on delete cascade,
  foreign key (product_id, business_id) references public.products (id, business_id),
  check (subtotal_centavos = cantidad * precio_unitario_centavos),
  check ((tipo = 'descuento') = (precio_unitario_centavos < 0)),
  check (tipo = 'producto' or product_id is null)
);

create index sale_items_sale_idx on public.sale_items (sale_id);
create index sale_items_product_idx on public.sale_items (business_id, product_id) where product_id is not null;

-- Las partidas son inmutables: el historial de precios de cada venta no se reescribe.
create or replace function private.sale_items_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Las partidas de una venta no pueden modificarse' using errcode = 'check_violation';
end;
$$;

create trigger sale_items_immutable before update on public.sale_items
  for each row execute function private.sale_items_immutable();

-- ---------------------------------------------------------------------------
-- payment_transactions: transacciones reportadas por Pey (GET /transaction/codi/qr/{id}).
-- Un QR puede recibir más de una transacción; se guardan todas para conciliar.
-- ---------------------------------------------------------------------------
create table public.payment_transactions (
  id                         uuid primary key default gen_random_uuid(),
  business_id                uuid not null,
  sale_id                    uuid not null,
  provider                   text not null default 'pey' check (provider in ('pey', 'mock')),
  provider_transaction_id    text not null,
  status                     text not null check (status in ('PENDING', 'PAID')),
  amount_centavos            bigint not null check (amount_centavos >= 0),
  base_centavos              bigint,
  tip_centavos               bigint,
  fee_centavos               bigint,
  application_fee_centavos   bigint,
  payment_method             text check (payment_method in ('CODI', 'CARD')),
  provider_created_at        timestamptz,
  provider_paid_at           timestamptz,
  raw                        jsonb not null default '{}'::jsonb,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  unique (provider, provider_transaction_id),
  foreign key (sale_id, business_id) references public.sales (id, business_id) on delete restrict
);

create index payment_transactions_sale_idx on public.payment_transactions (sale_id);

-- Una transacción PAID nunca vuelve a PENDING.
create or replace function private.payment_transactions_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'PAID' and new.status <> 'PAID' then
    raise exception 'Una transacción pagada no puede revertirse' using errcode = 'check_violation';
  end if;
  if new.sale_id is distinct from old.sale_id or new.business_id is distinct from old.business_id
     or new.provider_transaction_id is distinct from old.provider_transaction_id then
    raise exception 'Campos inmutables de la transacción' using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger payment_transactions_guard before update on public.payment_transactions
  for each row execute function private.payment_transactions_guard();

-- ---------------------------------------------------------------------------
-- payment_events: bitácora cruda e idempotente de lo recibido del proveedor (webhook o consulta).
-- ---------------------------------------------------------------------------
create table public.payment_events (
  id               bigint generated always as identity primary key,
  provider         text not null check (provider in ('pey', 'mock')),
  -- Clave de deduplicación: id de evento del webhook, o p. ej. 'poll:<txId>:<status>'.
  event_key        text not null check (char_length(event_key) between 1 and 200),
  source           text not null check (source in ('webhook', 'poll', 'api')),
  event_type       text,
  business_id      uuid references public.businesses (id) on delete set null,
  sale_id          uuid references public.sales (id) on delete set null,
  payload          jsonb not null,
  signature_valid  boolean,
  received_at      timestamptz not null default now(),
  processed_at     timestamptz,
  processing_error text,
  unique (provider, event_key)
);

create index payment_events_sale_idx on public.payment_events (sale_id);
create index payment_events_unprocessed_idx on public.payment_events (received_at) where processed_at is null;

-- ---------------------------------------------------------------------------
-- RLS y privilegios: lectura para miembros, escritura solo service_role.
-- ---------------------------------------------------------------------------
alter table public.payment_accounts enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.payment_transactions enable row level security;
alter table public.payment_events enable row level security;

create policy payment_accounts_select_admin on public.payment_accounts
  for select to authenticated
  using (private.is_member(business_id, array['owner', 'admin']::public.member_role[]));

create policy sales_select_member on public.sales
  for select to authenticated using (private.is_member(business_id));

create policy sale_items_select_member on public.sale_items
  for select to authenticated using (private.is_member(business_id));

create policy payment_transactions_select_member on public.payment_transactions
  for select to authenticated using (private.is_member(business_id));

-- payment_events: sin políticas. Contiene cargas crudas del proveedor; solo el backend la lee.

revoke all on public.payment_accounts, public.sales, public.sale_items,
              public.payment_transactions, public.payment_events from anon;
revoke insert, update, delete, truncate on public.payment_accounts, public.sales, public.sale_items,
              public.payment_transactions, public.payment_events from authenticated;
revoke select on public.payment_events from authenticated;
