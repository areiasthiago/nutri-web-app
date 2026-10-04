-- Lembretes por notificação (Web Push), primeira etapa: a prova de ponta a
-- ponta pedida no briefing. O aparelho se inscreve, a pessoa agenda um teste
-- para daqui a 2 minutos, e um agendamento do banco (pg_cron + pg_net) chama a
-- Edge Function "push" a cada minuto, que envia o que venceu — com o app fechado.
--
-- Chaves VAPID: geradas pela própria função na primeira vez e guardadas no
-- Vault (nunca no repositório nem no app). Só a função (service_role) lê.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Inscrição de push de um aparelho (endpoint do serviço de push + chaves dele).
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_success_at timestamptz
);

create index push_subscriptions_owner_idx on public.push_subscriptions (owner_id);

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions: dono" on public.push_subscriptions for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

-- Notificação de teste agendada ("Testar com o app fechado").
create table public.push_tests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  send_at timestamptz not null,
  sent_at timestamptz,
  -- "enviado para N aparelho(s)" ou o erro, para a tela mostrar.
  result text,
  created_at timestamptz not null default now(),
  check (send_at <= created_at + interval '1 hour')
);

create index push_tests_due_idx on public.push_tests (send_at) where sent_at is null;

alter table public.push_tests enable row level security;

create policy "push_tests: dono lê" on public.push_tests for select to authenticated
  using ((select auth.uid()) = owner_id);
create policy "push_tests: dono agenda" on public.push_tests for insert to authenticated
  with check ((select auth.uid()) = owner_id and sent_at is null and result is null);

-- ---------------------------------------------------------------------------
-- Segredos (Vault), acessíveis só pela função (service_role)
-- ---------------------------------------------------------------------------

-- Segredo que o agendamento manda no cabeçalho, para a função saber que a
-- chamada veio do banco.
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'push_cron_secret');

create function public.push_check_cron_secret(secret text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1 from vault.decrypted_secrets where name = 'push_cron_secret' and decrypted_secret = secret
  );
$$;

-- Chaves VAPID (JSON exportado pela função), ou null se ainda não existem.
create function public.push_get_vapid_keys()
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'push_vapid_keys';
$$;

-- Guarda as chaves geradas, se ainda não houver; devolve as que valem (as
-- existentes, se duas chamadas gerarem ao mesmo tempo).
create function public.push_set_vapid_keys(keys text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current text;
begin
  perform pg_advisory_xact_lock(hashtext('push_vapid_keys'));
  select decrypted_secret into current from vault.decrypted_secrets where name = 'push_vapid_keys';
  if current is not null then
    return current;
  end if;
  perform vault.create_secret(keys, 'push_vapid_keys');
  return keys;
end;
$$;

revoke execute on function public.push_check_cron_secret(text) from public, anon, authenticated;
revoke execute on function public.push_get_vapid_keys() from public, anon, authenticated;
revoke execute on function public.push_set_vapid_keys(text) from public, anon, authenticated;
grant execute on function public.push_check_cron_secret(text) to service_role;
grant execute on function public.push_get_vapid_keys() to service_role;
grant execute on function public.push_set_vapid_keys(text) to service_role;

-- ---------------------------------------------------------------------------
-- Agendamentos
-- ---------------------------------------------------------------------------

-- A cada minuto, chama a função para enviar o que venceu (~43 mil chamadas por
-- mês; o plano gratuito inclui 500 mil).
select cron.schedule(
  'push-dispatch',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://diyovmvytexosjxujand.supabase.co/functions/v1/push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_cron_secret')
    ),
    body := '{"action":"dispatch"}'::jsonb,
    timeout_milliseconds := 10000
  );
  $$
);

-- Limpeza diária: histórico do agendador e testes antigos não crescem para sempre.
select cron.schedule(
  'push-cleanup',
  '17 4 * * *',
  $$
  delete from cron.job_run_details where end_time < now() - interval '3 days';
  delete from public.push_tests where created_at < now() - interval '7 days';
  $$
);
