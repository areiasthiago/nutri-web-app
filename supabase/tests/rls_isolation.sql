-- Teste de isolamento entre usuários (o mais importante do projeto).
--
-- Cria dois usuários fictícios, A e B, e confere que B não lê, não altera e
-- não apaga nada de A, nem consegue escrever em nome de A. Termina SEMPRE com
-- um erro proposital "RESULTADO (transação desfeita): ...", que desfaz tudo:
-- nenhum dado fica no banco. Leia o resultado na mensagem de erro.
--
-- Esperado: A vê 1 e altera o próprio perfil (1); todos os "B ..." com 0 ou "bloqueado"; anônimo vê 0;
-- plano de A intacto: 1. Qualquer "PERMITIU" é falha grave.
--
-- Como rodar: cole no SQL Editor do Supabase e clique em Run. Ao criar tabela
-- nova com dados de usuário, acrescente os casos dela aqui.

do $$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  plan_a uuid;
  meal_a uuid;
  member_a uuid;
  n int;
  report text := '';
begin
  insert into public.allowed_emails (email) values ('rls-test-a@example.com'), ('rls-test-b@example.com');
  insert into auth.users (id, email, aud, role) values
    (a, 'rls-test-a@example.com', 'authenticated', 'authenticated'),
    (b, 'rls-test-b@example.com', 'authenticated', 'authenticated');

  -- Dados de IA de A (gravados pelo servidor, como a Edge Function faz)
  insert into public.ai_access (user_id) values (a);
  insert into public.ai_usage (user_id, feature, model, cost_usd) values (a, 'teste', 'teste', 0.01);
  insert into public.ai_plan_extractions (user_id, plan) values (a, '{"meals": []}');

  -- Usuário A cria um plano com uma refeição, um item, uma troca e um horário de água
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.plans (name, origin) values ('Plano A', 'manual') returning id into plan_a;
  with m as (
    insert into public.meals (plan_id, name, time) values (plan_a, 'Almoço', '12:00') returning id
  ), i as (
    insert into public.meal_items (meal_id, food, qty_text) select id, 'Arroz', '80 g' from m returning id
  )
  insert into public.substitutions (item_id, text) select id, 'Batata' from i;
  insert into public.hydration_slots (plan_id, time, ml) values (plan_a, '08:00', 300);
  select id into meal_a from public.meals where plan_id = plan_a limit 1;
  insert into public.meal_logs (meal_id, log_date, meal_name, meal_time)
    values (meal_a, current_date, 'Almoço', '12:00');
  insert into public.water_logs (log_date, ml) values (current_date, 362);
  insert into public.custom_meals (name, kcal) values ('Pipoca', 130);
  insert into public.snack_logs (log_date, name, kcal) values (current_date, 'Chocolate', 140);
  insert into public.push_subscriptions (endpoint, p256dh, auth) values ('https://push.example/a', 'k', 'x');
  insert into public.reminder_settings (lead_minutes) values (5);
  insert into public.household_members (nickname, kind) values ('Ana', 'adult') returning id into member_a;
  insert into public.house_foods (name, slot, qty_value, qty_unit) values ('Arroz', 'almoco', 80, 'g');
  insert into public.household_extras (name, qty_value, qty_unit) values ('Leite', 6, 'L');
  insert into public.food_yields (food_key, yield) values ('arroz', 2.5);
  insert into public.shopping_checks (week_start, item_key) values (current_date, 'arroz|g');
  insert into public.food_sections (food_key, section) values ('azeite', 'temperos');
  insert into public.ingredient_maps (item_key, food, ingredients, source) values ('ovo mexido|2 un', 'Ovo mexido', '[{"name":"Ovo","qty_value":2,"qty_unit":"un"}]', 'manual');
  perform public.replace_active_plan('{"origin":"manual","meals":[{"name":"Almoço","time":"12:00"}]}'::jsonb, member_a);
  select count(*) into n from public.plans; report := report || 'A vê planos: ' || n || '; ';
  select count(*) into n from public.ai_plan_extractions; report := report || 'A vê a própria leitura PDF: ' || n || '; ';
  update public.profiles set display_name = 'A' where id = a;
  get diagnostics n = row_count; report := report || 'A altera o próprio perfil: ' || n || '; ';

  -- Usuário B tenta ler, alterar, apagar e escrever no que é de A
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.plans; report := report || 'B vê planos: ' || n || '; ';
  select count(*) into n from public.meals; report := report || 'B vê refeições: ' || n || '; ';
  select count(*) into n from public.meal_items; report := report || 'B vê itens: ' || n || '; ';
  select count(*) into n from public.substitutions; report := report || 'B vê trocas: ' || n || '; ';
  select count(*) into n from public.hydration_slots; report := report || 'B vê água: ' || n || '; ';
  select count(*) into n from public.profiles where id = a; report := report || 'B vê perfil de A: ' || n || '; ';
  select count(*) into n from public.meal_logs; report := report || 'B vê refeições feitas de A: ' || n || '; ';
  delete from public.meal_logs;
  get diagnostics n = row_count; report := report || 'B apaga refeições feitas de A: ' || n || '; ';
  begin
    insert into public.meal_logs (meal_id, log_date, meal_name, meal_time)
      values (meal_a, current_date + 1, 'x', '12:00');
    report := report || 'B marca refeição de A: PERMITIU; ';
  exception when others then
    report := report || 'B marca refeição de A: bloqueado (' || sqlstate || '); ';
  end;
  select count(*) into n from public.water_logs; report := report || 'B vê água de A: ' || n || '; ';
  delete from public.water_logs;
  get diagnostics n = row_count; report := report || 'B apaga água de A: ' || n || '; ';
  begin
    insert into public.water_logs (owner_id, log_date, ml) values (a, current_date, 999);
    report := report || 'B registra água em nome de A: PERMITIU; ';
  exception when others then
    report := report || 'B registra água em nome de A: bloqueado (' || sqlstate || '); ';
  end;
  select count(*) into n from public.snack_logs; report := report || 'B vê fora de hora de A: ' || n || '; ';
  delete from public.snack_logs;
  get diagnostics n = row_count; report := report || 'B apaga fora de hora de A: ' || n || '; ';
  begin
    insert into public.snack_logs (owner_id, log_date, name) values (a, current_date, 'x');
    report := report || 'B registra fora de hora em nome de A: PERMITIU; ';
  exception when others then
    report := report || 'B registra fora de hora em nome de A: bloqueado (' || sqlstate || '); ';
  end;
  select count(*) into n from public.push_subscriptions; report := report || 'B vê aparelhos de A: ' || n || '; ';
  delete from public.push_subscriptions; get diagnostics n = row_count; report := report || 'B apaga aparelho de A: ' || n || '; ';
  select count(*) into n from public.reminder_settings; report := report || 'B vê lembretes de A: ' || n || '; ';
  update public.reminder_settings set meals_enabled = false; get diagnostics n = row_count; report := report || 'B altera lembretes de A: ' || n || '; ';
  begin
    insert into public.reminder_sends (owner_id, local_date, kind, ref_id, attempt) values (a, current_date, 'meal', gen_random_uuid(), 1);
    report := report || 'B grava envio de lembrete: PERMITIU; ';
  exception when others then
    report := report || 'B grava envio de lembrete: bloqueado (' || sqlstate || '); ';
  end;
  begin
    perform public.push_get_vapid_keys();
    report := report || 'B lê chaves de push: PERMITIU; ';
  exception when others then
    report := report || 'B lê chaves de push: bloqueado (' || sqlstate || '); ';
  end;
  select count(*) into n from public.household_members; report := report || 'B vê pessoas da casa de A: ' || n || '; ';
  update public.household_members set nickname = 'x'; get diagnostics n = row_count; report := report || 'B altera pessoa de A: ' || n || '; ';
  select count(*) into n from public.house_foods; report := report || 'B vê comida da casa de A: ' || n || '; ';
  select count(*) into n from public.household_extras; report := report || 'B vê extras de A: ' || n || '; ';
  begin
    perform public.replace_active_plan('{"origin":"manual","meals":[{"name":"x","time":"12:00"}]}'::jsonb, member_a);
    report := report || 'B troca o plano da pessoa de A: PERMITIU; ';
  exception when others then
    report := report || 'B troca o plano da pessoa de A: bloqueado (' || sqlstate || '); ';
  end;
  select count(*) into n from public.food_yields; report := report || 'B vê rendimentos de A: ' || n || '; ';
  select count(*) into n from public.food_sections; report := report || 'B vê seções de A: ' || n || '; ';
  select count(*) into n from public.ingredient_maps; report := report || 'B vê ingredientes de A: ' || n || '; ';
  select count(*) into n from public.shopping_checks; report := report || 'B vê lista de compras de A: ' || n || '; ';
  delete from public.shopping_checks; get diagnostics n = row_count; report := report || 'B apaga marcações de A: ' || n || '; ';
  select count(*) into n from public.custom_meals; report := report || 'B vê lista Já comi antes de A: ' || n || '; ';
  update public.custom_meals set kcal = 0;
  get diagnostics n = row_count; report := report || 'B altera lista de A: ' || n || '; ';
  select count(*) into n from public.ai_access; report := report || 'B vê acesso IA de A: ' || n || '; ';
  select count(*) into n from public.ai_usage; report := report || 'B vê uso IA de A: ' || n || '; ';
  select count(*) into n from public.ai_plan_extractions; report := report || 'B vê leitura PDF de A: ' || n || '; ';
  delete from public.ai_plan_extractions where user_id = a;
  get diagnostics n = row_count; report := report || 'B apaga leitura PDF de A: ' || n || '; ';
  begin
    insert into public.ai_access (user_id) values (b);
    report := report || 'B se torna VIP: PERMITIU; ';
  exception when others then
    report := report || 'B se torna VIP: bloqueado (' || sqlstate || '); ';
  end;
  update public.profiles set display_name = 'alterado' where id = a;
  get diagnostics n = row_count; report := report || 'B altera perfil de A: ' || n || '; ';
  update public.plans set name = 'alterado' where id = plan_a;
  get diagnostics n = row_count; report := report || 'B altera plano de A: ' || n || '; ';
  delete from public.meals where plan_id = plan_a;
  get diagnostics n = row_count; report := report || 'B apaga refeição de A: ' || n || '; ';
  begin
    insert into public.meals (plan_id, name, time) values (plan_a, 'Intrusa', '13:00');
    report := report || 'B insere refeição no plano de A: PERMITIU; ';
  exception when others then
    report := report || 'B insere refeição no plano de A: bloqueado (' || sqlstate || '); ';
  end;
  begin
    insert into public.plans (owner_id, name, origin) values (a, 'Falso', 'manual');
    report := report || 'B cria plano em nome de A: PERMITIU; ';
  exception when others then
    report := report || 'B cria plano em nome de A: bloqueado (' || sqlstate || '); ';
  end;

  -- Visitante sem login
  execute 'reset role';
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  select count(*) into n from public.plans; report := report || 'anônimo vê planos: ' || n || '; ';

  execute 'reset role';
  select count(*) into n from public.plans where id = plan_a and name = 'Plano A';
  report := report || 'plano de A intacto: ' || n;

  raise exception 'RESULTADO (transação desfeita): %', report;
end $$;
