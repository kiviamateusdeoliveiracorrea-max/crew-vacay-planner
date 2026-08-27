import { describe, expect, it } from "vitest";
import { MARCA_DIVERGENCIA, montarPrevistos, type PrevistoBase } from "@/lib/chamada";
import type { Employee, Movement } from "@/lib/sistema";

const AREA_A = "area-a";
const AREA_B = "area-b";
const DATA = "2026-05-10";

const emp = (over: Partial<Employee> = {}): Employee =>
  ({
    id: "e1",
    re: "1001",
    nome: "TESTE - Colaborador",
    area_id: AREA_A,
    shift_id: null,
    function_id: null,
    status: "ATIVO",
    data_desligamento: null,
    ...over,
  }) as Employee;

const mov = (over: Partial<Movement> = {}): Movement =>
  ({
    id: "m1",
    employee_id: "e1",
    status: "APROVADA",
    temporaria: false,
    area_origem_id: AREA_A,
    area_destino_id: AREA_B,
    shift_origem_id: null,
    shift_destino_id: null,
    data_efetiva: "2026-05-01",
    data_fim: null,
    tipo: "TRANSFERENCIA_DEFINITIVA",
    ...over,
  }) as Movement;

const base = (over: Partial<PrevistoBase> = {}): PrevistoBase => ({
  employees: [emp()],
  movimentacoes: [],
  ferias: [],
  funcoes: [],
  ...over,
});

describe("Chamada Diária — integração com employees/vacations/employee_movements", () => {
  it("marca FERIAS quando a data está entre início e retorno", () => {
    const b = base({
      ferias: [
        { id: "v1", employee_id: "e1", inicio: "2026-05-01", fim: "2026-05-15", status: "APROVADA" },
      ],
    });
    expect(montarPrevistos(b, DATA, AREA_A, null)[0]?.attendance_status).toBe("FERIAS");
  });

  it("ignora férias canceladas", () => {
    const b = base({
      ferias: [
        { id: "v1", employee_id: "e1", inicio: "2026-05-01", fim: "2026-05-15", status: "CANCELADA" },
      ],
    });
    expect(montarPrevistos(b, DATA, AREA_A, null)[0]?.attendance_status).toBe("PENDENTE");
  });

  it("no dia do retorno o colaborador não está mais de férias", () => {
    const b = base({
      ferias: [
        { id: "v1", employee_id: "e1", inicio: "2026-05-01", fim: "2026-05-09", status: "APROVADA" },
      ],
    });
    expect(montarPrevistos(b, DATA, AREA_A, null)[0]?.attendance_status).toBe("PENDENTE");
  });

  it("transferência definitiva carrega no destino e não na origem", () => {
    const b = base({ movimentacoes: [mov()] });
    expect(montarPrevistos(b, DATA, AREA_A, null)).toHaveLength(0);
    const destino = montarPrevistos(b, DATA, AREA_B, null);
    expect(destino).toHaveLength(1);
    expect(destino[0]?.planned_area_id).toBe(AREA_B);
  });

  it("movimentação temporária: destino temporário e origem em APOIO_OUTRA_AREA", () => {
    const b = base({
      movimentacoes: [
        mov({
          temporaria: true,
          tipo: "EMPRESTIMO_TEMPORARIO",
          data_efetiva: "2026-05-05",
          data_fim: "2026-05-20",
        }),
      ],
    });
    const destino = montarPrevistos(b, DATA, AREA_B, null)[0];
    expect(destino?.temporaria).toBe(true);
    const origem = montarPrevistos(b, DATA, AREA_A, null)[0];
    expect(origem?.attendance_status).toBe("APOIO_OUTRA_AREA");
  });

  it("após a data final volta à área de origem", () => {
    const b = base({
      movimentacoes: [
        mov({
          temporaria: true,
          tipo: "EMPRESTIMO_TEMPORARIO",
          data_efetiva: "2026-05-01",
          data_fim: "2026-05-05",
        }),
      ],
    });
    expect(montarPrevistos(b, DATA, AREA_A, null)[0]?.attendance_status).toBe("PENDENTE");
    expect(montarPrevistos(b, DATA, AREA_B, null)).toHaveLength(0);
  });

  it("afastamento vigente marca AFASTADO", () => {
    const b = base({ employees: [emp({ status: "AFASTADO" })] });
    expect(montarPrevistos(b, DATA, AREA_A, null)[0]?.attendance_status).toBe("AFASTADO");
  });

  it("desligado antes da data não é carregado", () => {
    const b = base({ employees: [emp({ status: "DESLIGADO", data_desligamento: "2026-04-30" })] });
    expect(montarPrevistos(b, DATA, AREA_A, null)).toHaveLength(0);
  });

  it("férias + afastamento gera divergência sem escolher status", () => {
    const b = base({
      employees: [emp({ status: "AFASTADO" })],
      ferias: [
        { id: "v1", employee_id: "e1", inicio: "2026-05-01", fim: "2026-05-15", status: "APROVADA" },
      ],
    });
    const linha = montarPrevistos(b, DATA, AREA_A, null)[0];
    expect(linha?.attendance_status).toBe("PENDENTE");
    expect(linha?.notes).toContain(MARCA_DIVERGENCIA);
    expect(linha?.divergencias[0]?.origens.length).toBeGreaterThan(0);
  });

  it("movimentações temporárias sobrepostas geram divergência com origem rastreável", () => {
    const b = base({
      movimentacoes: [
        mov({
          id: "m1",
          temporaria: true,
          tipo: "EMPRESTIMO_TEMPORARIO",
          data_efetiva: "2026-05-01",
          data_fim: "2026-05-20",
        }),
        mov({
          id: "m2",
          temporaria: true,
          tipo: "COBERTURA_DE_FERIAS",
          area_destino_id: AREA_B,
          data_efetiva: "2026-05-08",
          data_fim: "2026-05-18",
        }),
      ],
    });
    const linha = montarPrevistos(b, DATA, AREA_B, null)[0];
    expect(linha?.divergencias.some((d) => d.regra === "MOVIMENTACOES_SOBREPOSTAS")).toBe(true);
    expect(linha?.divergencias[0]?.origens[0]?.rota).toContain("/movimentacoes?registro=");
  });
});
