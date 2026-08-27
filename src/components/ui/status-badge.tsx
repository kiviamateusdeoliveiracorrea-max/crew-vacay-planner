import { cn } from "@/lib/utils";

/**
 * Etiquetas de status do design system.
 * As cores semânticas são fixas:
 * verde = regular/aprovado/concluído · amarelo = atenção · laranja = alta
 * vermelho = crítico/bloqueio/vencido · azul = informativo · cinza = inativo/cancelado
 */
export type StatusTipo =
  | "REGULAR"
  | "ATENÇÃO"
  | "ALTA"
  | "CRÍTICA"
  | "APROVADA"
  | "PENDENTE"
  | "EM GOZO"
  | "CONCLUÍDA"
  | "CANCELADA"
  | "MOVIMENTAÇÃO TEMPORÁRIA";

const ESTILOS: Record<StatusTipo, string> = {
  REGULAR: "border-success/30 bg-success/10 text-success",
  APROVADA: "border-success/30 bg-success/10 text-success",
  CONCLUÍDA: "border-success/30 bg-success/10 text-success",
  "ATENÇÃO": "border-warning/40 bg-warning/15 text-warning-foreground",
  PENDENTE: "border-warning/40 bg-warning/15 text-warning-foreground",
  ALTA: "border-high/40 bg-high/15 text-high-foreground",
  "CRÍTICA": "border-critical/30 bg-critical/10 text-critical",
  "EM GOZO": "border-info/30 bg-info/10 text-info",
  "MOVIMENTAÇÃO TEMPORÁRIA": "border-info/30 bg-info/10 text-info",
  CANCELADA: "border-border bg-muted text-muted-foreground",
};

export function StatusBadge({
  status,
  children,
  className,
}: {
  status: StatusTipo;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide",
        ESTILOS[status] ?? ESTILOS.CANCELADA,
        className,
      )}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
      {children ?? status}
    </span>
  );
}
