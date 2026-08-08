
-- Segurança: funções internas não executáveis por visitantes anônimos
revoke execute on function public.has_role(uuid, public.app_role) from anon, public;
revoke execute on function public.has_any_role(uuid) from anon, public;
revoke execute on function public.is_manager(uuid) from anon, public;
revoke execute on function public.can_access_area(uuid, uuid) from anon, public;
revoke execute on function public.employee_area_on(uuid, date) from anon, public;
revoke execute on function public.employee_shift_on(uuid, date) from anon, public;
revoke execute on function public.audit_trigger() from anon, public;
revoke execute on function public.handle_new_user() from anon, public, authenticated;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;
grant execute on function public.has_any_role(uuid) to authenticated;
grant execute on function public.is_manager(uuid) to authenticated;
grant execute on function public.can_access_area(uuid, uuid) to authenticated;
grant execute on function public.employee_area_on(uuid, date) to authenticated;
grant execute on function public.employee_shift_on(uuid, date) to authenticated;

-- ============ MOTOR DE CONFLITOS ============
create or replace function public.recalc_vacation_conflicts(_vacation_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v record; o record; m record;
  v_area uuid; v_shift uuid; v_func uuid; v_chave boolean;
  o_area uuid; o_shift uuid;
  ov_ini date; ov_fim date; ov_dias integer;
  sev public.conflict_severity;
  regra text; msg text; acao text;
  min_req integer; cobertura uuid; total_ativos integer; em_ferias integer;
begin
  delete from public.vacation_conflicts where vacation_id = _vacation_id;

  select vac.*, e.re, e.nome, e.function_id, f.funcao_chave
    into v
  from public.vacations vac
  join public.employees e on e.id = vac.employee_id
  left join public.functions f on f.id = e.function_id
  where vac.id = _vacation_id;

  if v is null or v.status = 'CANCELADA' then return; end if;

  v_area := coalesce(v.area_id_snapshot, public.employee_area_on(v.employee_id, v.inicio));
  v_shift := coalesce(v.shift_id_snapshot, public.employee_shift_on(v.employee_id, v.inicio));
  v_func := v.function_id;
  v_chave := coalesce(v.funcao_chave, false);

  -- 1) Conflitos com outras férias da mesma função
  for o in
    select vac.*, e.re, e.nome, e.function_id
    from public.vacations vac
    join public.employees e on e.id = vac.employee_id
    where vac.id <> _vacation_id
      and vac.status <> 'CANCELADA'
      and e.function_id = v_func
      and e.status <> 'DESLIGADO'
      and vac.inicio <= v.fim and v.inicio <= vac.fim
  loop
    o_area := coalesce(o.area_id_snapshot, public.employee_area_on(o.employee_id, o.inicio));
    o_shift := coalesce(o.shift_id_snapshot, public.employee_shift_on(o.employee_id, o.inicio));
    ov_ini := greatest(v.inicio, o.inicio);
    ov_fim := least(v.fim, o.fim);
    ov_dias := (ov_fim - ov_ini) + 1;

    if o_area = v_area and o_shift is not distinct from v_shift then
      sev := case when v_chave then 'BLOQUEIO' else 'CRITICO' end;
      regra := 'MESMA_FUNCAO_MESMA_AREA_MESMO_TURNO';
      acao := 'Reprogramar um dos períodos ou designar substituto qualificado.';
    elsif o_area = v_area then
      sev := case when v_chave then 'CRITICO' else 'ATENCAO' end;
      regra := 'MESMA_FUNCAO_MESMA_AREA_TURNOS_DIFERENTES';
      acao := 'Avaliar cobertura entre turnos da mesma área.';
    else
      select cr.cobertura_area_id into cobertura from public.coverage_rules cr
      where cr.area_id = v_area and (cr.function_id = v_func or cr.function_id is null)
        and cr.cobertura_area_id = o_area limit 1;
      if cobertura is not null then
        sev := 'INFORMATIVO';
        regra := 'MESMA_FUNCAO_OUTRA_AREA_COM_COBERTURA_PERMITIDA';
        acao := 'Cobertura entre as áreas está autorizada; apenas monitorar.';
      else
        sev := case when v_chave then 'CRITICO' else 'ATENCAO' end;
        regra := 'MESMA_FUNCAO_OUTRA_AREA';
        acao := 'Confirmar se a outra área consegue apoiar no período.';
      end if;
    end if;

    msg := format('%s (RE %s) e %s (RE %s) — mesma função com %s dia(s) de sobreposição (%s a %s).',
      v.nome, v.re, o.nome, o.re, ov_dias, to_char(ov_ini,'DD/MM/YYYY'), to_char(ov_fim,'DD/MM/YYYY'));

    insert into public.vacation_conflicts (vacation_id, outro_vacation_id, severidade, regra, mensagem,
      dias_coincidentes, overlap_inicio, overlap_fim, detalhes)
    values (_vacation_id, o.id, sev, regra, msg, ov_dias, ov_ini, ov_fim,
      jsonb_build_object(
        'acao_recomendada', acao,
        'envolvidos', jsonb_build_array(
          jsonb_build_object('nome', v.nome, 're', v.re, 'area_id', v_area, 'shift_id', v_shift,
            'function_id', v_func, 'inicio', v.inicio, 'fim', v.fim),
          jsonb_build_object('nome', o.nome, 're', o.re, 'area_id', o_area, 'shift_id', o_shift,
            'function_id', o.function_id, 'inicio', o.inicio, 'fim', o.fim))));
  end loop;

  -- 2) Função-chave sem substituto
  if v_chave and v.substituto_employee_id is null and coalesce(nullif(trim(v.substituto_nome),''), null) is null then
    insert into public.vacation_conflicts (vacation_id, severidade, regra, mensagem, detalhes,
      overlap_inicio, overlap_fim, dias_coincidentes)
    values (_vacation_id, 'CRITICO', 'FUNCAO_CHAVE_SEM_SUBSTITUTO',
      format('%s (RE %s) exerce função-chave e está sem substituto indicado.', v.nome, v.re),
      jsonb_build_object('acao_recomendada','Indicar substituto qualificado antes de aprovar.'),
      v.inicio, v.fim, (v.fim - v.inicio) + 1);
  end if;

  -- 3) Substituto também de férias
  if v.substituto_employee_id is not null then
    for o in
      select vac.*, e.nome, e.re from public.vacations vac
      join public.employees e on e.id = vac.employee_id
      where vac.employee_id = v.substituto_employee_id and vac.status <> 'CANCELADA'
        and vac.inicio <= v.fim and v.inicio <= vac.fim
    loop
      ov_ini := greatest(v.inicio, o.inicio); ov_fim := least(v.fim, o.fim);
      insert into public.vacation_conflicts (vacation_id, outro_vacation_id, severidade, regra, mensagem,
        dias_coincidentes, overlap_inicio, overlap_fim, detalhes)
      values (_vacation_id, o.id, 'BLOQUEIO', 'SUBSTITUTO_INDISPONIVEL',
        format('O substituto %s (RE %s) também está de férias de %s a %s.', o.nome, o.re,
          to_char(o.inicio,'DD/MM/YYYY'), to_char(o.fim,'DD/MM/YYYY')),
        (ov_fim - ov_ini) + 1, ov_ini, ov_fim,
        jsonb_build_object('acao_recomendada','Escolher outro substituto disponível.'));
    end loop;
  end if;

  -- 4) Movimentação aprovada durante as férias
  for m in
    select * from public.employee_movements
    where employee_id = v.employee_id and status = 'APROVADA'
      and data_efetiva <= v.fim and coalesce(data_fim, data_efetiva) >= v.inicio
      and data_efetiva > v.inicio
  loop
    insert into public.vacation_conflicts (vacation_id, movement_id, severidade, regra, mensagem, detalhes,
      overlap_inicio, overlap_fim)
    values (_vacation_id, m.id, 'CRITICO', 'MOVIMENTACAO_DURANTE_FERIAS',
      format('Movimentação %s com data efetiva em %s ocorre durante as férias de %s.',
        m.tipo, to_char(m.data_efetiva,'DD/MM/YYYY'), v.nome),
      jsonb_build_object('acao_recomendada','Ajustar a data da movimentação ou o período de férias.'),
      m.data_efetiva, least(coalesce(m.data_fim, m.data_efetiva), v.fim));
  end loop;

  -- 5) Cobertura mínima da função/área/turno
  select cr.min_presentes into min_req from public.coverage_rules cr
  where (cr.area_id = v_area or cr.area_id is null)
    and (cr.function_id = v_func or cr.function_id is null)
    and (cr.shift_id = v_shift or cr.shift_id is null)
  order by (cr.area_id is not null)::int + (cr.function_id is not null)::int + (cr.shift_id is not null)::int desc
  limit 1;

  if min_req is not null then
    select count(*) into total_ativos from public.employees e
    where e.function_id = v_func and e.status = 'ATIVO'
      and public.employee_area_on(e.id, v.inicio) = v_area
      and public.employee_shift_on(e.id, v.inicio) is not distinct from v_shift;

    select count(distinct vac.employee_id) into em_ferias from public.vacations vac
    join public.employees e on e.id = vac.employee_id
    where vac.status <> 'CANCELADA' and e.function_id = v_func and e.status = 'ATIVO'
      and public.employee_area_on(e.id, vac.inicio) = v_area
      and vac.inicio <= v.fim and v.inicio <= vac.fim;

    if (total_ativos - em_ferias) < min_req then
      insert into public.vacation_conflicts (vacation_id, severidade, regra, mensagem, detalhes,
        overlap_inicio, overlap_fim, dias_coincidentes)
      values (_vacation_id, 'BLOQUEIO', 'COBERTURA_MINIMA_NAO_ATENDIDA',
        format('Cobertura mínima não atendida: restariam %s de %s exigidos na função/área/turno.',
          greatest(total_ativos - em_ferias,0), min_req),
        jsonb_build_object('acao_recomendada','Reduzir o número de férias simultâneas ou trazer cobertura de outra área.'),
        v.inicio, v.fim, (v.fim - v.inicio) + 1);
    end if;
  end if;
end; $$;

revoke execute on function public.recalc_vacation_conflicts(uuid) from anon, public;
grant execute on function public.recalc_vacation_conflicts(uuid) to authenticated;

create or replace function public.recalc_related_conflicts(_employee_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in
    select vac.id from public.vacations vac
    join public.employees e on e.id = vac.employee_id
    where e.function_id = (select function_id from public.employees where id = _employee_id)
       or vac.employee_id = _employee_id
       or vac.substituto_employee_id = _employee_id
  loop
    perform public.recalc_vacation_conflicts(r.id);
  end loop;
end; $$;
revoke execute on function public.recalc_related_conflicts(uuid) from anon, public;
grant execute on function public.recalc_related_conflicts(uuid) to authenticated;

create or replace function public.trg_vacation_recalc()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform public.recalc_related_conflicts(old.employee_id);
    return old;
  end if;
  perform public.recalc_related_conflicts(new.employee_id);
  return new;
end; $$;
create trigger trg_vacations_recalc after insert or update or delete on public.vacations
for each row execute function public.trg_vacation_recalc();

create or replace function public.trg_movement_recalc()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.recalc_related_conflicts(coalesce(new.employee_id, old.employee_id));
  return coalesce(new, old);
end; $$;
create trigger trg_movements_recalc after insert or update or delete on public.employee_movements
for each row execute function public.trg_movement_recalc();

-- Regras de cobertura padrão para funções-chave
insert into public.coverage_rules (area_id, function_id, shift_id, min_presentes, max_ferias_simultaneas)
select a.id, f.id, null, 1, 1
from public.areas a
cross join public.functions f
where f.funcao_chave
  and exists (select 1 from public.employees e where e.area_id = a.id and e.function_id = f.id);

-- Recalcular tudo
do $$ declare r record; begin
  for r in select id from public.vacations loop perform public.recalc_vacation_conflicts(r.id); end loop;
end $$;
