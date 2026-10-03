-- Como usar:
-- 1. Copie este arquivo para "allowed_emails.local.sql" (esse nome já fica
--    fora do Git, veja o .gitignore).
-- 2. Troque os e-mails de exemplo abaixo pelos e-mails reais que podem
--    criar conta no app (o seu e o da conta de teste, por exemplo).
-- 3. Cole o conteúdo do arquivo .local.sql no SQL Editor do Supabase
--    (painel do projeto -> SQL Editor -> New query) e rode.
--
-- Você pode rodar esse script de novo a qualquer momento para liberar mais
-- e-mails; "on conflict do nothing" evita erro se o e-mail já estiver na lista.

insert into public.allowed_emails (email)
values
  (lower('seu-email@exemplo.com')),
  (lower('conta-de-teste@exemplo.com'))
on conflict (email) do nothing;
