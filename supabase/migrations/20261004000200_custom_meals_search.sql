-- Busca na lista "Já comi antes" feita no banco (a lista cresce com o tempo).
-- search_text = nome + descrição, minúsculo e sem acento, mantido por trigger,
-- para "abobora" achar "Abóbora cozida". O app busca cada palavra com ilike.
create extension if not exists unaccent with schema extensions;

alter table public.custom_meals add column search_text text not null default '';

create or replace function public.custom_meals_set_search_text()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.search_text := lower(extensions.unaccent(new.name || ' ' || coalesce(new.description, '')));
  return new;
end;
$$;

create trigger custom_meals_search_text_trigger
  before insert or update of name, description on public.custom_meals
  for each row execute function public.custom_meals_set_search_text();

update public.custom_meals
   set search_text = lower(extensions.unaccent(name || ' ' || coalesce(description, '')));

revoke execute on function public.custom_meals_set_search_text() from public, anon, authenticated;
