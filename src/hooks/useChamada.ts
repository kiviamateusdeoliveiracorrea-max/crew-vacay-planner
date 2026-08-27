import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type {
  ChamadaCorrecao,
  ChamadaDia,
  ChamadaRegistro,
  MotivoAusencia,
  Previsto,
  StatusPresenca,
} from "@/lib/chamada";

export function useMotivos() {
  return useQuery({
    queryKey: ["absence_reasons"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("absence_reasons")
        .select("*")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as MotivoAusencia[];
    },
  });
}

export function useChamadas(limite = 60) {
  return useQuery({
    queryKey: ["attendance_days", limite],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_days")
        .select("*")
        .order("attendance_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(limite);
      if (error) throw error;
      return (data ?? []) as ChamadaDia[];
    },
  });
}

export function useRegistros(dayId: string | null) {
  return useQuery({
    queryKey: ["attendance_records", dayId],
    enabled: !!dayId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_records")
        .select("*")
        .eq("attendance_day_id", dayId!)
        .order("employee_name_snapshot");
      if (error) throw error;
      return (data ?? []) as ChamadaRegistro[];
    },
  });
}

export function useCorrecoes(recordId: string | null) {
  return useQuery({
    queryKey: ["attendance_corrections", recordId],
    enabled: !!recordId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_corrections")
        .select("*")
        .eq("attendance_record_id", recordId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ChamadaCorrecao[];
    },
  });
}

function useInvalidar() {
  const qc = useQueryClient();
  return (dayId?: string) => {
    void qc.invalidateQueries({ queryKey: ["attendance_days"] });
    void qc.invalidateQueries({ queryKey: ["attendance_records", dayId] });
    void qc.invalidateQueries({ queryKey: ["auditoria"] });
  };
}

export function useAbrirChamada() {
  const invalidar = useInvalidar();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      attendance_date: string;
      unit_id: string | null;
      area_id: string;
      shift_id: string | null;
      notes: string | null;
      previstos: Previsto[];
    }) => {
      const { data: dia, error } = await supabase
        .from("attendance_days")
        .insert({
          attendance_date: input.attendance_date,
          unit_id: input.unit_id,
          area_id: input.area_id,
          shift_id: input.shift_id,
          notes: input.notes,
          responsible_user_id: user?.id ?? null,
          status: "ABERTA",
        })
        .select()
        .single();
      if (error) throw error;

      if (input.previstos.length) {
        const linhas = input.previstos.map((p) => ({
          attendance_day_id: dia.id,
          employee_id: p.employee_id,
          employee_re: p.employee_re,
          employee_name_snapshot: p.employee_name_snapshot,
          function_snapshot: p.function_snapshot,
          planned_area_id: p.planned_area_id,
          effective_area_id: p.effective_area_id,
          planned_shift_id: p.planned_shift_id,
          effective_shift_id: p.effective_shift_id,
          attendance_status: p.attendance_status,
          notes: p.notes,
          source: "ABERTURA",
        }));
        const { error: e2 } = await supabase.from("attendance_records").insert(linhas);
        if (e2) throw e2;
      }
      return dia as ChamadaDia;
    },
    onSuccess: (dia) => invalidar(dia.id),
  });
}

export function useAtualizarRegistro() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      dayId: string;
      patch: Partial<ChamadaRegistro>;
    }) => {
      const { error } = await supabase
        .from("attendance_records")
        .update(input.patch)
        .eq("id", input.id);
      if (error) throw error;

      const { error: e2 } = await supabase
        .from("attendance_days")
        .update({ status: "EM_PREENCHIMENTO" })
        .eq("id", input.dayId)
        .in("status", ["ABERTA"]);
      if (e2) throw e2;
    },
    onSuccess: (_d, v) => invalidar(v.dayId),
  });
}

export function useFecharChamada() {
  const invalidar = useInvalidar();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { dayId: string; confirmarPendentes: boolean }) => {
      if (input.confirmarPendentes) {
        const { error } = await supabase
          .from("attendance_records")
          .update({ attendance_status: "PRESENTE" as StatusPresenca, source: "FECHAMENTO" })
          .eq("attendance_day_id", input.dayId)
          .eq("attendance_status", "PENDENTE");
        if (error) throw error;
      }
      const { error: e2 } = await supabase
        .from("attendance_days")
        .update({
          status: "FECHADA",
          closed_at: new Date().toISOString(),
          closed_by: user?.id ?? null,
        })
        .eq("id", input.dayId);
      if (e2) throw e2;
    },
    onSuccess: (_d, v) => invalidar(v.dayId),
  });
}

export function useReabrirChamada() {
  const invalidar = useInvalidar();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { dayId: string; justificativa: string }) => {
      const { error } = await supabase
        .from("attendance_days")
        .update({
          status: "REABERTA",
          reopened_at: new Date().toISOString(),
          reopened_by: user?.id ?? null,
          reopening_justification: input.justificativa,
        })
        .eq("id", input.dayId);
      if (error) throw error;
    },
    onSuccess: (_d, v) => invalidar(v.dayId),
  });
}

export function useCorrigirRegistro() {
  const invalidar = useInvalidar();
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      dayId: string;
      registro: ChamadaRegistro;
      novoStatus: StatusPresenca;
      novoMotivo: string | null;
      justificativa: string;
    }) => {
      const { error } = await supabase.from("attendance_corrections").insert({
        attendance_record_id: input.registro.id,
        previous_status: input.registro.attendance_status,
        new_status: input.novoStatus,
        previous_reason: input.registro.absence_reason_id,
        new_reason: input.novoMotivo,
        justification: input.justificativa,
      });
      if (error) throw error;

      const { error: e2 } = await supabase
        .from("attendance_records")
        .update({
          attendance_status: input.novoStatus,
          absence_reason_id: input.novoMotivo,
          corrected_by: user?.id ?? null,
          corrected_at: new Date().toISOString(),
          correction_justification: input.justificativa,
          source: "CORRECAO",
        })
        .eq("id", input.registro.id);
      if (e2) throw e2;
    },
    onSuccess: (_d, v) => {
      invalidar(v.dayId);
      void qc.invalidateQueries({ queryKey: ["attendance_corrections", v.registro.id] });
    },
  });
}
