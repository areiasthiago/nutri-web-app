-- Pessoas da casa (briefing, seção 7). Ninguém além do usuário faz login: as
-- pessoas são cadastros dentro da conta dele, com as mesmas regras de acesso.
-- De criança, só apelido e faixa de idade (sem nascimento, peso, foto ou saúde).

create table public.household_members (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nickname text not null check (char_length(trim(nickname)) between 1 and 30),
  kind text not null check (kind in ('adult', 'child')),
  age_band text check (age_band in ('1-3', '4-8', '9-13', '14-17')),
  -- Quanto come em relação a um adulto sem dieta (só para estimar a compra).
  factor numeric(3, 2) not null default 1 check (factor between 0.1 and 2),
  -- Refeições que faz em casa: "dia:refeição", dia 0 = domingo.
  home_meals text[] not null default array['0:cafe', '0:almoco', '0:lanche', '0:jantar', '1:cafe', '1:almoco', '1:lanche', '1:jantar', '2:cafe', '2:almoco', '2:lanche', '2:jantar', '3:cafe', '3:almoco', '3:lanche', '3:jantar', '4:cafe', '4:almoco', '4:lanche', '4:jantar', '5:cafe', '5:almoco', '5:lanche', '5:jantar', '6:cafe', '6:almoco', '6:lanche', '6:jantar']::text[]
    check (home_meals <@ array['0:cafe', '0:almoco', '0:lanche', '0:jantar', '1:cafe', '1:almoco', '1:lanche', '1:jantar', '2:cafe', '2:almoco', '2:lanche', '2:jantar', '3:cafe', '3:almoco', '3:lanche', '3:jantar', '4:cafe', '4:almoco', '4:lanche', '4:jantar', '5:cafe', '5:almoco', '5:lanche', '5:jantar', '6:cafe', '6:almoco', '6:lanche', '6:jantar']::text[]),
  position int not null default 0,
  created_at timestamptz not null default now(),
  check ((kind = 'adult' and age_band is null) or (kind = 'child' and age_band is not null)),
  unique (id, owner_id)
);

alter table public.household_members enable row level security;

create policy "household_members: dono" on public.household_members for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

-- Plano de uma pessoa da casa: some junto com ela.
create index plans_household_member_idx on public.plans (household_member_id, owner_id);
alter table public.plans
  add constraint plans_household_member_fk foreign key (household_member_id, owner_id)
  references public.household_members (id, owner_id) on delete cascade;

-- Comida da casa: alimentos de base com a porção de um adulto sem dieta, por refeição.
create table public.house_foods (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 60),
  slot text not null check (slot in ('cafe', 'almoco', 'lanche', 'jantar')),
  qty_value numeric not null check (qty_value > 0),
  qty_unit text not null check (qty_unit in ('g', 'mL', 'un')),
  position int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.house_foods enable row level security;

create policy "house_foods: dono" on public.house_foods for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

-- Extras da casa: itens recorrentes que não vêm de plano nenhum, por semana.
create table public.household_extras (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 60),
  qty_value numeric not null check (qty_value > 0),
  qty_unit text not null check (qty_unit in ('g', 'mL', 'un', 'kg', 'L')),
  position int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.household_extras enable row level security;

create policy "household_extras: dono" on public.household_extras for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

-- Salvar plano agora aceita para quem é (member null = o próprio usuário).
drop function public.replace_active_plan(jsonb);

create function public.replace_active_plan(p jsonb, member uuid default null)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  old_plan uuid;
  local_today date;
  new_plan uuid;
  meal jsonb;
  meal_pos int := 0;
  new_meal uuid;
  item jsonb;
  item_pos int;
  new_item uuid;
  sub text;
  sub_pos int;
  slot jsonb;
  slot_pos int := 0;
begin
  if uid is null then
    raise exception 'Sessão expirada.';
  end if;
  if coalesce(p->>'origin', '') not in ('pdf', 'manual') then
    raise exception 'Origem do plano inválida.';
  end if;
  if jsonb_array_length(coalesce(p->'meals', '[]')) = 0 then
    raise exception 'O plano precisa ter pelo menos uma refeição.';
  end if;
  if member is not null and not exists (
    select 1 from public.household_members where id = member and owner_id = uid
  ) then
    raise exception 'Pessoa da casa não encontrada.';
  end if;

  select id into old_plan from public.plans
   where owner_id = uid and household_member_id is not distinct from member and active;
  select (now() at time zone coalesce(timezone, 'America/Sao_Paulo'))::date into local_today
    from public.profiles where id = uid;

  update public.plans set active = false
   where owner_id = uid and household_member_id is not distinct from member and active;

  insert into public.plans (household_member_id, name, origin, status_note, target_kcal, target_protein_g,
                            target_carbs_g, target_fat_g, target_water_ml, notes)
  values (
    member,
    coalesce(nullif(trim(p->>'name'), ''), 'Meu plano'),
    p->>'origin',
    nullif(trim(p->>'status_note'), ''),
    (p->'targets'->>'kcal')::numeric,
    (p->'targets'->>'protein_g')::numeric,
    (p->'targets'->>'carbs_g')::numeric,
    (p->'targets'->>'fat_g')::numeric,
    (p->'targets'->>'water_ml')::int,
    array(select jsonb_array_elements_text(coalesce(p->'notes', '[]')))
  )
  returning id into new_plan;

  for meal in select * from jsonb_array_elements(p->'meals') loop
    insert into public.meals (plan_id, name, time, position)
    values (new_plan, meal->>'name', (meal->>'time')::time, meal_pos)
    returning id into new_meal;
    meal_pos := meal_pos + 1;

    item_pos := 0;
    for item in select * from jsonb_array_elements(coalesce(meal->'items', '[]')) loop
      insert into public.meal_items (meal_id, food, qty_text, qty_value, qty_unit,
                                     kcal, protein_g, carbs_g, fat_g, position)
      values (new_meal, item->>'food', coalesce(item->>'qty_text', ''),
              (item->>'qty_value')::numeric, item->>'qty_unit',
              (item->>'kcal')::numeric, (item->>'protein_g')::numeric,
              (item->>'carbs_g')::numeric, (item->>'fat_g')::numeric, item_pos)
      returning id into new_item;
      item_pos := item_pos + 1;

      sub_pos := 0;
      for sub in select jsonb_array_elements_text(coalesce(item->'substitutions', '[]')) loop
        insert into public.substitutions (item_id, text, position)
        values (new_item, sub, sub_pos);
        sub_pos := sub_pos + 1;
      end loop;
    end loop;
  end loop;

  for slot in select * from jsonb_array_elements(coalesce(p->'hydration_slots', '[]')) loop
    insert into public.hydration_slots (plan_id, time, ml, label, position)
    values (new_plan, (slot->>'time')::time, (slot->>'ml')::int,
            nullif(trim(slot->>'label'), ''), slot_pos);
    slot_pos := slot_pos + 1;
  end loop;

  -- Refeições já marcadas hoje (ou depois) no plano anterior passam para a
  -- refeição de mesmo nome do plano novo, para editar o plano não apagar os
  -- ✓ do dia. Registros de dias anteriores ficam no plano antigo (histórico).
  -- (Só no plano do próprio usuário: as pessoas da casa não registram refeições.)
  if old_plan is not null and member is null then
    update public.meal_logs l
       set meal_id = nm.id, meal_name = nm.name, meal_time = nm.time
      from public.meals om
      join public.meals nm on nm.plan_id = new_plan and lower(trim(nm.name)) = lower(trim(om.name))
     where l.owner_id = uid
       and l.meal_id = om.id
       and om.plan_id = old_plan
       and l.log_date >= coalesce(local_today, current_date)
       -- Só nomes únicos nas duas versões (evita duas marcações caírem na mesma refeição).
       and (select count(*) from public.meals x where x.plan_id = old_plan and lower(trim(x.name)) = lower(trim(om.name))) = 1
       and (select count(*) from public.meals x where x.plan_id = new_plan and lower(trim(x.name)) = lower(trim(om.name))) = 1;
  end if;

  return new_plan;
end;
$$;

revoke execute on function public.replace_active_plan(jsonb, uuid) from public, anon;
grant execute on function public.replace_active_plan(jsonb, uuid) to authenticated;
