-- Diz se a conta logada já tem senha (para a tela "Minha conta" mostrar
-- "Criar senha" ou "Trocar senha"). Quem entra pelo Google e define uma
-- senha continua com providers = ['google'] na sessão, então a resposta
-- precisa vir de auth.users. Devolve só true/false, e só sobre a própria
-- conta (auth.uid()); nunca expõe o hash.
create or replace function public.current_user_has_password()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select encrypted_password is not null and encrypted_password <> ''
       from auth.users
      where id = (select auth.uid())),
    false
  );
$$;

revoke execute on function public.current_user_has_password() from public, anon;
grant execute on function public.current_user_has_password() to authenticated;
