-- Lembretes de refeição e água (Web Push), depois da prova de ponta a ponta.
-- A função "push" (chamada a cada minuto) escolhe o que venceu com as regras de
-- supabase/functions/_shared/reminders.ts e registra o envio em reminder_sends.

-- Preferências de lembrete. Sem linha = padrões.
create table public.reminder_settings (
  owner_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  meals_enabled boolean not null default true,
  water_enabled boolean not null default true,
  -- Antecedência do lembrete em minutos (0 = na hora).
  lead_minutes smallint not null default 0 check (lead_minutes between 0 and 60),
  -- Início do silêncio; null = automático (31 min depois da última refeição do plano).
  quiet_start time,
  quiet_end time not null default '06:30',
  updated_at timestamptz not null default now()
);

alter table public.reminder_settings enable row level security;

create policy "reminder_settings: dono" on public.reminder_settings for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

-- O que já foi enviado em cada dia (local) — impede lembrete repetido. Só a função escreve.
create table public.reminder_sends (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  local_date date not null,
  kind text not null check (kind in ('meal', 'water')),
  ref_id uuid not null,
  attempt smallint not null check (attempt in (1, 2)),
  sent_at timestamptz not null default now(),
  unique (owner_id, local_date, kind, ref_id, attempt)
);

alter table public.reminder_sends enable row level security;

create policy "reminder_sends: dono lê" on public.reminder_sends for select to authenticated
  using ((select auth.uid()) = owner_id);

-- O teste "com o app fechado" saiu do app.
drop table public.push_tests;

-- Limpeza diária: histórico do agendador e envios com mais de 3 dias.
select cron.schedule(
  'push-cleanup',
  '17 4 * * *',
  $$
  delete from cron.job_run_details where end_time < now() - interval '3 days';
  delete from public.reminder_sends where local_date < current_date - 3;
  $$
);
