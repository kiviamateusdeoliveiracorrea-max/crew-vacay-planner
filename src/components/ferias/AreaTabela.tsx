import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CalendarPlus, Pencil, Trash2 } from "lucide-react";
import { fmt, severidadeDe, type Colaborador, type Conflito, type Registro } from "@/lib/ferias";

export function AreaTabela({
  colaboradores,
  registros,
  mapa,
  onLancar,
  onEditar,
  onExcluir,
}: {
  colaboradores: Colaborador[];
  registros: Registro[];
  mapa: Map<string, Conflito[]>;
  onLancar: (c: Colaborador) => void;
  onEditar: (c: Colaborador, r: Registro) => void;
  onExcluir: (r: Registro) => void;
}) {
  const porColaborador = new Map<string, Registro[]>();
  for (const r of registros) {
    porColaborador.set(r.colaborador_id, [...(porColaborador.get(r.colaborador_id) ?? []), r]);
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[28%]">Colaborador</TableHead>
            <TableHead>Função</TableHead>
            <TableHead>Turno</TableHead>
            <TableHead>Períodos de férias</TableHead>
            <TableHead className="text-right">Ação</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {colaboradores.map((c) => {
            const lista = porColaborador.get(c.id) ?? [];
            return (
              <TableRow key={c.id}>
                <TableCell className="align-top">
                  <div className="font-medium">{c.nome}</div>
                  <div className="text-xs text-muted-foreground">RE {c.re ?? "—"}</div>
                </TableCell>
                <TableCell className="align-top">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm">{c.funcao}</span>
                    {c.funcao_chave && (
                      <Badge variant="outline" className="border-critical text-critical">
                        chave
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="align-top text-sm text-muted-foreground">{c.turno ?? "—"}</TableCell>
                <TableCell className="align-top">
                  {lista.length === 0 ? (
                    <span className="text-sm text-muted-foreground">sem programação</span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {lista.map((r) => {
                        const sev = severidadeDe(mapa.get(r.id));
                        return (
                          <span
                            key={r.id}
                            className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${
                              sev === "critico"
                                ? "border-critical/40 bg-critical/10 text-critical"
                                : sev === "alerta"
                                  ? "border-warning/50 bg-warning/20 text-warning-foreground"
                                  : "border-border bg-secondary text-secondary-foreground"
                            }`}
                          >
                            {fmt(r.inicio)} → {fmt(r.fim)}
                            <button
                              type="button"
                              aria-label="Editar período"
                              onClick={() => onEditar(c, r)}
                              className="opacity-60 hover:opacity-100"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              aria-label="Excluir período"
                              onClick={() => onExcluir(r)}
                              className="opacity-60 hover:opacity-100"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-right align-top">
                  <Button size="sm" variant="outline" onClick={() => onLancar(c)}>
                    <CalendarPlus className="mr-1 h-4 w-4" /> Férias
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
