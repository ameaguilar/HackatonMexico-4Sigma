-- CobraVoz · Migración 02: usuarios, negocios y membresías (multi-negocio).
--
-- La identidad la administra Supabase Auth (auth.users). `profiles` guarda solo datos de presentación.
-- La autorización se decide SIEMPRE con business_members + auth.uid(), nunca con datos enviados por el cliente.

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  nombre_completo text check (nombre_completo is null or char_length(nombre_completo) between 1 and 120),
  telefono        text check (telefono is null or telefono ~ '^[0-9]{10}$'),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- businesses
-- ---------------------------------------------------------------------------
create table public.businesses (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users (id) on delete restrict,
  nombre        text not null check (char_length(btrim(nombre)) between 2 and 70),
  tipo_negocio  text check (tipo_negocio is null or char_length(tipo_negocio) <= 60),
  moneda        char(3) not null default 'MXN' check (moneda = 'MXN'),
  -- Contador para numRef de Pey (^[0-9]{1,7}$). Solo lo modifica private.create_sale().
  num_ref_seq   integer not null default 0 check (num_ref_seq between 0 and 9999999),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index businesses_owner_idx on public.businesses (owner_id);

create trigger businesses_touch before update on public.businesses
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- business_members
-- ---------------------------------------------------------------------------
create table public.business_members (
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        public.member_role not null default 'cashier',
  created_at  timestamptz not null default now(),
  primary key (business_id, user_id)
);

create index business_members_user_idx on public.business_members (user_id);
-- Exactamente un dueño por negocio.
create unique index business_members_one_owner on public.business_members (business_id) where role = 'owner';

-- El dueño queda registrado como miembro 'owner' al crear el negocio.
create or replace function private.add_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.business_members (business_id, user_id, role)
  values (new.id, new.owner_id, 'owner');
  return new;
end;
$$;

create trigger businesses_add_owner after insert on public.businesses
  for each row execute function private.add_owner_membership();

-- ---------------------------------------------------------------------------
-- Autorización: ¿el usuario autenticado pertenece al negocio (con alguno de estos roles)?
-- SECURITY DEFINER para que las políticas no se evalúen de forma recursiva sobre business_members.
-- ---------------------------------------------------------------------------
create or replace function private.is_member(p_business_id uuid, p_roles public.member_role[] default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_members m
    where m.business_id = p_business_id
      and m.user_id = (select auth.uid())
      and (p_roles is null or m.role = any (p_roles))
  );
$$;

revoke all on function private.is_member(uuid, public.member_role[]) from public;
grant execute on function private.is_member(uuid, public.member_role[]) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.business_members enable row level security;

-- profiles: cada quien ve y edita solo su perfil.
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- businesses: los miembros leen; cualquiera autenticado crea un negocio propio; dueño/admin editan.
create policy businesses_select_member on public.businesses
  for select to authenticated using (private.is_member(id));
create policy businesses_insert_self on public.businesses
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy businesses_update_admin on public.businesses
  for update to authenticated
  using (private.is_member(id, array['owner', 'admin']::public.member_role[]))
  with check (private.is_member(id, array['owner', 'admin']::public.member_role[]));

-- business_members: los miembros ven a su equipo; solo el dueño administra y nunca la fila 'owner'.
create policy members_select_team on public.business_members
  for select to authenticated using (private.is_member(business_id));
create policy members_insert_owner on public.business_members
  for insert to authenticated
  with check (role <> 'owner' and private.is_member(business_id, array['owner']::public.member_role[]));
create policy members_update_owner on public.business_members
  for update to authenticated
  using (role <> 'owner' and private.is_member(business_id, array['owner']::public.member_role[]))
  with check (role <> 'owner' and private.is_member(business_id, array['owner']::public.member_role[]));
create policy members_delete_owner on public.business_members
  for delete to authenticated
  using (role <> 'owner' and private.is_member(business_id, array['owner']::public.member_role[]));

-- ---------------------------------------------------------------------------
-- Privilegios por columna (defensa adicional a RLS).
-- Supabase concede ALL a anon/authenticated por defecto; aquí se recorta.
-- ---------------------------------------------------------------------------
revoke all on public.profiles, public.businesses, public.business_members from anon;

revoke insert, update on public.profiles from authenticated;
grant insert (id, nombre_completo, telefono) on public.profiles to authenticated;
grant update (nombre_completo, telefono) on public.profiles to authenticated;

-- Nadie cambia owner_id, moneda ni el contador numRef desde la API pública.
revoke insert, update, delete on public.businesses from authenticated;
grant insert (owner_id, nombre, tipo_negocio) on public.businesses to authenticated;
grant update (nombre, tipo_negocio) on public.businesses to authenticated;

revoke update on public.business_members from authenticated;
grant update (role) on public.business_members to authenticated;
