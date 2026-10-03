-- Salva um plano novo (vindo do PDF ou digitado à mão) e o torna o plano
-- ativo do usuário, desativando o anterior (que fica guardado). Tudo numa
-- transação: ou o plano entra inteiro, ou nada muda.
--
-- security invoker: roda com as permissões de quem chama, então a RLS das
-- tabelas do plano vale normalmente (cada linha nasce com owner_id = auth.uid()).
--
-- Formato de p (o mesmo do rascunho do app):
-- { name, origin ('pdf'|'manual'), status_note, notes: [text],
--   targets: { kcal, protein_g, carbs_g, fat_g, water_ml },
--   meals: [{ name, time 'HH:MM', items: [{ food, qty_text, qty_value, qty_unit,
--            kcal, protein_g, carbs_g, fat_g, substitutions: [text] }] }],
--   hydration_slots: [{ time 'HH:MM', ml, label }] }
create or replace function public.replace_active_plan(p jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
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

  update public.plans set active = false
   where owner_id = uid and household_member_id is null and active;

  insert into public.plans (name, origin, status_note, target_kcal, target_protein_g,
                            target_carbs_g, target_fat_g, target_water_ml, notes)
  values (
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

  return new_plan;
end;
$$;

revoke execute on function public.replace_active_plan(jsonb) from public, anon;
grant execute on function public.replace_active_plan(jsonb) to authenticated;
