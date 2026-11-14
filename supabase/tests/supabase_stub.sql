-- Stub mínimo de Supabase para probar las migraciones en un PostgreSQL normal (sin Supabase CLI).
-- NO se aplica en Supabase: allí estos roles, esquemas y funciones ya existen.
-- Reproduce lo que las migraciones necesitan: roles de API, auth.users, auth.uid() y privilegios por defecto.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end;
$$;

create schema if not exists auth;
create schema if not exists extensions;

create table if not exists auth.users (
  id         uuid primary key,
  email      text,
  phone      text,
  created_at timestamptz not null default now()
);

-- Igual que en Supabase: el "sub" del JWT de la petición.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ),
    ''
  )::uuid;
$$;

grant usage on schema public, auth, extensions to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- Supabase concede por defecto todos los privilegios del esquema public a los roles de API.
-- Las migraciones deben recortarlos; replicarlo aquí hace que las pruebas sean realistas.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
