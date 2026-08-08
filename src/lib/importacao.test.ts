import { describe, expect, it } from "vitest";
import { classificar, type Mapeamento } from "@/lib/importacao";
import type { Area, Employee, Funcao, Turno } from "@/lib/sistema";

const areas = [{ id: "a1", nome: "ALMOXARIFADO" }, { id: "a2", nome: "RECEBIMENTO" }] as Area[];
const turnos = [{ id: "t1", nome: "1º Turno" }] as Turno[];
const funcoes = [{ id: "f1", nome: "OPERADOR DE EMPILHADEIRA" }] as Funcao[];

const employees = [
  {
    id: "e1",
    re: "123",
    nome: "JOAO",
    area_id: "a1",
    shift_id: "t1",
    function_id: "f1",
    lider: null,
    status: "ATIVO",
  },
] as Employee[];

const map: Mapeamento = {
  re: "RE",
  nome: "NOME",
  area: "SETOR",
  turno: "TURNO",
  funcao: "FUNCAO",
  status: "STATUS",
};

const linha = (over: Record<string, string>) => ({
  RE: "123",
  NOME: "JOAO",
  SETOR: "ALMOXARIFADO",
  TURNO: "1º Turno",
  FUNCAO: "OPERADOR DE EMPILHADEIRA",
  STATUS: "ATIVO",
  ...over,
});

describe("classificação de importação", () => {
  it("detecta novo colaborador", () => {
    const r = classificar([linha({ RE: "999", NOME: "MARIA" })], map, employees, areas, turnos, funcoes);
    expect(r[0]!.classificacao).toBe("NOVO_COLABORADOR");
  });

  it("detecta mudança de setor", () => {
    const r = classificar([linha({ SETOR: "RECEBIMENTO" })], map, employees, areas, turnos, funcoes);
    expect(r[0]!.classificacao).toBe("MUDANCA_DE_SETOR");
  });

  it("detecta duplicidade de RE", () => {
    const r = classificar([linha({}), linha({})], map, employees, areas, turnos, funcoes);
    expect(r[1]!.classificacao).toBe("DUPLICIDADE");
    expect(r[1]!.aplicar).toBe(false);
  });

  it("não altera quem está igual à base", () => {
    const r = classificar([linha({})], map, employees, areas, turnos, funcoes);
    expect(r[0]!.classificacao).toBe("SEM_ALTERACAO");
  });

  it("desliga apenas com status/data no arquivo", () => {
    const r = classificar([linha({ STATUS: "DESLIGADO" })], map, employees, areas, turnos, funcoes);
    expect(r[0]!.classificacao).toBe("DESLIGAMENTO");
  });

  it("marca dado inválido quando falta campo obrigatório", () => {
    const r = classificar([linha({ NOME: "" })], map, employees, areas, turnos, funcoes);
    expect(r[0]!.classificacao).toBe("DADO_INVALIDO");
    expect(r[0]!.aplicar).toBe(false);
  });
});
