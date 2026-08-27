import { describe, expect, it } from "vitest";
import {
  autoMapear,
  camposDaFonte,
  classificar,
  detectarCamposSensiveis,
  podeAprovar,
  type Mapeamento,
} from "@/lib/importacao";
import type { Area, Employee, Funcao, Turno } from "@/lib/sistema";

/* Dados fictícios de TESTE — nenhum registro real é tocado nestes cenários. */
const areas = [
  { id: "a1", nome: "TESTE ALMOXARIFADO" },
  { id: "a2", nome: "TESTE RECEBIMENTO" },
] as Area[];
const turnos = [{ id: "t1", nome: "TESTE 1º Turno" }, { id: "t2", nome: "TESTE 2º Turno" }] as Turno[];
const funcoes = [
  { id: "f1", nome: "TESTE OPERADOR DE EMPILHADEIRA" },
  { id: "f2", nome: "TESTE CONFERENTE" },
] as Funcao[];

const base = {
  id: "e1",
  re: "T-123",
  nome: "TESTE JOAO",
  area_id: "a1",
  shift_id: "t1",
  function_id: "f1",
  lider: "TESTE LIDER A",
  status: "ATIVO",
};

const employees = [
  base,
  { ...base, id: "e2", re: "T-456", nome: "TESTE ANA", status: "AFASTADO" },
  { ...base, id: "e3", re: "T-789", nome: "TESTE PEDRO", status: "DESLIGADO" },
] as Employee[];

const map: Mapeamento = {
  re: "RE",
  nome: "NOME",
  area: "SETOR",
  turno: "TURNO",
  funcao: "FUNCAO",
  lider: "LIDER",
  status: "STATUS",
  vaga_id: "ID VAGA",
  status_vaga: "STATUS VAGA",
};

const linha = (over: Record<string, string> = {}) => ({
  RE: "T-123",
  NOME: "TESTE JOAO",
  SETOR: "TESTE ALMOXARIFADO",
  TURNO: "TESTE 1º Turno",
  FUNCAO: "TESTE OPERADOR DE EMPILHADEIRA",
  LIDER: "TESTE LIDER A",
  STATUS: "ATIVO",
  "ID VAGA": "",
  "STATUS VAGA": "",
  ...over,
});

const rodar = (rows: Record<string, string>[]) =>
  classificar(rows, map, employees, areas, turnos, funcoes, "PERSONALIZADO");

describe("classificação de importação (dados de TESTE)", () => {
  it("detecta novo colaborador", () => {
    expect(rodar([linha({ RE: "T-999", NOME: "TESTE MARIA" })])[0]!.classificacao).toBe(
      "NOVO_COLABORADOR",
    );
  });

  it("detecta mudança de setor", () => {
    expect(rodar([linha({ SETOR: "TESTE RECEBIMENTO" })])[0]!.classificacao).toBe(
      "MUDANCA_DE_SETOR",
    );
  });

  it("detecta mudança de turno e de função", () => {
    expect(rodar([linha({ TURNO: "TESTE 2º Turno" })])[0]!.classificacao).toBe("MUDANCA_DE_TURNO");
    expect(rodar([linha({ FUNCAO: "TESTE CONFERENTE" })])[0]!.classificacao).toBe(
      "MUDANCA_DE_FUNCAO",
    );
  });

  it("detecta mudança de líder", () => {
    expect(rodar([linha({ LIDER: "TESTE LIDER B" })])[0]!.classificacao).toBe("MUDANCA_DE_LIDER");
  });

  it("detecta afastamento, retorno e reativação", () => {
    expect(rodar([linha({ STATUS: "AFASTADO INSS" })])[0]!.classificacao).toBe("AFASTAMENTO");
    expect(rodar([linha({ RE: "T-456", NOME: "TESTE ANA" })])[0]!.classificacao).toBe(
      "RETORNO_DE_AFASTAMENTO",
    );
    expect(rodar([linha({ RE: "T-789", NOME: "TESTE PEDRO" })])[0]!.classificacao).toBe(
      "REATIVACAO",
    );
  });

  it("bloqueia as duas linhas com RE duplicado", () => {
    const r = rodar([linha(), linha()]);
    expect(r.map((l) => l.classificacao)).toEqual(["DUPLICIDADE", "DUPLICIDADE"]);
    expect(r.every((l) => podeAprovar(l))).toBe(false);
  });

  it("linha sem RE fica inválida", () => {
    const r = rodar([linha({ RE: "" })]);
    expect(r[0]!.classificacao).toBe("DADO_INVALIDO");
    expect(r[0]!.erros.join()).toMatch(/sem RE/i);
  });

  it("linha sem RE mas com vaga vira VAGA_ABERTA", () => {
    const r = rodar([linha({ RE: "", NOME: "", "ID VAGA": "V-01", "STATUS VAGA": "ABERTA" })]);
    expect(r[0]!.classificacao).toBe("VAGA_ABERTA");
  });

  it("não altera quem está igual à base", () => {
    expect(rodar([linha()])[0]!.classificacao).toBe("SEM_ALTERACAO");
  });

  it("desliga apenas com status ou data explícita", () => {
    expect(rodar([linha({ STATUS: "DESLIGADO" })])[0]!.classificacao).toBe("DESLIGAMENTO");
    expect(rodar([linha({ STATUS: "" })])[0]!.classificacao).toBe("SEM_ALTERACAO");
  });

  it("nenhuma linha nasce aprovada", () => {
    expect(rodar([linha({ SETOR: "TESTE RECEBIMENTO" })])[0]!.aplicar).toBe(false);
    expect(rodar([linha({ SETOR: "TESTE RECEBIMENTO" })])[0]!.decisao).toBe("PENDENTE");
  });
});

describe("mapeamento e campos sensíveis", () => {
  it("reconhece aliases de cabeçalho", () => {
    const m = autoMapear(
      ["Número Pessoal", "Nome do Colaborador", "Real (Setor)", "Planejado (Setor)", "Turno Plan"],
      "HEADCOUNT",
    );
    expect(m.re).toBe("Número Pessoal");
    expect(m.nome).toBe("Nome do Colaborador");
    expect(m.area).toBe("Real (Setor)");
    expect(m.setor_planejado).toBe("Planejado (Setor)");
    expect(m.turno_planejado).toBe("Turno Plan");
  });

  it("sinaliza e não mapeia colunas pessoais", () => {
    const cols = ["RE", "CPF", "Telefone Celular", "Data de Nascimento", "Banco"];
    const bloqueadas = detectarCamposSensiveis(cols);
    expect(bloqueadas.map((b) => b.coluna)).toEqual([
      "CPF",
      "Telefone Celular",
      "Data de Nascimento",
      "Banco",
    ]);
    expect(bloqueadas[0]!.motivo).toMatch(/não será importado/);
    expect(Object.values(autoMapear(cols, "SAP_ATIVOS"))).not.toContain("CPF");
  });

  it("expõe os campos exigidos por fonte", () => {
    expect(camposDaFonte("HEADCOUNT").map((c) => c.key)).toContain("setor_planejado");
    expect(camposDaFonte("SAP_ATIVOS").map((c) => c.key)).toContain("horario");
    expect(camposDaFonte("FERIAS_A_VENCER").filter((c) => c.obrigatorio).map((c) => c.key)).toEqual([
      "re",
      "ferias_saida",
      "ferias_retorno",
    ]);
  });
});
