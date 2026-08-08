
-- ============ ENUMS ============
create type public.app_role as enum ('ADMIN','ANALISTA','LIDER','COORDENADOR','GERENTE');
create type public.movement_type as enum ('TRANSFERENCIA_DEFINITIVA','EMPRESTIMO_TEMPORARIO','COBERTURA_DE_FERIAS','TROCA_DE_TURNO','RETORNO_A_ORIGEM');
create type public.movement_status as enum ('PENDENTE','APROVADA','REJEITADA','CANCELADA');
create type public.vacation_status as enum ('PLANEJADA','APROVADA','EM_ANDAMENTO','CONCLUIDA','CANCELADA');
create type public.conflict_severity as enum ('INFORMATIVO','ATENCAO','CRITICO','BLOQUEIO');
create type public.employee_status as enum ('ATIVO','DESLIGADO','AFASTADO');
create type public.import_status as enum ('RASCUNHO','VALIDADO','APROVADO','APLICADO','CANCELADO');
create type public.import_row_class as enum ('NOVO_COLABORADOR','ATUALIZACAO_CADASTRAL','MUDANCA_DE_SETOR','MUDANCA_DE_TURNO','MUDANCA_DE_FUNCAO','DESLIGAMENTO','DUPLICIDADE','DADO_INVALIDO','SEM_ALTERACAO');
create type public.approval_status as enum ('PENDENTE','APROVADO','REJEITADO');

-- ============ HELPERS ============
create or replace function public.update_updated_at_column()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

-- ============ PROFILES / ROLES ============
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  nome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role);
$$;

create or replace function public.has_any_role(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id);
$$;

create or replace function public.is_manager(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role in ('ADMIN','ANALISTA','GERENTE'));
$$;

create policy "profiles self read" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_manager(auth.uid()));
create policy "profiles self write" on public.profiles for update to authenticated
  using (id = auth.uid() or public.has_role(auth.uid(),'ADMIN'))
  with check (id = auth.uid() or public.has_role(auth.uid(),'ADMIN'));
create policy "profiles self insert" on public.profiles for insert to authenticated with check (id = auth.uid());

create policy "roles read own or admin" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_manager(auth.uid()));

-- primeiro usuário vira ADMIN
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, nome)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'nome', new.raw_user_meta_data->>'full_name', new.email));
  if not exists (select 1 from public.user_roles) then
    insert into public.user_roles (user_id, role) values (new.id, 'ADMIN');
  end if;
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- ============ CADASTROS ============
create table public.areas (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  unidade text not null default 'MATRIZ',
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.functions (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  funcao_chave boolean not null default false,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.employees (
  id uuid primary key default gen_random_uuid(),
  re text not null unique,
  nome text not null,
  area_id uuid references public.areas(id),
  shift_id uuid references public.shifts(id),
  function_id uuid references public.functions(id),
  lider text,
  unidade text not null default 'MATRIZ',
  status public.employee_status not null default 'ATIVO',
  data_admissao date,
  data_desligamento date,
  legacy_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.employees (area_id);
create index on public.employees (function_id);

create table public.user_area_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  area_id uuid not null references public.areas(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, area_id)
);
create table public.coverage_rules (
  id uuid primary key default gen_random_uuid(),
  area_id uuid references public.areas(id) on delete cascade,
  function_id uuid references public.functions(id) on delete cascade,
  shift_id uuid references public.shifts(id) on delete cascade,
  min_presentes integer not null default 1,
  max_ferias_simultaneas integer not null default 1,
  cobertura_area_id uuid references public.areas(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.can_access_area(_user_id uuid, _area_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_manager(_user_id)
     or exists (select 1 from public.user_area_permissions p where p.user_id = _user_id and p.area_id = _area_id);
$$;

-- ============ MOVIMENTAÇÕES ============
create table public.employee_movements (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  re text not null,
  area_origem_id uuid references public.areas(id),
  area_destino_id uuid references public.areas(id),
  shift_origem_id uuid references public.shifts(id),
  shift_destino_id uuid references public.shifts(id),
  data_efetiva date not null,
  tipo public.movement_type not null,
  temporaria boolean not null default false,
  data_fim date,
  motivo text,
  aprovador_id uuid references auth.users(id),
  status public.movement_status not null default 'PENDENTE',
  observacao text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.employee_movements (employee_id, data_efetiva);

create or replace function public.validate_movement()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.temporaria and new.data_fim is null then
    raise exception 'Movimentação temporária exige data final';
  end if;
  if new.data_fim is not null and new.data_fim < new.data_efetiva then
    raise exception 'Data final não pode ser anterior à data efetiva';
  end if;
  return new;
end; $$;
create trigger trg_validate_movement before insert or update on public.employee_movements
for each row execute function public.validate_movement();

-- área/turno vigentes em uma data
create or replace function public.employee_area_on(_employee_id uuid, _data date)
returns uuid language sql stable security definer set search_path = public as $$
  with temporaria as (
    select area_destino_id from public.employee_movements m
    where m.employee_id = _employee_id and m.status = 'APROVADA' and m.temporaria
      and m.area_destino_id is not null
      and _data between m.data_efetiva and coalesce(m.data_fim, _data)
    order by m.data_efetiva desc limit 1
  ), definitiva as (
    select area_destino_id from public.employee_movements m
    where m.employee_id = _employee_id and m.status = 'APROVADA' and not m.temporaria
      and m.area_destino_id is not null and m.data_efetiva <= _data
    order by m.data_efetiva desc limit 1
  )
  select coalesce(
    (select area_destino_id from temporaria),
    (select area_destino_id from definitiva),
    (select area_id from public.employees where id = _employee_id)
  );
$$;

create or replace function public.employee_shift_on(_employee_id uuid, _data date)
returns uuid language sql stable security definer set search_path = public as $$
  with temporaria as (
    select shift_destino_id from public.employee_movements m
    where m.employee_id = _employee_id and m.status = 'APROVADA' and m.temporaria
      and m.shift_destino_id is not null
      and _data between m.data_efetiva and coalesce(m.data_fim, _data)
    order by m.data_efetiva desc limit 1
  ), definitiva as (
    select shift_destino_id from public.employee_movements m
    where m.employee_id = _employee_id and m.status = 'APROVADA' and not m.temporaria
      and m.shift_destino_id is not null and m.data_efetiva <= _data
    order by m.data_efetiva desc limit 1
  )
  select coalesce(
    (select shift_destino_id from temporaria),
    (select shift_destino_id from definitiva),
    (select shift_id from public.employees where id = _employee_id)
  );
$$;

-- ============ FÉRIAS ============
create table public.vacations (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  inicio date not null,
  fim date not null,
  status public.vacation_status not null default 'PLANEJADA',
  substituto_employee_id uuid references public.employees(id) on delete set null,
  substituto_nome text,
  observacao text,
  area_id_snapshot uuid references public.areas(id),
  shift_id_snapshot uuid references public.shifts(id),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.vacations (employee_id, inicio);

create or replace function public.validate_vacation()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.fim < new.inicio then raise exception 'Data final anterior à inicial'; end if;
  new.area_id_snapshot := public.employee_area_on(new.employee_id, new.inicio);
  new.shift_id_snapshot := public.employee_shift_on(new.employee_id, new.inicio);
  return new;
end; $$;
create trigger trg_validate_vacation before insert or update on public.vacations
for each row execute function public.validate_vacation();

create table public.vacation_conflicts (
  id uuid primary key default gen_random_uuid(),
  vacation_id uuid not null references public.vacations(id) on delete cascade,
  outro_vacation_id uuid references public.vacations(id) on delete cascade,
  movement_id uuid references public.employee_movements(id) on delete cascade,
  severidade public.conflict_severity not null,
  regra text not null,
  mensagem text not null,
  detalhes jsonb not null default '{}'::jsonb,
  dias_coincidentes integer,
  overlap_inicio date,
  overlap_fim date,
  reconhecido boolean not null default false,
  reconhecido_por uuid references auth.users(id),
  reconhecido_em timestamptz,
  created_at timestamptz not null default now()
);
create index on public.vacation_conflicts (vacation_id);

-- ============ APROVAÇÕES ============
create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  entidade text not null,
  entidade_id uuid not null,
  status public.approval_status not null default 'PENDENTE',
  solicitado_por uuid references auth.users(id),
  decidido_por uuid references auth.users(id),
  decidido_em timestamptz,
  justificativa text,
  area_id uuid references public.areas(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.approvals (entidade, entidade_id);

-- ============ IMPORTAÇÃO ============
create table public.import_mappings (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  mapeamento jsonb not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  arquivo_nome text not null,
  aba text,
  status public.import_status not null default 'RASCUNHO',
  mapeamento jsonb not null default '{}'::jsonb,
  total_linhas integer not null default 0,
  resumo jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  aprovado_por uuid references auth.users(id),
  aplicado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  linha integer not null,
  dados jsonb not null,
  classificacao public.import_row_class not null,
  diferencas jsonb not null default '{}'::jsonb,
  erros text[],
  employee_id uuid references public.employees(id) on delete set null,
  aplicar boolean not null default true,
  setor_decisao text,
  setor_decisao_fim date,
  aplicado boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.import_rows (batch_id);

-- ============ AUDITORIA ============
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  tabela text not null,
  registro_id uuid,
  acao text not null,
  usuario_id uuid,
  valor_anterior jsonb,
  valor_posterior jsonb,
  justificativa text,
  created_at timestamptz not null default now()
);
create index on public.audit_log (tabela, registro_id);
create index on public.audit_log (created_at desc);

create or replace function public.audit_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_old jsonb; v_new jsonb; v_id uuid;
begin
  if tg_op = 'DELETE' then v_old := to_jsonb(old); v_id := old.id;
  elsif tg_op = 'INSERT' then v_new := to_jsonb(new); v_id := new.id;
  else v_old := to_jsonb(old); v_new := to_jsonb(new); v_id := new.id;
  end if;
  insert into public.audit_log (tabela, registro_id, acao, usuario_id, valor_anterior, valor_posterior)
  values (tg_table_name, v_id, tg_op, auth.uid(), v_old, v_new);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end; $$;

-- ============ GRANTS ============
grant select, insert, update, delete on public.areas, public.shifts, public.functions,
  public.employees, public.user_area_permissions, public.coverage_rules,
  public.employee_movements, public.vacations, public.vacation_conflicts,
  public.approvals, public.import_batches, public.import_rows, public.import_mappings to authenticated;
grant select on public.audit_log to authenticated;
grant all on public.areas, public.shifts, public.functions, public.employees,
  public.user_area_permissions, public.coverage_rules, public.employee_movements,
  public.vacations, public.vacation_conflicts, public.approvals, public.import_batches,
  public.import_rows, public.import_mappings, public.audit_log to service_role;

alter table public.areas enable row level security;
alter table public.shifts enable row level security;
alter table public.functions enable row level security;
alter table public.employees enable row level security;
alter table public.user_area_permissions enable row level security;
alter table public.coverage_rules enable row level security;
alter table public.employee_movements enable row level security;
alter table public.vacations enable row level security;
alter table public.vacation_conflicts enable row level security;
alter table public.approvals enable row level security;
alter table public.import_batches enable row level security;
alter table public.import_rows enable row level security;
alter table public.import_mappings enable row level security;
alter table public.audit_log enable row level security;

-- leitura geral para quem tem papel
create policy "read areas" on public.areas for select to authenticated using (public.has_any_role(auth.uid()));
create policy "read shifts" on public.shifts for select to authenticated using (public.has_any_role(auth.uid()));
create policy "read functions" on public.functions for select to authenticated using (public.has_any_role(auth.uid()));
create policy "read coverage" on public.coverage_rules for select to authenticated using (public.has_any_role(auth.uid()));
create policy "read employees" on public.employees for select to authenticated using (public.has_any_role(auth.uid()));
create policy "read movements" on public.employee_movements for select to authenticated using (public.has_any_role(auth.uid()));
create policy "read vacations" on public.vacations for select to authenticated using (public.has_any_role(auth.uid()));
create policy "read conflicts" on public.vacation_conflicts for select to authenticated using (public.has_any_role(auth.uid()));
create policy "read approvals" on public.approvals for select to authenticated using (public.has_any_role(auth.uid()));
create policy "read batches" on public.import_batches for select to authenticated using (public.has_any_role(auth.uid()));
create policy "read rows" on public.import_rows for select to authenticated using (public.has_any_role(auth.uid()));
create policy "read mappings" on public.import_mappings for select to authenticated using (public.has_any_role(auth.uid()));
create policy "read perms" on public.user_area_permissions for select to authenticated
  using (user_id = auth.uid() or public.is_manager(auth.uid()));
create policy "read audit admin" on public.audit_log for select to authenticated using (public.has_role(auth.uid(),'ADMIN'));

-- escrita de cadastros: ADMIN/ANALISTA
create policy "write areas" on public.areas for all to authenticated
  using (public.has_role(auth.uid(),'ADMIN') or public.has_role(auth.uid(),'ANALISTA'))
  with check (public.has_role(auth.uid(),'ADMIN') or public.has_role(auth.uid(),'ANALISTA'));
create policy "write shifts" on public.shifts for all to authenticated
  using (public.has_role(auth.uid(),'ADMIN') or public.has_role(auth.uid(),'ANALISTA'))
  with check (public.has_role(auth.uid(),'ADMIN') or public.has_role(auth.uid(),'ANALISTA'));
create policy "write functions" on public.functions for all to authenticated
  using (public.has_role(auth.uid(),'ADMIN') or public.has_role(auth.uid(),'ANALISTA'))
  with check (public.has_role(auth.uid(),'ADMIN') or public.has_role(auth.uid(),'ANALISTA'));
create policy "write coverage" on public.coverage_rules for all to authenticated
  using (public.has_role(auth.uid(),'ADMIN') or public.has_role(auth.uid(),'ANALISTA'))
  with check (public.has_role(auth.uid(),'ADMIN') or public.has_role(auth.uid(),'ANALISTA'));
create policy "write employees" on public.employees for all to authenticated
  using (public.has_role(auth.uid(),'ADMIN') or public.has_role(auth.uid(),'ANALISTA'))
  with check (public.has_role(auth.uid(),'ADMIN') or public.has_role(auth.uid(),'ANALISTA'));
create policy "write batches" on public.import_batches for all to authenticated
  using (public.has_role(auth.uid(),'ADMIN') or public.has_role(auth.uid(),'ANALISTA'))
  with check (public.has_role(auth.uid(),'ADMIN') or public.has_role(auth.uid(),'ANALISTA'));
create policy "write rows" on public.import_rows for all to authenticated
  using (public.has_role(auth.uid(),'ADMIN') or public.has_role(auth.uid(),'ANALISTA'))
  with check (public.has_role(auth.uid(),'ADMIN') or public.has_role(auth.uid(),'ANALISTA'));
create policy "write mappings" on public.import_mappings for all to authenticated
  using (public.has_role(auth.uid(),'ADMIN') or public.has_role(auth.uid(),'ANALISTA'))
  with check (public.has_role(auth.uid(),'ADMIN') or public.has_role(auth.uid(),'ANALISTA'));
create policy "admin perms" on public.user_area_permissions for all to authenticated
  using (public.has_role(auth.uid(),'ADMIN')) with check (public.has_role(auth.uid(),'ADMIN'));

-- movimentações: ADMIN/ANALISTA total; LIDER/COORDENADOR nas áreas liberadas
create policy "write movements" on public.employee_movements for all to authenticated
  using (
    public.has_role(auth.uid(),'ADMIN') or public.has_role(auth.uid(),'ANALISTA')
    or (public.can_access_area(auth.uid(), area_origem_id) or public.can_access_area(auth.uid(), area_destino_id))
  )
  with check (
    public.has_role(auth.uid(),'ADMIN') or public.has_role(auth.uid(),'ANALISTA')
    or (public.can_access_area(auth.uid(), area_origem_id) or public.can_access_area(auth.uid(), area_destino_id))
  );

-- férias: ADMIN/ANALISTA total; demais nas áreas liberadas do colaborador
create policy "write vacations" on public.vacations for all to authenticated
  using (
    public.has_role(auth.uid(),'ADMIN') or public.has_role(auth.uid(),'ANALISTA')
    or public.can_access_area(auth.uid(), (select e.area_id from public.employees e where e.id = employee_id))
  )
  with check (
    public.has_role(auth.uid(),'ADMIN') or public.has_role(auth.uid(),'ANALISTA')
    or public.can_access_area(auth.uid(), (select e.area_id from public.employees e where e.id = employee_id))
  );

create policy "write conflicts" on public.vacation_conflicts for all to authenticated
  using (public.has_any_role(auth.uid())) with check (public.has_any_role(auth.uid()));

-- aprovações: COORDENADOR nas áreas liberadas, GERENTE/ADMIN em tudo, qualquer papel solicita
create policy "insert approvals" on public.approvals for insert to authenticated
  with check (public.has_any_role(auth.uid()));
create policy "decide approvals" on public.approvals for update to authenticated
  using (
    public.has_role(auth.uid(),'ADMIN') or public.has_role(auth.uid(),'GERENTE')
    or (public.has_role(auth.uid(),'COORDENADOR') and public.can_access_area(auth.uid(), area_id))
  )
  with check (
    public.has_role(auth.uid(),'ADMIN') or public.has_role(auth.uid(),'GERENTE')
    or (public.has_role(auth.uid(),'COORDENADOR') and public.can_access_area(auth.uid(), area_id))
  );

-- ============ TRIGGERS updated_at + auditoria ============
do $$
declare t text;
begin
  foreach t in array array['profiles','areas','shifts','functions','employees','coverage_rules',
    'employee_movements','vacations','approvals','import_batches','import_mappings'] loop
    execute format('create trigger trg_%s_updated before update on public.%I for each row execute function public.update_updated_at_column()', t, t);
  end loop;
  foreach t in array array['employees','employee_movements','vacations','approvals','import_batches','user_roles','user_area_permissions','coverage_rules'] loop
    execute format('create trigger trg_%s_audit after insert or update or delete on public.%I for each row execute function public.audit_trigger()', t, t);
  end loop;
end $$;

-- ============ MIGRAÇÃO DOS DADOS EXISTENTES ============
insert into public.areas (nome) select distinct area from public.colaboradores where area is not null
on conflict (nome) do nothing;
insert into public.shifts (nome) select distinct turno from public.colaboradores where turno is not null
on conflict (nome) do nothing;
insert into public.functions (nome, funcao_chave)
select funcao, bool_or(funcao_chave) from public.colaboradores where funcao is not null group by funcao
on conflict (nome) do nothing;

insert into public.employees (re, nome, area_id, shift_id, function_id, lider, status, legacy_id)
select c.re, c.nome, a.id, s.id, f.id, c.lider,
  case when c.ativo then 'ATIVO'::public.employee_status else 'DESLIGADO'::public.employee_status end, c.id
from public.colaboradores c
left join public.areas a on a.nome = c.area
left join public.shifts s on s.nome = c.turno
left join public.functions f on f.nome = c.funcao
on conflict (re) do nothing;

insert into public.vacations (employee_id, inicio, fim, status, substituto_nome, observacao)
select e.id, fr.inicio, fr.fim,
  case when fr.status = 'CANCELADA' then 'CANCELADA'::public.vacation_status else 'PLANEJADA'::public.vacation_status end,
  fr.substituto, fr.observacao
from public.ferias fr join public.employees e on e.legacy_id = fr.colaborador_id;
