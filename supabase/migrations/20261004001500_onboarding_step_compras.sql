-- Primeiros passos: passo "compras" (dia de compras), depois de "casa".
alter table public.profiles drop constraint profiles_onboarding_step_check;
alter table public.profiles add constraint profiles_onboarding_step_check
  check (onboarding_step in ('boas-vindas', 'nome', 'plano', 'treino', 'notificacoes', 'casa', 'compras', 'pronto'));
