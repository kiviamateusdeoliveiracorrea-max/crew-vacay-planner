import { describe, expect, it } from "vitest";
import {
  lotacaoDefinitiva,
  lotacaoVigente,
  normalizaPorTipo,
  temporariaAberta,
  temporariaSobreposta,
  validaMovimentacao,
} from "@/lib/movimentacao";
import type { Movement } from "@/lib/sistema";

const emp = { id: "e1", area_id: "ALMOX", shift_id: "T1" };

const mov = (m: Partial<Movement>): Movement =>
  ({
    id: m.id ?? crypto.randomUUID(),
    employee_id: "e1",
    status: "APROVADA",
    temporaria: false,
    area_origem_id: null,
    shift_origem_id: null,
    area_destino_id: null,
    shift_destino_id: null,
    data_efetiva: "2026-01-01",
    data_fim: null,
    tipo: "TRANSFERENCIA_DEFINITIVA",
    ...m,
  }) as Movement;

describe("movimentação definitiva", () => {
  const transferencia = mov({
    tipo: "TRANSFERENCIA_DEFINITIVA",
    area_destino_id: "CEM",
    data_efetiva: "2026-03-10",
  });

  it("não altera a área antes da data efetiva", () => {
    expect(lotacaoVigente([transferencia], emp, "2026-03-09").areaId).toBe("ALMOX");
  });

  it("altera a área a partir da data efetiva", () => {
    expect(lotacaoVigente([transferencia], emp, "2026-03-10").areaId).toBe("CEM");
    expect(lotacaoVigente([transferencia], emp, "2026-12-01").areaId).toBe("CEM");
  });

  it("mantém histórico: a movimentação anterior continua respondendo pelo passado", () => {
    const segunda = mov({
      tipo: "TRANSFERENCIA_DEFINITIVA",
      area_destino_id: "RECEBIMENTO",
      data_efetiva: "2026-06-01",
    });
    const movs = [transferencia, segunda];
    expect(lotacaoVigente(movs, emp, "2026-02-01").areaId).toBe("ALMOX");
    expect(lotacaoVigente(movs, emp, "2026-04-01").areaId).toBe("CEM");
    expect(lotacaoVigente(movs, emp, "2026-07-01").areaId).toBe("RECEBIMENTO");
  });

  it("recusa data final em movimentação definitiva", () => {
    expect(
      validaMovimentacao({
        tipo: "TRANSFERENCIA_DEFINITIVA",
        areaDestinoId: "CEM",
        dataEfetiva: "2026-03-10",
        temporaria: true,
        dataFim: "2026-04-10",
      }),
    ).toContain("Transferência definitiva e retorno à origem não podem ser temporários.");
  });

  it("normaliza definitiva removendo a data final", () => {
    const n = normalizaPorTipo({
      tipo: "TRANSFERENCIA_DEFINITIVA",
      areaDestinoId: "CEM",
      dataEfetiva: "2026-03-10",
      temporaria: true,
      dataFim: "2026-04-10",
    });
    expect(n.temporaria).toBe(false);
    expect(n.dataFim).toBeNull();
  });

  it("pendente não muda a lotação", () => {
    const pendente = mov({ ...transferencia, id: "p1", status: "PENDENTE" });
    expect(lotacaoVigente([pendente], emp, "2026-05-01").areaId).toBe("ALMOX");
  });
});

describe("movimentação temporária", () => {
  const emprestimo = mov({
    tipo: "EMPRESTIMO_TEMPORARIO",
    temporaria: true,
    area_destino_id: "ATIVACAO",
    data_efetiva: "2026-04-01",
    data_fim: "2026-04-30",
  });

  it("vale somente dentro da janela", () => {
    expect(lotacaoVigente([emprestimo], emp, "2026-03-31").areaId).toBe("ALMOX");
    expect(lotacaoVigente([emprestimo], emp, "2026-04-15").areaId).toBe("ATIVACAO");
    expect(lotacaoVigente([emprestimo], emp, "2026-05-01").areaId).toBe("ALMOX");
  });

  it("marca a lotação como temporária durante a janela", () => {
    expect(lotacaoVigente([emprestimo], emp, "2026-04-15").temporaria).toBe(true);
    expect(lotacaoVigente([emprestimo], emp, "2026-05-01").temporaria).toBe(false);
  });

  it("não apaga a lotação definitiva vigente no mesmo dia", () => {
    expect(lotacaoDefinitiva([emprestimo], emp, "2026-04-15").areaId).toBe("ALMOX");
  });

  it("tem precedência sobre a transferência definitiva anterior", () => {
    const transferencia = mov({
      tipo: "TRANSFERENCIA_DEFINITIVA",
      area_destino_id: "CEM",
      data_efetiva: "2026-01-05",
    });
    const movs = [transferencia, emprestimo];
    expect(lotacaoVigente(movs, emp, "2026-04-15").areaId).toBe("ATIVACAO");
    expect(lotacaoVigente(movs, emp, "2026-05-02").areaId).toBe("CEM");
  });

  it("exige data final", () => {
    expect(
      validaMovimentacao({
        tipo: "EMPRESTIMO_TEMPORARIO",
        areaDestinoId: "ATIVACAO",
        dataEfetiva: "2026-04-01",
        temporaria: true,
        dataFim: null,
      }),
    ).toContain("Movimentação temporária exige data final.");
  });

  it("recusa data final anterior ou igual à data efetiva", () => {
    expect(
      validaMovimentacao({
        tipo: "COBERTURA_DE_FERIAS",
        areaDestinoId: "CEM",
        dataEfetiva: "2026-04-10",
        temporaria: true,
        dataFim: "2026-04-01",
      }),
    ).toContain("A data final deve ser posterior à data efetiva.");
    expect(
      validaMovimentacao({
        tipo: "COBERTURA_DE_FERIAS",
        areaDestinoId: "CEM",
        dataEfetiva: "2026-04-10",
        temporaria: true,
        dataFim: "2026-04-10",
      }),
    ).toContain("A data final deve ser posterior à data efetiva.");
  });

  it("recusa origem igual ao destino", () => {
    expect(
      validaMovimentacao({
        tipo: "TRANSFERENCIA_DEFINITIVA",
        areaDestinoId: "CEM",
        areaOrigemId: "CEM",
        shiftOrigemId: "T1",
        shiftDestinoId: "T1",
        dataEfetiva: "2026-04-10",
        temporaria: false,
        dataFim: null,
      }),
    ).toContain("Origem e destino não podem ser iguais (mesmo setor e turno).");
    expect(
      validaMovimentacao({
        tipo: "TROCA_DE_TURNO",
        areaDestinoId: "CEM",
        areaOrigemId: "CEM",
        shiftOrigemId: "T1",
        shiftDestinoId: "T2",
        dataEfetiva: "2026-04-10",
        temporaria: false,
        dataFim: null,
      }),
    ).toHaveLength(0);
  });


  it("detecta sobreposição com outra temporária aprovada", () => {
    const nova = { inicio: "2026-04-20", fim: "2026-05-10" };
    expect(temporariaSobreposta([emprestimo], "e1", nova)?.id).toBe(emprestimo.id);
    expect(temporariaSobreposta([emprestimo], "e1", { inicio: "2026-05-01", fim: "2026-05-10" })).toBeNull();
  });
});

describe("retorno à origem", () => {
  const transferencia = mov({
    tipo: "TRANSFERENCIA_DEFINITIVA",
    area_destino_id: "CEM",
    data_efetiva: "2026-01-10",
  });
  const emprestimo = mov({
    tipo: "EMPRESTIMO_TEMPORARIO",
    temporaria: true,
    area_destino_id: "ATIVACAO",
    data_efetiva: "2026-04-01",
    data_fim: "2026-06-30",
  });

  it("destino sugerido é a lotação definitiva, não a temporária", () => {
    expect(lotacaoVigente([transferencia, emprestimo], emp, "2026-05-01").areaId).toBe("ATIVACAO");
    expect(lotacaoDefinitiva([transferencia, emprestimo], emp, "2026-05-01").areaId).toBe("CEM");
  });

  it("identifica o empréstimo aberto a ser encerrado", () => {
    expect(temporariaAberta([transferencia, emprestimo], "e1", "2026-05-01")?.id).toBe(emprestimo.id);
    expect(temporariaAberta([transferencia, emprestimo], "e1", "2026-07-01")).toBeNull();
  });

  it("encerrado o empréstimo, a lotação volta à área definitiva", () => {
    const encerrado = mov({ ...emprestimo, id: emprestimo.id, data_fim: "2026-04-30" });
    expect(lotacaoVigente([transferencia, encerrado], emp, "2026-05-01").areaId).toBe("CEM");
  });

  it("é sempre permanente", () => {
    const n = normalizaPorTipo({
      tipo: "RETORNO_A_ORIGEM",
      areaDestinoId: "CEM",
      dataEfetiva: "2026-05-01",
      temporaria: true,
      dataFim: "2026-05-30",
    });
    expect(n.temporaria).toBe(false);
    expect(n.dataFim).toBeNull();
    expect(validaMovimentacao(n)).toHaveLength(0);
  });
});
