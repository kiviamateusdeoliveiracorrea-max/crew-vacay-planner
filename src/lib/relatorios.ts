/**
 * Regras puras dos relatórios e exportações.
 * Nada aqui grava no banco: apenas seleciona, filtra e formata o que o usuário já pode ver.
 */
import { SEVERIDADE_PESO, fmtData, fmtDataHora, humaniza, type Severidade } from "@/lib/sistema";
import { lotacaoVigente } from "@/lib/movimentacao";

export type RelatorioId =
  | "COLABORADORES"
  | "FERIAS"
  | "FERIAS_A_VENCER"
  | "MOVIMENTACOES"
  | "IMPORTACOES"
  | "AUDITORIA"
  | "CHAMADA"
  | "COMPLETO";

export type Filtros = {
  inicio: string;
  fim: string;
  unidade: string;
  area: string;
  turno: string;
  lider: string;
  funcao: string;
  colaborador: string;
  status: string;
  criticidade: string;
};

export const FILTROS_VAZIOS: Filtros = {
  inicio: "",
  fim: "",
  unidade: "",
  area: "",
  turno: "",
  lider: "",
  funcao: "",
  colaborador: "",
  status: "",
  criticidade: "",
};

export const RELATORIOS: {
  id: RelatorioId;
  nome: string;
  descricao: string;
  somenteAdmin?: boolean;
}[] = [
  { id: "COLABORADORES", nome: "Colaboradores", descricao: "Cadastro operacional vigente" },
  { id: "FERIAS", nome: "Férias", descricao: "Programações, criticidade e aprovação" },
  { id: "FERIAS_A_VENCER", nome: "Férias a vencer", descricao: "Períodos e prazos legais" },
  { id: "MOVIMENTACOES", nome: "Movimentações", descricao: "Transferências e empréstimos" },
  { id: "IMPORTACOES", nome: "Importações", descricao: "Lotes processados" },
  {
    id: "AUDITORIA",
    nome: "Auditoria",
    descricao: "Trilha completa de alterações",
    somenteAdmin: true,
  },
  { id: "CHAMADA", nome: "Chamada diária", descricao: "Presença operacional por dia" },
  { id: "COMPLETO", nome: "Relatório completo", descricao: "Excel com várias abas" },
];

export type Tabela = { nome: string; colunas: string[]; linhas: (string | number)[][] };

/* ---------------------------------------------------------------- utilidades */

export const vazio = "—";
const txt = (v: unknown) => (v === null || v === undefined || v === "" ? vazio : String(v));
const sim = (v: boolean) => (v ? "Sim" : "Não");

/** Soma dias a uma data ISO sem depender do fuso local. */
export function somaDias(iso: string, dias: number): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export const dentroDoPeriodo = (data: string | null | undefined, f: Filtros) => {
  if (!data) return !f.inicio && !f.fim;
  const d = data.slice(0, 10);
  if (f.inicio && d < f.inicio) return false;
  if (f.fim && d > f.fim) return false;
  return true;
};

export const periodoSobrepoe = (inicio: string, fim: string, f: Filtros) => {
  if (f.inicio && fim.slice(0, 10) < f.inicio) return false;
  if (f.fim && inicio.slice(0, 10) > f.fim) return false;
  return true;
};

const contem = (valor: string | null | undefined, busca: string) =>
  !busca || (valor ?? "").toLowerCase().includes(busca.trim().toLowerCase());

/* ------------------------------------------------------------------ contexto */

export type Ctx = {
  areas: Map<string, { nome: string; unit_id: string | null }>;
  turnos: Map<string, string>;
  funcoes: Map<string, { nome: string; chave: boolean }>;
  unidades: Map<string, string>;
  usuarios: Map<string, string>;
  movimentos: Parameters<typeof lotacaoVigente>[0];
  hoje: string;
  /** null = sem restrição de área (ADMIN/ANALISTA). */
  areasPermitidas: string[] | null;
};

export const areaNome = (ctx: Ctx, id: string | null | undefined) =>
  (id && ctx.areas.get(id)?.nome) || vazio;
export const turnoNome = (ctx: Ctx, id: string | null | undefined) =>
  (id && ctx.turnos.get(id)) || vazio;
export const funcaoNome = (ctx: Ctx, id: string | null | undefined) =>
  (id && ctx.funcoes.get(id)?.nome) || vazio;
export const usuarioNome = (ctx: Ctx, id: string | null | undefined) =>
  (id && ctx.usuarios.get(id)) || (id ? "usuário do sistema" : vazio);

/** Barreira de visibilidade no cliente — espelho das políticas RLS do banco. */
export function podeVerArea(ctx: Ctx, areaId: string | null | undefined): boolean {
  if (ctx.areasPermitidas === null) return true;
  return !!areaId && ctx.areasPermitidas.includes(areaId);
}

const unidadeDaArea = (ctx: Ctx, areaId: string | null | undefined) =>
  (areaId && ctx.areas.get(areaId)?.unit_id) || null;

/* -------------------------------------------------------------- colaboradores */

export type EmpLike = {
  id: string;
  re: string;
  nome: string;
  area_id: string | null;
  shift_id: string | null;
  function_id: string | null;
  lider: string | null;
  status: string;
  data_admissao: string | null;
  updated_at: string;
};

/** Área/turno vigentes na data (considera movimentações aprovadas). */
export function vigente(ctx: Ctx, e: EmpLike) {
  const l = lotacaoVigente(ctx.movimentos, e, ctx.hoje);
  return { areaId: l.areaId, shiftId: l.shiftId };
}

export function filtraColaborador(ctx: Ctx, e: EmpLike, f: Filtros): boolean {
  const v = vigente(ctx, e);
  if (!podeVerArea(ctx, v.areaId) && !podeVerArea(ctx, e.area_id)) return false;
  if (f.unidade && unidadeDaArea(ctx, v.areaId) !== f.unidade) return false;
  if (f.area && v.areaId !== f.area && e.area_id !== f.area) return false;
  if (f.turno && v.shiftId !== f.turno && e.shift_id !== f.turno) return false;
  if (f.funcao && e.function_id !== f.funcao) return false;
  if (f.lider && !contem(e.lider, f.lider)) return false;
  if (f.colaborador && !contem(e.nome, f.colaborador) && !contem(e.re, f.colaborador)) return false;
  if (f.status && e.status !== f.status) return false;
  return true;
}

export const COLUNAS_COLABORADORES = [
  "RE",
  "Nome",
  "WWID",
  "Cargo real",
  "Cargo padronizado",
  "Função",
  "Área real",
  "Área planejada",
  "Turno real",
  "Turno planejado",
  "Líder",
  "Status",
  "Função-chave",
  "Data de admissão",
  "Última atualização",
];

export function tabelaColaboradores(ctx: Ctx, emps: EmpLike[], f: Filtros): Tabela {
  const linhas = emps
    .filter((e) => filtraColaborador(ctx, e, f))
    .map((e) => {
      const v = vigente(ctx, e);
      const fn = e.function_id ? ctx.funcoes.get(e.function_id) : undefined;
      return [
        e.re,
        e.nome,
        vazio, // WWID ainda não existe no cadastro
        fn?.nome ?? vazio, // cargo real = função registrada
        fn?.nome ?? vazio, // cargo padronizado = catálogo de funções
        fn?.nome ?? vazio,
        areaNome(ctx, v.areaId),
        areaNome(ctx, e.area_id),
        turnoNome(ctx, v.shiftId),
        turnoNome(ctx, e.shift_id),
        txt(e.lider),
        humaniza(e.status),
        sim(!!fn?.chave),
        fmtData(e.data_admissao),
        fmtDataHora(e.updated_at),
      ];
    });
  return { nome: "Colaboradores", colunas: COLUNAS_COLABORADORES, linhas };
}

/* --------------------------------------------------------------------- férias */

export type FeriasLike = {
  employee_id: string;
  inicio: string;
  fim: string;
  status: string;
  substituto_nome: string | null;
  substituto_employee_id: string | null;
  observacao: string | null;
  area_id_snapshot: string | null;
  shift_id_snapshot: string | null;
  function_id_snapshot: string | null;
  aprovado_por: string | null;
  aprovado_em: string | null;
  employee: EmpLike | null;
  conflitos: { severidade: Severidade; mensagem: string }[];
};

export function criticidadeFerias(v: FeriasLike): { nivel: string; motivo: string } {
  if (!v.conflitos.length) return { nivel: "SEM ALERTA", motivo: vazio };
  const pior = v.conflitos.reduce((a, b) =>
    SEVERIDADE_PESO[b.severidade] > SEVERIDADE_PESO[a.severidade] ? b : a,
  );
  return {
    nivel: pior.severidade,
    motivo: v.conflitos.map((c) => c.mensagem).join(" | "),
  };
}

export const COLUNAS_FERIAS = [
  "RE",
  "Colaborador",
  "Área considerada",
  "Turno considerado",
  "Função",
  "Função-chave",
  "Data de início",
  "Data de retorno",
  "Dias",
  "Status",
  "Substituto",
  "Criticidade",
  "Motivo do alerta",
  "Aprovador",
  "Data da aprovação",
  "Observação",
];

export const diasDeFerias = (inicio: string, fim: string) =>
  Math.max(
    0,
    Math.round(
      (new Date(`${fim}T12:00:00Z`).getTime() - new Date(`${inicio}T12:00:00Z`).getTime()) /
        86400000,
    ) + 1,
  );

export function tabelaFerias(ctx: Ctx, ferias: FeriasLike[], f: Filtros): Tabela {
  const linhas = ferias
    .filter((v) => {
      const e = v.employee;
      const area = v.area_id_snapshot ?? e?.area_id ?? null;
      if (!podeVerArea(ctx, area)) return false;
      if (!periodoSobrepoe(v.inicio, v.fim, f)) return false;
      if (f.unidade && unidadeDaArea(ctx, area) !== f.unidade) return false;
      if (f.area && area !== f.area) return false;
      if (f.turno && (v.shift_id_snapshot ?? e?.shift_id) !== f.turno) return false;
      if (f.funcao && (v.function_id_snapshot ?? e?.function_id) !== f.funcao) return false;
      if (f.lider && !contem(e?.lider ?? "", f.lider)) return false;
      if (f.colaborador && !contem(e?.nome, f.colaborador) && !contem(e?.re, f.colaborador))
        return false;
      if (f.status && v.status !== f.status) return false;
      if (f.criticidade && criticidadeFerias(v).nivel !== f.criticidade) return false;
      return true;
    })
    .map((v) => {
      const e = v.employee;
      const fnId = v.function_id_snapshot ?? e?.function_id ?? null;
      const fn = fnId ? ctx.funcoes.get(fnId) : undefined;
      const c = criticidadeFerias(v);
      return [
        txt(e?.re),
        txt(e?.nome),
        areaNome(ctx, v.area_id_snapshot ?? e?.area_id),
        turnoNome(ctx, v.shift_id_snapshot ?? e?.shift_id),
        fn?.nome ?? vazio,
        sim(!!fn?.chave),
        fmtData(v.inicio),
        fmtData(somaDias(v.fim, 1)),
        diasDeFerias(v.inicio, v.fim),
        humaniza(v.status),
        txt(v.substituto_nome),
        c.nivel,
        c.motivo,
        usuarioNome(ctx, v.aprovado_por),
        fmtDataHora(v.aprovado_em),
        txt(v.observacao),
      ];
    });
  return { nome: "Férias", colunas: COLUNAS_FERIAS, linhas };
}

/* ------------------------------------------------------------ férias a vencer */

export type PeriodoAquisitivo = {
  aquisitivoInicio: string;
  aquisitivoFim: string;
  concessivoInicio: string;
  concessivoFim: string;
  limiteSaida: string;
  saldo: number;
  programados: number;
  restantes: number;
  status: string;
  critPrazo: string;
  critOperacional: string;
  critLideranca: string;
  consolidada: string;
};

const NIVEL = { BAIXA: 1, MEDIA: 2, ALTA: 3, CRITICA: 4 } as const;
const maiorCrit = (...n: string[]) =>
  n.reduce((a, b) => ((NIVEL[b as keyof typeof NIVEL] ?? 0) > (NIVEL[a as keyof typeof NIVEL] ?? 0) ? b : a));

/**
 * Período aquisitivo/concessivo a partir da admissão (CLT: 12 meses aquisitivos,
 * 12 meses concessivos, saída até 30 dias antes do fim do concessivo).
 */
export function periodoAquisitivo(
  admissao: string,
  hoje: string,
  diasProgramados: number,
  funcaoChave: boolean,
  ehLideranca: boolean,
): PeriodoAquisitivo {
  const adm = new Date(`${admissao.slice(0, 10)}T12:00:00Z`);
  const anos = Math.max(
    1,
    Math.floor(
      (new Date(`${hoje}T12:00:00Z`).getTime() - adm.getTime()) / (365.2425 * 86400000),
    ),
  );
  const ini = new Date(adm);
  ini.setUTCFullYear(adm.getUTCFullYear() + anos - 1);
  const aquisitivoInicio = ini.toISOString().slice(0, 10);
  const aquisitivoFim = somaDias(
    new Date(Date.UTC(ini.getUTCFullYear() + 1, ini.getUTCMonth(), ini.getUTCDate(), 12))
      .toISOString()
      .slice(0, 10),
    -1,
  );
  const concessivoInicio = somaDias(aquisitivoFim, 1);
  const cf = new Date(`${concessivoInicio}T12:00:00Z`);
  cf.setUTCFullYear(cf.getUTCFullYear() + 1);
  const concessivoFim = somaDias(cf.toISOString().slice(0, 10), -1);
  const limiteSaida = somaDias(concessivoFim, -30);

  const saldo = 30;
  const restantes = Math.max(0, saldo - diasProgramados);
  const diasAteLimite = Math.round(
    (new Date(`${limiteSaida}T12:00:00Z`).getTime() - new Date(`${hoje}T12:00:00Z`).getTime()) /
      86400000,
  );

  const critPrazo =
    diasAteLimite < 0 ? "CRITICA" : diasAteLimite <= 60 ? "ALTA" : diasAteLimite <= 120 ? "MEDIA" : "BAIXA";
  const critOperacional = funcaoChave ? "ALTA" : "BAIXA";
  const critLideranca = ehLideranca ? "ALTA" : "BAIXA";
  const status =
    diasAteLimite < 0
      ? "VENCIDO"
      : restantes === 0
        ? "PROGRAMADO"
        : diasAteLimite <= 60
          ? "A VENCER"
          : "EM DIA";

  return {
    aquisitivoInicio,
    aquisitivoFim,
    concessivoInicio,
    concessivoFim,
    limiteSaida,
    saldo,
    programados: diasProgramados,
    restantes,
    status,
    critPrazo,
    critOperacional,
    critLideranca,
    consolidada: maiorCrit(critPrazo, critOperacional, critLideranca),
  };
}

export const COLUNAS_A_VENCER = [
  "RE",
  "Colaborador",
  "Cargo",
  "Nível hierárquico",
  "Área de responsabilidade",
  "Início do período aquisitivo",
  "Término do período aquisitivo",
  "Início do período concessivo",
  "Término do período concessivo",
  "Limite para saída",
  "Saldo de dias",
  "Dias programados",
  "Dias restantes",
  "Status automático",
  "Criticidade de prazo",
  "Criticidade operacional",
  "Criticidade da liderança",
  "Criticidade consolidada",
  "Substituto",
  "Plano de cobertura",
  "Responsável pela tratativa",
];

export function tabelaAVencer(
  ctx: Ctx,
  emps: EmpLike[],
  ferias: FeriasLike[],
  f: Filtros,
): Tabela {
  const linhas = emps
    .filter((e) => e.status === "ATIVO" && e.data_admissao && filtraColaborador(ctx, e, f))
    .map((e) => {
      const fn = e.function_id ? ctx.funcoes.get(e.function_id) : undefined;
      const minhas = ferias.filter(
        (v) => v.employee_id === e.id && v.status !== "CANCELADA" && v.inicio.slice(0, 4) >= ctx.hoje.slice(0, 4),
      );
      const programados = minhas.reduce((s, v) => s + diasDeFerias(v.inicio, v.fim), 0);
      const p = periodoAquisitivo(
        e.data_admissao!,
        ctx.hoje,
        programados,
        !!fn?.chave,
        !!e.lider && emps.some((o) => o.lider === e.nome),
      );
      const sub = minhas.find((v) => v.substituto_nome)?.substituto_nome ?? null;
      return {
        crit: p.consolidada,
        linha: [
          e.re,
          e.nome,
          fn?.nome ?? vazio,
          fn?.chave ? "Função-chave" : "Operacional",
          areaNome(ctx, vigente(ctx, e).areaId),
          fmtData(p.aquisitivoInicio),
          fmtData(p.aquisitivoFim),
          fmtData(p.concessivoInicio),
          fmtData(p.concessivoFim),
          fmtData(p.limiteSaida),
          p.saldo,
          p.programados,
          p.restantes,
          p.status,
          p.critPrazo,
          p.critOperacional,
          p.critLideranca,
          p.consolidada,
          txt(sub),
          sub ? "Substituição indicada" : "Sem plano registrado",
          txt(e.lider),
        ] as (string | number)[],
      };
    })
    .filter((r) => !f.criticidade || r.crit === f.criticidade)
    .map((r) => r.linha);
  return { nome: "Férias a vencer", colunas: COLUNAS_A_VENCER, linhas };
}

/* ------------------------------------------------------------- movimentações */

export type MovLike = {
  re: string;
  employee: EmpLike | null;
  tipo: string;
  area_origem_id: string | null;
  area_destino_id: string | null;
  shift_origem_id: string | null;
  shift_destino_id: string | null;
  data_efetiva: string;
  temporaria: boolean;
  data_fim: string | null;
  status: string;
  motivo: string | null;
  aprovador_id: string | null;
  observacao: string | null;
};

export const COLUNAS_MOVIMENTACOES = [
  "RE",
  "Colaborador",
  "Tipo da movimentação",
  "Área de origem",
  "Área de destino",
  "Turno de origem",
  "Turno de destino",
  "Data efetiva",
  "Temporária?",
  "Data final temporária",
  "Status",
  "Motivo",
  "Aprovador",
  "Observação",
];

export function tabelaMovimentacoes(ctx: Ctx, movs: MovLike[], f: Filtros): Tabela {
  const linhas = movs
    .filter((m) => {
      if (!podeVerArea(ctx, m.area_destino_id) && !podeVerArea(ctx, m.area_origem_id)) return false;
      if (!dentroDoPeriodo(m.data_efetiva, f)) return false;
      if (f.unidade && unidadeDaArea(ctx, m.area_destino_id) !== f.unidade) return false;
      if (f.area && m.area_destino_id !== f.area && m.area_origem_id !== f.area) return false;
      if (f.turno && m.shift_destino_id !== f.turno && m.shift_origem_id !== f.turno) return false;
      if (f.funcao && m.employee?.function_id !== f.funcao) return false;
      if (f.lider && !contem(m.employee?.lider ?? "", f.lider)) return false;
      if (f.colaborador && !contem(m.employee?.nome, f.colaborador) && !contem(m.re, f.colaborador))
        return false;
      if (f.status && m.status !== f.status) return false;
      return true;
    })
    .map((m) => [
      m.re,
      txt(m.employee?.nome),
      humaniza(m.tipo),
      areaNome(ctx, m.area_origem_id),
      areaNome(ctx, m.area_destino_id),
      turnoNome(ctx, m.shift_origem_id),
      turnoNome(ctx, m.shift_destino_id),
      fmtData(m.data_efetiva),
      sim(m.temporaria),
      fmtData(m.data_fim),
      humaniza(m.status),
      txt(m.motivo),
      usuarioNome(ctx, m.aprovador_id),
      txt(m.observacao),
    ]);
  return { nome: "Movimentações", colunas: COLUNAS_MOVIMENTACOES, linhas };
}

/* ---------------------------------------------------------------- importações */

export type LoteLike = {
  id: string;
  arquivo_nome: string;
  fonte: string;
  created_at: string;
  created_by: string | null;
  total_linhas: number;
  status: string;
  resumo: Record<string, unknown> | null;
};

export const COLUNAS_IMPORTACOES = [
  "Lote",
  "Nome do arquivo",
  "Tipo",
  "Data",
  "Usuário",
  "Total de registros",
  "Novos colaboradores",
  "Atualizações",
  "Movimentações",
  "Desligamentos",
  "Inválidos",
  "Rejeitados",
  "Status do processamento",
];

const num = (r: Record<string, unknown> | null, k: string) => Number(r?.[k] ?? 0) || 0;

export function tabelaImportacoes(ctx: Ctx, lotes: LoteLike[], f: Filtros): Tabela {
  const linhas = lotes
    .filter((l) => dentroDoPeriodo(l.created_at, f) && (!f.status || l.status === f.status))
    .map((l) => [
      l.id.slice(0, 8),
      l.arquivo_nome,
      humaniza(l.fonte),
      fmtDataHora(l.created_at),
      usuarioNome(ctx, l.created_by),
      l.total_linhas,
      num(l.resumo, "novos"),
      num(l.resumo, "atualizacoes"),
      num(l.resumo, "movimentacoes"),
      num(l.resumo, "desligamentos"),
      num(l.resumo, "invalidos"),
      num(l.resumo, "rejeitados"),
      humaniza(l.status),
    ]);
  return { nome: "Importações", colunas: COLUNAS_IMPORTACOES, linhas };
}

/* ------------------------------------------------------------------ auditoria */

export type AuditLike = {
  created_at: string;
  usuario_id: string | null;
  acao: string;
  tabela: string;
  registro_id: string | null;
  valor_anterior: unknown;
  valor_posterior: unknown;
  justificativa: string | null;
};

export const COLUNAS_AUDITORIA = [
  "Data e hora",
  "Usuário",
  "Ação",
  "Entidade",
  "Registro",
  "Valor anterior",
  "Valor novo",
  "Justificativa",
];

const json = (v: unknown) => (v ? JSON.stringify(v).slice(0, 4000) : vazio);

export function tabelaAuditoria(ctx: Ctx, regs: AuditLike[], f: Filtros): Tabela {
  const linhas = regs
    .filter((r) => dentroDoPeriodo(r.created_at, f))
    .map((r) => [
      fmtDataHora(r.created_at),
      usuarioNome(ctx, r.usuario_id),
      r.acao,
      r.tabela,
      txt(r.registro_id),
      json(r.valor_anterior),
      json(r.valor_posterior),
      txt(r.justificativa),
    ]);
  return { nome: "Auditoria", colunas: COLUNAS_AUDITORIA, linhas };
}

/* ------------------------------------------------------------- chamada diária */

export type ChamadaLike = {
  attendance_date: string;
  unit_id: string | null;
  area_id: string | null;
  shift_id: string | null;
  closed_at: string | null;
  employee_re: string;
  employee_name_snapshot: string;
  function_snapshot: string | null;
  attendance_status: string;
  motivo: string | null;
  arrival_time: string | null;
  notes: string | null;
  registered_by: string | null;
};

export const COLUNAS_CHAMADA = [
  "Data",
  "Unidade",
  "Área",
  "Turno",
  "RE",
  "Colaborador",
  "Função",
  "Status diário",
  "Motivo",
  "Horário de chegada",
  "Observação",
  "Responsável pelo registro",
  "Fechamento da chamada",
];

export function tabelaChamada(ctx: Ctx, regs: ChamadaLike[], f: Filtros): Tabela {
  const linhas = regs
    .filter((r) => {
      if (!podeVerArea(ctx, r.area_id)) return false;
      if (!dentroDoPeriodo(r.attendance_date, f)) return false;
      if (f.unidade && r.unit_id !== f.unidade) return false;
      if (f.area && r.area_id !== f.area) return false;
      if (f.turno && r.shift_id !== f.turno) return false;
      if (f.status && r.attendance_status !== f.status) return false;
      if (
        f.colaborador &&
        !contem(r.employee_name_snapshot, f.colaborador) &&
        !contem(r.employee_re, f.colaborador)
      )
        return false;
      return true;
    })
    .map((r) => [
      fmtData(r.attendance_date),
      (r.unit_id && ctx.unidades.get(r.unit_id)) || vazio,
      areaNome(ctx, r.area_id),
      turnoNome(ctx, r.shift_id),
      r.employee_re,
      r.employee_name_snapshot,
      txt(r.function_snapshot),
      humaniza(r.attendance_status),
      txt(r.motivo),
      txt(r.arrival_time),
      txt(r.notes),
      usuarioNome(ctx, r.registered_by),
      fmtDataHora(r.closed_at),
    ]);
  return { nome: "Chamada diária", colunas: COLUNAS_CHAMADA, linhas };
}

/* --------------------------------------------------------------------- resumo */

export function tabelaResumo(tabelas: Tabela[], filtros: Filtros, usuario: string): Tabela {
  const linhas: (string | number)[][] = tabelas.map((t) => [t.nome, t.linhas.length]);
  linhas.push(["Usuário responsável", usuario]);
  linhas.push(["Gerado em", fmtDataHora(new Date().toISOString())]);
  linhas.push(["Período", `${filtros.inicio || "início"} a ${filtros.fim || "hoje"}`]);
  return { nome: "Resumo", colunas: ["Indicador", "Valor"], linhas };
}

export function tabelaPendencias(ferias: Tabela, movs: Tabela): Tabela {
  const iCrit = ferias.colunas.indexOf("Criticidade");
  const iStatus = movs.colunas.indexOf("Status");
  const linhas: (string | number)[][] = [];
  for (const l of ferias.linhas) {
    const c = String(l[iCrit] ?? "");
    if (c === "CRITICO" || c === "BLOQUEIO")
      linhas.push(["Férias", `${l[0]} — ${l[1]}`, c, String(l[ferias.colunas.indexOf("Motivo do alerta")] ?? "")]);
  }
  for (const l of movs.linhas) {
    if (String(l[iStatus] ?? "").toLowerCase() === "pendente")
      linhas.push(["Movimentação", `${l[0]} — ${l[1]}`, "PENDENTE", String(l[movs.colunas.indexOf("Motivo")] ?? "")]);
  }
  return { nome: "Pendências", colunas: ["Origem", "Registro", "Situação", "Detalhe"], linhas };
}

/** Descrição legível dos filtros para a aba "Parâmetros do Relatório". */
export function parametros(
  relatorio: string,
  f: Filtros,
  usuario: string,
  rotulos: Partial<Record<keyof Filtros, string>> = {},
): (string | number)[][] {
  const nomes: Record<keyof Filtros, string> = {
    inicio: "Período — início",
    fim: "Período — fim",
    unidade: "Unidade",
    area: "Área",
    turno: "Turno",
    lider: "Líder",
    funcao: "Função",
    colaborador: "Colaborador",
    status: "Status",
    criticidade: "Criticidade",
  };
  const linhas: (string | number)[][] = [
    ["Relatório", relatorio],
    ["Exportado em", fmtDataHora(new Date().toISOString())],
    ["Usuário responsável", usuario],
  ];
  (Object.keys(nomes) as (keyof Filtros)[]).forEach((k) => {
    const bruto = f[k];
    linhas.push([nomes[k], bruto ? (rotulos[k] ?? bruto) : "Todos"]);
  });
  return linhas;
}
