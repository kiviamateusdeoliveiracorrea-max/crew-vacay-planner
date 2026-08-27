/**
 * Exportação dos indicadores do painel gerencial.
 * Funções puras: montam as tabelas de dados que formam cada indicador,
 * respeitando exatamente os filtros ativos da tela. Nada aqui grava no banco.
 */
import {
  FILTROS_VAZIOS,
  parametros,
  tabelaAVencer,
  tabelaFerias,
  tabelaMovimentacoes,
  type Ctx,
  type EmpLike,
  type Filtros,
  type Tabela,
} from "@/lib/relatorios";
import { fmtDataHora } from "@/lib/sistema";

export type CatalogoPainel = {
  areas: { id: string; nome: string; unit_id: string | null }[];
  turnos: { id: string; nome: string }[];
  funcoes: { id: string; nome: string; funcao_chave: boolean }[];
  unidades: { id: string; nome: string }[];
};

/** Contexto de nomes/permissões usado pelos geradores de tabela. */
export function ctxPainel(
  cat: CatalogoPainel,
  movimentos: Ctx["movimentos"],
  areasPermitidas: string[] | null,
): Ctx {
  return {
    areas: new Map(cat.areas.map((a) => [a.id, { nome: a.nome, unit_id: a.unit_id }])),
    turnos: new Map(cat.turnos.map((t) => [t.id, t.nome])),
    funcoes: new Map(cat.funcoes.map((f) => [f.id, { nome: f.nome, chave: f.funcao_chave }])),
    unidades: new Map(cat.unidades.map((u) => [u.id, u.nome])),
    usuarios: new Map(),
    movimentos,
    hoje: new Date().toISOString().slice(0, 10),
    areasPermitidas,
  };
}

export type FiltrosPainel = {
  unidade: string;
  area: string;
  turno: string;
  funcao: string;
  mes: string;
  status: string;
  criticidade: string;
};

const ultimoDia = (mes: string) => new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0).getDate();

/** Converte os filtros da tela do painel no formato usado pelos relatórios. */
export function filtrosDoPainel(f: FiltrosPainel): Filtros {
  return {
    ...FILTROS_VAZIOS,
    inicio: f.mes ? `${f.mes}-01` : "",
    fim: f.mes ? `${f.mes}-${String(ultimoDia(f.mes)).padStart(2, "0")}` : "",
    unidade: f.unidade,
    area: f.area,
    turno: f.turno,
    funcao: f.funcao,
    status: f.status,
    criticidade: f.criticidade,
  };
}

/** Registros já filtrados pela tela: não refiltramos, apenas formatamos. */
export const tabelaFeriasPainel = (ctx: Ctx, itens: Parameters<typeof tabelaFerias>[1]) =>
  tabelaFerias(ctx, itens, FILTROS_VAZIOS);

export const tabelaMovPainel = (ctx: Ctx, itens: Parameters<typeof tabelaMovimentacoes>[1]) =>
  tabelaMovimentacoes(ctx, itens, FILTROS_VAZIOS);

export const COLUNAS_A_VENCER_PAINEL = [
  "Colaborador",
  "RE",
  "Área",
  "Saldo de dias",
  "Limite para saída",
  "Criticidade",
  "Substituto",
  "Responsável pela tratativa",
];

/** Recorte pedido para o indicador "Férias a vencer" do painel. */
export function tabelaAVencerPainel(
  ctx: Ctx,
  emps: EmpLike[],
  ferias: Parameters<typeof tabelaAVencer>[2],
): Tabela {
  const base = tabelaAVencer(ctx, emps, ferias, FILTROS_VAZIOS);
  const idx = COLUNAS_A_VENCER_PAINEL.map((c) =>
    base.colunas.indexOf(
      c === "Colaborador"
        ? "Colaborador"
        : c === "Área"
          ? "Área de responsabilidade"
          : c === "Criticidade"
            ? "Criticidade consolidada"
            : c,
    ),
  );
  return {
    nome: "Férias a vencer",
    colunas: COLUNAS_A_VENCER_PAINEL,
    linhas: base.linhas.map((l) => idx.map((i) => (i >= 0 ? l[i]! : "—"))),
  };
}

/** Agregação de um gráfico vira tabela exportável (rótulo + quantidade). */
export const tabelaAgregada = (nome: string, rotulo: string, dados: [string, number][]): Tabela => ({
  nome,
  colunas: [rotulo, "Quantidade"],
  linhas: dados.map(([k, n]) => [k, n]),
});

/**
 * Cabeçalho obrigatório do arquivo: indicador de origem, filtros aplicados,
 * data/hora e usuário que exportou.
 */
export function parametrosPainel(
  indicador: string,
  f: Filtros,
  usuario: string,
  rotulos: Partial<Record<keyof Filtros, string>>,
): (string | number)[][] {
  return [
    ["Origem", "Painel gerencial"],
    ["Indicador de origem", indicador],
    ["Data e hora da exportação", fmtDataHora(new Date().toISOString())],
    ["Usuário que exportou", usuario],
    ...parametros(indicador, f, usuario, rotulos).slice(3),
  ];
}
