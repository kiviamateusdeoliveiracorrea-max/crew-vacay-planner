import type {
  Area,
  CoverageRule,
  Employee,
  Funcao,
  Movement,
  Severidade,
  Turno,
  Vacation,
} from "@/lib/sistema";
import { diasEntre, fmtData, humaniza, sobrepoe } from "@/lib/sistema";
import { lotacaoVigente } from "@/lib/movimentacao";

export type Alerta = {
  severidade: Severidade;
  regra: string;
  mensagem: string;
  acao: string;
  dias: number | null;
  overlap: { inicio: string; fim: string } | null;
  envolvidos: {
    nome: string;
    re: string | null;
    funcao: string | null;
    area: string | null;
    turno: string | null;
    inicio: string;
    fim: string;
  }[];
};

export type PeriodoFerias = Pick<Vacation, "employee_id" | "inicio" | "fim" | "status"> & {
  id?: string | null;
  substituto_employee_id?: string | null;
  substituto_nome?: string | null;
  area_id_snapshot?: string | null;
  shift_id_snapshot?: string | null;
};

export type BaseMotor = {
  employees: Employee[];
  funcoes: Funcao[];
  areas: Area[];
  turnos: Turno[];
  movimentacoes: Movement[];
  regras: CoverageRule[];
  ferias: PeriodoFerias[];
};

const nome = <T extends { id: string; nome: string }>(lista: T[], id: string | null) =>
  (id ? (lista.find((x) => x.id === id)?.nome ?? null) : null);

/** Área e turno vigentes na data, considerando movimentações definitivas e temporárias. */
export function lotacaoNaData(base: BaseMotor, employee: Employee, data: string) {
  return lotacaoVigente(base.movimentacoes, employee, data);
}

function regraCobertura(
  base: BaseMotor,
  areaId: string | null,
  functionId: string | null,
  shiftId: string | null,
) {
  const candidatas = base.regras.filter(
    (r) =>
      (r.area_id === areaId || r.area_id === null) &&
      (r.function_id === functionId || r.function_id === null) &&
      (r.shift_id === shiftId || r.shift_id === null),
  );
  return (
    candidatas
      .slice()
      .sort(
        (a, b) =>
          Number(!!b.area_id) + Number(!!b.function_id) + Number(!!b.shift_id) -
          (Number(!!a.area_id) + Number(!!a.function_id) + Number(!!a.shift_id)),
      )[0] ?? null
  );
}

function coberturaPermitida(
  base: BaseMotor,
  areaId: string | null,
  functionId: string | null,
  outraAreaId: string | null,
) {
  return base.regras.some(
    (r) =>
      r.area_id === areaId &&
      (r.function_id === functionId || r.function_id === null) &&
      r.cobertura_area_id === outraAreaId,
  );
}

/**
 * Motor de conflitos: área e turno vigentes na data das férias, capacidade mínima,
 * substitutos e movimentações. Espelha as regras aplicadas no banco.
 */
export function avaliarFerias(base: BaseMotor, alvo: PeriodoFerias): Alerta[] {
  const alertas: Alerta[] = [];
  if (!alvo.employee_id || !alvo.inicio || !alvo.fim) return alertas;
  if (alvo.status === "CANCELADA") return alertas;

  const emp = base.employees.find((e) => e.id === alvo.employee_id);
  if (!emp) return alertas;

  const lot = lotacaoNaData(base, emp, alvo.inicio);
  const funcao = base.funcoes.find((f) => f.id === emp.function_id) ?? null;
  const chave = !!funcao?.funcao_chave;
  const areaNome = nome(base.areas, lot.areaId);
  const turnoNome = nome(base.turnos, lot.shiftId);

  const ficha = (
    e: Employee,
    areaId: string | null,
    shiftId: string | null,
    inicio: string,
    fim: string,
  ) => ({
    nome: e.nome,
    re: e.re,
    funcao: nome(base.funcoes, e.function_id),
    area: nome(base.areas, areaId),
    turno: nome(base.turnos, shiftId),
    inicio,
    fim,
  });

  const outras = base.ferias.filter(
    (v) =>
      v.status !== "CANCELADA" &&
      (alvo.id ? v.id !== alvo.id : true) &&
      sobrepoe(v, { inicio: alvo.inicio, fim: alvo.fim }),
  );

  // 1) Mesma pessoa com períodos sobrepostos
  for (const v of outras.filter((v) => v.employee_id === emp.id)) {
    alertas.push({
      severidade: "BLOQUEIO",
      regra: "FERIAS_SOBREPOSTAS_MESMO_COLABORADOR",
      mensagem: `${emp.nome} já possui férias de ${fmtData(v.inicio)} a ${fmtData(v.fim)} sobrepostas a este período.`,
      acao: "Ajuste as datas ou edite o período já existente.",
      dias: diasEntre(maior(alvo.inicio, v.inicio), menor(alvo.fim, v.fim)),
      overlap: { inicio: maior(alvo.inicio, v.inicio), fim: menor(alvo.fim, v.fim) },
      envolvidos: [ficha(emp, lot.areaId, lot.shiftId, alvo.inicio, alvo.fim)],
    });
  }

  // 2) Mesma função, com área e turno vigentes na data de cada período
  for (const v of outras) {
    if (v.employee_id === emp.id) continue;
    const outro = base.employees.find((e) => e.id === v.employee_id);
    if (!outro || outro.status === "DESLIGADO") continue;
    if (!outro.function_id || outro.function_id !== emp.function_id) continue;

    const lotOutro = lotacaoNaData(base, outro, v.inicio);
    const ini = maior(alvo.inicio, v.inicio);
    const fim = menor(alvo.fim, v.fim);
    const dias = diasEntre(ini, fim);

    let severidade: Severidade;
    let regra: string;
    let acao: string;
    if (lotOutro.areaId === lot.areaId && lotOutro.shiftId === lot.shiftId) {
      severidade = chave ? "BLOQUEIO" : "CRITICO";
      regra = "MESMA_FUNCAO_MESMA_AREA_MESMO_TURNO";
      acao = "Reprogramar um dos períodos ou designar substituto qualificado.";
    } else if (lotOutro.areaId === lot.areaId) {
      severidade = chave ? "CRITICO" : "ATENCAO";
      regra = "MESMA_FUNCAO_MESMA_AREA_TURNOS_DIFERENTES";
      acao = "Avaliar cobertura entre turnos da mesma área.";
    } else if (coberturaPermitida(base, lot.areaId, emp.function_id, lotOutro.areaId)) {
      severidade = "INFORMATIVO";
      regra = "MESMA_FUNCAO_OUTRA_AREA_COM_COBERTURA_PERMITIDA";
      acao = "Cobertura entre as áreas está autorizada; apenas monitorar.";
    } else {
      severidade = chave ? "CRITICO" : "ATENCAO";
      regra = "MESMA_FUNCAO_OUTRA_AREA";
      acao = "Confirmar se a outra área consegue apoiar no período.";
    }

    alertas.push({
      severidade,
      regra,
      mensagem: `${emp.nome} (RE ${emp.re ?? "—"}) e ${outro.nome} (RE ${outro.re ?? "—"}) — mesma função com ${dias} dia(s) de sobreposição (${fmtData(ini)} a ${fmtData(fim)}).`,
      acao,
      dias,
      overlap: { inicio: ini, fim },
      envolvidos: [
        ficha(emp, lot.areaId, lot.shiftId, alvo.inicio, alvo.fim),
        ficha(outro, lotOutro.areaId, lotOutro.shiftId, v.inicio, v.fim),
      ],
    });
  }

  // 3) Substituto
  const temSubstituto = !!alvo.substituto_employee_id || !!alvo.substituto_nome?.trim();
  if (chave && !temSubstituto) {
    alertas.push({
      severidade: "CRITICO",
      regra: "FUNCAO_CHAVE_SEM_SUBSTITUTO",
      mensagem: `${emp.nome} (RE ${emp.re ?? "—"}) exerce função-chave (${funcao?.nome ?? "—"}) e está sem substituto indicado.`,
      acao: "Indicar substituto qualificado antes de aprovar.",
      dias: diasEntre(alvo.inicio, alvo.fim),
      overlap: { inicio: alvo.inicio, fim: alvo.fim },
      envolvidos: [ficha(emp, lot.areaId, lot.shiftId, alvo.inicio, alvo.fim)],
    });
  }

  if (alvo.substituto_employee_id) {
    const sub = base.employees.find((e) => e.id === alvo.substituto_employee_id) ?? null;
    for (const v of outras.filter((v) => v.employee_id === alvo.substituto_employee_id)) {
      const ini = maior(alvo.inicio, v.inicio);
      const fim = menor(alvo.fim, v.fim);
      alertas.push({
        severidade: "BLOQUEIO",
        regra: "SUBSTITUTO_INDISPONIVEL",
        mensagem: `O substituto ${sub?.nome ?? "indicado"} (RE ${sub?.re ?? "—"}) também está de férias de ${fmtData(v.inicio)} a ${fmtData(v.fim)}.`,
        acao: "Escolher outro substituto disponível.",
        dias: diasEntre(ini, fim),
        overlap: { inicio: ini, fim },
        envolvidos: sub ? [ficha(sub, sub.area_id, sub.shift_id, v.inicio, v.fim)] : [],
      });
    }
    if (sub && sub.status !== "ATIVO") {
      alertas.push({
        severidade: "CRITICO",
        regra: "SUBSTITUTO_INDISPONIVEL",
        mensagem: `O substituto ${sub.nome} está com status ${humaniza(sub.status)}.`,
        acao: "Escolher um substituto ativo.",
        dias: null,
        overlap: null,
        envolvidos: [ficha(sub, sub.area_id, sub.shift_id, alvo.inicio, alvo.fim)],
      });
    }
  }

  // 4) Movimentações aprovadas durante as férias
  for (const m of base.movimentacoes) {
    if (m.employee_id !== emp.id || m.status !== "APROVADA") continue;
    const fimMov = m.data_fim ?? m.data_efetiva;
    if (!sobrepoe({ inicio: m.data_efetiva, fim: fimMov }, { inicio: alvo.inicio, fim: alvo.fim }))
      continue;
    if (m.data_efetiva <= alvo.inicio) continue;
    alertas.push({
      severidade: "CRITICO",
      regra: "MOVIMENTACAO_DURANTE_FERIAS",
      mensagem: `Movimentação ${humaniza(m.tipo)} com data efetiva em ${fmtData(m.data_efetiva)} ocorre durante as férias de ${emp.nome}.`,
      acao: "Ajustar a data da movimentação ou o período de férias.",
      dias: null,
      overlap: { inicio: m.data_efetiva, fim: menor(fimMov, alvo.fim) },
      envolvidos: [ficha(emp, lot.areaId, lot.shiftId, alvo.inicio, alvo.fim)],
    });
  }

  // 5) Capacidade mínima da função/área/turno vigentes
  const regra = regraCobertura(base, lot.areaId, emp.function_id, lot.shiftId);
  if (regra) {
    const ativos = base.employees.filter((e) => {
      if (e.status !== "ATIVO" || e.function_id !== emp.function_id) return false;
      const l = lotacaoNaData(base, e, alvo.inicio);
      return l.areaId === lot.areaId && l.shiftId === lot.shiftId;
    });
    const idsAtivos = new Set(ativos.map((e) => e.id));
    const ausentes = new Set(
      base.ferias
        .filter(
          (v) =>
            v.status !== "CANCELADA" &&
            idsAtivos.has(v.employee_id) &&
            sobrepoe(v, { inicio: alvo.inicio, fim: alvo.fim }),
        )
        .map((v) => v.employee_id),
    );
    ausentes.add(emp.id);
    const restantes = Math.max(ativos.length - ausentes.size, 0);
    if (restantes < regra.min_presentes) {
      alertas.push({
        severidade: "BLOQUEIO",
        regra: "COBERTURA_MINIMA_NAO_ATENDIDA",
        mensagem: `Cobertura mínima não atendida em ${areaNome ?? "área"} / ${turnoNome ?? "turno"}: restariam ${restantes} de ${regra.min_presentes} exigidos na função ${funcao?.nome ?? "—"}.`,
        acao: "Reduzir o número de férias simultâneas ou trazer cobertura de outra área.",
        dias: diasEntre(alvo.inicio, alvo.fim),
        overlap: { inicio: alvo.inicio, fim: alvo.fim },
        envolvidos: [ficha(emp, lot.areaId, lot.shiftId, alvo.inicio, alvo.fim)],
      });
    }
    if (ausentes.size > regra.max_ferias_simultaneas) {
      alertas.push({
        severidade: "CRITICO",
        regra: "MAXIMO_FERIAS_SIMULTANEAS",
        mensagem: `${ausentes.size} colaboradores da função ${funcao?.nome ?? "—"} ficariam de férias ao mesmo tempo (limite ${regra.max_ferias_simultaneas}).`,
        acao: "Escalonar os períodos de férias da função.",
        dias: diasEntre(alvo.inicio, alvo.fim),
        overlap: { inicio: alvo.inicio, fim: alvo.fim },
        envolvidos: [ficha(emp, lot.areaId, lot.shiftId, alvo.inicio, alvo.fim)],
      });
    }
  }

  return alertas;
}

const maior = (a: string, b: string) => (a > b ? a : b);
const menor = (a: string, b: string) => (a < b ? a : b);
