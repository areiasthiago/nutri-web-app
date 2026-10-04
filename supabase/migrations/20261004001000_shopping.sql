-- Lista de compras da semana. A lista em si é calculada no app (planos, pessoas
-- da casa, comida da casa e extras); aqui ficam só as escolhas da pessoa.

-- Dia de compras (0 = domingo … 6 = sábado). Padrão: sábado.
alter table public.profiles
  add column shopping_day smallint not null default 6 check (shopping_day between 0 and 6);

-- Rendimento escolhido por alimento (pronto ÷ cru), sobrepõe o padrão do app.
create table public.food_yields (
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  food_key text not null check (char_length(food_key) between 1 and 80),
  yield numeric not null check (yield > 0 and yield <= 10),
  primary key (owner_id, food_key)
);

alter table public.food_yields enable row level security;

create policy "food_yields: dono" on public.food_yields for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

-- O que já foi comprado em cada semana (semana = dia de compras em que começa).
create table public.shopping_checks (
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  week_start date not null,
  item_key text not null check (char_length(item_key) between 1 and 100),
  checked_at timestamptz not null default now(),
  primary key (owner_id, week_start, item_key)
);

alter table public.shopping_checks enable row level security;

create policy "shopping_checks: dono" on public.shopping_checks for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
