CREATE OR REPLACE FUNCTION public.validate_movement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_origem_area uuid;
  v_origem_shift uuid;
begin
  if new.tipo in ('TRANSFERENCIA_DEFINITIVA', 'RETORNO_A_ORIGEM') then
    new.temporaria := false;
    new.data_fim := null;
  elsif new.tipo in ('EMPRESTIMO_TEMPORARIO', 'COBERTURA_DE_FERIAS') then
    new.temporaria := true;
    if new.data_fim is null then
      raise exception 'Empréstimo temporário e cobertura de férias exigem data final';
    end if;
  end if;

  if new.data_efetiva is null then
    raise exception 'Data efetiva é obrigatória';
  end if;
  if new.temporaria and new.data_fim is null then
    raise exception 'Movimentação temporária exige data final';
  end if;
  if new.data_fim is not null and new.data_fim <= new.data_efetiva then
    raise exception 'A data final deve ser posterior à data efetiva';
  end if;

  if new.area_origem_id is null then
    new.area_origem_id := public.employee_area_on(new.employee_id, new.data_efetiva);
  end if;
  if new.shift_origem_id is null then
    new.shift_origem_id := public.employee_shift_on(new.employee_id, new.data_efetiva);
  end if;

  if new.tipo = 'RETORNO_A_ORIGEM' then
    v_origem_area := public.employee_definitive_area_on(new.employee_id, new.data_efetiva);
    v_origem_shift := public.employee_definitive_shift_on(new.employee_id, new.data_efetiva);
    new.area_destino_id := v_origem_area;
    if new.shift_destino_id is null then
      new.shift_destino_id := v_origem_shift;
    end if;
  end if;

  if new.area_destino_id is null then
    raise exception 'Setor de destino é obrigatório';
  end if;

  if new.shift_destino_id is null then
    new.shift_destino_id := new.shift_origem_id;
  end if;

  if new.area_destino_id = new.area_origem_id
     and new.shift_destino_id is not distinct from new.shift_origem_id then
    raise exception 'Origem e destino não podem ser iguais (mesmo setor e turno)';
  end if;

  if new.temporaria and new.status = 'APROVADA' then
    if exists (
      select 1 from public.employee_movements m
      where m.employee_id = new.employee_id
        and m.id <> new.id
        and m.temporaria
        and m.status = 'APROVADA'
        and new.data_efetiva <= coalesce(m.data_fim, new.data_efetiva)
        and m.data_efetiva <= coalesce(new.data_fim, m.data_efetiva)
    ) then
      raise exception 'Já existe movimentação temporária aprovada sobreposta para este colaborador';
    end if;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.apply_movement_effects()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- movimentação cancelada/rejeitada/pendente nunca altera a alocação
  if new.status <> 'APROVADA' then
    if tg_op = 'UPDATE' and old.status = 'APROVADA' and old.temporaria = false
       and new.status in ('CANCELADA','REJEITADA') then
      -- desfaz o efeito de uma definitiva que havia sido aplicada
      update public.employees e
        set area_id = coalesce(public.employee_definitive_area_on(e.id, current_date), e.area_id),
            shift_id = coalesce(public.employee_definitive_shift_on(e.id, current_date), e.shift_id)
      where e.id = new.employee_id;
    end if;
    return new;
  end if;

  if new.tipo = 'RETORNO_A_ORIGEM' then
    update public.employee_movements m
      set data_fim = new.data_efetiva - 1
    where m.employee_id = new.employee_id
      and m.id <> new.id
      and m.temporaria
      and m.status = 'APROVADA'
      and m.data_efetiva < new.data_efetiva
      and coalesce(m.data_fim, 'infinity'::date) >= new.data_efetiva;
  end if;

  if not new.temporaria and new.data_efetiva <= current_date then
    update public.employees e
      set area_id = coalesce(new.area_destino_id, e.area_id),
          shift_id = coalesce(new.shift_destino_id, e.shift_id)
    where e.id = new.employee_id;
  end if;

  return new;
end;
$function$;