import { describe, expect, it } from "vitest";
import { avaliarFerias, type BaseMotor, type PeriodoFerias } from "@/lib/motor-conflitos";
import type { Area, CoverageRule, Employee, Funcao, Movement, Turno } from "@/lib/sistema";

const areas = [
  { id: "a1", nome: "ALMOXARIFADO" },
  { id: "a2", nome: "RECEBIMENTO" },
] as Area[];
const turnos = [
  { id: "t1", nome: "1º Turno" },
  { id: "t2", nome: "2º Turno" },
] as Turno[];
const funcoes = [
  { id: "f1", nome: "OPERADOR DE EMPILHADEIRA", funcao_chave: true },
  { id: "f2", nome: "AUXILIAR", funcao_chave: false },
] as Funcao[];

const emp = (over: Partial<Employee> & { id: string }): Employee =>
  ({
    re: over.id,
    nome: over.id.toUpperCase(),
    area_id: "a1",
    shift_id: "t1",
    function_id: "f2",
    status: "ATIVO",
    ...over,
  }) as Employee;

const base = (over: Partial<BaseMotor> = {}): BaseMotor => ({
  employees: [],
  funcoes,
  areas,
  turnos,
  movimentacoes: [],
  regras: [],
  ferias: [],
  ...over,
});

const ferias = (o: Partial<PeriodoFerias> & { employee_id: string }): PeriodoFerias => ({
  id: `v-${o.employee_id}`,
  inicio: "2026-03-01",
  fim: "2026-03-10",
  status: "PLANEJADA",
  ...o,
});

const regras = (s: Severidade | string) => (a: { regra: string }[]) => a.some((x) => x.regra === s);
type Severidade = string;

const REF = "2026-01-15";
const av = (b: Parameters<typeof avaliarFerias>[0], a: Parameters<typeof avaliarFerias>[1]) =>
  avaliarFerias(b, a, REF);

describe("motor de conflitos", () => {
  it("bloqueia mesma função, mesma área e mesmo turno", () => {
    const b = base({
      employees: [emp({ id: "e1", function_id: "f1" }), emp({ id: "e2", function_id: "f1" })],
      ferias: [ferias({ employee_id: "e2" })],
    });
    const r = av(b, ferias({ employee_id: "e1", id: "novo" }));
    const c = r.find((x) => x.regra === "MESMA_FUNCAO_MESMA_AREA_MESMO_TURNO");
    expect(c?.severidade).toBe("BLOQUEIO");
    expect(c?.dias).toBe(10);
  });

  it("usa o turno vigente por movimentação temporária", () => {
    const movs = [
      {
        id: "m1",
        employee_id: "e2",
        status: "APROVADA",
        temporaria: true,
        area_destino_id: "a1",
        shift_destino_id: "t2",
        data_efetiva: "2026-02-01",
        data_fim: "2026-04-01",
      },
    ] as unknown as Movement[];
    const b = base({
      employees: [emp({ id: "e1", function_id: "f2" }), emp({ id: "e2", function_id: "f2" })],
      ferias: [ferias({ employee_id: "e2" })],
      movimentacoes: movs,
    });
    const r = av(b, ferias({ employee_id: "e1", id: "novo" }));
    expect(regras("MESMA_FUNCAO_MESMA_AREA_TURNOS_DIFERENTES")(r)).toBe(true);
  });

  it("classifica como informativo quando há cobertura permitida entre áreas", () => {
    const b = base({
      employees: [
        emp({ id: "e1", function_id: "f2" }),
        emp({ id: "e2", function_id: "f2", area_id: "a2" }),
      ],
      ferias: [ferias({ employee_id: "e2" })],
      regras: [
        { area_id: "a1", function_id: "f2", cobertura_area_id: "a2" } as unknown as CoverageRule,
      ],
    });
    const r = av(b, ferias({ employee_id: "e1", id: "novo" }));
    const c = r.find((x) => x.regra === "MESMA_FUNCAO_OUTRA_AREA_COM_COBERTURA_PERMITIDA");
    expect(c?.severidade).toBe("INFORMATIVO");
  });

  it("aponta função-chave sem substituto", () => {
    const b = base({ employees: [emp({ id: "e1", function_id: "f1" })] });
    const r = av(b, ferias({ employee_id: "e1", id: "novo" }));
    expect(regras("FUNCAO_CHAVE_SEM_SUBSTITUTO")(r)).toBe(true);
  });

  it("bloqueia quando o substituto também está de férias", () => {
    const b = base({
      employees: [emp({ id: "e1", function_id: "f1" }), emp({ id: "e2", function_id: "f1" })],
      ferias: [ferias({ employee_id: "e2" })],
    });
    const r = av(
      b,
      ferias({ employee_id: "e1", id: "novo", substituto_employee_id: "e2" }),
    );
    expect(r.find((x) => x.regra === "SUBSTITUTO_INDISPONIVEL")?.severidade).toBe("BLOQUEIO");
  });

  it("alerta movimentação durante as férias", () => {
    const movs = [
      {
        id: "m1",
        employee_id: "e1",
        status: "APROVADA",
        temporaria: false,
        tipo: "TRANSFERENCIA_DEFINITIVA",
        area_destino_id: "a2",
        shift_destino_id: null,
        data_efetiva: "2026-03-05",
        data_fim: null,
      },
    ] as unknown as Movement[];
    const b = base({ employees: [emp({ id: "e1" })], movimentacoes: movs });
    const r = av(b, ferias({ employee_id: "e1", id: "novo" }));
    expect(r.find((x) => x.regra === "MOVIMENTACAO_DURANTE_FERIAS")?.severidade).toBe("CRITICO");
  });

  it("não alerta transferência definitiva anterior às férias", () => {
    const movs = [
      {
        id: "m1",
        employee_id: "e1",
        status: "APROVADA",
        temporaria: false,
        tipo: "TRANSFERENCIA_DEFINITIVA",
        area_destino_id: "a2",
        shift_destino_id: null,
        data_efetiva: "2026-01-05",
        data_fim: null,
      },
    ] as unknown as Movement[];
    const b = base({ employees: [emp({ id: "e1" })], movimentacoes: movs });
    const r = av(b, ferias({ employee_id: "e1", id: "novo" }));
    expect(regras("MOVIMENTACAO_DURANTE_FERIAS")(r)).toBe(false);
  });

  it("bloqueia quando a capacidade mínima não é atendida", () => {
    const b = base({
      employees: [emp({ id: "e1" }), emp({ id: "e2" })],
      ferias: [ferias({ employee_id: "e2" })],
      regras: [
        {
          area_id: "a1",
          function_id: "f2",
          shift_id: "t1",
          min_presentes: 1,
          max_ferias_simultaneas: 5,
        } as unknown as CoverageRule,
      ],
    });
    const r = av(b, ferias({ employee_id: "e1", id: "novo" }));
    expect(r.find((x) => x.regra === "COBERTURA_MINIMA_NAO_ATENDIDA")?.severidade).toBe("BLOQUEIO");
  });

  it("ignora férias canceladas", () => {
    const b = base({
      employees: [emp({ id: "e1", function_id: "f1" }), emp({ id: "e2", function_id: "f1" })],
      ferias: [ferias({ employee_id: "e2", status: "CANCELADA" })],
    });
    const r = av(
      b,
      ferias({ employee_id: "e1", id: "novo", substituto_employee_id: "e2" }),
    );
    expect(r).toHaveLength(0);
  });
});
