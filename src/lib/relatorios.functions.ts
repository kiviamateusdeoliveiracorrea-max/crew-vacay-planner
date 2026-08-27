import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({
  relatorio: z.string().min(1),
  formato: z.enum(["XLSX", "CSV"]),
  filtros: z.record(z.string(), z.string()),
  totais: z.record(z.string(), z.number()),
});

/** Registra a exportação no audit_log. Não lê nem altera dados operacionais. */
export const registrarExportacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("audit_log").insert({
      tabela: "relatorios",
      registro_id: null,
      acao: `EXPORTACAO_${data.relatorio}`,
      usuario_id: context.userId,
      valor_anterior: null,
      valor_posterior: {
        formato: data.formato,
        filtros: data.filtros,
        totais: data.totais,
      } as never,
      justificativa: `Exportação ${data.formato} do relatório ${data.relatorio}`,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
