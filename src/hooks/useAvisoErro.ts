import { useCallback } from "react";
import { toast } from "sonner";
import { usePerfil } from "@/hooks/useSistema";
import { mensagemErro } from "@/lib/mensagens";

/**
 * Exibe erros em linguagem clara. O detalhe técnico fica disponível
 * apenas para ADMIN e ANALISTA, em "Ver detalhes do erro".
 */
export function useAvisoErro() {
  const perfil = usePerfil();
  const podeVerDetalhes = perfil.podeManterCadastro;

  return useCallback(
    (erro: unknown, padrao?: string) => {
      const { texto, detalhe } = mensagemErro(erro, padrao);
      const mostrarDetalhe = podeVerDetalhes && detalhe && detalhe !== texto;

      toast.error(texto, {
        action: mostrarDetalhe
          ? {
              label: "Ver detalhes do erro",
              onClick: () =>
                toast.message("Detalhe técnico", {
                  description: detalhe,
                  duration: 15000,
                }),
            }
          : undefined,
      });
    },
    [podeVerDetalhes],
  );
}
