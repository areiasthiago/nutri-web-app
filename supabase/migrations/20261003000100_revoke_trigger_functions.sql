-- As funções de trigger da Fatia 1 são security definer e só devem rodar
-- pelos triggers em auth.users, nunca via API (/rest/v1/rpc).
revoke execute on function public.check_allowed_email() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
