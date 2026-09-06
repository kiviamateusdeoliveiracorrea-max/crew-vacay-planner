-- Liga o colaborador à vaga/posição que ele ocupa, para permitir fechamento automático da vaga ao contratar.
alter table public.employees
  add column if not exists vaga_id text;

create unique index if not exists employees_vaga_id_key
  on public.employees (vaga_id)
  where vaga_id is not null;

-- Impede duas vagas abertas com o mesmo código ao mesmo tempo, mas permite reabrir uma vaga já fechada.
create unique index if not exists job_openings_codigo_aberta_key
  on public.job_openings (codigo)
  where status = 'ABERTA';