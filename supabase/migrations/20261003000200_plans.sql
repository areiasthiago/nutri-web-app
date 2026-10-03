-- Fatia 2: o plano alimentar (o que foi prescrito). Os registros do que a
-- pessoa fez (meal_logs, water_logs) ficam em tabelas próprias, nas próximas
-- fatias. Nenhum plano real é inserido aqui (o seed fica fora do Git).
--
-- Toda tabela filha guarda owner_id e uma FK composta (pai, owner_id) para o
-- pai: assim a RLS é uma comparação simples com auth.uid() e ninguém consegue
-- pendurar uma linha sua no plano de outra pessoa.

-- ---------------------------------------------------------------------
-- plans
-- ---------------------------------------------------------------------
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Pessoa da casa dona do plano; vazio quando o plano é do próprio usuário.
  -- A FK para household_members entra na fatia de pessoas da casa.
  household_member_id uuid,
  name text not null,
  origin text not null check (origin in ('seed', 'pdf', 'manual')),
  active boolean not null default true,
  -- Aviso exibido no app (ex.: "trocas aguardando validação").
  status_note text,
  target_kcal numeric,
  target_protein_g numeric,
  target_carbs_g numeric,
  target_fat_g numeric,
  target_water_ml integer check (target_water_ml > 0),
  notes text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (id, owner_id)
);

-- Um plano ativo por usuário (e por pessoa da casa).
create unique index plans_one_active_per_person
  on public.plans (owner_id, coalesce(household_member_id, '00000000-0000-0000-0000-000000000000'))
  where active;

-- ---------------------------------------------------------------------
-- meals
-- ---------------------------------------------------------------------
create table public.meals (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null,
  owner_id uuid not null default auth.uid(),
  name text not null,
  time time not null,
  position integer not null default 0,
  unique (id, owner_id),
  foreign key (plan_id, owner_id) references public.plans (id, owner_id) on delete cascade
);

create index meals_plan_id_idx on public.meals (plan_id, owner_id);

-- ---------------------------------------------------------------------
-- meal_items
-- ---------------------------------------------------------------------
create table public.meal_items (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null,
  owner_id uuid not null default auth.uid(),
  food text not null,
  -- Quantidade como está no plano ("2 un (100 g)"). Os campos numéricos são
  -- preenchidos quando dá (lista de compras); "à vontade" fica só no texto.
  qty_text text not null,
  qty_value numeric,
  qty_unit text check (qty_unit in ('g', 'mL', 'un')),
  kcal numeric,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  position integer not null default 0,
  unique (id, owner_id),
  foreign key (meal_id, owner_id) references public.meals (id, owner_id) on delete cascade
);

create index meal_items_meal_id_idx on public.meal_items (meal_id, owner_id);

-- ---------------------------------------------------------------------
-- substitutions (trocas previstas para um item)
-- ---------------------------------------------------------------------
create table public.substitutions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null,
  owner_id uuid not null default auth.uid(),
  text text not null,
  position integer not null default 0,
  foreign key (item_id, owner_id) references public.meal_items (id, owner_id) on delete cascade
);

create index substitutions_item_id_idx on public.substitutions (item_id, owner_id);

-- ---------------------------------------------------------------------
-- hydration_slots (protocolo de horários de água; só guia, a meta é do plano)
-- ---------------------------------------------------------------------
create table public.hydration_slots (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null,
  owner_id uuid not null default auth.uid(),
  time time not null,
  ml integer not null check (ml > 0),
  label text,
  position integer not null default 0,
  foreign key (plan_id, owner_id) references public.plans (id, owner_id) on delete cascade
);

create index hydration_slots_plan_id_idx on public.hydration_slots (plan_id, owner_id);

-- ---------------------------------------------------------------------
-- RLS: cada linha só é lida e escrita pelo próprio dono.
-- ---------------------------------------------------------------------
alter table public.plans enable row level security;
alter table public.meals enable row level security;
alter table public.meal_items enable row level security;
alter table public.substitutions enable row level security;
alter table public.hydration_slots enable row level security;

create policy "plans: dono" on public.plans for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

create policy "meals: dono" on public.meals for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

create policy "meal_items: dono" on public.meal_items for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

create policy "substitutions: dono" on public.substitutions for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

create policy "hydration_slots: dono" on public.hydration_slots for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
