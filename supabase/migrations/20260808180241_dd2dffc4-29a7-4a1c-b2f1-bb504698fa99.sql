CREATE TABLE public.access_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  email text,
  area_id uuid references public.areas(id),
  justificativa text not null,
  status approval_status not null default 'PENDENTE',
  decidido_por uuid,
  decidido_em timestamptz,
  resposta text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

GRANT SELECT, INSERT, UPDATE ON public.access_requests TO authenticated;
GRANT ALL ON public.access_requests TO service_role;

ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuário vê suas próprias solicitações"
ON public.access_requests FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(),'ADMIN'));

CREATE POLICY "Usuário cria a própria solicitação"
ON public.access_requests FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admin decide solicitações"
ON public.access_requests FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'ADMIN'))
WITH CHECK (public.has_role(auth.uid(),'ADMIN'));

CREATE UNIQUE INDEX access_requests_uma_aberta_por_usuario
ON public.access_requests (user_id) WHERE status = 'PENDENTE';

CREATE TRIGGER trg_access_requests_updated
BEFORE UPDATE ON public.access_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_access_requests_audit
AFTER INSERT OR UPDATE OR DELETE ON public.access_requests
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();