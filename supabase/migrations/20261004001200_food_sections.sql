-- Seção do mercado escolhida pela pessoa para um item da lista de compras
-- (sobrepõe a seção que o app deduz pelo nome).
create table public.food_sections (
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  food_key text not null check (char_length(food_key) between 1 and 80),
  section text not null check (section in ('hortifruti', 'padaria', 'carnes', 'laticinios', 'mercearia', 'temperos', 'bebidas', 'congelados', 'outros')),
  primary key (owner_id, food_key)
);

alter table public.food_sections enable row level security;

create policy "food_sections: dono" on public.food_sections for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
