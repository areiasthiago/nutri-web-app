-- Botões dentro da notificação ("Registrar" e "Adiar 15 min").
--
-- O service worker do celular não tem a sessão da pessoa; cada notificação leva
-- um código de uso único (token), que a função "push" confere antes de agir.
-- As duas tabelas são só da função (service_role): RLS ligado e sem políticas.

create table public.notification_actions (
  token uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  local_date date not null,
  kind text not null check (kind in ('meal', 'water')),
  ref_id uuid not null,
  -- Água: volume do horário do protocolo ("Registrar 400 mL").
  ml integer check (ml > 0),
  created_at timestamptz not null default now(),
  used_at timestamptz
);

alter table public.notification_actions enable row level security;

-- Lembrete adiado pelo botão: a função reenvia na hora marcada.
create table public.reminder_snoozes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  local_date date not null,
  kind text not null check (kind in ('meal', 'water')),
  ref_id uuid not null,
  send_at timestamptz not null,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index reminder_snoozes_due_idx on public.reminder_snoozes (owner_id, send_at) where sent_at is null;

alter table public.reminder_snoozes enable row level security;

-- Limpeza diária também destas tabelas.
select cron.schedule(
  'push-cleanup',
  '17 4 * * *',
  $$
  delete from cron.job_run_details where end_time < now() - interval '3 days';
  delete from public.reminder_sends where local_date < current_date - 3;
  delete from public.notification_actions where created_at < now() - interval '2 days';
  delete from public.reminder_snoozes where created_at < now() - interval '2 days';
  $$
);
