-- Atividade ligada a uma rotina: só a rotina do próprio dono (chave composta),
-- como nas outras tabelas. Rotina apagada: a atividade fica, sem o vínculo.
alter table public.activity_logs
  add constraint activity_logs_routine_fk
  foreign key (routine_id, owner_id) references public.workout_routines (id, owner_id)
  on delete set null (routine_id);

create index activity_logs_routine_idx on public.activity_logs (routine_id, owner_id);
