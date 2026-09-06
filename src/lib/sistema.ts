import type { Tables, Enums } from "@/integrations/supabase/types";

export type Unidade = Tables<"units">;
export type Area = Tables<"areas">;
export type Turno = Tables<"shifts">;
export type Funcao = Tables<"functions">;
export type Employee = Tables<"employees">;
export type Movement = Tables<"employee_movements">;
export type Vacation = Tables<"vacations">;
export type Conflict = Tables<"vacation_conflicts">;
export type CoverageRule = Tables<"coverage_rules">;
export type ImportBatch = Tables<"import_batches">;
export type ImportRow = Tables<"import_rows">;
export type AuditLog = Tables<"audit_log">;
export type Approval = Tables<"approvals">;

export type Papel = Enums<"app_role">;
export type Severidade = Enums<"conflict_severity">;
export type TipoMovimentacao = Enums<"movement_type">;
export type ClassificacaoImport = Enums<"import_row_class">;

export const PAPEIS: Papel[] = ["ADMIN", "ANALISTA", "LIDER", "COORDENADOR", "GERENTE"];

export const PAPEL_DESCRICAO: Record<Papel, string> = {
  ADMIN: "Acesso completo: usuários, parâmetros e auditoria",
  ANALISTA: "Importa bases, mantém cadastros, movimentações e férias",
  LIDER: "Vê a própria equipe, programa férias e indica substituto",
  COORDENADOR: "Vê e aprova registros das áreas autorizadas",
  GERENTE: "Vê todas as áreas da unidade e aprova alertas críticos",
};

export const TIPOS_MOVIMENTACAO: TipoMovimentacao[] = [
  "TRANSFERENCIA_DEFINITIVA",
  "EMPRESTIMO_TEMPORARIO",
  "COBERTURA_DE_FERIAS",
  "TROCA_DE_TURNO",
  "RETORNO_A_ORIGEM",
];

export const SEVERIDADES: Severidade[] = ["INFORMATIVO", "ATENCAO", "CRITICO", "BLOQUEIO"];

export const SEVERIDADE_PESO: Record<Severidade, number> = {
  INFORMATIVO: 1,
  ATENCAO: 2,
  CRITICO: 3,
  BLOQUEIO: 4,
};

export const SEVERIDADE_LABEL: Record<Severidade, string> = {
  INFORMATIVO: "Informativo",
  ATENCAO: "Atenção",
  CRITICO: "Crítico",
  BLOQUEIO: "Bloqueio",
};

export function severidadeClasse(s: Severidade) {
  switch (s) {
    case "BLOQUEIO":
      return "bg-destructive text-destructive-foreground";
    case "CRITICO":
      return "bg-destructive/15 text-destructive border border-destructive/40";
    case "ATENCAO":
      return "bg-amber-500/15 text-amber-600 border border-amber-500/40 dark:text-amber-400";
    default:
      return "bg-muted text-muted-foreground border border-border";
  }
}

export const humaniza = (v: string | null | undefined) =>
  (v ?? "").replaceAll("_", " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());

export const fmtData = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};

export const fmtDataHora = (iso: string | null | undefined) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR");
};

export const diasEntre = (inicio: string, fim: string) =>
  Math.round((new Date(fim).getTime() - new Date(inicio).getTime()) / 86400000) + 1;

export const sobrepoe = (
  a: { inicio: string; fim: string },
  b: { inicio: string; fim: string },
) => a.inicio <= b.fim && b.inicio <= a.fim;

export const mesDe = (iso: string) => iso.slice(0, 7);

export const MESES = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

export const normaliza = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
