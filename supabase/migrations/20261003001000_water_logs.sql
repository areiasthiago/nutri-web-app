-- Fatia 4: registro de água. Uma linha por copo/garrafa registrado.
-- log_date é o dia LOCAL do usuário (fuso do perfil), calculado no app, como
-- em meal_logs: um copo às 22h em São Paulo pertence àquele dia.
create table public.water_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  log_date date not null,
  logged_at timestamptz not null default now(),
  ml integer not null check (ml between 1 and 5000)
);

create index water_logs_owner_date_idx on public.water_logs (owner_id, log_date);

alter table public.water_logs enable row level security;

create policy "water_logs: dono" on public.water_logs for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
