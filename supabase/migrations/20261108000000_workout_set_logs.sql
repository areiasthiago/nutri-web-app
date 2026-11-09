-- Modo treino: cada série feita (carga e repetições, ou o tempo, nas séries
-- por tempo), para mostrar "da última vez" e acompanhar a progressão.
--
-- O histórico é pelo nome do exercício, copiado no registro: salvar o treino
-- cria exercícios novos (replace_active_workout), e o histórico continua.
create table public.workout_set_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  log_date date not null,
  logged_at timestamptz not null default now(),
  exercise_name text not null check (char_length(trim(exercise_name)) between 1 and 100),
  set_number int not null check (set_number between 1 and 20),
  reps int check (reps between 0 and 500),
  load_kg numeric(5, 1) check (load_kg between 0 and 500),
  seconds int check (seconds between 1 and 7200)
);

create index workout_set_logs_owner_exercise_idx on public.workout_set_logs (owner_id, exercise_name, logged_at desc);

alter table public.workout_set_logs enable row level security;
create policy "workout_set_logs: dono" on public.workout_set_logs for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
