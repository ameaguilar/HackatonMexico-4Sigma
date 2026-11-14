-- CobraVoz · Migración 01: extensiones, esquema privado, tipos y utilidades comunes.
--
-- Convenciones:
--   * Todo importe se guarda en CENTAVOS (bigint). Nunca float ni numeric con redondeo implícito.
--   * Moneda única: MXN.
--   * Las funciones auxiliares viven en el esquema `private`, que PostgREST no expone.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists unaccent with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- Roles dentro de un negocio.
create type public.member_role as enum ('owner', 'admin', 'cashier');

-- Ciclo de vida de un cobro.
--   CREATED       registro creado, aún sin QR del proveedor.
--   QR_GENERATED  el proveedor devolvió el QR; nadie ha iniciado el pago.
--   PENDING       el proveedor reporta una transacción PENDING para el QR.
--   PAID          el proveedor reporta una transacción PAID que cubre el importe (verificado en backend).
--   EXPIRED       venció sin pago.
--   CANCELLED     cancelado localmente (Pey no ofrece cancelar un QR; ver docs/ARQUITECTURA.md).
--   FAILED        el QR no pudo generarse; nunca se mostró al cliente.
create type public.sale_status as enum (
  'CREATED', 'QR_GENERATED', 'PENDING', 'PAID', 'EXPIRED', 'CANCELLED', 'FAILED'
);

-- Estado de registro CoDi de una cuenta bancaria, idéntico al de Pey (codiStatus).
create type public.account_status as enum ('PENDING', 'PROCESSING', 'ACTIVE', 'ERROR');

-- Mantiene updated_at sin depender del cliente.
create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Normaliza nombres de producto para buscarlos sin importar acentos, mayúsculas ni espacios.
create or replace function private.normalize_name(value text)
returns text
language sql
stable
set search_path = ''
as $$
  select lower(regexp_replace(btrim(extensions.unaccent(coalesce(value, ''))), '\s+', ' ', 'g'));
$$;
