-- As policies de profiles (Fatia 1) chamavam auth.uid() direto, o que o
-- Postgres reavalia linha a linha. (select auth.uid()) é avaliado uma vez
-- por consulta, como nas tabelas do plano. Mesmo efeito de acesso.
drop policy "profiles: usuário lê o próprio perfil" on public.profiles;
drop policy "profiles: usuário atualiza o próprio perfil" on public.profiles;

create policy "profiles: usuário lê o próprio perfil"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

create policy "profiles: usuário atualiza o próprio perfil"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
