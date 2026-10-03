-- IA (Claude) só para usuários VIP, com teto de gasto mensal por usuário.
-- Quem é VIP e qual o teto é decidido pelo dono do projeto direto no banco
-- (SQL Editor); o app só LÊ. A chamada à IA acontece na Edge Function
-- ai-extract-plan, que usa a service_role para conferir o acesso e gravar o uso.

-- ---------------------------------------------------------------------
-- ai_access: quem pode usar IA, teto mensal e aceite do termo.
-- ---------------------------------------------------------------------
create table public.ai_access (
  user_id uuid primary key references auth.users (id) on delete cascade,
  monthly_limit_usd numeric(8, 2) not null default 1.00 check (monthly_limit_usd >= 0),
  -- Quando a pessoa aceitou o termo de uso da IA (envio do plano à Anthropic).
  consented_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.ai_access enable row level security;

-- Só leitura da própria linha. Sem policy de escrita: ninguém vira VIP nem
-- aumenta o próprio teto pela API.
create policy "ai_access: dono lê" on public.ai_access for select to authenticated
  using ((select auth.uid()) = user_id);

-- Aceitar o termo é a única escrita que o usuário faz aqui, e só no próprio
-- registro, só no campo consented_at.
create or replace function public.accept_ai_terms()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.ai_access
     set consented_at = now()
   where user_id = (select auth.uid()) and consented_at is null;
  return exists (
    select 1 from public.ai_access
     where user_id = (select auth.uid()) and consented_at is not null
  );
end;
$$;

revoke execute on function public.accept_ai_terms() from public, anon;
grant execute on function public.accept_ai_terms() to authenticated;

-- ---------------------------------------------------------------------
-- ai_usage: uma linha por chamada à IA, com tokens e custo estimado.
-- Escrita só pela Edge Function (service_role); o usuário lê o próprio uso.
-- ---------------------------------------------------------------------
create table public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  feature text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd numeric(10, 6) not null default 0,
  created_at timestamptz not null default now()
);

create index ai_usage_user_month_idx on public.ai_usage (user_id, created_at);

alter table public.ai_usage enable row level security;

create policy "ai_usage: dono lê" on public.ai_usage for select to authenticated
  using ((select auth.uid()) = user_id);
