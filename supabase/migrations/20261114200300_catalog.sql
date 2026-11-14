-- CobraVoz · Migración 03: catálogo de productos e historial de precios.
--
-- Las ventas guardan su propio precio (sale_items). Cambiar precio_actual_centavos nunca altera ventas pasadas.
-- Cada cambio de precio se registra automáticamente en product_price_history mediante trigger.

create table public.products (
  id                     uuid primary key default gen_random_uuid(),
  business_id            uuid not null references public.businesses (id) on delete cascade,
  nombre                 text not null check (char_length(btrim(nombre)) between 1 and 60),
  nombre_normalizado     text not null,
  precio_actual_centavos bigint not null check (precio_actual_centavos between 1 and 99999999),
  activo                 boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  -- Necesario para las llaves foráneas compuestas que impiden mezclar negocios.
  unique (id, business_id),
  unique (business_id, nombre_normalizado)
);

create index products_business_active_idx on public.products (business_id) where activo;

create or replace function private.products_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.nombre := regexp_replace(btrim(new.nombre), '\s+', ' ', 'g');
  new.nombre_normalizado := private.normalize_name(new.nombre);
  if tg_op = 'UPDATE' then
    if new.business_id is distinct from old.business_id then
      raise exception 'Un producto no puede cambiar de negocio' using errcode = 'check_violation';
    end if;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger products_before_write before insert or update on public.products
  for each row execute function private.products_before_write();

-- ---------------------------------------------------------------------------
-- Historial de precios
-- ---------------------------------------------------------------------------
create table public.product_price_history (
  id                       bigint generated always as identity primary key,
  product_id               uuid not null,
  business_id              uuid not null,
  precio_anterior_centavos bigint check (precio_anterior_centavos is null or precio_anterior_centavos > 0),
  precio_nuevo_centavos    bigint not null check (precio_nuevo_centavos > 0),
  -- alta: producto nuevo · manual: edición en catálogo · voz: confirmado tras un dictado.
  origen                   text not null default 'manual' check (origen in ('alta', 'manual', 'voz')),
  changed_by               uuid references auth.users (id) on delete set null,
  created_at               timestamptz not null default now(),
  foreign key (product_id, business_id) references public.products (id, business_id) on delete cascade
);

create index price_history_product_idx on public.product_price_history (product_id, created_at desc);

-- El backend indica el origen y el autor con variables locales de transacción
-- (ver private.set_product_price). Si no las define, se usa auth.uid() y 'manual'.
create or replace function private.record_price_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_origen text := nullif(current_setting('cobravoz.price_source', true), '');
  v_actor  uuid := coalesce((select auth.uid()), nullif(current_setting('cobravoz.actor_id', true), '')::uuid);
begin
  if tg_op = 'INSERT' then
    insert into public.product_price_history (product_id, business_id, precio_anterior_centavos, precio_nuevo_centavos, origen, changed_by)
    values (new.id, new.business_id, null, new.precio_actual_centavos, 'alta', v_actor);
  elsif new.precio_actual_centavos is distinct from old.precio_actual_centavos then
    insert into public.product_price_history (product_id, business_id, precio_anterior_centavos, precio_nuevo_centavos, origen, changed_by)
    values (new.id, new.business_id, old.precio_actual_centavos, new.precio_actual_centavos,
            coalesce(v_origen, 'manual'), v_actor);
  end if;
  return null;
end;
$$;

create trigger products_record_price after insert or update of precio_actual_centavos on public.products
  for each row execute function private.record_price_change();

-- Cambio de precio confirmado por el usuario (p. ej. tras un dictado con precio distinto).
-- Solo el backend (service_role) la invoca, después de verificar el JWT y el rol del usuario.
create or replace function public.set_product_price(
  p_product_id uuid,
  p_business_id uuid,
  p_actor_id uuid,
  p_new_price_centavos bigint,
  p_origen text default 'manual'
)
returns public.products
language plpgsql
set search_path = ''
as $$
declare
  v_product public.products;
begin
  if not exists (
    select 1 from public.business_members
    where business_id = p_business_id and user_id = p_actor_id and role in ('owner', 'admin')
  ) then
    raise exception 'El usuario no puede modificar precios de este negocio' using errcode = 'insufficient_privilege';
  end if;
  if p_origen not in ('manual', 'voz') then
    raise exception 'Origen de precio inválido' using errcode = 'check_violation';
  end if;

  perform set_config('cobravoz.price_source', p_origen, true);
  perform set_config('cobravoz.actor_id', p_actor_id::text, true);

  update public.products
     set precio_actual_centavos = p_new_price_centavos
   where id = p_product_id and business_id = p_business_id
  returning * into v_product;

  if v_product.id is null then
    raise exception 'Producto no encontrado' using errcode = 'no_data_found';
  end if;
  return v_product;
end;
$$;

revoke all on function public.set_product_price(uuid, uuid, uuid, bigint, text) from public, anon, authenticated;
grant execute on function public.set_product_price(uuid, uuid, uuid, bigint, text) to service_role;

-- ---------------------------------------------------------------------------
-- RLS y privilegios
-- ---------------------------------------------------------------------------
alter table public.products enable row level security;
alter table public.product_price_history enable row level security;

create policy products_select_member on public.products
  for select to authenticated using (private.is_member(business_id));
create policy products_insert_admin on public.products
  for insert to authenticated
  with check (private.is_member(business_id, array['owner', 'admin']::public.member_role[]));
create policy products_update_admin on public.products
  for update to authenticated
  using (private.is_member(business_id, array['owner', 'admin']::public.member_role[]))
  with check (private.is_member(business_id, array['owner', 'admin']::public.member_role[]));
-- Sin política DELETE: los productos se desactivan (activo = false) para conservar referencias.

create policy price_history_select_member on public.product_price_history
  for select to authenticated using (private.is_member(business_id));
-- Sin políticas de escritura: solo el trigger SECURITY DEFINER inserta.

revoke all on public.products, public.product_price_history from anon;
revoke insert, update, delete on public.products from authenticated;
grant insert (business_id, nombre, precio_actual_centavos, activo) on public.products to authenticated;
grant update (nombre, precio_actual_centavos, activo) on public.products to authenticated;
revoke insert, update, delete on public.product_price_history from authenticated;
