-- Treino: rotina do personal (PDF ou à mão), registro das atividades do dia e
-- estimativa do gasto calórico, que entra no balanço do dia (registrado −
-- gasto). O app só faz a conta: não sugere comer mais nem compensar.

-- Peso (opcional), usado só para estimar o gasto das atividades. Sem peso, o
-- app usa um adulto médio e avisa que a estimativa fica menos precisa.
alter table public.profiles
  add column weight_kg numeric(5, 1) check (weight_kg between 25 and 400);

-- Primeiros passos ganham o passo "treino" (opcional).
alter table public.profiles drop constraint profiles_onboarding_step_check;
alter table public.profiles add constraint profiles_onboarding_step_check
  check (onboarding_step in ('boas-vindas', 'nome', 'plano', 'treino', 'notificacoes', 'casa', 'pronto'));

-- Plano de treino (uma versão ativa por pessoa; salvar cria uma nova).
create table public.workout_plans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  origin text not null check (origin in ('pdf', 'manual')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, owner_id)
);

create unique index workout_plans_one_active on public.workout_plans (owner_id) where active;

alter table public.workout_plans enable row level security;
create policy "workout_plans: dono" on public.workout_plans for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

-- Rotinas (Treino A, Treino B…).
create table public.workout_routines (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  plan_id uuid not null,
  name text not null check (char_length(trim(name)) between 1 and 80),
  position int not null default 0,
  unique (id, owner_id),
  foreign key (plan_id, owner_id) references public.workout_plans (id, owner_id) on delete cascade
);

alter table public.workout_routines enable row level security;
create policy "workout_routines: dono" on public.workout_routines for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

-- Exercícios de cada rotina, como estão no PDF ("4x15", "0kg", "60s").
create table public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  routine_id uuid not null,
  name text not null check (char_length(trim(name)) between 1 and 100),
  sets_text text not null default '',
  load_text text not null default '',
  rest_text text not null default '',
  position int not null default 0,
  foreign key (routine_id, owner_id) references public.workout_routines (id, owner_id) on delete cascade
);

alter table public.workout_exercises enable row level security;
create policy "workout_exercises: dono" on public.workout_exercises for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

-- Atividades feitas no dia: uma rotina do treino ou outra atividade livre.
-- Nome e gasto copiados no registro (o histórico não muda se o treino mudar).
create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  log_date date not null,
  logged_at timestamptz not null default now(),
  routine_id uuid,
  name text not null check (char_length(trim(name)) between 1 and 120),
  duration_min int not null check (duration_min between 1 and 600),
  kcal numeric not null check (kcal >= 0 and kcal <= 5000),
  -- Como o gasto foi estimado: pela IA (VIP) ou pela tabela de gasto (MET).
  kcal_source text not null check (kcal_source in ('ai', 'table')),
  note text
);

create index activity_logs_owner_date_idx on public.activity_logs (owner_id, log_date);

alter table public.activity_logs enable row level security;
create policy "activity_logs: dono" on public.activity_logs for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

-- Salva o treino revisado como o ativo (o anterior fica guardado, inativo).
-- p = { name, origin, routines: [{ name, exercises: [{ name, sets_text, load_text, rest_text }] }] }
create function public.replace_active_workout(p jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  new_plan uuid;
  routine jsonb;
  routine_pos int := 0;
  new_routine uuid;
  ex jsonb;
  ex_pos int;
begin
  if uid is null then
    raise exception 'Sessão expirada.';
  end if;
  if coalesce(p->>'origin', '') not in ('pdf', 'manual') then
    raise exception 'Origem do treino inválida.';
  end if;
  if jsonb_array_length(coalesce(p->'routines', '[]')) = 0 then
    raise exception 'O treino precisa ter pelo menos uma rotina.';
  end if;

  update public.workout_plans set active = false where owner_id = uid and active;

  insert into public.workout_plans (name, origin)
  values (coalesce(nullif(trim(p->>'name'), ''), 'Meu treino'), p->>'origin')
  returning id into new_plan;

  for routine in select * from jsonb_array_elements(p->'routines') loop
    insert into public.workout_routines (plan_id, name, position)
    values (new_plan, coalesce(nullif(trim(routine->>'name'), ''), 'Treino'), routine_pos)
    returning id into new_routine;
    routine_pos := routine_pos + 1;

    ex_pos := 0;
    for ex in select * from jsonb_array_elements(coalesce(routine->'exercises', '[]')) loop
      continue when coalesce(trim(ex->>'name'), '') = '';
      insert into public.workout_exercises (routine_id, name, sets_text, load_text, rest_text, position)
      values (new_routine, trim(ex->>'name'), coalesce(ex->>'sets_text', ''), coalesce(ex->>'load_text', ''),
              coalesce(ex->>'rest_text', ''), ex_pos);
      ex_pos := ex_pos + 1;
    end loop;
  end loop;

  return new_plan;
end;
$$;

revoke execute on function public.replace_active_workout(jsonb) from public, anon;
grant execute on function public.replace_active_workout(jsonb) to authenticated;
