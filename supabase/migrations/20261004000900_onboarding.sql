-- Primeiros passos (apresentação em sequência para conta nova): em que passo
-- a pessoa parou e quando terminou (ou pulou). null = ainda não terminou.
alter table public.profiles
  add column onboarding_step text check (onboarding_step in ('boas-vindas', 'nome', 'plano', 'notificacoes', 'casa', 'pronto')),
  add column onboarding_done_at timestamptz;
