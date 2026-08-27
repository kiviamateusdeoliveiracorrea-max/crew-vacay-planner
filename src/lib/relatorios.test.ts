/**
 * Testes das exportações. Apenas dados fictícios "TESTE -"; nada aqui toca o banco.
 */
import { describe, expect, it } from "vitest";
import { montarCsv } from "@/lib/exportar";
import {
  FILTROS_VAZIOS,
  periodoAquisitivo,
  tabelaAVencer,
  tabelaColaboradores,
  tabelaFerias,
  tabelaMovimentacoes,
  tabelaPendencias,
  tabelaResumo,
  type Ctx,
  type EmpLike,
  type FeriasLike,
  type Filtros,
  type MovLike,
} from "@/lib/relatorios";

const ctx = (areasPermitidas: string[] | null = null): Ctx => ({
  areas: new Map([
    ["a1", { nome: "TESTE - ALMOXARIFADO", unit_id: "u1" }],
    ["a2", { nome: "TESTE - RECEBIMENTO", unit_id: "u1" }],
  ]),
  turnos: new Map([
    ["t1", "TESTE - TURNO A"],
    ["t2", "TESTE - TURNO B"],
  ]),
  funcoes: new Map([
    ["f1", { nome: "TESTE - OPERADOR DE EMPILHADEIRA", chave: true }],
    ["f2", { nome: "TESTE - CONFERENTE", chave: false }],
  ]),
  unidades: new Map([["u1", "TESTE - UNIDADE"]]),
  usuarios: new Map([["us1", "teste@empresa.com"]]),
  movimentos: [],
  hoje: "2026-08-27",
  areasPermitidas,
});

const emp = (over: Partial<EmpLike> = {}): EmpLike => ({
  id: "e1",
  re: "TESTE-001",
  nome: "TESTE - JOÃO ANDRÉ",
  area_id: "a1",
  shift_id: "t1",
  function_id: "f1",
  lider: "TESTE - LÍDER A",
  status: "ATIVO",
  data_admissao: "2020-03-10",
  updated_at: "2026-08-01T12:00:00Z",
  ...over,
});

const fer = (over: Partial<FeriasLike> = {}): FeriasLike => ({
  employee_id: "e1",
  inicio: "2026-09-01",
  fim: "2026-09-10",
  status: "APROVADA",
  substituto_nome: "TESTE - SUBSTITUTO",
  substituto_employee_id: null,
  observacao: "Observação com acentuação: férias já negociadas",
  area_id_snapshot: "a1",
  shift_id_snapshot: "t1",
  function_id_snapshot: "f1",
  aprovado_por: "us1",
  aprovado_em: "2026-08-05T10:00:00Z",
  employee: emp(),
  conflitos: [{ severidade: "CRITICO", mensagem: "Função-chave sem cobertura" }],
  ...over,
});

const mov = (over: Partial<MovLike> = {}): MovLike => ({
  re: "TESTE-001",
  employee: emp(),
  tipo: "TRANSFERENCIA_DEFINITIVA",
  area_origem_id: "a1",
  area_destino_id: "a2",
  shift_origem_id: "t1",
  shift_destino_id: "t2",
  data_efetiva: "2026-07-01",
  temporaria: false,
  data_fim: null,
  status: "PENDENTE",
  motivo: "Reorganização",
  aprovador_id: null,
  observacao: null,
  ...over,
});

const f = (over: Partial<Filtros> = {}): Filtros => ({ ...FILTROS_VAZIOS, ...over });

describe("Relatórios e exportações (dados TESTE -)", () => {
  it("exporta colaboradores sem filtros e sem campos sensíveis", () => {
    const t = tabelaColaboradores(ctx(), [emp(), emp({ id: "e2", re: "TESTE-002", area_id: "a2" })], f());
    expect(t.linhas).toHaveLength(2);
    expect(t.colunas).toContain("Função-chave");
    expect(t.colunas.join().toLowerCase()).not.toMatch(/senha|token|banco|cpf|user_id|uuid/);
    expect(t.linhas[0]![0]).toBe("TESTE-001");
    expect(t.linhas[0]![13]).toBe("10/03/2020"); // data DD/MM/AAAA
  });

  it("filtra por área", () => {
    const t = tabelaColaboradores(ctx(), [emp(), emp({ id: "e2", re: "TESTE-002", area_id: "a2" })], f({ area: "a2" }));
    expect(t.linhas.map((l) => l[0])).toEqual(["TESTE-002"]);
  });

  it("líder exporta apenas a área autorizada", () => {
    const t = tabelaColaboradores(ctx(["a1"]), [emp(), emp({ id: "e2", re: "TESTE-002", area_id: "a2" })], f());
    expect(t.linhas.map((l) => l[0])).toEqual(["TESTE-001"]);
  });

  it("líder que filtra outra área não recebe nada", () => {
    const t = tabelaColaboradores(ctx(["a1"]), [emp({ id: "e2", re: "TESTE-002", area_id: "a2" })], f({ area: "a2" }));
    expect(t.linhas).toHaveLength(0);
  });

  it("férias: período, retorno, dias e criticidade", () => {
    const t = tabelaFerias(ctx(), [fer()], f({ inicio: "2026-09-01", fim: "2026-09-30" }));
    const l = t.linhas[0]!;
    expect(l[6]).toBe("01/09/2026");
    expect(l[7]).toBe("11/09/2026"); // retorno = dia seguinte ao fim
    expect(l[8]).toBe(10);
    expect(l[11]).toBe("CRITICO");
    expect(String(l[12])).toMatch(/Função-chave/);
  });

  it("férias fora do período não são exportadas", () => {
    expect(tabelaFerias(ctx(), [fer()], f({ inicio: "2026-01-01", fim: "2026-02-01" })).linhas).toHaveLength(0);
  });

  it("filtra por criticidade", () => {
    const dados = [fer(), fer({ employee_id: "e2", conflitos: [] })];
    expect(tabelaFerias(ctx(), dados, f({ criticidade: "CRITICO" })).linhas).toHaveLength(1);
    expect(tabelaFerias(ctx(), dados, f({ criticidade: "SEM ALERTA" })).linhas).toHaveLength(1);
  });

  it("férias a vencer calcula períodos, saldo e criticidade", () => {
    const p = periodoAquisitivo("2020-03-10", "2026-08-27", 10, true, false);
    expect(p.aquisitivoInicio).toBe("2025-03-10");
    expect(p.aquisitivoFim).toBe("2026-03-09");
    expect(p.concessivoInicio).toBe("2026-03-10");
    expect(p.concessivoFim).toBe("2027-03-09");
    expect(p.limiteSaida).toBe("2027-02-07");
    expect(p.restantes).toBe(20);
    expect(p.critOperacional).toBe("ALTA");
    expect(p.consolidada).toBe("ALTA");
    const t = tabelaAVencer(ctx(), [emp()], [fer()], f());
    expect(t.linhas).toHaveLength(1);
    expect(t.colunas).toHaveLength(t.linhas[0]!.length);
  });

  it("movimentações trazem origem, destino e datas formatadas", () => {
    const t = tabelaMovimentacoes(ctx(), [mov()], f());
    const l = t.linhas[0]!;
    expect(l[3]).toBe("TESTE - ALMOXARIFADO");
    expect(l[4]).toBe("TESTE - RECEBIMENTO");
    expect(l[7]).toBe("01/07/2026");
    expect(l[8]).toBe("Não");
    expect(tabelaMovimentacoes(ctx(), [mov()], f({ inicio: "2026-08-01" })).linhas).toHaveLength(0);
  });

  it("arquivo sem registros resulta em tabela vazia", () => {
    expect(tabelaColaboradores(ctx(), [], f()).linhas).toHaveLength(0);
  });

  it("suporta mais de 1.000 linhas", () => {
    const muitos = Array.from({ length: 1500 }, (_, i) => emp({ id: `e${i}`, re: `TESTE-${i}` }));
    expect(tabelaColaboradores(ctx(), muitos, f()).linhas).toHaveLength(1500);
  });

  it("relatório com várias abas inclui resumo e pendências", () => {
    const colab = tabelaColaboradores(ctx(), [emp()], f());
    const ferias = tabelaFerias(ctx(), [fer()], f());
    const movs = tabelaMovimentacoes(ctx(), [mov()], f());
    const pend = tabelaPendencias(ferias, movs);
    const abas = [tabelaResumo([colab, ferias, movs, pend], f(), "teste@empresa.com"), colab, ferias, movs, pend];
    expect(abas.map((a) => a.nome)).toEqual([
      "Resumo",
      "Colaboradores",
      "Férias",
      "Movimentações",
      "Pendências",
    ]);
    expect(pend.linhas).toHaveLength(2); // férias crítica + movimentação pendente
  });

  it("CSV preserva acentuação e escapa separadores", () => {
    const csv = montarCsv(tabelaFerias(ctx(), [fer()], f()));
    expect(csv.split("\r\n")[0]).toContain("Colaborador");
    expect(csv).toContain("TESTE - JOÃO ANDRÉ");
    expect(csv).toContain("01/09/2026");
  });
});
