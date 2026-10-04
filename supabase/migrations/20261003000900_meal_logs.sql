-- Fatia 3: registro do que a pessoa fez (refeição marcada como feita).
-- Separado do plano (o que foi prescrito). Uma linha por refeição por dia;
-- desmarcar apaga a linha.
--
-- log_date é o dia LOCAL do usuário (fuso do perfil), calculado no app: uma
-- refeição às 23h em São Paulo pertence àquele dia, não ao dia seguinte UTC.
-- Nome e horário da refeição são copiados no registro para o histórico
-- continuar legível mesmo depois de trocar de plano.
create table public.meal_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  meal_id uuid not null,
  log_date date not null,
  meal_name text not null,
  meal_time time not null,
  done_at timestamptz not null default now(),
  -- Trocas usadas: [{ "item_id": uuid, "food": text, "substitution": text }]
  swaps jsonb not null default '[]' check (jsonb_typeof(swaps) = 'array'),
  unique (owner_id, log_date, meal_id),
  foreign key (meal_id, owner_id) references public.meals (id, owner_id) on delete cascade
);

create index meal_logs_owner_date_idx on public.meal_logs (owner_id, log_date);
create index meal_logs_meal_idx on public.meal_logs (meal_id, owner_id);

alter table public.meal_logs enable row level security;

create policy "meal_logs: dono" on public.meal_logs for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
