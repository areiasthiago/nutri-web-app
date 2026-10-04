-- Corrige a conferência do segredo do agendamento: "secret" também é o nome de
-- uma coluna de vault.decrypted_secrets, que vencia o parâmetro.
create or replace function public.push_check_cron_secret(secret text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1 from vault.decrypted_secrets s where s.name = 'push_cron_secret' and s.decrypted_secret = $1
  );
$$;
revoke execute on function public.push_check_cron_secret(text) from public, anon, authenticated;
grant execute on function public.push_check_cron_secret(text) to service_role;
