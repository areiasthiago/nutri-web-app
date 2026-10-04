-- "Comeu fora de hora?": o que foi comido fora das refeições do plano (ex.: um
-- chocolate entre o almoço e o lanche). Soma no total do dia e conta como acima
-- do plano. Valores copiados no registro (o histórico não muda se a lista
-- "Já comi antes" for editada). log_date é o dia LOCAL do usuário, como em meal_logs.
create table public.snack_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  log_date date not null,
  logged_at timestamptz not null default now(),
  custom_meal_id uuid,
  name text not null check (char_length(name) between 1 and 80),
  kcal numeric check (kcal >= 0),
  protein_g numeric check (protein_g >= 0),
  carbs_g numeric check (carbs_g >= 0),
  fat_g numeric check (fat_g >= 0),
  foreign key (custom_meal_id, owner_id) references public.custom_meals (id, owner_id)
    on delete set null (custom_meal_id)
);

create index snack_logs_owner_date_idx on public.snack_logs (owner_id, log_date);
create index snack_logs_custom_meal_idx on public.snack_logs (custom_meal_id, owner_id);

alter table public.snack_logs enable row level security;

create policy "snack_logs: dono" on public.snack_logs for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
