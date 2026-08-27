/** Geração dos arquivos XLSX e CSV no navegador. Nenhuma escrita no banco. */
import * as XLSX from "xlsx";
import type { Tabela } from "@/lib/relatorios";

const baixar = (blob: Blob, nome: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
};

export const nomeArquivo = (rel: string, ext: string) =>
  `${rel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${new Date().toISOString().slice(0, 10)}.${ext}`;

/** CSV com BOM para o Excel abrir acentuação corretamente. */
export function montarCsv(t: Tabela): string {
  const escapa = (v: string | number) => {
    const s = String(v ?? "");
    return /[";\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  return [t.colunas, ...t.linhas].map((l) => l.map(escapa).join(";")).join("\r\n");
}

export function exportarCsv(t: Tabela, nome: string) {
  baixar(new Blob([`\uFEFF${montarCsv(t)}`], { type: "text/csv;charset=utf-8" }), nomeArquivo(nome, "csv"));
}

function planilha(t: Tabela) {
  const ws = XLSX.utils.aoa_to_sheet([t.colunas, ...t.linhas]);
  const ref = XLSX.utils.decode_range(ws["!ref"]!);
  ws["!autofilter"] = { ref: XLSX.utils.encode_range(ref) };
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };
  ws["!panes"] = [{ ySplit: 1, topLeftCell: "A2", activePane: "bottomLeft", state: "frozen" }];
  ws["!cols"] = t.colunas.map((c, i) => ({
    wch: Math.min(46, Math.max(c.length + 2, ...t.linhas.slice(0, 200).map((l) => String(l[i] ?? "").length + 2))),
  }));
  return ws;
}

/** Um arquivo Excel com as abas de dados + "Parâmetros do Relatório". */
export function exportarXlsx(tabelas: Tabela[], parametros: (string | number)[][], nome: string) {
  const wb = XLSX.utils.book_new();
  for (const t of tabelas) {
    XLSX.utils.book_append_sheet(wb, planilha(t), t.nome.slice(0, 31));
  }
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([["Parâmetro", "Valor"], ...parametros]),
    "Parâmetros do Relatório",
  );
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  baixar(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    nomeArquivo(nome, "xlsx"),
  );
}

/** CSV com bloco de cabeçalho (indicador, filtros, data/hora, usuário) antes dos dados. */
export function exportarCsvComCabecalho(t: Tabela, parametros: (string | number)[][], nome: string) {
  const cabecalho = montarCsv({ nome: "Parâmetros", colunas: ["Parâmetro", "Valor"], linhas: parametros });
  const corpo = montarCsv(t);
  baixar(
    new Blob([`\uFEFF${cabecalho}\r\n\r\n${corpo}`], { type: "text/csv;charset=utf-8" }),
    nomeArquivo(nome, "csv"),
  );
}
