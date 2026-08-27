import type { Enums, Tables } from "@/integrations/supabase/types";
import type { Employee, Movement, Vacation } from "@/lib/sistema";
import { lotacaoVigente } from "@/lib/movimentacao";

export type ChamadaDia = Tables<"attendance_days">;
export type ChamadaRegistro = Tables<"attendance_records">;
export type MotivoAusencia = Tables<"absence_reasons">;
export type ChamadaCorrecao = Tables<"attendance_corrections">;

export type StatusChamada = Enums<"attendance_day_status">;
export type StatusPresenca = Enums<"attendance_status">;

export const STATUS_CHAMADA_LABEL: Record<StatusChamada, string> = {
  ABERTA: "Aberta",
  EM_PREENCHIMENTO: "Em preenchimento",
  FECHADA: "Fechada",
  REABERTA: "Reaberta",
  CANCELADA: "Cancelada",
};

export const STATUS_PRESENCA_LABEL: Record<StatusPresenca, string> = {
  PENDENTE: "Pendente",
  PRESENTE: "Presente",
  FALTA: "Falta",
  FALTA_JUSTIFICADA: "Falta justificada",
  ATESTADO: "Atestado",
  FERIAS: "Férias",
  AFASTADO: "Afastado",
  FOLGA: "Folga",
  COMPENSACAO: "Compensação",
  ATRASO: "Atraso",
  SAIDA_ANTECIPADA: "Saída antecipada",
  TREINAMENTO: "Treinamento",
  APOIO_OUTRA_AREA: "Apoio em outra área",
  HOME_OFFICE: "Home office",
  DESLIGADO: "Desligado",
  NAO_PREVISTO: "Não previsto",
};

/** Ocorrências oferecidas nas ações rápidas, com o código de motivo sugerido. */
export const ACOES_RAPIDAS: { status: StatusPresenca; label: string; motivo?: string }[] = [
  { status: "FALTA", label: "Falta", motivo: "FALTA_SEM_JUSTIFICATIVA" },
  { status: "FALTA_JUSTIFICADA", label: "Falta justificada", motivo: "FALTA_JUSTIFICADA" },
  { status: "ATESTADO", label: "Atestado", motivo: "ATESTADO_PENDENTE" },
  { status: "ATRASO", label: "Atraso", motivo: "ATRASO" },
  { status: "SAIDA_ANTECIPADA", label: "Saída antecipada", motivo: "SAIDA_ANTECIPADA" },
  { status: "FOLGA", label: "Folga", motivo: "FOLGA" },
  { status: "COMPENSACAO", label: "Compensação", motivo: "COMPENSACAO" },
  { status: "TREINAMENTO", label: "Treinamento", motivo: "TREINAMENTO" },
  { status: "APOIO_OUTRA_AREA", label: "Apoio em outra área", motivo: "APOIO_OUTRA_AREA" },
];

/** Ocorrências que exigem motivo preenchido para permitir o fechamento. */
export const EXIGE_MOTIVO: StatusPresenca[] = [
  "FALTA",
  "FALTA_JUSTIFICADA",
  "ATESTADO",
  "ATRASO",
  "SAIDA_ANTECIPADA",
  "FOLGA",
  "COMPENSACAO",
  "TREINAMENTO",
  "APOIO_OUTRA_AREA",
];

export function statusClasse(s: StatusPresenca) {
  switch (s) {
    case "PRESENTE":
      return "bg-emerald-500/15 text-emerald-600 border border-emerald-500/40 dark:text-emerald-400";
    case "FALTA":
      return "bg-destructive/15 text-destructive border border-destructive/40";
    case "PENDENTE":
      return "bg-muted text-muted-foreground border border-border";
    case "FERIAS":
    case "AFASTADO":
    case "DESLIGADO":
    case "NAO_PREVISTO":
      return "bg-sky-500/15 text-sky-600 border border-sky-500/40 dark:text-sky-400";
    default:
      return "bg-amber-500/15 text-amber-600 border border-amber-500/40 dark:text-amber-400";
  }
}

export type PrevistoBase = {
  employees: Employee[];
  movimentacoes: Movement[];
  ferias: Pick<Vacation, "employee_id" | "inicio" | "fim" | "status">[];
  funcoes: { id: string; nome: string }[];
};

export type Previsto = {
  employee_id: string;
  employee_re: string;
  employee_name_snapshot: string;
  function_snapshot: string | null;
  planned_area_id: string | null;
  effective_area_id: string | null;
  planned_shift_id: string | null;
  effective_shift_id: string | null;
  attendance_status: StatusPresenca;
  notes: string | null;
  avisos: string[];
};

/**
 * Monta a lista prevista da chamada para uma data/área/turno considerando
 * movimentações definitivas e temporárias vigentes, férias e afastamentos.
 * Desligados nunca entram.
 */
export function montarPrevistos(
  base: PrevistoBase,
  data: string,
  areaId: string,
  shiftId: string | null,
): Previsto[] {
  const nomeFuncao = (id: string | null) =>
    id ? (base.funcoes.find((f) => f.id === id)?.nome ?? null) : null;

  const emFerias = (employeeId: string) =>
    base.ferias.some(
      (v) =>
        v.employee_id === employeeId &&
        v.status !== "CANCELADA" &&
        v.inicio <= data &&
        v.fim >= data,
    );

  const linhas: Previsto[] = [];

  for (const e of base.employees) {
    if (e.status === "DESLIGADO") continue;
    if (e.data_desligamento && e.data_desligamento <= data) continue;

    const lot = lotacaoVigente(base.movimentacoes, e, data);
    const efetivaAqui = lot.areaId === areaId;
    const planejadaAqui = e.area_id === areaId;
    if (!efetivaAqui && !planejadaAqui) continue;

    const turnoOk =
      !shiftId ||
      (efetivaAqui ? lot.shiftId === shiftId : e.shift_id === shiftId) ||
      (!lot.shiftId && !e.shift_id);
    if (!turnoOk) continue;

    const avisos: string[] = [];
    if (!e.area_id) avisos.push("Colaborador sem área cadastrada");
    if (!e.shift_id) avisos.push("Colaborador sem turno cadastrado");

    let status: StatusPresenca = "PENDENTE";
    let notes: string | null = null;

    if (!efetivaAqui && planejadaAqui) {
      status = "NAO_PREVISTO";
      notes = "Cedido temporariamente para outra área";
      avisos.push("Colaborador enviado para outra área na data");
    } else if (efetivaAqui && !planejadaAqui) {
      notes = "Recebido temporariamente de outra área";
    } else if (lot.temporaria) {
      notes = "Movimentação temporária vigente";
    }

    if (emFerias(e.id)) {
      status = "FERIAS";
      notes = "Férias vigentes na data";
    } else if (e.status === "AFASTADO") {
      status = "AFASTADO";
      notes = "Afastamento vigente";
    }

    linhas.push({
      employee_id: e.id,
      employee_re: e.re,
      employee_name_snapshot: e.nome,
      function_snapshot: nomeFuncao(e.function_id),
      planned_area_id: e.area_id,
      effective_area_id: lot.areaId,
      planned_shift_id: e.shift_id,
      effective_shift_id: lot.shiftId,
      attendance_status: status,
      notes,
      avisos,
    });
  }

  return linhas.sort((a, b) =>
    a.employee_name_snapshot.localeCompare(b.employee_name_snapshot, "pt-BR"),
  );
}

export type Resumo = {
  previsto: number;
  presentes: number;
  faltas: number;
  faltasJustificadas: number;
  atestados: number;
  ferias: number;
  afastados: number;
  folgas: number;
  atrasos: number;
  apoio: number;
  pendentes: number;
};

export function resumir(registros: Pick<ChamadaRegistro, "attendance_status">[]): Resumo {
  const c = (s: StatusPresenca) => registros.filter((r) => r.attendance_status === s).length;
  return {
    previsto: registros.length,
    presentes: c("PRESENTE"),
    faltas: c("FALTA"),
    faltasJustificadas: c("FALTA_JUSTIFICADA"),
    atestados: c("ATESTADO"),
    ferias: c("FERIAS"),
    afastados: c("AFASTADO"),
    folgas: c("FOLGA") + c("COMPENSACAO"),
    atrasos: c("ATRASO") + c("SAIDA_ANTECIPADA"),
    apoio: c("APOIO_OUTRA_AREA"),
    pendentes: c("PENDENTE"),
  };
}

/** Impedimentos de fechamento. Lista vazia = pode fechar. */
export function bloqueiosFechamento(
  registros: ChamadaRegistro[],
  dia: Pick<ChamadaDia, "area_id" | "shift_id">,
): string[] {
  const erros: string[] = [];

  const semMotivo = registros.filter(
    (r) => EXIGE_MOTIVO.includes(r.attendance_status) && !r.absence_reason_id,
  );
  if (semMotivo.length)
    erros.push(
      `${semMotivo.length} ocorrência(s) sem motivo obrigatório: ${semMotivo
        .slice(0, 3)
        .map((r) => r.employee_re)
        .join(", ")}${semMotivo.length > 3 ? "…" : ""}`,
    );

  const vistos = new Set<string>();
  const dup = new Set<string>();
  for (const r of registros) {
    if (vistos.has(r.employee_re)) dup.add(r.employee_re);
    vistos.add(r.employee_re);
  }
  if (dup.size) erros.push(`RE duplicado na chamada: ${[...dup].join(", ")}`);

  const inconsistentes = registros.filter(
    (r) =>
      r.attendance_status !== "APOIO_OUTRA_AREA" &&
      r.attendance_status !== "NAO_PREVISTO" &&
      ((r.effective_area_id && r.effective_area_id !== dia.area_id) ||
        (dia.shift_id && r.effective_shift_id && r.effective_shift_id !== dia.shift_id)),
  );
  if (inconsistentes.length)
    erros.push(
      `${inconsistentes.length} registro(s) com área ou turno divergente do cabeçalho da chamada`,
    );

  const divergencias = registros.filter(
    (r) =>
      (r.attendance_status === "ATRASO" && !r.arrival_time) ||
      (r.attendance_status === "SAIDA_ANTECIPADA" && !r.departure_time) ||
      (r.attendance_status === "ATESTADO" &&
        r.document_presented &&
        r.document_validation_status === "PENDENTE" &&
        !r.notes),
  );
  if (divergencias.length)
    erros.push(
      `${divergencias.length} divergência(s) não tratada(s): informe horário de chegada/saída ou observação`,
    );

  return erros;
}
