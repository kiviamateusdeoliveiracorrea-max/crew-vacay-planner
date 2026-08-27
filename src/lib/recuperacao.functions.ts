import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const solicitacaoSchema = z.object({
  emailMascarado: z.string().min(3).max(160),
  resultado: z.enum(["ENVIADO", "FALHA", "LIMITE"]),
});

/**
 * Registra apenas o evento de solicitação de recuperação.
 * Nunca recebe nem grava senha, token, link ou conteúdo do e-mail.
 */
export const registrarSolicitacaoRecuperacao = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => solicitacaoSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_log").insert({
      tabela: "auth",
      registro_id: null,
      acao: "RECUPERACAO_SENHA_SOLICITADA",
      usuario_id: null,
      valor_anterior: null,
      valor_posterior: { email: data.emailMascarado, resultado: data.resultado } as never,
      justificativa: "Solicitação de link para criar nova senha.",
    });
    return { ok: true };
  });

/** Registra a conclusão da redefinição. Executa com a sessão de recuperação do próprio usuário. */
export const registrarRedefinicaoConcluida = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_log").insert({
      tabela: "auth",
      registro_id: context.userId,
      acao: "RECUPERACAO_SENHA_CONCLUIDA",
      usuario_id: context.userId,
      valor_anterior: null,
      valor_posterior: { resultado: "SENHA_ALTERADA" } as never,
      justificativa: "Nova senha definida pelo próprio usuário.",
    });
    return { ok: true };
  });
