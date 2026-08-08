import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  diagnosticoAcesso,
  listarUsuarios,
  promoverPrimeiroAdmin,
  removerAcesso,
  salvarAcesso,
} from "@/lib/acessos.functions";
import { useAuth } from "@/hooks/useAuth";

export function useDiagnosticoAcesso() {
  const fn = useServerFn(diagnosticoAcesso);
  const { user } = useAuth();
  return useQuery({
    queryKey: ["diagnostico-acesso", user?.id],
    enabled: !!user,
    queryFn: () => fn({}),
  });
}

export function usePromoverPrimeiroAdmin() {
  const fn = useServerFn(promoverPrimeiroAdmin);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => fn({}),
    onSuccess: () => {
      qc.invalidateQueries();
    },
  });
}

export function useUsuariosAcesso(habilitado: boolean) {
  const fn = useServerFn(listarUsuarios);
  return useQuery({
    queryKey: ["usuarios-acesso"],
    enabled: habilitado,
    queryFn: () => fn({}),
  });
}

export function useSalvarAcesso() {
  const fn = useServerFn(salvarAcesso);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      userId: string;
      papeis: string[];
      unidades: string[];
      areas: string[];
      ativo: boolean;
    }) => fn({ data } as never),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["usuarios-acesso"] });
      qc.invalidateQueries({ queryKey: ["perfil"] });
      qc.invalidateQueries({ queryKey: ["audit"] });
    },
  });
}

export function useRemoverAcesso() {
  const fn = useServerFn(removerAcesso);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => fn({ data: { userId } } as never),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["usuarios-acesso"] });
      qc.invalidateQueries({ queryKey: ["audit"] });
    },
  });
}
