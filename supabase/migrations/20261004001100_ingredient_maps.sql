-- Ingredientes de compra de cada item do plano ("Omelete com 2 ovos e tomate"
-- → ovo 2 un + tomate 30 g), com a quantidade em cru, como se compra. A chave é
-- o texto do item (alimento + quantidade), então vale para todas as versões do
-- plano e para as pessoas da casa com o mesmo item. Feitos pela IA (só VIP) ou
-- à mão; o que foi ajustado à mão a IA nunca sobrescreve. Sem linha aqui, a
-- lista usa as regras automáticas do app.
create table public.ingredient_maps (
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_key text not null check (char_length(item_key) between 1 and 300),
  food text not null,
  qty_text text not null default '',
  -- [{ "name": "Ovo", "qty_value": 2, "qty_unit": "un" }, ...]; qty null = sem quantidade.
  ingredients jsonb not null check (jsonb_typeof(ingredients) = 'array'),
  source text not null check (source in ('ai', 'manual')),
  updated_at timestamptz not null default now(),
  primary key (owner_id, item_key)
);

alter table public.ingredient_maps enable row level security;

create policy "ingredient_maps: dono" on public.ingredient_maps for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
