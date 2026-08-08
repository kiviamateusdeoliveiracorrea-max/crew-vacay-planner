-- 1. Área/turno DEFINITIVOS numa data (ignora temporárias) — base do RETORNO_A_ORIGEM
CREATE OR REPLACE FUNCTION public.employee_definitive_area_on(_employee_id uuid, _data date)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select coalesce(
    (select m.area_destino_id from public.employee_movements m
      where m.employee_id = _employee_id and m.status = 'APROVADA' and not m.temporaria
        and m.area_destino_id is not null and m.data_efetiva <= _data
      order by m.data_efetiva desc limit 1),
    (select area_id from public.employees where id = _employee_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.employee_definitive_shift_on(_employee_id uuid, _data date)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select coalesce(
    (select m.shift_destino_id from public.employee_movements m
      where m.employee_id = _employee_id and m.status = 'APROVADA' and not m.temporaria
        and m.shift_destino_id is not null and m.data_efetiva <= _data
      order by m.data_efetiva desc limit 1),
    (select shift_id from public.employees where id = _employee_id)
  );
$$;

REVOKE ALL ON FUNCTION public.employee_definitive_area_on(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.employee_definitive_shift_on(uuid, date) FROM PUBLIC, anon, authenticated;

-- 2. Validação/normalização das regras por tipo
CREATE OR REPLACE FUNCTION public.validate_movement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare
  v_origem_area uuid;
  v_origem_shift uuid;
begin
  -- coerência tipo x temporária
  if new.tipo in ('TRANSFERENCIA_DEFINITIVA', 'RETORNO_A_ORIGEM') then
    new.temporaria := false;
    new.data_fim := null;
  elsif new.tipo in ('EMPRESTIMO_TEMPORARIO', 'COBERTURA_DE_FERIAS') then
    new.temporaria := true;
    if new.data_fim is null then
      raise exception 'Empréstimo temporário e cobertura de férias exigem data final';
    end if;
  end if;

  if new.temporaria and new.data_fim is null then
    raise exception 'Movimentação temporária exige data final';
  end if;
  if new.data_fim is not null and new.data_fim < new.data_efetiva then
    raise exception 'Data final não pode ser anterior à data efetiva';
  end if;

  -- origem = situação vigente na data efetiva (nunca apaga histórico)
  if new.area_origem_id is null then
    new.area_origem_id := public.employee_area_on(new.employee_id, new.data_efetiva);
  end if;
  if new.shift_origem_id is null then
    new.shift_origem_id := public.employee_shift_on(new.employee_id, new.data_efetiva);
  end if;

  -- retorno à origem: destino é sempre a lotação definitiva vigente
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

  -- sem duas temporárias aprovadas sobrepostas para o mesmo colaborador
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
$$;

-- 3. Efeitos da aprovação: retorno encerra temporária aberta; definitiva atualiza cadastro
CREATE OR REPLACE FUNCTION public.apply_movement_effects()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
begin
  if new.status <> 'APROVADA' then
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
$$;

REVOKE ALL ON FUNCTION public.apply_movement_effects() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_movement_effects ON public.employee_movements;
CREATE TRIGGER trg_movement_effects
AFTER INSERT OR UPDATE OF status, data_efetiva, area_destino_id, shift_destino_id
ON public.employee_movements
FOR EACH ROW EXECUTE FUNCTION public.apply_movement_effects();