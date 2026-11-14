-- CobraVoz · Pruebas de aislamiento (RLS), privilegios y consistencia financiera.
--
-- Se ejecuta con psql -v ON_ERROR_STOP=1. Todo ocurre dentro de una transacción que se revierte al final,
-- así que puede correrse contra una base local de Supabase sin dejar datos.
-- Cualquier aserción fallida lanza una excepción con el prefijo "FALLÓ".
--
-- Actores:
--   A  = dueño de "Tacos Juanita"
--   B  = dueño de "Jugos Beto" (otro negocio, no debe ver nada de A)
--   C  = cajero de "Tacos Juanita"

\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned

begin;

create schema tests;
grant usage on schema tests to anon, authenticated, service_role;

create function tests.ok(cond boolean, msg text) returns text language plpgsql as $$
begin
  if cond is not true then raise exception 'FALLÓ: %', msg; end if;
  return 'ok - ' || msg;
end $$;

create function tests.throws(q text, msg text, expected_fragment text default null) returns text language plpgsql as $$
begin
  begin
    execute q;
  exception when others then
    if expected_fragment is not null and position(lower(expected_fragment) in lower(sqlerrm)) = 0 then
      raise exception 'FALLÓ: % (error inesperado: %)', msg, sqlerrm;
    end if;
    return 'ok - ' || msg;
  end;
  raise exception 'FALLÓ (no lanzó error): %', msg;
end $$;

create function tests.affected(q text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute q;
  get diagnostics n = row_count;
  return n;
end $$;

grant execute on all functions in schema tests to anon, authenticated, service_role;

-- Identidades
insert into auth.users (id) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc');

\set A '''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'''
\set B '''bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'''
\set C '''cccccccc-cccc-4ccc-8ccc-cccccccccccc'''

\echo '# Alta de negocios con el rol authenticated'
set local request.jwt.claim.sub = :A;
set local role authenticated;
insert into public.businesses (owner_id, nombre, tipo_negocio) values (:A, 'Tacos Juanita', 'puesto de comida');
select tests.ok((select count(*) = 1 from public.business_members where user_id = :A and role = 'owner'),
                'el dueño queda como miembro owner automáticamente');
select tests.throws(format('insert into public.businesses (owner_id, nombre) values (%L, %L)', :B, 'Negocio ajeno'),
                    'no se puede crear un negocio a nombre de otro usuario', 'row-level security');
reset role;

set local request.jwt.claim.sub = :B;
set local role authenticated;
insert into public.businesses (owner_id, nombre) values (:B, 'Jugos Beto');
reset role;

select id as biz_a from public.businesses where owner_id = :A \gset
select id as biz_b from public.businesses where owner_id = :B \gset

\echo '# Catálogo y equipo'
set local request.jwt.claim.sub = :A;
set local role authenticated;
insert into public.products (business_id, nombre, precio_actual_centavos) values
  (:'biz_a', '  Tacos   ', 2000),
  (:'biz_a', 'Coca', 1800);
insert into public.business_members (business_id, user_id, role) values (:'biz_a', :C, 'cashier');
select tests.ok((select nombre = 'Tacos' and nombre_normalizado = 'tacos' from public.products where business_id = :'biz_a' and nombre = 'Tacos'),
                'el nombre del producto se limpia y normaliza');
select tests.throws(format('insert into public.products (business_id, nombre, precio_actual_centavos) values (%L, %L, 100)', :'biz_a', 'TACOS'),
                    'no se duplican productos con distinto formato de nombre', 'duplicate');
select tests.throws(format('insert into public.business_members (business_id, user_id, role) values (%L, %L, %L)', :'biz_a', :B, 'owner'),
                    'no se puede agregar un segundo dueño', 'row-level security');
select tests.ok(tests.affected(format('update public.business_members set role = %L where business_id = %L and user_id = %L', 'cashier', :'biz_a', :A)) = 0,
                'el dueño no puede degradar su propia fila owner');
reset role;

set local request.jwt.claim.sub = :B;
set local role authenticated;
insert into public.products (business_id, nombre, precio_actual_centavos) values (:'biz_b', 'Jugo de naranja', 3500);
reset role;

select id as tacos_a from public.products where business_id = :'biz_a' and nombre = 'Tacos' \gset
select id as coca_a  from public.products where business_id = :'biz_a' and nombre = 'Coca' \gset
select id as jugo_b  from public.products where business_id = :'biz_b' \gset

\echo '# Aislamiento entre negocios (B no ve ni toca nada de A)'
set local request.jwt.claim.sub = :B;
set local role authenticated;
select tests.ok((select count(*) = 1 from public.businesses), 'B solo ve su negocio');
select tests.ok((select count(*) = 0 from public.products where business_id = :'biz_a'), 'B no ve productos de A');
select tests.ok((select count(*) = 0 from public.business_members where business_id = :'biz_a'), 'B no ve el equipo de A');
select tests.ok((select count(*) = 0 from public.product_price_history where business_id = :'biz_a'), 'B no ve el historial de precios de A');
select tests.throws(format('insert into public.products (business_id, nombre, precio_actual_centavos) values (%L, %L, 100)', :'biz_a', 'Intruso'),
                    'B no puede crear productos en el negocio de A', 'row-level security');
select tests.ok(tests.affected(format('update public.products set precio_actual_centavos = 1 where id = %L', :'tacos_a')) = 0,
                'B no puede cambiar precios de A');
select tests.ok(tests.affected(format('update public.businesses set nombre = %L where id = %L', 'Hackeado', :'biz_a')) = 0,
                'B no puede renombrar el negocio de A');
select tests.throws(format('insert into public.business_members (business_id, user_id, role) values (%L, %L, %L)', :'biz_a', :B, 'admin'),
                    'B no puede agregarse al equipo de A', 'row-level security');
reset role;

\echo '# Privilegios por columna y tablas de solo backend'
set local request.jwt.claim.sub = :A;
set local role authenticated;
select tests.throws(format('update public.businesses set owner_id = %L where id = %L', :B, :'biz_a'),
                    'nadie cambia owner_id desde la API', 'permission denied');
select tests.throws(format('update public.businesses set num_ref_seq = 5 where id = %L', :'biz_a'),
                    'nadie altera el contador numRef desde la API', 'permission denied');
select tests.throws(format('update public.products set business_id = %L where id = %L', :'biz_b', :'tacos_a'),
                    'un producto no puede moverse a otro negocio', 'permission denied');
select tests.throws(format($q$insert into public.sales (business_id, total_centavos, concepto, origen, num_ref, idempotency_key, request_hash)
                            values (%L, 100, 'x', 'manual', '1', 'llave-falsa-123', 'h')$q$, :'biz_a'),
                    'el usuario no inserta ventas directamente', 'permission denied');
select tests.throws('select * from public.payment_events', 'el usuario no lee eventos crudos del proveedor', 'permission denied');
select tests.throws(format($q$select public.create_sale(%L, %L, 'llave-usuario-1', 'manual', 'x', '[{"tipo":"importe_libre","cantidad":1,"precio_unitario_centavos":100}]'::jsonb)$q$, :'biz_a', :A),
                    'el usuario no ejecuta create_sale (solo el backend)', 'permission denied');
select tests.throws(format('select public.set_product_price(%L, %L, %L, 1, %L)', :'tacos_a', :'biz_a', :A, 'manual'),
                    'el usuario no ejecuta set_product_price (solo el backend)', 'permission denied');
reset role;

set local role anon;
select tests.throws('select * from public.businesses', 'anon no lee negocios', 'permission denied');
select tests.throws('select * from public.products', 'anon no lee productos', 'permission denied');
reset role;

\echo '# Roles dentro del negocio (cajero C)'
set local request.jwt.claim.sub = :C;
set local role authenticated;
select tests.ok((select count(*) = 2 from public.products where business_id = :'biz_a'), 'el cajero ve el catálogo');
select tests.throws(format('insert into public.products (business_id, nombre, precio_actual_centavos) values (%L, %L, 100)', :'biz_a', 'Agua'),
                    'el cajero no crea productos', 'row-level security');
select tests.ok(tests.affected(format('update public.products set precio_actual_centavos = 1 where id = %L', :'tacos_a')) = 0,
                'el cajero no cambia precios');
select tests.throws(format('insert into public.business_members (business_id, user_id, role) values (%L, %L, %L)', :'biz_a', :B, 'cashier'),
                    'el cajero no administra el equipo', 'row-level security');
reset role;

\echo '# Historial de precios'
set local request.jwt.claim.sub = :A;
set local role authenticated;
update public.products set precio_actual_centavos = 2200 where id = :'tacos_a';
reset role;
select tests.ok((select count(*) = 2 from public.product_price_history where product_id = :'tacos_a'), 'alta y cambio quedan registrados');
select tests.ok((select origen = 'manual' and precio_anterior_centavos = 2000 and precio_nuevo_centavos = 2200 and changed_by = :A
                   from public.product_price_history where product_id = :'tacos_a' order by id desc limit 1),
                'el cambio manual guarda precio anterior, nuevo y autor');

set local role service_role;
select tests.throws(format('select public.set_product_price(%L, %L, %L, 2500, %L)', :'tacos_a', :'biz_a', :C, 'voz'),
                    'set_product_price rechaza a un cajero', 'no puede modificar');
select tests.ok((select precio_actual_centavos = 2000 from public.set_product_price(:'tacos_a', :'biz_a', :A, 2000, 'voz')),
                'set_product_price aplica un cambio confirmado por voz');
select tests.ok((select origen = 'voz' and changed_by = :A from public.product_price_history where product_id = :'tacos_a' order by id desc limit 1),
                'el cambio por voz queda con origen voz y autor');
select tests.throws(format('select public.set_product_price(%L, %L, %L, 999, %L)', :'jugo_b', :'biz_a', :A, 'manual'),
                    'set_product_price no toca productos de otro negocio', 'no encontrado');

\echo '# create_sale: totales, snapshots, idempotencia'
select (public.create_sale(
  :'biz_a', :A, 'idem-venta-0001', 'voz', '2 tacos y 1 coca',
  jsonb_build_array(
    jsonb_build_object('tipo', 'producto', 'product_id', :'tacos_a', 'nombre', 'ignorado', 'cantidad', 2, 'precio_unitario_centavos', 2000),
    jsonb_build_object('tipo', 'producto', 'product_id', :'coca_a', 'cantidad', 1, 'precio_unitario_centavos', 1800)
  ))).id as sale1 \gset

select tests.ok((select total_centavos = 5800 and estado_pago = 'CREATED' and num_ref = '1' from public.sales where id = :'sale1'),
                'total recalculado (2×20 + 18 = 58.00), estado CREATED y numRef 1');
select tests.ok((select nombre_producto_snapshot = 'Tacos' from public.sale_items where sale_id = :'sale1' and product_id = :'tacos_a'),
                'el nombre de la partida sale del catálogo, no del cliente');
select tests.ok((select (public.create_sale(
  :'biz_a', :A, 'idem-venta-0001', 'voz', '2 tacos y 1 coca',
  jsonb_build_array(
    jsonb_build_object('tipo', 'producto', 'product_id', :'tacos_a', 'nombre', 'ignorado', 'cantidad', 2, 'precio_unitario_centavos', 2000),
    jsonb_build_object('tipo', 'producto', 'product_id', :'coca_a', 'cantidad', 1, 'precio_unitario_centavos', 1800)
  ))).id = :'sale1'), 'reintento con la misma llave devuelve la misma venta');
select tests.ok((select count(*) = 1 from public.sales where business_id = :'biz_a'), 'el reintento no duplica la venta');
select tests.throws(format($q$select public.create_sale(%L, %L, 'idem-venta-0001', 'voz', 'otra', '[{"tipo":"importe_libre","cantidad":1,"precio_unitario_centavos":999}]'::jsonb)$q$, :'biz_a', :A),
                    'misma llave con otra solicitud se rechaza', 'idempotencia');
select tests.throws(format($q$select public.create_sale(%L, %L, 'idem-venta-0002', 'voz', 'x', jsonb_build_array(jsonb_build_object('tipo','producto','product_id',%L,'cantidad',1,'precio_unitario_centavos',100)))$q$, :'biz_a', :A, :'jugo_b'),
                    'no se pueden vender productos de otro negocio', 'inexistente');
select tests.throws(format($q$select public.create_sale(%L, %L, 'idem-venta-0003', 'manual', 'x', '[{"tipo":"importe_libre","cantidad":1,"precio_unitario_centavos":100}]'::jsonb)$q$, :'biz_a', :B),
                    'un usuario ajeno no crea ventas en el negocio', 'no pertenece');
select tests.throws(format($q$select public.create_sale(%L, %L, 'idem-venta-0004', 'manual', 'x', '[{"tipo":"importe_libre","cantidad":1,"precio_unitario_centavos":100},{"tipo":"descuento","cantidad":1,"precio_unitario_centavos":-100}]'::jsonb)$q$, :'biz_a', :A),
                    'una venta con total cero se rechaza', 'total');
select tests.throws(format($q$select public.create_sale(%L, %L, 'idem-venta-0005', 'manual', 'x', '[{"tipo":"importe_libre","cantidad":1,"precio_unitario_centavos":-100}]'::jsonb)$q$, :'biz_a', :A),
                    'un importe libre negativo se rechaza');
select tests.throws(format($q$select public.create_sale(%L, %L, 'idem-venta-0006', 'manual', 'x', '[{"tipo":"importe_libre","cantidad":1,"precio_unitario_centavos":100}]'::jsonb, gen_random_uuid())$q$, :'biz_a', :A),
                    'no se cobra a una cuenta inexistente o inactiva', 'cuenta de cobro');

update public.products set precio_actual_centavos = 2500 where id = :'tacos_a';
select tests.ok((select precio_unitario_centavos = 2000 and subtotal_centavos = 4000 from public.sale_items where sale_id = :'sale1' and product_id = :'tacos_a'),
                'cambiar el precio del catálogo no altera ventas anteriores');
select tests.throws(format('update public.sale_items set precio_unitario_centavos = 1 where sale_id = %L', :'sale1'),
                    'las partidas son inmutables', 'no pueden modificarse');

\echo '# Máquina de estados y conciliación'
select tests.throws(format($q$update public.sales set estado_pago = 'PAID' where id = %L$q$, :'sale1'),
                    'CREATED no puede pasar directo a PAID', 'inválida');
select tests.throws(format($q$update public.sales set estado_pago = 'QR_GENERATED' where id = %L$q$, :'sale1'),
                    'QR_GENERATED exige QR del proveedor');
select tests.throws(format($q$select public.apply_provider_transaction(%L, 'pey', 'TX-0', 'PAID', 5800)$q$, :'sale1'),
                    'no se aplica un pago a una venta sin QR', 'no tiene un qr');
update public.sales set estado_pago = 'QR_GENERATED', provider_qr_id = 'IDC-1', qr_string = '{"demo":true}',
       expires_at = now() + interval '10 minutes' where id = :'sale1';
select tests.throws(format($q$update public.sales set total_centavos = 1 where id = %L$q$, :'sale1'),
                    'el total de una venta no puede modificarse', 'inmutables');
select tests.throws(format($q$update public.sales set provider_qr_id = 'IDC-OTRO' where id = %L$q$, :'sale1'),
                    'el QR de una venta no puede reemplazarse', 'reemplazarse');

select tests.ok((select estado_pago = 'PENDING' from public.apply_provider_transaction(:'sale1', 'pey', 'TX-1', 'PENDING', 5800)),
                'una transacción PENDING lleva la venta a PENDING');
select tests.throws(format($q$update public.sales set estado_pago = 'CANCELLED' where id = %L$q$, :'sale1'),
                    'no se cancela una venta con pago en curso', 'inválida');
select tests.ok((select estado_pago = 'PAID' and paid_amount_centavos = 5800 and codi_transaction_id = 'TX-1'
                   from public.apply_provider_transaction(:'sale1', 'pey', 'TX-1', 'PAID', 5900, 5800, 0, 100, null, 'CODI', now(), now())),
                'la transacción PAID con importe base suficiente liquida la venta');
select tests.ok((select estado_pago = 'PAID' from public.apply_provider_transaction(:'sale1', 'pey', 'TX-1', 'PAID', 5900, 5800)),
                'aplicar la misma transacción dos veces es idempotente');
select tests.ok((select count(*) = 1 from public.payment_transactions where sale_id = :'sale1'), 'no se duplican transacciones');
select tests.ok((select status = 'PAID' from public.payment_transactions where provider_transaction_id = 'TX-1'), 'la transacción quedó PAID');
select tests.ok((select status = 'PAID' from public.payment_transactions t
                   where provider_transaction_id = 'TX-1'
                     and (select estado_pago from public.apply_provider_transaction(:'sale1', 'pey', 'TX-1', 'PENDING', 5900)) = 'PAID'),
                'una transacción pagada no regresa a PENDING');
select tests.throws(format($q$update public.sales set estado_pago = 'CANCELLED' where id = %L$q$, :'sale1'),
                    'PAID es terminal', 'inválida');
select tests.throws(format($q$update public.sales set concepto = 'otro' where id = %L$q$, :'sale1'),
                    'una venta pagada no se modifica', 'no puede modificarse');

-- Pago insuficiente
select (public.create_sale(:'biz_a', :A, 'idem-venta-0010', 'calculadora', 'Venta 100',
        '[{"tipo":"importe_libre","cantidad":1,"precio_unitario_centavos":10000}]'::jsonb)).id as sale2 \gset
update public.sales set estado_pago = 'QR_GENERATED', provider_qr_id = 'IDC-2', qr_string = 'x' where id = :'sale2';
select tests.ok((select estado_pago <> 'PAID' and failure_reason = 'pago_insuficiente'
                   from public.apply_provider_transaction(:'sale2', 'pey', 'TX-2', 'PAID', 5000, 5000)),
                'un pago por menos del total no marca la venta como pagada');
select tests.throws(format($q$select public.apply_provider_transaction(%L, 'pey', 'TX-1', 'PAID', 5800)$q$, :'sale2'),
                    'una transacción no puede reasignarse a otra venta', 'otra venta');

-- Cancelada y pagada tarde
select (public.create_sale(:'biz_a', :A, 'idem-venta-0011', 'manual', 'Venta 50',
        '[{"tipo":"importe_libre","cantidad":1,"precio_unitario_centavos":5000}]'::jsonb)).id as sale3 \gset
select tests.ok((select num_ref = '3' from public.sales where id = :'sale3'), 'numRef es consecutivo por negocio');
update public.sales set estado_pago = 'QR_GENERATED', provider_qr_id = 'IDC-3', qr_string = 'x' where id = :'sale3';
update public.sales set estado_pago = 'CANCELLED' where id = :'sale3';
select tests.ok((select cancelled_at is not null from public.sales where id = :'sale3'), 'cancelar registra la fecha');
select tests.ok((select estado_pago = 'PAID' and paid_after_close
                   from public.apply_provider_transaction(:'sale3', 'pey', 'TX-3', 'PAID', 5000, 5000)),
                'un pago tardío sobre un QR cancelado se registra y se marca para revisión');

-- Falla al generar QR
select (public.create_sale(:'biz_a', :A, 'idem-venta-0012', 'manual', 'Venta 10',
        '[{"tipo":"importe_libre","cantidad":1,"precio_unitario_centavos":1000}]'::jsonb)).id as sale4 \gset
update public.sales set estado_pago = 'FAILED', failure_reason = 'pey_503' where id = :'sale4';
select tests.throws(format($q$update public.sales set estado_pago = 'QR_GENERATED', provider_qr_id = 'IDC-4', qr_string = 'x' where id = %L$q$, :'sale4'),
                    'FAILED es terminal', 'inválida');

-- Bitácora de voz
insert into public.voice_commands (business_id, user_id, sale_id, texto_original, parser, intent) values
  (:'biz_a', :A, :'sale1', 'cobra dos tacos y una coca', 'reglas', 'create_sale'),
  (:'biz_a', :C, null, 'cobra tres aguas', 'ollama', 'create_sale');
reset role;

\echo '# Visibilidad de ventas por rol'
set local request.jwt.claim.sub = :C;
set local role authenticated;
select tests.ok((select count(*) = 4 from public.sales), 'el cajero ve las ventas de su negocio');
select tests.ok((select count(*) = 0 from public.payment_accounts), 'el cajero no ve cuentas de cobro');
select tests.ok((select count(*) = 1 from public.voice_commands), 'el cajero solo ve sus propios comandos de voz');
reset role;

set local request.jwt.claim.sub = :B;
set local role authenticated;
select tests.ok((select count(*) = 0 from public.sales), 'B no ve ventas de A');
select tests.ok((select count(*) = 0 from public.sale_items), 'B no ve partidas de A');
select tests.ok((select count(*) = 0 from public.payment_transactions), 'B no ve transacciones de A');
select tests.ok((select count(*) = 0 from public.voice_commands), 'B no ve comandos de voz de A');
reset role;

set local request.jwt.claim.sub = :A;
set local role authenticated;
select tests.ok((select count(*) = 2 from public.voice_commands), 'el dueño ve todos los comandos de su negocio');
select tests.ok((select count(*) = 3 from public.payment_transactions), 'el dueño ve las transacciones de su negocio');
reset role;

\echo '# Todas las pruebas pasaron'
rollback;
