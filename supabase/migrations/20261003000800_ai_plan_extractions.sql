-- Resultado da leitura do PDF pela IA, guardado assim que fica pronto.
-- Motivo: a leitura leva ~30-90 s; se a conexão do celular cair nesse tempo
-- (tela apagou, troca de app), a resposta se perdia mesmo já tendo sido paga.
-- Agora o app busca o resultado aqui. A linha é apagada quando a pessoa salva
-- ou descarta o plano; o app só oferece leituras das últimas 24 h.
create table public.ai_plan_extractions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan jsonb not null,
  cost_usd numeric(10, 6) not null default 0,
  created_at timestamptz not null default now()
);

create index ai_plan_extractions_user_idx on public.ai_plan_extractions (user_id, created_at desc);

alter table public.ai_plan_extractions enable row level security;

-- Escrita só pela Edge Function (service_role). O dono lê e apaga.
create policy "ai_plan_extractions: dono lê" on public.ai_plan_extractions for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "ai_plan_extractions: dono apaga" on public.ai_plan_extractions for delete to authenticated
  using ((select auth.uid()) = user_id);
