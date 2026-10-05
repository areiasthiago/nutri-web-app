-- Peso: um registro por dia (o último do dia vale). O peso do perfil
-- (profiles.weight_kg, usado no gasto das atividades) passa a ser sempre o do
-- registro mais recente, mantido por gatilho.
-- Lembrete diário para se pesar, ao fim do silêncio (reminder_settings.weight_enabled).

create table public.weight_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  log_date date not null,
  weight_kg numeric(5,1) not null check (weight_kg between 25 and 400),
  logged_at timestamptz not null default now(),
  unique (owner_id, log_date)
);

alter table public.weight_logs enable row level security;

create policy "weight_logs: dono" on public.weight_logs
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create function public.weight_logs_sync_profile()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  who uuid := coalesce(new.owner_id, old.owner_id);
begin
  update public.profiles
     set weight_kg = (select w.weight_kg from public.weight_logs w where w.owner_id = who order by w.log_date desc limit 1)
   where id = who;
  return null;
end;
$$;

create trigger weight_logs_sync_profile
  after insert or update or delete on public.weight_logs
  for each row execute function public.weight_logs_sync_profile();

-- Quem já tinha peso no perfil: vira o primeiro registro (hoje).
insert into public.weight_logs (owner_id, log_date, weight_kg)
  select id, current_date, weight_kg from public.profiles where weight_kg is not null
  on conflict do nothing;

-- Lembrete de peso
alter table public.reminder_settings add column weight_enabled boolean not null default true;

alter table public.reminder_sends drop constraint reminder_sends_kind_check;
alter table public.reminder_sends add constraint reminder_sends_kind_check check (kind in ('meal', 'water', 'weight'));
alter table public.reminder_snoozes drop constraint reminder_snoozes_kind_check;
alter table public.reminder_snoozes add constraint reminder_snoozes_kind_check check (kind in ('meal', 'water', 'weight'));
alter table public.notification_actions drop constraint notification_actions_kind_check;
alter table public.notification_actions add constraint notification_actions_kind_check check (kind in ('meal', 'water', 'weight'));

-- Primeiros passos: passo "peso", depois de "Sobre você".
alter table public.profiles drop constraint profiles_onboarding_step_check;
alter table public.profiles add constraint profiles_onboarding_step_check
  check (onboarding_step in ('boas-vindas', 'nome', 'peso', 'plano', 'treino', 'notificacoes', 'casa', 'compras', 'pronto'));
