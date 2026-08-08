import { Badge } from "@/components/ui/badge";
import { fmt, type Conflito, type Registro } from "@/lib/ferias";

export function AlertasPanel({
  registros,
  mapa,
  onSelecionar,
}: {
  registros: Registro[];
  mapa: Map<string, Conflito[]>;
  onSelecionar: (area: string) => void;
}) {
  const criticos = registros.filter((r) => (mapa.get(r.id) ?? []).some((c) => c.severidade === "critico"));
  const atencao = registros.filter(
    (r) =>
      (mapa.get(r.id) ?? []).length > 0 && !(mapa.get(r.id) ?? []).some((c) => c.severidade === "critico"),
  );
  const lista = [...criticos, ...atencao];

  if (lista.length === 0) {
    return (
      <div className="rounded-lg border border-success/40 bg-success/10 p-4">
        <p className="font-semibold text-success">Nenhum conflito de férias no momento.</p>
        <p className="text-sm text-muted-foreground">
          Nenhuma sobreposição de mesma função dentro da área ou entre áreas.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold">Alertas de conflito</h2>
        <Badge variant="destructive">{criticos.length} crítico(s)</Badge>
        <Badge className="bg-warning text-warning-foreground hover:bg-warning">{atencao.length} atenção</Badge>
      </div>
      <ul className="max-h-72 space-y-2 overflow-auto pr-1">
        {lista.map((r) => {
          const cs = mapa.get(r.id) ?? [];
          const critico = cs.some((c) => c.severidade === "critico");
          return (
            <li
              key={r.id}
              onClick={() => onSelecionar(r.colaborador.area)}
              className={`cursor-pointer rounded-md border p-3 text-sm transition-colors ${
                critico
                  ? "border-critical/40 bg-critical/10 hover:bg-critical/15"
                  : "border-warning/50 bg-warning/15 hover:bg-warning/25"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2 font-medium">
                <span>{r.colaborador.nome}</span>
                {r.colaborador.funcao_chave && (
                  <Badge variant="outline" className="border-critical text-critical">
                    Função-chave
                  </Badge>
                )}
                <span className="text-muted-foreground">
                  {r.colaborador.area} · {r.colaborador.funcao} · {fmt(r.inicio)} a {fmt(r.fim)}
                </span>
              </div>
              <ul className="mt-1 list-inside list-disc text-muted-foreground">
                {cs.map((c, i) => (
                  <li key={i}>{c.mensagem}</li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
