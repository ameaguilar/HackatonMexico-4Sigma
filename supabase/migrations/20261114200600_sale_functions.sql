-- CobraVoz · Migración 06: operaciones atómicas de venta y conciliación.
--
-- Solo service_role puede ejecutarlas. El backend las llama DESPUÉS de verificar el JWT del usuario;
-- aun así cada función vuelve a comprobar la membresía del actor (defensa en profundidad).

-- ---------------------------------------------------------------------------
-- create_sale: crea la venta en CREATED con sus partidas, de forma atómica e idempotente.
--
-- p_items: arreglo JSON de objetos
--   { "tipo": "producto"|"importe_libre"|"descuento",
--     "product_id": uuid|null, "nombre": text, "cantidad": int, "precio_unitario_centavos": int }
-- El precio lo decide el backend (catálogo o cambio confirmado por el usuario); aquí se recalculan
-- subtotales y total, y se verifica que los productos pertenezcan al negocio.
-- ---------------------------------------------------------------------------
create or replace function public.create_sale(
  p_business_id        uuid,
  p_actor_id           uuid,
  p_idempotency_key    text,
  p_origen             text,
  p_concepto           text,
  p_items              jsonb,
  p_payment_account_id uuid default null,
  p_expiration_seconds integer default 600,
  p_provider           text default 'pey'
)
returns public.sales
language plpgsql
set search_path = ''
as $$
declare
  v_hash     text;
  v_sale     public.sales;
  v_item     jsonb;
  v_tipo     text;
  v_qty      integer;
  v_price    bigint;
  v_name     text;
  v_product  public.products;
  v_total    bigint := 0;
  v_pos      smallint := 0;
  v_seq      integer;
  v_rows     jsonb := '[]'::jsonb;
begin
  if not exists (
    select 1 from public.business_members where business_id = p_business_id and user_id = p_actor_id
  ) then
    raise exception 'El usuario no pertenece al negocio' using errcode = 'insufficient_privilege';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'La venta debe tener entre 1 y 50 partidas' using errcode = 'check_violation';
  end if;

  v_hash := encode(extensions.digest(
    jsonb_build_object(
      'origen', p_origen, 'concepto', p_concepto, 'items', p_items,
      'account', p_payment_account_id, 'expiration', p_expiration_seconds, 'provider', p_provider
    )::text, 'sha256'), 'hex');

  -- Idempotencia: misma llave + misma solicitud => misma venta. Misma llave + otra solicitud => error.
  select * into v_sale from public.sales
   where business_id = p_business_id and idempotency_key = p_idempotency_key;
  if found then
    if v_sale.request_hash <> v_hash then
      raise exception 'La llave de idempotencia ya se usó con otra solicitud' using errcode = 'unique_violation';
    end if;
    return v_sale;
  end if;

  if p_payment_account_id is not null and not exists (
    select 1 from public.payment_accounts
     where id = p_payment_account_id and business_id = p_business_id and estado = 'ACTIVE'
  ) then
    raise exception 'La cuenta de cobro no está activa o no pertenece al negocio' using errcode = 'check_violation';
  end if;

  -- Validación y cálculo de partidas.
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_tipo  := coalesce(v_item ->> 'tipo', 'producto');
    v_qty   := (v_item ->> 'cantidad')::integer;
    v_price := (v_item ->> 'precio_unitario_centavos')::bigint;
    v_name  := nullif(btrim(v_item ->> 'nombre'), '');

    if v_tipo not in ('producto', 'importe_libre', 'descuento') then
      raise exception 'Tipo de partida inválido: %', v_tipo using errcode = 'check_violation';
    end if;
    if v_qty is null or v_price is null then
      raise exception 'Cada partida requiere cantidad y precio' using errcode = 'check_violation';
    end if;

    v_product := null;
    if v_tipo = 'producto' and (v_item ->> 'product_id') is not null then
      select * into v_product from public.products
       where id = (v_item ->> 'product_id')::uuid and business_id = p_business_id;
      if not found then
        raise exception 'Producto inexistente en este negocio' using errcode = 'foreign_key_violation';
      end if;
      if not v_product.activo then
        raise exception 'El producto % está desactivado', v_product.nombre using errcode = 'check_violation';
      end if;
      v_name := v_product.nombre;
    elsif v_tipo <> 'producto' and (v_item ->> 'product_id') is not null then
      raise exception 'Solo las partidas de producto llevan product_id' using errcode = 'check_violation';
    end if;

    v_name := coalesce(v_name, case v_tipo when 'descuento' then 'Descuento' when 'importe_libre' then 'Importe' end);
    if v_name is null then
      raise exception 'Cada producto requiere nombre' using errcode = 'check_violation';
    end if;

    v_total := v_total + v_qty * v_price;
    v_rows := v_rows || jsonb_build_object(
      'tipo', v_tipo, 'product_id', v_product.id, 'nombre', left(v_name, 60),
      'cantidad', v_qty, 'precio', v_price, 'pos', v_pos);
    v_pos := v_pos + 1;
  end loop;

  if v_total < 1 or v_total > 99999999 then
    raise exception 'El total debe estar entre $0.01 y $999,999.99' using errcode = 'check_violation';
  end if;

  -- numRef consecutivo por negocio (1..9999999, cíclico). El UPDATE bloquea la fila del negocio.
  update public.businesses
     set num_ref_seq = case when num_ref_seq >= 9999999 then 1 else num_ref_seq + 1 end
   where id = p_business_id
  returning num_ref_seq into v_seq;

  begin
    insert into public.sales (
      business_id, created_by, total_centavos, concepto, origen, payment_account_id, provider,
      num_ref, expiration_seconds, idempotency_key, request_hash
    ) values (
      p_business_id, p_actor_id, v_total, left(btrim(p_concepto), 255), p_origen, p_payment_account_id, p_provider,
      v_seq::text, p_expiration_seconds, p_idempotency_key, v_hash
    ) returning * into v_sale;
  exception when unique_violation then
    -- Carrera con otra solicitud con la misma llave: devolver la venta ganadora si coincide.
    select * into v_sale from public.sales
     where business_id = p_business_id and idempotency_key = p_idempotency_key;
    if v_sale.request_hash <> v_hash then
      raise exception 'La llave de idempotencia ya se usó con otra solicitud' using errcode = 'unique_violation';
    end if;
    return v_sale;
  end;

  insert into public.sale_items (
    sale_id, business_id, product_id, tipo, nombre_producto_snapshot, cantidad,
    precio_unitario_centavos, subtotal_centavos, posicion
  )
  select v_sale.id, p_business_id, nullif(r ->> 'product_id', '')::uuid, r ->> 'tipo', r ->> 'nombre',
         (r ->> 'cantidad')::integer, (r ->> 'precio')::bigint,
         (r ->> 'cantidad')::integer * (r ->> 'precio')::bigint, (r ->> 'pos')::smallint
    from jsonb_array_elements(v_rows) r;

  return v_sale;
end;
$$;

-- ---------------------------------------------------------------------------
-- apply_provider_transaction: registra una transacción del proveedor y actualiza la venta.
-- Idempotente: aplicar la misma transacción varias veces (webhook + consulta) no duplica nada.
-- Bloquea la venta (FOR UPDATE) para que webhook y consulta concurrentes no se pisen.
-- ---------------------------------------------------------------------------
create or replace function public.apply_provider_transaction(
  p_sale_id                  uuid,
  p_provider                 text,
  p_provider_transaction_id  text,
  p_status                   text,
  p_amount_centavos          bigint,
  p_base_centavos            bigint default null,
  p_tip_centavos             bigint default null,
  p_fee_centavos             bigint default null,
  p_application_fee_centavos bigint default null,
  p_payment_method           text default 'CODI',
  p_provider_created_at      timestamptz default null,
  p_provider_paid_at         timestamptz default null,
  p_raw                      jsonb default '{}'::jsonb
)
returns public.sales
language plpgsql
set search_path = ''
as $$
declare
  v_sale    public.sales;
  v_tx      public.payment_transactions;
  v_covered bigint;
begin
  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then
    raise exception 'Venta no encontrada' using errcode = 'no_data_found';
  end if;
  if v_sale.provider <> p_provider then
    raise exception 'El proveedor no coincide con la venta' using errcode = 'check_violation';
  end if;
  if v_sale.estado_pago in ('CREATED', 'FAILED') then
    raise exception 'La venta % no tiene un QR activo', v_sale.estado_pago using errcode = 'check_violation';
  end if;

  insert into public.payment_transactions (
    business_id, sale_id, provider, provider_transaction_id, status, amount_centavos, base_centavos,
    tip_centavos, fee_centavos, application_fee_centavos, payment_method, provider_created_at,
    provider_paid_at, raw
  ) values (
    v_sale.business_id, v_sale.id, p_provider, p_provider_transaction_id, p_status, p_amount_centavos,
    p_base_centavos, p_tip_centavos, p_fee_centavos, p_application_fee_centavos, p_payment_method,
    p_provider_created_at, p_provider_paid_at, coalesce(p_raw, '{}'::jsonb)
  )
  on conflict (provider, provider_transaction_id) do update
     set status           = case when public.payment_transactions.status = 'PAID' then 'PAID' else excluded.status end,
         amount_centavos  = excluded.amount_centavos,
         base_centavos    = excluded.base_centavos,
         tip_centavos     = excluded.tip_centavos,
         fee_centavos     = excluded.fee_centavos,
         application_fee_centavos = excluded.application_fee_centavos,
         provider_paid_at = coalesce(public.payment_transactions.provider_paid_at, excluded.provider_paid_at),
         raw              = excluded.raw
  returning * into v_tx;

  if v_tx.sale_id <> v_sale.id then
    raise exception 'La transacción pertenece a otra venta' using errcode = 'check_violation';
  end if;

  if v_tx.status = 'PAID' then
    if v_sale.estado_pago = 'PAID' then
      return v_sale;   -- Ya liquidada; un segundo pago queda registrado en payment_transactions.
    end if;
    -- Se compara el importe base (sin comisión al pagador) contra el total de la venta.
    v_covered := coalesce(v_tx.base_centavos, v_tx.amount_centavos);
    if v_covered >= v_sale.total_centavos then
      update public.sales
         set estado_pago = 'PAID',
             paid_at = coalesce(v_tx.provider_paid_at, now()),
             paid_amount_centavos = v_covered,
             codi_transaction_id = v_tx.provider_transaction_id,
             failure_reason = null
       where id = v_sale.id
      returning * into v_sale;
    else
      update public.sales
         set failure_reason = 'pago_insuficiente'
       where id = v_sale.id
      returning * into v_sale;
    end if;
  elsif v_sale.estado_pago in ('QR_GENERATED', 'EXPIRED', 'CANCELLED') then
    update public.sales set estado_pago = 'PENDING' where id = v_sale.id returning * into v_sale;
  end if;

  return v_sale;
end;
$$;

revoke all on function public.create_sale(uuid, uuid, text, text, text, jsonb, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.create_sale(uuid, uuid, text, text, text, jsonb, uuid, integer, text) to service_role;

revoke all on function public.apply_provider_transaction(uuid, text, text, text, bigint, bigint, bigint, bigint, bigint, text, timestamptz, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.apply_provider_transaction(uuid, text, text, text, bigint, bigint, bigint, bigint, bigint, text, timestamptz, timestamptz, jsonb) to service_role;
