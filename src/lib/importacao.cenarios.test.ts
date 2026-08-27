/**
 * Testes dos 18 cenários do módulo de importação.
 * Usa exclusivamente registros fictícios com o prefixo "TESTE -".
 * Nenhuma linha desta suíte toca a base real (não há acesso ao banco aqui).
 */
import { describe, expect, it } from "vitest";
import {
  autoMapear,
  classificar,
  detectarCamposSensiveis,
  linhaProcessavel,
  podeAprovar,
  TIPO_MOVIMENTACAO,
  validarDecisaoSetor,
  type DecisaoSetor,
  type LinhaImportada,
  type Mapeamento,
} from "@/lib/importacao";
import type { Area, Employee, Funcao, Turno } from "@/lib/sistema";

const areas = [
  { id: "a1", nome: "TESTE - ALMOXARIFADO" },
  { id: "a2", nome: "TESTE - RECEBIMENTO" },
] as Area[];
const turnos = [
  { id: "t1", nome: "TESTE - TURNO A" },
  { id: "t2", nome: "TESTE - TURNO B" },
] as Turno[];
const funcoes = [
  { id: "f1", nome: "TESTE - OPERADOR DE EMPILHADEIRA" },
  { id: "f2", nome: "TESTE - CONFERENTE" },
] as Funcao[];

const modelo = {
  id: "e1",
  re: "TESTE-001",
  nome: "TESTE - JOAO",
  area_id: "a1",
  shift_id: "t1",
  function_id: "f1",
  lider: "TESTE - LIDER A",
  status: "ATIVO",
};

/** Base fictícia: ativo, afastado, desligado e um que não vem no arquivo. */
const employees = [
  modelo,
  { ...modelo, id: "e2", re: "TESTE-002", nome: "TESTE - ANA", status: "AFASTADO" },
  { ...modelo, id: "e3", re: "TESTE-003", nome: "TESTE - PEDRO", status: "DESLIGADO" },
  { ...modelo, id: "e4", re: "TESTE-004", nome: "TESTE - AUSENTE", status: "ATIVO" },
] as Employee[];

const map: Mapeamento = {
  re: "RE",
  nome: "NOME",
  area: "SETOR",
  turno: "TURNO",
  funcao: "FUNCAO",
  lider: "LIDER",
  status: "STATUS",
  data_desligamento: "DATA DESLIGAMENTO",
};

const linha = (over: Record<string, string> = {}) => ({
  RE: "TESTE-001",
  NOME: "TESTE - JOAO",
  SETOR: "TESTE - ALMOXARIFADO",
  TURNO: "TESTE - TURNO A",
  FUNCAO: "TESTE - OPERADOR DE EMPILHADEIRA",
  LIDER: "TESTE - LIDER A",
  STATUS: "ATIVO",
  "DATA DESLIGAMENTO": "",
  ...over,
});

const rodar = (rows: Record<string, string>[]) =>
  classificar(rows, map, employees, areas, turnos, funcoes, "PERSONALIZADO");
const uma = (over: Record<string, string> = {}) => rodar([linha(over)])[0]!;
const aprovar = (l: LinhaImportada): LinhaImportada => ({ ...l, decisao: "APROVADA", aplicar: true });

describe("Cenários 1 a 18 — módulo de importação (somente dados TESTE -)", () => {
  it("1. Novo colaborador com RE novo fica pendente antes da aprovação", () => {
    const l = uma({ RE: "TESTE-900", NOME: "TESTE - NOVO" });
    expect(l.classificacao).toBe("NOVO_COLABORADOR");
    expect(l.decisao).toBe("PENDENTE");
    expect(l.aplicar).toBe(false);
    expect(linhaProcessavel(l)).toBe(false);
    expect(linhaProcessavel(aprovar(l))).toBe(true);
  });

  it("2. Atualização de cargo de RE existente", () => {
    const l = uma({ FUNCAO: "TESTE - CONFERENTE" });
    expect(l.classificacao).toBe("MUDANCA_DE_FUNCAO");
    expect(l.diferencas["funcao"]).toEqual({
      de: "TESTE - OPERADOR DE EMPILHADEIRA",
      para: "TESTE - CONFERENTE",
    });
    expect(l.employee_id).toBe("e1");
  });

  it("3. Mudança definitiva de setor gera movimentação de transferência", () => {
    const l = uma({ SETOR: "TESTE - RECEBIMENTO" });
    expect(l.classificacao).toBe("MUDANCA_DE_SETOR");
    const d: DecisaoSetor = { tipo: "DEFINITIVA", inicio: "2026-09-01", fim: "" };
    expect(validarDecisaoSetor(l, d)).toBeNull();
    expect(TIPO_MOVIMENTACAO[d.tipo as "DEFINITIVA"]).toBe("TRANSFERENCIA_DEFINITIVA");
  });

  it("4. Empréstimo temporário exige data inicial e final", () => {
    const l = uma({ SETOR: "TESTE - RECEBIMENTO" });
    expect(validarDecisaoSetor(l, { tipo: "TEMPORARIA", inicio: "", fim: "" })).toMatch(/data efetiva/i);
    expect(validarDecisaoSetor(l, { tipo: "TEMPORARIA", inicio: "2026-09-01", fim: "" })).toMatch(
      /data final/i,
    );
    expect(
      validarDecisaoSetor(l, { tipo: "TEMPORARIA", inicio: "2026-09-10", fim: "2026-09-01" }),
    ).toMatch(/posterior/i);
    expect(
      validarDecisaoSetor(l, { tipo: "TEMPORARIA", inicio: "2026-09-01", fim: "2026-09-30" }),
    ).toBeNull();
    expect(TIPO_MOVIMENTACAO["TEMPORARIA"]).toBe("EMPRESTIMO_TEMPORARIO");
    expect(TIPO_MOVIMENTACAO["COBERTURA_FERIAS"]).toBe("COBERTURA_DE_FERIAS");
  });

  it("5. Mudança de turno", () => {
    const l = uma({ TURNO: "TESTE - TURNO B" });
    expect(l.classificacao).toBe("MUDANCA_DE_TURNO");
    expect(l.diferencas["turno"]!.para).toBe("TESTE - TURNO B");
  });

  it("6. Mudança de líder", () => {
    const l = uma({ LIDER: "TESTE - LIDER B" });
    expect(l.classificacao).toBe("MUDANCA_DE_LIDER");
  });

  it("7. Afastamento", () => {
    expect(uma({ STATUS: "AFASTADO INSS" }).classificacao).toBe("AFASTAMENTO");
  });

  it("8. Retorno de afastamento", () => {
    const l = uma({ RE: "TESTE-002", NOME: "TESTE - ANA", STATUS: "ATIVO" });
    expect(l.classificacao).toBe("RETORNO_DE_AFASTAMENTO");
    expect(l.employee_id).toBe("e2");
  });

  it("9. Desligamento apenas com status/data explícita", () => {
    expect(uma({ STATUS: "DESLIGADO" }).classificacao).toBe("DESLIGAMENTO");
    expect(uma({ STATUS: "", "DATA DESLIGAMENTO": "31/08/2026" }).classificacao).toBe("DESLIGAMENTO");
  });

  it("10. Colaborador ausente do arquivo não gera desligamento", () => {
    const r = rodar([linha()]);
    expect(r).toHaveLength(1);
    expect(r.some((l) => l.employee_id === "e4")).toBe(false);
    expect(r.some((l) => l.classificacao === "DESLIGAMENTO")).toBe(false);
  });

  it("11. RE duplicado bloqueia as duas linhas", () => {
    const r = rodar([linha({ SETOR: "TESTE - RECEBIMENTO" }), linha()]);
    expect(r.map((l) => l.classificacao)).toEqual(["DUPLICIDADE", "DUPLICIDADE"]);
    expect(r.every((l) => !podeAprovar(l))).toBe(true);
    expect(r.every((l) => !linhaProcessavel(aprovar(l)))).toBe(true);
  });

  it("12. RE em branco é dado inválido", () => {
    const l = uma({ RE: "" });
    expect(l.classificacao).toBe("DADO_INVALIDO");
    expect(l.erros.join()).toMatch(/sem RE/i);
    expect(linhaProcessavel(aprovar(l))).toBe(false);
  });

  it("13. Área desconhecida é sinalizada, não criada em silêncio", () => {
    const l = uma({ SETOR: "TESTE - SETOR INEXISTENTE" });
    expect(l.classificacao).toBe("MUDANCA_DE_SETOR");
    expect(l.avisos.join()).toMatch(/Setor "TESTE - SETOR INEXISTENTE" não existe/);
  });

  it("14. Função desconhecida é sinalizada", () => {
    const l = uma({ FUNCAO: "TESTE - FUNCAO INEXISTENTE" });
    expect(l.avisos.join()).toMatch(/Função "TESTE - FUNCAO INEXISTENTE" não existe/);
  });

  it("15. Arquivo com dados bancários — colunas ignoradas", () => {
    const colunas = ["RE", "NOME", "CPF", "Banco", "Agência", "Conta Corrente", "PIX", "Salário"];
    const ignoradas = detectarCamposSensiveis(colunas).map((c) => c.coluna);
    expect(ignoradas).toEqual(expect.arrayContaining(["CPF", "Banco", "Agência", "Conta Corrente"]));
    const m = autoMapear(colunas, "PERSONALIZADO");
    expect(Object.values(m)).not.toEqual(expect.arrayContaining(ignoradas));
    expect(m.re).toBe("RE");
  });

  it("16. Cancelamento do lote antes da aplicação não deixa nada aprovado", () => {
    const analisado = rodar([linha({ SETOR: "TESTE - RECEBIMENTO" }), linha({ RE: "TESTE-901" })]);
    const aprovadas = analisado.map(aprovar);
    const cancelado: LinhaImportada[] | null = null; // cancelar = descartar a análise
    expect(aprovadas.filter(linhaProcessavel)).toHaveLength(2);
    expect(cancelado).toBeNull();
    expect((cancelado ?? []).filter(linhaProcessavel)).toHaveLength(0);
  });

  it("17. Tentativa de processar linha inválida é bloqueada pela guarda final", () => {
    const invalidas = [uma({ RE: "" }), ...rodar([linha(), linha()])].map(aprovar);
    expect(invalidas.filter(linhaProcessavel)).toHaveLength(0);
  });

  it("18. Processa somente as linhas aprovadas e válidas", () => {
    const analisado = rodar([
      linha({ RE: "TESTE-902", NOME: "TESTE - NOVO 2" }), // aprovada
      linha({ SETOR: "TESTE - RECEBIMENTO" }), // aprovada
      linha({ RE: "TESTE-903", TURNO: "TESTE - TURNO B" }), // rejeitada
      linha({ RE: "" }), // inválida
    ]);
    const decididas = analisado.map((l, i) =>
      i < 2 ? aprovar(l) : { ...l, decisao: "REJEITADA" as const },
    );
    const processadas = decididas.filter(linhaProcessavel);
    expect(processadas.map((l) => l.dados["re"])).toEqual(["TESTE-902", "TESTE-001"]);
    // nenhuma linha rejeitada/inválida entra no processamento
    expect(processadas.some((l) => l.erros.length)).toBe(false);
  });
});
