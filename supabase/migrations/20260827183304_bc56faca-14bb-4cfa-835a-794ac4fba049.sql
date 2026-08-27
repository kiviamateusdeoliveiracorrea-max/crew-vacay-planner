CREATE OR REPLACE FUNCTION public.concluir_ferias_vencidas()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  _concluidas integer := 0;
  _conflitos integer := 0;
begin
  with alvo as (
    select id, status
    from public.vacations
    where status not in ('CANCELADA', 'CONCLUIDA')
      and fim is not null
      and inicio is not null
      and fim >= inicio
      and fim < current_date
  ), upd as (
    update public.vacations v
       set status = 'CONCLUIDA'
      from alvo a
     where v.id = a.id
    returning v.id, a.status as status_anterior
  ), log as (
    insert into public.audit_log (tabela, registro_id, acao, valor_anterior, valor_posterior, justificativa)
    select 'vacations', u.id, 'CONCLUSAO_AUTOMATICA',
           jsonb_build_object('status', u.status_anterior),
           jsonb_build_object('status', 'CONCLUIDA', 'origem', 'SISTEMA_AUTOMATICO', 'em', now()),
           'Conclusão automática por decurso do período (origem SISTEMA_AUTOMATICO).'
      from upd u
    returning 1
  )
  select count(*) into _concluidas from log;

  update public.vacation_conflicts c
     set reconhecido = true,
         reconhecido_em = coalesce(c.reconhecido_em, now()),
         detalhes = coalesce(c.detalhes, '{}'::jsonb)
                    || jsonb_build_object('resolucao', 'RESOLVIDO_POR_DECURSO_DO_PERIODO')
    from public.vacations v
   where v.id = c.vacation_id
     and v.status <> 'CANCELADA'
     and v.fim is not null
     and v.fim < current_date
     and coalesce(c.detalhes->>'resolucao', '') <> 'RESOLVIDO_POR_DECURSO_DO_PERIODO';
  get diagnostics _conflitos = row_count;

  return jsonb_build_object(
    'ferias_concluidas', _concluidas,
    'conflitos_encerrados', _conflitos,
    'executado_em', now()
  );
end;
$function$;

REVOKE ALL ON FUNCTION public.concluir_ferias_vencidas() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.concluir_ferias_vencidas() TO service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'concluir-ferias-vencidas';

SELECT cron.schedule(
  'concluir-ferias-vencidas',
  '10 3 * * *',
  $$SELECT public.concluir_ferias_vencidas();$$
);