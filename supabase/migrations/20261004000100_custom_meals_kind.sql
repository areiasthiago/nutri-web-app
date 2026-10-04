-- A lista "Já comi antes" guarda duas coisas diferentes:
--   'meal': uma refeição inteira comida no lugar da do plano ("Comi outra coisa");
--   'item': um alimento trocado por outro dentro da refeição ("Outro…" em Fazer trocas).
-- Misturadas, um alimento (ex.: abóbora no lugar do arroz) aparecia como
-- sugestão de refeição completa. Agora cada lista sugere só o seu tipo.
alter table public.custom_meals
  add column kind text not null default 'meal' check (kind in ('meal', 'item'));

create index custom_meals_owner_kind_idx on public.custom_meals (owner_id, kind, last_used_at desc);
