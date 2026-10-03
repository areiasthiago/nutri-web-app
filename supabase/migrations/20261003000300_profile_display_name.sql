-- Como a pessoa quer ser chamada no app (saudação). Opcional e curto: é o
-- único dado pessoal além do e-mail, e a pessoa escolhe o que escrever.
alter table public.profiles
  add column display_name text check (char_length(display_name) <= 40);

-- O fuso precisa ser um nome válido (ex.: America/Sao_Paulo), porque o "dia"
-- do usuário é calculado nele. Agora que o perfil é editável pelo app, isso
-- passa a ser validado no banco.
create or replace function public.is_valid_timezone(tz text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  perform now() at time zone tz;
  return true;
exception when others then
  return false;
end;
$$;

alter table public.profiles
  add constraint profiles_timezone_valid check (public.is_valid_timezone(timezone));
