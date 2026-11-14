-- CobraVoz · Migración 05: bitácora de comandos de voz.
--
-- Guarda el texto dictado, cómo se interpretó (reglas u Ollama) y qué decidió el usuario.
-- Nunca guarda audio: el dictado ocurre en el navegador (Web Speech API).

create table public.voice_commands (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references public.businesses (id) on delete cascade,
  user_id          uuid references auth.users (id) on delete set null,
  sale_id          uuid,
  texto_original   text not null check (char_length(texto_original) between 1 and 500),
  texto_procesado  text check (texto_procesado is null or char_length(texto_procesado) <= 500),
  parser           text not null check (parser in ('reglas', 'ollama', 'ninguno')),
  modelo           text,
  intent           text check (intent is null or intent in (
                     'create_sale', 'add_items', 'remove_last', 'query_total', 'confirm', 'cancel',
                     'query_stats', 'update_price', 'unknown')),
  resultado        jsonb not null default '{}'::jsonb,
  estado           text not null default 'interpretado'
                     check (estado in ('interpretado', 'confirmado', 'rechazado', 'error')),
  latency_ms       integer check (latency_ms is null or latency_ms >= 0),
  created_at       timestamptz not null default now(),
  foreign key (sale_id, business_id) references public.sales (id, business_id) on delete set null (sale_id)
);

create index voice_commands_business_created_idx on public.voice_commands (business_id, created_at desc);

alter table public.voice_commands enable row level security;

-- Dueño/admin ven todo el negocio; cada cajero solo sus propios comandos.
create policy voice_commands_select on public.voice_commands
  for select to authenticated
  using (
    private.is_member(business_id, array['owner', 'admin']::public.member_role[])
    or (user_id = (select auth.uid()) and private.is_member(business_id))
  );

revoke all on public.voice_commands from anon;
revoke insert, update, delete, truncate on public.voice_commands from authenticated;
