-- ============================================================
-- 1. FUNÇÃO GENÉRICA DE AUTORIA (created_by / updated_by)
-- ============================================================
create or replace function public.set_audit_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
    new.updated_by := coalesce(new.updated_by, auth.uid());
  else
    new.created_by := old.created_by;
    new.updated_by := coalesce(auth.uid(), old.updated_by);
  end if;
  return new;
end;
$$;

-- ============================================================
-- 2. UNITS
-- ============================================================
create table public.units (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);
grant select, insert, update, delete on public.units to authenticated;
grant all on public.units to service_role;
alter table public.units enable row level security;
create policy "read units" on public.units for select to authenticated using (public.has_any_role(auth.uid()));
create policy "write units" on public.units for all to authenticated
  using (public.has_role(auth.uid(),'ADMIN') or public.has_role(auth.uid(),'ANALISTA'))
  with check (public.has_role(auth.uid(),'ADMIN') or public.has_role(auth.uid(),'ANALISTA'));

insert into public.units (nome)
select distinct unidade from public.areas where coalesce(nullif(trim(unidade),''),'') <> ''
on conflict (nome) do nothing;
insert into public.units (nome) select 'MATRIZ' where not exists (select 1 from public.units);

alter table public.areas add column unit_id uuid references public.units(id);
update public.areas a set unit_id = u.id from public.units u where u.nome = a.unidade;
update public.areas set unit_id = (select id from public.units order by nome limit 1) where unit_id is null;

-- ============================================================
-- 3. VAGAS EM ABERTO (separadas de colaboradores)
-- ============================================================
create table public.job_openings (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  area_id uuid references public.areas(id),
  shift_id uuid references public.shifts(id),
  function_id uuid references public.functions(id),
  quantidade integer not null default 1 check (quantidade > 0),
  status text not null default 'ABERTA' check (status in ('ABERTA','EM_PROCESSO','PREENCHIDA','CANCELADA')),
  motivo text,
  previsao_preenchimento date,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);
grant select, insert, update, delete on public.job_openings to authenticated;
grant all on public.job_openings to service_role;
alter table public.job_openings enable row level security;
create policy "read job_openings" on public.job_openings for select to authenticated using (public.has_any_role(auth.uid()));
create policy "write job_openings" on public.job_openings for all to authenticated
  using (public.has_role(auth.uid(),'ADMIN') or public.has_role(auth.uid(),'ANALISTA'))
  with check (public.has_role(auth.uid(),'ADMIN') or public.has_role(auth.uid(),'ANALISTA'));

-- ============================================================
-- 4. RE ÚNICO APENAS PARA COLABORADORES VÁLIDOS
-- ============================================================
alter table public.employees drop constraint if exists employees_re_key;
create unique index employees_re_ativo_uidx
  on public.employees (re) where status <> 'DESLIGADO';
create index if not exists employees_re_idx on public.employees (re);

-- ============================================================
-- 5. FÉRIAS: FUNÇÃO CONSIDERADA + SNAPSHOT DE APROVAÇÃO
-- ============================================================
alter table public.vacations
  add column function_id_snapshot uuid references public.functions(id),
  add column area_id_aprovacao uuid references public.areas(id),
  add column shift_id_aprovacao uuid references public.shifts(id),
  add column function_id_aprovacao uuid references public.functions(id),
  add column aprovado_em timestamptz,
  add column aprovado_por uuid references auth.users(id);

update public.vacations v
  set function_id_snapshot = e.function_id
  from public.employees e where e.id = v.employee_id and v.function_id_snapshot is null;

create or replace function public.validate_vacation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.fim < new.inicio then raise exception 'Data final anterior à inicial'; end if;
  new.area_id_snapshot := public.employee_area_on(new.employee_id, new.inicio);
  new.shift_id_snapshot := public.employee_shift_on(new.employee_id, new.inicio);
  new.function_id_snapshot := (select function_id from public.employees where id = new.employee_id);
  return new;
end; $$;

-- ============================================================
-- 6. APROVAÇÕES DE FÉRIAS
-- ============================================================
create table public.vacation_approvals (
  id uuid primary key default gen_random_uuid(),
  vacation_id uuid not null references public.vacations(id) on delete cascade,
  decisao public.approval_status not null default 'PENDENTE',
  solicitado_por uuid references auth.users(id),
  solicitado_em timestamptz not null default now(),
  decidido_por uuid references auth.users(id),
  decidido_em timestamptz,
  justificativa text,
  area_id_considerada uuid references public.areas(id),
  shift_id_considerado uuid references public.shifts(id),
  function_id_considerada uuid references public.functions(id),
  severidade_maxima public.conflict_severity,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);
create index vacation_approvals_vacation_idx on public.vacation_approvals (vacation_id);
grant select, insert, update on public.vacation_approvals to authenticated;
grant all on public.vacation_approvals to service_role;
alter table public.vacation_approvals enable row level security;
create policy "read vacation_approvals" on public.vacation_approvals for select to authenticated using (public.has_any_role(auth.uid()));
create policy "insert vacation_approvals" on public.vacation_approvals for insert to authenticated with check (public.has_any_role(auth.uid()));
create policy "decide vacation_approvals" on public.vacation_approvals for update to authenticated
  using (public.has_role(auth.uid(),'ADMIN') or public.has_role(auth.uid(),'GERENTE') or public.has_role(auth.uid(),'COORDENADOR'))
  with check (public.has_role(auth.uid(),'ADMIN') or public.has_role(auth.uid(),'GERENTE') or public.has_role(auth.uid(),'COORDENADOR'));

-- ============================================================
-- 7. MODELOS DE IMPORTAÇÃO
-- ============================================================
alter table public.import_mappings rename to import_templates;
alter table public.import_templates add column ativo boolean not null default true;
alter table public.import_batches add column template_id uuid references public.import_templates(id);

-- ============================================================
-- 8. EXCLUSÃO LÓGICA EM REGRAS DE COBERTURA
-- ============================================================
alter table public.coverage_rules add column ativo boolean not null default true;

-- ============================================================
-- 9. created_at / updated_at / created_by / updated_by
-- ============================================================
alter table public.areas add column created_by uuid references auth.users(id), add column updated_by uuid references auth.users(id);
alter table public.shifts add column created_by uuid references auth.users(id), add column updated_by uuid references auth.users(id);
alter table public.functions add column created_by uuid references auth.users(id), add column updated_by uuid references auth.users(id);
alter table public.employees add column created_by uuid references auth.users(id), add column updated_by uuid references auth.users(id);
alter table public.coverage_rules add column created_by uuid references auth.users(id), add column updated_by uuid references auth.users(id);
alter table public.employee_movements add column updated_by uuid references auth.users(id);
alter table public.vacations add column updated_by uuid references auth.users(id);
alter table public.import_batches add column updated_by uuid references auth.users(id);
alter table public.import_templates add column updated_by uuid references auth.users(id);
alter table public.approvals add column created_by uuid references auth.users(id), add column updated_by uuid references auth.users(id);
alter table public.user_area_permissions
  add column updated_at timestamptz not null default now(),
  add column created_by uuid references auth.users(id),
  add column updated_by uuid references auth.users(id);
alter table public.vacation_conflicts
  add column updated_at timestamptz not null default now(),
  add column created_by uuid references auth.users(id),
  add column updated_by uuid references auth.users(id);
alter table public.import_rows
  add column updated_at timestamptz not null default now(),
  add column created_by uuid references auth.users(id),
  add column updated_by uuid references auth.users(id);

do $$
declare t text;
begin
  foreach t in array array['units','areas','shifts','functions','employees','coverage_rules',
    'employee_movements','vacations','vacation_conflicts','vacation_approvals','approvals',
    'import_templates','import_batches','import_rows','user_area_permissions','job_openings','profiles']
  loop
    execute format('drop trigger if exists trg_%1$s_actor on public.%1$s', t);
    execute format('create trigger trg_%1$s_actor before insert or update on public.%1$s for each row execute function public.set_audit_actor()', t);
    execute format('drop trigger if exists trg_%1$s_updated on public.%1$s', t);
    execute format('create trigger trg_%1$s_updated before update on public.%1$s for each row execute function public.update_updated_at_column()', t);
  end loop;
end $$;

-- ============================================================
-- 10. AUDITORIA EM TODAS AS TABELAS OPERACIONAIS
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['units','areas','shifts','functions','job_openings','coverage_rules',
    'employees','employee_movements','vacations','vacation_conflicts','vacation_approvals',
    'approvals','import_templates','import_batches','import_rows','user_area_permissions',
    'user_roles','profiles']
  loop
    execute format('drop trigger if exists trg_%1$s_audit on public.%1$s', t);
    execute format('create trigger trg_%1$s_audit after insert or update or delete on public.%1$s for each row execute function public.audit_trigger()', t);
  end loop;
end $$;