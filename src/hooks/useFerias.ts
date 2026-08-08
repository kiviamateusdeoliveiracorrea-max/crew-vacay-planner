import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Colaborador, Feria, Registro } from "@/lib/ferias";

export function useDados() {
  return useQuery({
    queryKey: ["controle-ferias"],
    queryFn: async () => {
      const [{ data: colaboradores, error: e1 }, { data: ferias, error: e2 }] = await Promise.all([
        supabase.from("colaboradores").select("*").eq("ativo", true).order("nome"),
        supabase.from("ferias").select("*").order("inicio"),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      const cols = (colaboradores ?? []) as Colaborador[];
      const porId = new Map(cols.map((c) => [c.id, c]));
      const registros: Registro[] = ((ferias ?? []) as Feria[])
        .filter((f) => porId.has(f.colaborador_id))
        .map((f) => ({ ...f, colaborador: porId.get(f.colaborador_id)! }));
      return { colaboradores: cols, registros };
    },
  });
}

export function useSalvarFerias() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string | undefined;
      colaborador_id: string;
      inicio: string;
      fim: string;
      substituto: string | null;
      observacao: string | null;
    }) => {
      const { id, ...rest } = input;
      if (id) {
        const { error } = await supabase.from("ferias").update(rest).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("ferias").insert({ ...rest, status: "PLANEJADA" });
        if (error) throw error;
      }

    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["controle-ferias"] }),
  });
}

export function useExcluirFerias() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ferias").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["controle-ferias"] }),
  });
}
