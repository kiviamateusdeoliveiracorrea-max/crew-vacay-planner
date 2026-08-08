-- 1) permissões por unidade + área
ALTER TABLE public.user_area_permissions
  ADD COLUMN IF NOT EXISTS unit_id uuid REFERENCES public.units(id) ON DELETE CASCADE,
  ALTER COLUMN area_id DROP NOT NULL;

UPDATE public.user_area_permissions p
   SET unit_id = a.unit_id
  FROM public.areas a
 WHERE a.id = p.area_id AND p.unit_id IS NULL;

ALTER TABLE public.user_area_permissions
  ADD CONSTRAINT user_area_permissions_escopo_chk
  CHECK (unit_id IS NOT NULL OR area_id IS NOT NULL);

ALTER TABLE public.user_area_permissions DROP CONSTRAINT IF EXISTS user_area_permissions_user_id_area_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS user_area_permissions_unico
  ON public.user_area_permissions (user_id, coalesce(unit_id,'00000000-0000-0000-0000-000000000000'::uuid), coalesce(area_id,'00000000-0000-0000-0000-000000000000'::uuid));

-- 2) escopo de área: ADMIN/ANALISTA tudo; demais somente concessões explícitas
CREATE OR REPLACE FUNCTION public.can_access_area(_user_id uuid, _area_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select
    public.has_role(_user_id,'ADMIN') or public.has_role(_user_id,'ANALISTA')
    or exists (
      select 1 from public.user_area_permissions p
      where p.user_id = _user_id and p.area_id = _area_id
    )
    or exists (
      select 1 from public.user_area_permissions p
      join public.areas a on a.unit_id = p.unit_id
      where p.user_id = _user_id and p.area_id is null and a.id = _area_id
    );
$$;

-- 3) ADMIN gerencia perfis
GRANT INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
DROP POLICY IF EXISTS "admin manage roles" ON public.user_roles;
CREATE POLICY "admin manage roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'ADMIN'))
  WITH CHECK (public.has_role(auth.uid(),'ADMIN'));

-- 4) movimentações: LIDER não movimenta
DROP POLICY IF EXISTS "write movements" ON public.employee_movements;
CREATE POLICY "write movements" ON public.employee_movements FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(),'ADMIN') OR public.has_role(auth.uid(),'ANALISTA')
    OR ((public.has_role(auth.uid(),'COORDENADOR') OR public.has_role(auth.uid(),'GERENTE'))
        AND (public.can_access_area(auth.uid(), area_origem_id) OR public.can_access_area(auth.uid(), area_destino_id)))
  )
  WITH CHECK (
    public.has_role(auth.uid(),'ADMIN') OR public.has_role(auth.uid(),'ANALISTA')
    OR ((public.has_role(auth.uid(),'COORDENADOR') OR public.has_role(auth.uid(),'GERENTE'))
        AND (public.can_access_area(auth.uid(), area_origem_id) OR public.can_access_area(auth.uid(), area_destino_id)))
  );

-- 5) conflitos: reconhecimento apenas na área autorizada
DROP POLICY IF EXISTS "write conflicts" ON public.vacation_conflicts;
CREATE POLICY "write conflicts" ON public.vacation_conflicts FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(),'ADMIN') OR public.has_role(auth.uid(),'ANALISTA')
    OR public.can_access_area(auth.uid(), (select v.area_id_snapshot from public.vacations v where v.id = vacation_id))
  )
  WITH CHECK (
    public.has_role(auth.uid(),'ADMIN') OR public.has_role(auth.uid(),'ANALISTA')
    OR public.can_access_area(auth.uid(), (select v.area_id_snapshot from public.vacations v where v.id = vacation_id))
  );

-- 6) aprovações de férias exigem área autorizada
DROP POLICY IF EXISTS "decide vacation_approvals" ON public.vacation_approvals;
CREATE POLICY "decide vacation_approvals" ON public.vacation_approvals FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(),'ADMIN')
    OR ((public.has_role(auth.uid(),'GERENTE') OR public.has_role(auth.uid(),'COORDENADOR'))
        AND public.can_access_area(auth.uid(), coalesce(area_id_considerada,
              (select v.area_id_snapshot from public.vacations v where v.id = vacation_id))))
  )
  WITH CHECK (
    public.has_role(auth.uid(),'ADMIN')
    OR ((public.has_role(auth.uid(),'GERENTE') OR public.has_role(auth.uid(),'COORDENADOR'))
        AND public.can_access_area(auth.uid(), coalesce(area_id_considerada,
              (select v.area_id_snapshot from public.vacations v where v.id = vacation_id))))
  );

DROP POLICY IF EXISTS "decide approvals" ON public.approvals;
CREATE POLICY "decide approvals" ON public.approvals FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(),'ADMIN')
    OR ((public.has_role(auth.uid(),'GERENTE') OR public.has_role(auth.uid(),'COORDENADOR'))
        AND public.can_access_area(auth.uid(), area_id))
  )
  WITH CHECK (
    public.has_role(auth.uid(),'ADMIN')
    OR ((public.has_role(auth.uid(),'GERENTE') OR public.has_role(auth.uid(),'COORDENADOR'))
        AND public.can_access_area(auth.uid(), area_id))
  );