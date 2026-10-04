-- Refeições fora do plano ("comi outra coisa").
--
-- custom_meals: a lista pessoal "Já comi antes". Cada coisa comida fora do
-- plano fica guardada com a estimativa nutricional (feita pela IA ou digitada),
-- para ser reaproveitada com um toque, sem chamar a IA de novo.
create table public.custom_meals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  -- Quantidade/detalhes como a pessoa descreveu (ex.: "1 tigela média, com manteiga").
  description text check (char_length(description) <= 300),
  kcal numeric check (kcal >= 0),
  protein_g numeric check (protein_g >= 0),
  carbs_g numeric check (carbs_g >= 0),
  fat_g numeric check (fat_g >= 0),
  source text not null default 'manual' check (source in ('ai', 'manual')),
  use_count integer not null default 0,
  last_used_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (id, owner_id)
);

create index custom_meals_owner_recent_idx on public.custom_meals (owner_id, last_used_at desc);

alter table public.custom_meals enable row level security;

create policy "custom_meals: dono" on public.custom_meals for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

-- meal_logs: o que foi comido de fato, quando não foi o do plano. Os valores
-- ficam copiados no registro (o histórico não muda se a lista for editada);
-- apagar um item da lista só desliga o vínculo.
alter table public.meal_logs
  add column custom_meal_id uuid,
  add column actual_name text,
  add column actual_kcal numeric,
  add column actual_protein_g numeric,
  add column actual_carbs_g numeric,
  add column actual_fat_g numeric,
  add constraint meal_logs_custom_meal_fk
    foreign key (custom_meal_id, owner_id) references public.custom_meals (id, owner_id)
    on delete set null (custom_meal_id);

create index meal_logs_custom_meal_idx on public.meal_logs (custom_meal_id, owner_id);
