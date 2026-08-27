/**
 * Função centralizada que determina a situação real de uma programação de férias.
 *
 * Convenção de datas no banco:
 * - `inicio` = primeiro dia de afastamento;
 * - `fim`    = último dia de afastamento;
 * - retorno  = `fim` + 1 dia (primeiro dia de trabalho).
 *
 * Uma pessoa está de férias quando `inicio <= data` e `retorno > data`.
 * Uma programação está concluída quando `retorno <= hoje`.
 *
 * A situação é sempre calculada pelas datas — o status gravado só é usado
 * para reconhecer registros cancelados.
 */

export type SituacaoFerias =
  | "CANCELADA"
  | "ERRO_DE_DATA"
  | "PENDENTE_DE_VALIDACAO"
  | "PROGRAMADA"
  | "EM_GOZO"
  | "CONCLUIDA";

export const SITUACAO_LABEL: Record<SituacaoFerias, string> = {
  CANCELADA: "Cancelada",
  ERRO_DE_DATA: "Erro de data",
  PENDENTE_DE_VALIDACAO: "Pendente de validação",
  PROGRAMADA: "Futura",
  EM_GOZO: "Em gozo",
  CONCLUIDA: "Concluída",
};

export type PeriodoBase = {
  inicio?: string | null;
  fim?: string | null;
  status?: string | null;
};

/** Data de hoje (fuso local do usuário) no formato ISO `AAAA-MM-DD`. */
export function hojeISO(base: Date = new Date()) {
  const ano = base.getFullYear();
  const mes = String(base.getMonth() + 1).padStart(2, "0");
  const dia = String(base.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

const soData = (v: string | null | undefined) => (v ? v.slice(0, 10) : null);

/** Primeiro dia de retorno ao trabalho (`fim` + 1 dia). */
export function dataRetorno(periodo: PeriodoBase): string | null {
  const fim = soData(periodo.fim);
  if (!fim) return null;
  const d = new Date(`${fim}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function situacaoFerias(
  periodo: PeriodoBase,
  hoje: string = hojeISO(),
): SituacaoFerias {
  if (periodo.status === "CANCELADA") return "CANCELADA";

  const inicio = soData(periodo.inicio);
  const fim = soData(periodo.fim);
  if (!inicio || !fim) return "PENDENTE_DE_VALIDACAO";
  if (Number.isNaN(new Date(`${inicio}T00:00:00Z`).getTime())) return "PENDENTE_DE_VALIDACAO";
  if (Number.isNaN(new Date(`${fim}T00:00:00Z`).getTime())) return "PENDENTE_DE_VALIDACAO";
  if (fim < inicio) return "ERRO_DE_DATA";

  const retorno = dataRetorno(periodo)!;
  if (inicio > hoje) return "PROGRAMADA";
  if (retorno > hoje) return "EM_GOZO";
  return "CONCLUIDA";
}

/** Programações que ainda impactam a operação (futuras ou em gozo). */
export function feriasAtiva(periodo: PeriodoBase, hoje: string = hojeISO()) {
  const s = situacaoFerias(periodo, hoje);
  return s === "PROGRAMADA" || s === "EM_GOZO";
}

export function feriasConcluida(periodo: PeriodoBase, hoje: string = hojeISO()) {
  return situacaoFerias(periodo, hoje) === "CONCLUIDA";
}

/** A pessoa está de férias na data informada (`inicio <= data < retorno`). */
export function emFeriasEm(periodo: PeriodoBase, data: string) {
  if (periodo.status === "CANCELADA") return false;
  const inicio = soData(periodo.inicio);
  const fim = soData(periodo.fim);
  if (!inicio || !fim || fim < inicio) return false;
  const retorno = dataRetorno(periodo)!;
  return inicio <= data && retorno > data;
}

/** Concluída dentro do ano informado (para o indicador "Férias concluídas no ano"). */
export function concluidaNoAno(
  periodo: PeriodoBase,
  ano: string,
  hoje: string = hojeISO(),
) {
  if (situacaoFerias(periodo, hoje) !== "CONCLUIDA") return false;
  const retorno = dataRetorno(periodo);
  return !!retorno && retorno.slice(0, 4) === ano;
}
