import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type {
  Area,
  Conflict,
  CoverageRule,
  Employee,
  Funcao,
  Movement,
  Papel,
  Turno,
  Unidade,
  Vacation,
} from "@/lib/sistema";

export type VacationFull = Vacation & {
  employee: Employee | null;
  conflitos: Conflict[];
};

export function usePerfil() {
  const { user, loading } = useAuth();
  const q = useQuery({
    queryKey: ["perfil", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [{ data: roles, error: e1 }, { data: perms, error: e2 }, { data: areas, error: e3 }] =
        await Promise.all([
          supabase.from("user_roles").select("role").eq("user_id", user!.id),
          supabase.from("user_area_permissions").select("area_id, unit_id").eq("user_id", user!.id),
          supabase.from("areas").select("id, unit_id"),
        ]);
      if (e1) throw e1;
      if (e2) throw e2;
      if (e3) throw e3;

      const unidades = (perms ?? []).filter((p) => !p.area_id && p.unit_id).map((p) => p.unit_id!);
      const diretas = (perms ?? []).filter((p) => p.area_id).map((p) => p.area_id!);
      const porUnidade = (areas ?? [])
        .filter((a) => a.unit_id && unidades.includes(a.unit_id))
        .map((a) => a.id);

      return {
        papeis: (roles ?? []).map((r) => r.role as Papel),
        areas: Array.from(new Set([...diretas, ...porUnidade])),
        unidades,
      };
    },
  });

  const papeis = q.data?.papeis ?? [];
  const tem = (p: Papel) => papeis.includes(p);
  const areasPermitidas = q.data?.areas ?? [];
  const unidadesPermitidas = q.data?.unidades ?? [];
  const irrestrito = tem("ADMIN") || tem("ANALISTA");
  const gestor = irrestrito || tem("GERENTE");

  return {
    loading: loading || q.isLoading,
    papeis,
    areasPermitidas,
    unidadesPermitidas,
    tem,
    semPapel: !!user && !q.isLoading && papeis.length === 0,
    podeManterCadastro: tem("ADMIN") || tem("ANALISTA"),
    podeAprovar: tem("ADMIN") || tem("GERENTE") || tem("COORDENADOR"),
    podeVerAuditoria: tem("ADMIN"),
    podeVerArea: (areaId: string | null) =>
      irrestrito || (!!areaId && areasPermitidas.includes(areaId)),
    gestor,
  };
}


export function useCatalogos() {
  return useQuery({
    queryKey: ["catalogos"],
    queryFn: async () => {
      const [areas, turnos, funcoes, regras, unidades] = await Promise.all([
        supabase.from("areas").select("*").order("nome"),
        supabase.from("shifts").select("*").order("nome"),
        supabase.from("functions").select("*").order("nome"),
        supabase.from("coverage_rules").select("*"),
        supabase.from("units").select("*").order("nome"),
      ]);
      if (areas.error) throw areas.error;
      if (turnos.error) throw turnos.error;
      if (funcoes.error) throw funcoes.error;
      if (regras.error) throw regras.error;
      if (unidades.error) throw unidades.error;
      return {
        areas: (areas.data ?? []) as Area[],
        turnos: (turnos.data ?? []) as Turno[],
        funcoes: (funcoes.data ?? []) as Funcao[],
        regras: (regras.data ?? []) as CoverageRule[],
        unidades: (unidades.data ?? []) as Unidade[],
      };
    },
  });
}

export function useEmployees() {
  return useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("*").order("nome");
      if (error) throw error;
      return (data ?? []) as Employee[];
    },
  });
}

export function useVacations() {
  return useQuery({
    queryKey: ["vacations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vacations")
        .select(
          "*, employee:employees!vacations_employee_id_fkey(*), conflitos:vacation_conflicts!vacation_conflicts_vacation_id_fkey(*)",
        )
        .order("inicio");
      if (error) throw error;
      return (data ?? []) as unknown as VacationFull[];
    },
  });
}

export type MovementFull = Movement & { employee: Employee | null };

export function useMovements() {
  return useQuery({
    queryKey: ["movements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_movements")
        .select("*, employee:employees!employee_movements_employee_id_fkey(*)")
        .order("data_efetiva", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as MovementFull[];
    },
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["vacations"] });
    qc.invalidateQueries({ queryKey: ["movements"] });
    qc.invalidateQueries({ queryKey: ["employees"] });
    qc.invalidateQueries({ queryKey: ["audit"] });
  };
}

export function useSalvarFerias() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      employee_id: string;
      inicio: string;
      fim: string;
      status: Vacation["status"];
      substituto_employee_id: string | null;
      substituto_nome: string | null;
      observacao: string | null;
    }) => {
      const { id, ...rest } = input;
      if (id) {
        const { error } = await supabase.from("vacations").update(rest).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("vacations").insert(rest);
        if (error) throw error;
      }
    },
    onSuccess: invalidate,
  });
}

export function useExcluirFerias() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vacations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useSalvarMovimentacao() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: Partial<Movement> & { employee_id: string; re: string }) => {
      const { id, ...rest } = input as Movement;
      if (id) {
        const { error } = await supabase.from("employee_movements").update(rest).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("employee_movements").insert(rest as never);
        if (error) throw error;
      }
    },
    onSuccess: invalidate,
  });
}

export function useDecidirMovimentacao() {
  const invalidate = useInvalidate();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { id: string; status: Movement["status"]; observacao?: string }) => {
      const { error } = await supabase
        .from("employee_movements")
        .update({
          status: input.status,
          aprovador_id: user?.id ?? null,
          ...(input.observacao ? { observacao: input.observacao } : {}),
        })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useReconhecerConflito() {
  const invalidate = useInvalidate();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("vacation_conflicts")
        .update({ reconhecido: true, reconhecido_por: user?.id ?? null, reconhecido_em: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useAuditoria(limite = 200) {
  return useQuery({
    queryKey: ["audit", limite],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limite);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAuditoriaRegistro(registroId: string | null | undefined) {
  return useQuery({
    queryKey: ["audit", "registro", registroId],
    enabled: !!registroId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("*")
        .eq("registro_id", registroId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
}
