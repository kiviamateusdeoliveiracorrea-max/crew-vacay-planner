import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ChamadaDia, ChamadaRegistro } from "@/lib/chamada";

/** Somente leitura: dados do dia usados pelos blocos da tela inicial. */
export function useResumoDoDia(dia: string) {
  return useQuery({
    queryKey: ["painel-inicio", "chamada", dia],
    queryFn: async () => {
      const desde = new Date(new Date(dia).getTime() - 30 * 86400000).toISOString().slice(0, 10);
      const { data: dias, error } = await supabase
        .from("attendance_days")
        .select("*")
        .gte("attendance_date", desde)
        .lte("attendance_date", dia)
        .order("attendance_date", { ascending: false });
      if (error) throw error;

      const doDia = (dias ?? []).filter((d) => d.attendance_date === dia);
      const ids = doDia.map((d) => d.id);
      let registros: ChamadaRegistro[] = [];
      if (ids.length) {
        const { data: regs, error: e2 } = await supabase
          .from("attendance_records")
          .select("*")
          .in("attendance_day_id", ids);
        if (e2) throw e2;
        registros = (regs ?? []) as ChamadaRegistro[];
      }
      return {
        dias: (dias ?? []) as ChamadaDia[],
        diasDoDia: doDia as ChamadaDia[],
        registros,
      };
    },
  });
}


/** Somente leitura: lotes de importação que ainda aguardam validação/aprovação. */
export function useLotesPendentes() {
  return useQuery({
    queryKey: ["painel-inicio", "import_batches"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("import_batches")
        .select("id, arquivo_nome, fonte, status, total_linhas, created_at")
        .in("status", ["RASCUNHO", "VALIDADO", "APROVADO"])
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
}
