import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { MovimentacaoDialog } from "@/components/movimentacoes/MovimentacaoDialog";
import {
  useCatalogos,
  useDecidirMovimentacao,
  useEmployees,
  useMovements,
  usePerfil,
  useVacations,
  type MovementFull,
} from "@/hooks/useSistema";
import { fmtData, humaniza } from "@/lib/sistema";

export const Route = createFileRoute("/movimentacoes")({
  head: () => ({
    meta: [
      { title: "Movimentações de Colaboradores | Gestão de Férias" },
      {
        name: "description",
        content:
          "Transferências definitivas, empréstimos temporários, coberturas e trocas de turno com histórico completo e aprovação.",
      },
      { property: "og:title", content: "Movimentações de Colaboradores" },
      {
        property: "og:description",
        content: "Controle de transferências, empréstimos e coberturas com histórico e aprovações.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MovimentacoesPage,
});

function MovimentacoesPage() {
  const cat = useCatalogos();
  const emp = useEmployees();
  const mov = useMovements();
  const fer = useVacations();
  const perfil = usePerfil();
  const decidir = useDecidirMovimentacao();

  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState<MovementFull | null>(null);

  const areas = cat.data?.areas ?? [];
  const turnos = cat.data?.turnos ?? [];
  const nomeArea = (id: string | null) => areas.find((a) => a.id === id)?.nome ?? "—";
  const nomeTurno = (id: string | null) => turnos.find((t) => t.id === id)?.nome ?? "—";

  const registros = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (mov.data ?? []).filter(
      (m) =>
        !termo ||
        (m.employee?.nome ?? "").toLowerCase().includes(termo) ||
        (m.re ?? "").includes(termo),
    );
  }, [mov.data, busca]);

  const feriasDoColaborador = (employeeId: string) =>
    (fer.data ?? [])
      .filter((v) => v.employee_id === employeeId && v.status !== "CANCELADA")
      .map((v) => ({ inicio: v.inicio, fim: v.fim }));

  return (
    <AppShell>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Movimentações</h1>
            <p className="text-sm text-muted-foreground">
              Histórico completo de transferências, empréstimos, coberturas e trocas de turno.
            </p>
          </div>
          {perfil.podeManterCadastro && (
            <Button
              onClick={() => {
                setEditando(null);
                setAberto(true);
              }}
            >
              Nova movimentação
            </Button>
          )}
        </div>

        <Input
          placeholder="Buscar por nome ou RE"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="max-w-xs"
        />

        {mov.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : (
          <div className="space-y-2">
            {registros.length === 0 && (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  Nenhuma movimentação registrada.
                </CardContent>
              </Card>
            )}
            {registros.map((m) => (
              <Card key={m.id}>
                <CardContent className="flex flex-wrap items-start justify-between gap-3 py-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {m.employee?.nome} <span className="text-muted-foreground">· RE {m.re}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {humaniza(m.tipo)} · {nomeArea(m.area_origem_id)} → {nomeArea(m.area_destino_id)}
                      {" · "}
                      {nomeTurno(m.shift_origem_id)} → {nomeTurno(m.shift_destino_id)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Efetiva em {fmtData(m.data_efetiva)}
                      {m.temporaria ? ` · temporária até ${fmtData(m.data_fim)}` : " · definitiva"}
                      {m.motivo ? ` · ${m.motivo}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      {humaniza(m.status)}
                    </Badge>
                    {perfil.podeManterCadastro && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditando(m);
                          setAberto(true);
                        }}
                      >
                        Editar
                      </Button>
                    )}
                    {perfil.podeAprovar && m.status === "PENDENTE" && (
                      <>
                        <Button
                          size="sm"
                          onClick={async () => {
                            await decidir.mutateAsync({ id: m.id, status: "APROVADA" });
                            toast.success("Movimentação aprovada.");
                          }}
                        >
                          Aprovar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            await decidir.mutateAsync({ id: m.id, status: "REJEITADA" });
                            toast.success("Movimentação rejeitada.");
                          }}
                        >
                          Rejeitar
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <MovimentacaoDialog
        open={aberto}
        onOpenChange={setAberto}
        registro={editando}
        employees={emp.data ?? []}
        areas={areas}
        turnos={turnos}
        feriasDoColaborador={feriasDoColaborador}
      />
    </AppShell>
  );
}
