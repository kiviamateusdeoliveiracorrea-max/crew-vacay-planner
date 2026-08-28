import { describe, expect, it } from "vitest";
import {
  concluidaNoAno,
  dataRetorno,
  emFeriasEm,
  feriasAtiva,
  situacaoFerias,
} from "@/lib/situacao-ferias";

const HOJE = "2026-08-27";
const f = (inicio: string | null, fim: string | null, status = "PLANEJADA") => ({
  inicio,
  fim,
  status,
});

describe("TESTE - situação automática das férias", () => {
  it("1. férias futuras ficam como PROGRAMADA", () => {
    expect(situacaoFerias(f("2026-09-10", "2026-09-20"), HOJE)).toBe("PROGRAMADA");
  });

  it("2. férias em andamento ficam como EM_GOZO", () => {
    expect(situacaoFerias(f("2026-08-20", "2026-09-02"), HOJE)).toBe("EM_GOZO");
  });

  it("3. retorno na data atual (fim ontem) fica CONCLUIDA", () => {
    expect(dataRetorno(f("2026-08-01", "2026-08-26"))).toBe("2026-08-27");
    expect(situacaoFerias(f("2026-08-01", "2026-08-26"), HOJE)).toBe("CONCLUIDA");
  });

  it("3b. retorno amanhã continua EM_GOZO", () => {
    expect(situacaoFerias(f("2026-08-01", "2026-08-27"), HOJE)).toBe("EM_GOZO");
  });

  it("4. retorno no dia anterior fica CONCLUIDA", () => {
    expect(situacaoFerias(f("2026-08-01", "2026-08-25"), HOJE)).toBe("CONCLUIDA");
  });

  it("5. cancelada continua CANCELADA mesmo com datas vencidas", () => {
    expect(situacaoFerias(f("2026-01-01", "2026-01-10", "CANCELADA"), HOJE)).toBe("CANCELADA");
    expect(feriasAtiva(f("2026-01-01", "2026-01-10", "CANCELADA"), HOJE)).toBe(false);
  });

  it("6. datas ausentes ou invertidas não são concluídas automaticamente", () => {
    expect(situacaoFerias(f("2026-08-01", null), HOJE)).toBe("PENDENTE_DE_VALIDACAO");
    expect(situacaoFerias(f(null, "2026-08-01"), HOJE)).toBe("PENDENTE_DE_VALIDACAO");
    expect(situacaoFerias(f("2026-08-10", "2026-08-01"), HOJE)).toBe("ERRO_DE_DATA");
  });

  it("8. chamada histórica dentro do período mantém férias", () => {
    expect(emFeriasEm(f("2026-08-01", "2026-08-10"), "2026-08-05")).toBe(true);
  });

  it("9. chamada na data de retorno não marca férias", () => {
    expect(emFeriasEm(f("2026-08-01", "2026-08-10"), "2026-08-11")).toBe(false);
  });

  it("11. filtros: ativas excluem concluídas e canceladas", () => {
    const base = [
      f("2026-09-01", "2026-09-10"),
      f("2026-08-20", "2026-09-02"),
      f("2026-07-01", "2026-07-10"),
      f("2026-09-01", "2026-09-10", "CANCELADA"),
    ];
    expect(base.filter((v) => feriasAtiva(v, HOJE))).toHaveLength(2);
    expect(base.filter((v) => situacaoFerias(v, HOJE) === "CONCLUIDA")).toHaveLength(1);
  });

  it("12. indicador de concluídas no ano considera o ano do retorno", () => {
    expect(concluidaNoAno(f("2026-07-01", "2026-07-10"), "2026", HOJE)).toBe(true);
    expect(concluidaNoAno(f("2025-12-01", "2025-12-10"), "2026", HOJE)).toBe(false);
  });
});
