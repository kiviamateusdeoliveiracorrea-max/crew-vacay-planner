CREATE TABLE public.colaboradores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  re text,
  nome text NOT NULL,
  funcao text NOT NULL,
  area text NOT NULL,
  turno text,
  lider text,
  funcao_chave boolean NOT NULL DEFAULT false,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.colaboradores TO authenticated;
GRANT ALL ON public.colaboradores TO service_role;
ALTER TABLE public.colaboradores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read colaboradores" ON public.colaboradores FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert colaboradores" ON public.colaboradores FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update colaboradores" ON public.colaboradores FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete colaboradores" ON public.colaboradores FOR DELETE TO authenticated USING (true);

CREATE TABLE public.ferias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  inicio date NOT NULL,
  fim date NOT NULL,
  status text NOT NULL DEFAULT 'PLANEJADA',
  substituto text,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ferias_colaborador ON public.ferias(colaborador_id);
CREATE INDEX idx_ferias_periodo ON public.ferias(inicio, fim);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ferias TO authenticated;
GRANT ALL ON public.ferias TO service_role;
ALTER TABLE public.ferias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read ferias" ON public.ferias FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert ferias" ON public.ferias FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update ferias" ON public.ferias FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete ferias" ON public.ferias FOR DELETE TO authenticated USING (true);