import { describe, expect, it } from "vitest";
import {
  COLUNAS_A_VENCER_PAINEL,
  ctxPainel,
  filtrosDoPainel,
  parametrosPainel,
  tabelaAgregada,
  tabelaAVencerPainel,
  tabelaFeriasPainel,
} from "@/lib/painel-export";

const cat = {
  areas: [{ id: "a1", nome: "TESTE - Expedição", unit_id: "u1" }],
  turnos: [{ id: "t1", nome: "TESTE - 1º turno" }],
  funcoes: [{ id: "f1", nome: "TESTE - Operador de empilhadeira", funcao_chave: true }],
  unidades: [{ id: "u1", nome: "TESTE - CD Norte" }],
};
const ctx = ctxPainel(cat, [] as never, null);

const emp = {
  id: "e1",
  re: "TESTE-001",
  nome: "TESTE - Ana",
  area_id: "a1",
  shift_id: "t1",
  function_id: "f1",
  lider: "TESTE - Bruno",
  status: "ATIVO",
  data_admissao: "2022-01-10",
  updated_at: "2026-01-01T00:00:00Z",
};

const feria = {
  id: "v1",
  employee_id: "e1",
  employee: emp,
  inicio: "2026-03-02",
  fim: "2026-03-11",
  status: "APROVADA",
  area_id_snapshot: "a1",
  shift_id_snapshot: "t1",
  function_id_snapshot: "f1",
  substituto_nome: "TESTE - Carlos",
  aprovado_por: null,
  aprovado_em: null,
  observacao: null,
  conflitos: [],
};

describe("exportação do painel", () => {
  it("converte o mês do painel em período de filtro", () => {
    expect(filtrosDoPainel({ unidade: "", area: "", turno: "", funcao: "", mes: "2026-02", status: "", criticidade: "" }))
      .toMatchObject({ inicio: "2026-02-01", fim: "2026-02-28" });
  });

  it("exporta os registros que formam o indicador de férias", () => {
    const t = tabelaFeriasPainel(ctx, [feria] as never);
    expect(t.linhas).toHaveLength(1);
    expect(t.linhas[0]![0]).toBe("TESTE-001");
    expect(t.colunas).toContain("Substituto");
  });

  it("férias a vencer traz colaborador, RE, área, saldo, limite, criticidade, substituto e responsável", () => {
    const t = tabelaAVencerPainel(ctx, [emp] as never, [feria] as never);
    expect(t.colunas).toEqual(COLUNAS_A_VENCER_PAINEL);
    expect(t.linhas[0]![1]).toBe("TESTE-001");
    expect(t.linhas[0]![2]).toBe("TESTE - Expedição");
    expect(t.linhas[0]![6]).toBe("TESTE - Carlos");
    expect(t.linhas[0]![7]).toBe("TESTE - Bruno");
  });

  it("gráfico exporta os dados agregados, não apenas a imagem", () => {
    const t = tabelaAgregada("Férias por área", "Área", [["TESTE - Expedição", 3]]);
    expect(t.linhas).toEqual([["TESTE - Expedição", 3]]);
  });

  it("cabeçalho informa origem, indicador, data/hora, usuário e filtros", () => {
    const p = parametrosPainel(
      "Férias críticas",
      filtrosDoPainel({ unidade: "", area: "a1", turno: "", funcao: "", mes: "2026-03", status: "", criticidade: "CRITICO" }),
      "teste@empresa.com",
      { area: "TESTE - Expedição" },
    );
    const mapa = Object.fromEntries(p.map((l) => [l[0], l[1]]));
    expect(mapa["Indicador de origem"]).toBe("Férias críticas");
    expect(mapa["Usuário que exportou"]).toBe("teste@empresa.com");
    expect(mapa["Área"]).toBe("TESTE - Expedição");
    expect(mapa["Criticidade"]).toBe("CRITICO");
    expect(String(mapa["Data e hora da exportação"])).not.toHaveLength(0);
  });
});
