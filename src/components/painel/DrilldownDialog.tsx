import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import type { MovementFull, VacationFull } from "@/hooks/useSistema";
import {
  fmtData,
  humaniza,
  severidadeClasse,
  SEVERIDADE_LABEL,
  type Severidade,
} from "@/lib/sistema";
import { severidadeMax } from "@/lib/conflitos";
import type { RegistroFoco } from "@/components/painel/RegistroDialog";
import { Button } from "@/components/ui/button";
import { Download, FileSpreadsheet } from "lucide-react";
import type { Tabela } from "@/lib/relatorios";

type Base = { titulo: string; indicador: string; tabela: Tabela; extras?: Tabela[] };

export type Drilldown =
  | (Base & { tipo: "ferias"; itens: VacationFull[] })
  | (Base & { tipo: "movimentacoes"; itens: MovementFull[] })
  | (Base & { tipo: "tabela" })
  | null;

export function DrilldownDialog({
  data,
  onClose,
  onAbrirRegistro,
  onExportar,
  exportando,
  nomeArea,
  nomeTurno,
  nomeFuncao,
}: {
  data: Drilldown;
  onClose: () => void;
  onAbrirRegistro: (r: RegistroFoco) => void;
  onExportar: (d: NonNullable<Drilldown>, formato: "XLSX" | "CSV") => void;
  exportando: boolean;
  nomeArea: (id: string | null) => string;
  nomeTurno: (id: string | null) => string;
  nomeFuncao: (id: string | null) => string;
}) {
  return (
    <Dialog open={!!data} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{data?.titulo}</DialogTitle>
          <DialogDescription>
            {data
              ? `${data.tabela.linhas.length} registro(s) compõem este indicador. Clique em um item para abrir o registro de origem e a trilha de auditoria.`
              : ""}
          </DialogDescription>
        </DialogHeader>

        {data && (
          <div className="flex flex-wrap gap-2 border-b border-border pb-3">
            <Button
              size="sm"
              variant="outline"
              disabled={exportando}
              onClick={() => onExportar(data, "XLSX")}
            >
              <FileSpreadsheet className="mr-1.5 h-4 w-4" /> Exportar Excel
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={exportando}
              onClick={() => onExportar(data, "CSV")}
            >
              <Download className="mr-1.5 h-4 w-4" /> Exportar CSV
            </Button>
            <span className="self-center text-xs text-muted-foreground">
              A exportação respeita os filtros ativos do painel.
            </span>
          </div>
        )}

        {data?.tipo === "tabela" && (
          <div className="overflow-x-auto">
            {data.tabela.linhas.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum registro.</p>
            )}
            {data.tabela.linhas.length > 0 && (
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground">
                  <tr className="border-b border-border">
                    {data.tabela.colunas.map((c) => (
                      <th key={c} className="whitespace-nowrap py-2 pr-3 text-left font-medium">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.tabela.linhas.map((l, i) => (
                    <tr key={i} className="border-b border-border/60">
                      {l.map((v, j) => (
                        <td key={j} className="whitespace-nowrap py-1.5 pr-3">
                          {v}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {data?.tipo === "ferias" && (
          <div className="space-y-2">
            {data.itens.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum registro.</p>
            )}
            {data.itens.map((v) => {
              const sev = severidadeMax(v.conflitos);
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => onAbrirRegistro({ tipo: "ferias", item: v })}
                  className="w-full rounded-lg border border-border p-3 text-left transition-colors hover:border-primary/60 hover:bg-accent/40"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {v.employee?.nome} <span className="text-muted-foreground">· RE {v.employee?.re}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {nomeFuncao(v.employee?.function_id ?? null)} · {nomeArea(v.area_id_snapshot)} ·{" "}
                        {nomeTurno(v.shift_id_snapshot)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {fmtData(v.inicio)} — {fmtData(v.fim)}
                      </span>
                      <Badge variant="outline" className="text-[10px]">
                        {humaniza(v.status)}
                      </Badge>
                      {sev && (
                        <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${severidadeClasse(sev)}`}>
                          {SEVERIDADE_LABEL[sev as Severidade]}
                        </span>
                      )}
                    </div>
                  </div>
                  {v.conflitos.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {v.conflitos.map((c) => (
                        <li key={c.id} className="text-xs text-muted-foreground">
                          <span className={`mr-2 rounded px-1.5 py-0.5 text-[10px] ${severidadeClasse(c.severidade)}`}>
                            {SEVERIDADE_LABEL[c.severidade]}
                          </span>
                          {c.mensagem}
                        </li>
                      ))}
                    </ul>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {data?.tipo === "movimentacoes" && (
          <div className="space-y-2">
            {data.itens.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum registro.</p>
            )}
            {data.itens.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onAbrirRegistro({ tipo: "movimentacao", item: m })}
                className="w-full rounded-lg border border-border p-3 text-left transition-colors hover:border-primary/60 hover:bg-accent/40"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {m.employee?.nome} <span className="text-muted-foreground">· RE {m.re}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {humaniza(m.tipo)} · {nomeArea(m.area_origem_id)} → {nomeArea(m.area_destino_id)}
                      {m.shift_destino_id ? ` · turno ${nomeTurno(m.shift_destino_id)}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {fmtData(m.data_efetiva)}
                    {m.temporaria ? ` — ${fmtData(m.data_fim)}` : ""}
                    <Badge variant="outline" className="text-[10px]">
                      {humaniza(m.status)}
                    </Badge>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
