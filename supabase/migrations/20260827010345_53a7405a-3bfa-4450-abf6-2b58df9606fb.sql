-- ============ ENUMS ============
create type public.attendance_day_status as enum ('ABERTA','EM_PREENCHIMENTO','FECHADA','REABERTA','CANCELADA');

create type public.attendance_status as enum (
  'PENDENTE','PRESENTE','FALTA','FALTA_JUSTIFICADA','ATESTADO','FERIAS','AFASTADO','FOLGA',
  'COMPENSACAO','ATRASO','SAIDA_ANTECIPADA','TREINAMENTO','APOIO_OUTRA_AREA','HOME_OFFICE',
  'DESLIGADO','NAO_PREVISTO');

create type public.absence_category as enum ('FALTA','JUSTIFICADA','SAUDE','ESCALA','OPERACIONAL','OUTRO');

create type public.document_validation_status as enum ('NAO_APLICAVEL','PENDENTE','VALIDADO','REJEITADO');

-- ============ GUARD: bloquear exclusão física ============
create or replace function public.prevent_physical_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  raise exception 'Exclusão física não permitida nesta tabela (%). Use cancelamento/correção.', tg_table_name;
end; $$;

-- ============ 1) absence_reasons ============
create table public.absence_reasons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  category public.absence_category not null default 'OUTRO',
  requires_document boolean not null default false,
  counts_as_absence boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.absence_reasons to authenticated;
grant insert, update on public.absence_reasons to authenticated;
grant all on public.absence_reasons to service_role;
alter table public.absence_reasons enable row level security;

create policy "reasons_select_roles" on public.absence_reasons
  for select to authenticated using (public.has_any_role(auth.uid()));
create policy "reasons_insert_admin" on public.absence_reasons
  for insert to authenticated with check (public.has_role(auth.uid(),'ADMIN'));
create policy "reasons_update_admin" on public.absence_reasons
  for update to authenticated using (public.has_role(auth.uid(),'ADMIN')) with check (public.has_role(auth.uid(),'ADMIN'));

insert into public.absence_reasons (code, name, category, requires_document, counts_as_absence) values
  ('FALTA_SEM_JUSTIFICATIVA','Falta sem justificativa','FALTA',false,true),
  ('FALTA_JUSTIFICADA','Falta justificada','JUSTIFICADA',true,true),
  ('ATESTADO_PENDENTE','Atestado pendente','SAUDE',true,true),
  ('ATESTADO_VALIDADO','Atestado validado','SAUDE',true,false),
  ('ACOMPANHAMENTO_FAMILIAR','Acompanhamento familiar','JUSTIFICADA',true,true),
  ('FOLGA','Folga','ESCALA',false,false),
  ('COMPENSACAO','Compensação','ESCALA',false,false),
  ('TREINAMENTO','Treinamento','OPERACIONAL',false,false),
  ('APOIO_OUTRA_AREA','Apoio em outra área','OPERACIONAL',false,false),
  ('ATRASO','Atraso','OPERACIONAL',false,false),
  ('SAIDA_ANTECIPADA','Saída antecipada','OPERACIONAL',false,false),
  ('OUTRO','Outro','OUTRO',false,false);

-- ============ 2) attendance_days ============
create table public.attendance_days (
  id uuid primary key default gen_random_uuid(),
  attendance_date date not null default current_date,
  unit_id uuid references public.units(id),
  area_id uuid not null references public.areas(id),
  shift_id uuid references public.shifts(id),
  responsible_user_id uuid references auth.users(id),
  status public.attendance_day_status not null default 'ABERTA',
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by uuid references auth.users(id),
  reopened_at timestamptz,
  reopened_by uuid references auth.users(id),
  reopening_justification text,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create unique index uq_attendance_day_ativa
  on public.attendance_days (attendance_date, coalesce(unit_id,'00000000-0000-0000-0000-000000000000'::uuid), area_id, coalesce(shift_id,'00000000-0000-0000-0000-000000000000'::uuid))
  where status <> 'CANCELADA';
create index idx_attendance_days_date on public.attendance_days (attendance_date desc);
create index idx_attendance_days_area on public.attendance_days (area_id);
create index idx_attendance_days_unit on public.attendance_days (unit_id);
create index idx_attendance_days_status on public.attendance_days (status);

grant select, insert, update on public.attendance_days to authenticated;
grant all on public.attendance_days to service_role;
alter table public.attendance_days enable row level security;

create policy "days_select_area" on public.attendance_days
  for select to authenticated using (public.can_access_area(auth.uid(), area_id));
create policy "days_insert_area" on public.attendance_days
  for insert to authenticated with check (public.is_active_user(auth.uid()) and public.can_access_area(auth.uid(), area_id));
create policy "days_update_area" on public.attendance_days
  for update to authenticated
  using (public.is_active_user(auth.uid()) and public.can_access_area(auth.uid(), area_id))
  with check (public.can_access_area(auth.uid(), area_id));

-- ============ 3) attendance_records ============
create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  attendance_day_id uuid not null references public.attendance_days(id),
  employee_id uuid references public.employees(id),
  employee_re text not null,
  employee_name_snapshot text not null,
  function_snapshot text,
  planned_area_id uuid references public.areas(id),
  effective_area_id uuid references public.areas(id),
  planned_shift_id uuid references public.shifts(id),
  effective_shift_id uuid references public.shifts(id),
  attendance_status public.attendance_status not null default 'PENDENTE',
  absence_reason_id uuid references public.absence_reasons(id),
  arrival_time time,
  departure_time time,
  minutes_late integer not null default 0,
  document_presented boolean not null default false,
  document_validation_status public.document_validation_status not null default 'NAO_APLICAVEL',
  notes text,
  source text not null default 'MANUAL',
  registered_by uuid references auth.users(id) default auth.uid(),
  registered_at timestamptz not null default now(),
  corrected_by uuid references auth.users(id),
  corrected_at timestamptz,
  correction_justification text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (attendance_day_id, employee_re)
);

create index idx_attendance_records_day on public.attendance_records (attendance_day_id);
create index idx_attendance_records_employee on public.attendance_records (employee_id);
create index idx_attendance_records_re on public.attendance_records (employee_re);
create index idx_attendance_records_status on public.attendance_records (attendance_status);

grant select, insert, update on public.attendance_records to authenticated;
grant all on public.attendance_records to service_role;
alter table public.attendance_records enable row level security;

create policy "records_select_area" on public.attendance_records
  for select to authenticated using (exists (
    select 1 from public.attendance_days d where d.id = attendance_day_id and public.can_access_area(auth.uid(), d.area_id)));
create policy "records_insert_area" on public.attendance_records
  for insert to authenticated with check (public.is_active_user(auth.uid()) and exists (
    select 1 from public.attendance_days d where d.id = attendance_day_id and public.can_access_area(auth.uid(), d.area_id)));
create policy "records_update_area" on public.attendance_records
  for update to authenticated
  using (public.is_active_user(auth.uid()) and exists (
    select 1 from public.attendance_days d where d.id = attendance_day_id and public.can_access_area(auth.uid(), d.area_id)))
  with check (exists (
    select 1 from public.attendance_days d where d.id = attendance_day_id and public.can_access_area(auth.uid(), d.area_id)));

-- ============ 4) attendance_corrections ============
create table public.attendance_corrections (
  id uuid primary key default gen_random_uuid(),
  attendance_record_id uuid not null references public.attendance_records(id),
  previous_status public.attendance_status,
  new_status public.attendance_status not null,
  previous_reason uuid references public.absence_reasons(id),
  new_reason uuid references public.absence_reasons(id),
  justification text not null,
  requested_by uuid references auth.users(id) default auth.uid(),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_attendance_corrections_record on public.attendance_corrections (attendance_record_id);

grant select, insert, update on public.attendance_corrections to authenticated;
grant all on public.attendance_corrections to service_role;
alter table public.attendance_corrections enable row level security;

create policy "corrections_select_area" on public.attendance_corrections
  for select to authenticated using (exists (
    select 1 from public.attendance_records r
    join public.attendance_days d on d.id = r.attendance_day_id
    where r.id = attendance_record_id and public.can_access_area(auth.uid(), d.area_id)));
create policy "corrections_insert_area" on public.attendance_corrections
  for insert to authenticated with check (public.is_active_user(auth.uid()) and exists (
    select 1 from public.attendance_records r
    join public.attendance_days d on d.id = r.attendance_day_id
    where r.id = attendance_record_id and public.can_access_area(auth.uid(), d.area_id)));
create policy "corrections_approve_manager" on public.attendance_corrections
  for update to authenticated
  using (public.is_manager(auth.uid())) with check (public.is_manager(auth.uid()));

-- ============ TRIGGERS ============
create trigger trg_attendance_days_updated before update on public.attendance_days
  for each row execute function public.update_updated_at_column();
create trigger trg_attendance_days_actor before insert or update on public.attendance_days
  for each row execute function public.set_audit_actor();
create trigger trg_attendance_days_audit after insert or update or delete on public.attendance_days
  for each row execute function public.audit_trigger();
create trigger trg_attendance_days_nodelete before delete on public.attendance_days
  for each row execute function public.prevent_physical_delete();

create trigger trg_attendance_records_updated before update on public.attendance_records
  for each row execute function public.update_updated_at_column();
create trigger trg_attendance_records_audit after insert or update or delete on public.attendance_records
  for each row execute function public.audit_trigger();
create trigger trg_attendance_records_nodelete before delete on public.attendance_records
  for each row execute function public.prevent_physical_delete();

create trigger trg_attendance_corrections_audit after insert or update or delete on public.attendance_corrections
  for each row execute function public.audit_trigger();
create trigger trg_attendance_corrections_nodelete before delete on public.attendance_corrections
  for each row execute function public.prevent_physical_delete();

create trigger trg_absence_reasons_updated before update on public.absence_reasons
  for each row execute function public.update_updated_at_column();
create trigger trg_absence_reasons_audit after insert or update or delete on public.absence_reasons
  for each row execute function public.audit_trigger();