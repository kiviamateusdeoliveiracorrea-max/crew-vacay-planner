ALTER TYPE public.import_row_class ADD VALUE IF NOT EXISTS 'MUDANCA_DE_LIDER';
ALTER TYPE public.import_row_class ADD VALUE IF NOT EXISTS 'AFASTAMENTO';
ALTER TYPE public.import_row_class ADD VALUE IF NOT EXISTS 'RETORNO_DE_AFASTAMENTO';
ALTER TYPE public.import_row_class ADD VALUE IF NOT EXISTS 'REATIVACAO';
ALTER TYPE public.import_row_class ADD VALUE IF NOT EXISTS 'VAGA_ABERTA';

ALTER TABLE public.import_batches ADD COLUMN IF NOT EXISTS fonte text NOT NULL DEFAULT 'PERSONALIZADO';
ALTER TABLE public.import_templates ADD COLUMN IF NOT EXISTS fonte text NOT NULL DEFAULT 'PERSONALIZADO';

ALTER TABLE public.import_rows ADD COLUMN IF NOT EXISTS decisao text NOT NULL DEFAULT 'PENDENTE';
ALTER TABLE public.import_rows ADD COLUMN IF NOT EXISTS justificativa text;
ALTER TABLE public.import_rows ADD COLUMN IF NOT EXISTS setor_decisao_inicio date;
ALTER TABLE public.import_rows ADD COLUMN IF NOT EXISTS campos_ignorados text[] NOT NULL DEFAULT '{}';