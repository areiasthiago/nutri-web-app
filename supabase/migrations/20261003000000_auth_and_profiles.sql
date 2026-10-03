-- Fatia 1: login + convites (allowlist) + perfil básico.
-- Nenhum dado pessoal real é inserido aqui. Os e-mails liberados são
-- inseridos à parte, via supabase/seed/allowed_emails.local.sql (fora do Git).

-- ---------------------------------------------------------------------
-- allowed_emails: lista de convite. Só o backend (trigger abaixo) lê esta
-- tabela; não existe policy de leitura/escrita para usuários comuns, então
-- com RLS ligada e sem policies o acesso via API fica bloqueado por padrão.
-- ---------------------------------------------------------------------
create table if not exists public.allowed_emails (
  email text primary key,
  created_at timestamptz not null default now()
);

alter table public.allowed_emails enable row level security;

-- ---------------------------------------------------------------------
-- profiles: um perfil por usuário autenticado.
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  timezone text not null default 'America/Sao_Paulo',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: usuário lê o próprio perfil"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles: usuário atualiza o próprio perfil"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ---------------------------------------------------------------------
-- Gate de convite: roda ANTES de criar a linha em auth.users, para os dois
-- métodos de login (Google OAuth e e-mail/senha). Se o e-mail não estiver
-- em allowed_emails, a criação da conta falha.
-- ---------------------------------------------------------------------
create or replace function public.check_allowed_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.allowed_emails
    where email = lower(new.email)
  ) then
    raise exception 'E-mail não autorizado a criar conta: %', new.email;
  end if;
  return new;
end;
$$;

drop trigger if exists check_allowed_email_trigger on auth.users;
create trigger check_allowed_email_trigger
  before insert on auth.users
  for each row execute function public.check_allowed_email();

-- ---------------------------------------------------------------------
-- Cria o perfil automaticamente quando uma conta nova é aceita.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

drop trigger if exists handle_new_user_trigger on auth.users;
create trigger handle_new_user_trigger
  after insert on auth.users
  for each row execute function public.handle_new_user();
