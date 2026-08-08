import type { Employee, Movement, TipoMovimentacao } from "@/lib/sistema";
import { sobrepoe } from "@/lib/sistema";

/** Tipos que sempre alteram a lotação de forma permanente. */
export const TIPOS_DEFINITIVOS: TipoMovimentacao[] = [
  "TRANSFERENCIA_DEFINITIVA",
  "RETORNO_A_ORIGEM",
];

/** Tipos que valem apenas dentro da janela data_efetiva..data_fim. */
export const TIPOS_TEMPORARIOS: TipoMovimentacao[] = [
  "EMPRESTIMO_TEMPORARIO",
  "COBERTURA_DE_FERIAS",
];

export const ehDefinitivo = (t: TipoMovimentacao) => TIPOS_DEFINITIVOS.includes(t);
export const ehTemporario = (t: TipoMovimentacao) => TIPOS_TEMPORARIOS.includes(t);

export type Lotacao = { areaId: string | null; shiftId: string | null; temporaria: boolean };

type Mov = Pick<
  Movement,
  | "employee_id"
  | "status"
  | "temporaria"
  | "area_destino_id"
  | "shift_destino_id"
  | "data_efetiva"
  | "data_fim"
>;

const aprovadas = (movs: Mov[], employeeId: string) =>
  movs.filter((m) => m.employee_id === employeeId && m.status === "APROVADA");

const maisRecente = <T extends { data_efetiva: string }>(lista: T[]) =>
  lista.slice().sort((a, b) => b.data_efetiva.localeCompare(a.data_efetiva))[0] ?? null;

/** Lotação permanente numa data — ignora empréstimos e coberturas. */
export function lotacaoDefinitiva(
  movs: Mov[],
  employee: Pick<Employee, "id" | "area_id" | "shift_id">,
  data: string,
): Lotacao {
  const base = aprovadas(movs, employee.id).filter((m) => !m.temporaria && m.data_efetiva <= data);
  const area = maisRecente(base.filter((m) => m.area_destino_id));
  const turno = maisRecente(base.filter((m) => m.shift_destino_id));
  return {
    areaId: area?.area_destino_id ?? employee.area_id,
    shiftId: turno?.shift_destino_id ?? employee.shift_id,
    temporaria: false,
  };
}

/** Lotação vigente numa data — temporária tem precedência dentro da janela. */
export function lotacaoVigente(
  movs: Mov[],
  employee: Pick<Employee, "id" | "area_id" | "shift_id">,
  data: string,
): Lotacao {
  const temp = maisRecente(
    aprovadas(movs, employee.id).filter(
      (m) => m.temporaria && m.data_efetiva <= data && (m.data_fim ?? data) >= data,
    ),
  );
  if (temp) {
    const fixa = lotacaoDefinitiva(movs, employee, data);
    return {
      areaId: temp.area_destino_id ?? fixa.areaId,
      shiftId: temp.shift_destino_id ?? fixa.shiftId,
      temporaria: true,
    };
  }
  return lotacaoDefinitiva(movs, employee, data);
}

/** Empréstimo/cobertura aprovado que ainda cobre a data informada. */
export function temporariaAberta(movs: Mov[], employeeId: string, data: string) {
  return (
    aprovadas(movs, employeeId).find(
      (m) => m.temporaria && m.data_efetiva <= data && (m.data_fim ?? "9999-12-31") >= data,
    ) ?? null
  );
}

export function temporariaSobreposta(
  movs: (Mov & { id: string })[],
  employeeId: string,
  periodo: { inicio: string; fim: string },
  ignorarId?: string | undefined,
) {
  return (
    movs.find(
      (m) =>
        m.employee_id === employeeId &&
        m.status === "APROVADA" &&
        m.temporaria &&
        m.id !== ignorarId &&
        sobrepoe({ inicio: m.data_efetiva, fim: m.data_fim ?? m.data_efetiva }, periodo),
    ) ?? null
  );
}

export type FormMovimentacao = {
  tipo: TipoMovimentacao;
  areaDestinoId: string | null;
  dataEfetiva: string;
  temporaria: boolean;
  dataFim: string | null;
};

/** Mesmas regras aplicadas pelo banco, para feedback imediato no formulário. */
export function validaMovimentacao(form: FormMovimentacao): string[] {
  const erros: string[] = [];
  if (!form.dataEfetiva) erros.push("Informe a data efetiva.");
  if (!form.areaDestinoId) erros.push("Informe o setor de destino.");
  if (ehDefinitivo(form.tipo) && form.temporaria) {
    erros.push("Transferência definitiva e retorno à origem não podem ser temporários.");
  }
  if (ehTemporario(form.tipo) && !form.temporaria) {
    erros.push("Empréstimo temporário e cobertura de férias são sempre temporários.");
  }
  if (form.temporaria && !form.dataFim) erros.push("Movimentação temporária exige data final.");
  if (form.dataFim && form.dataEfetiva && form.dataFim < form.dataEfetiva) {
    erros.push("A data final não pode ser anterior à data efetiva.");
  }
  return erros;
}

/** Normaliza o formulário conforme o tipo (espelha o gatilho do banco). */
export function normalizaPorTipo<T extends FormMovimentacao>(form: T): T {
  if (ehDefinitivo(form.tipo)) return { ...form, temporaria: false, dataFim: null };
  if (ehTemporario(form.tipo)) return { ...form, temporaria: true };
  return form;
}
