import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { FeriasFormDialog } from "@/components/ferias/FeriasFormDialog";
import {
  useCatalogos,
  useEmployees,
  useExcluirFerias,
  usePerfil,
  useMovements,
  useReconhecerConflito,
  useVacations,
  type VacationFull,
} from "@/hooks/useSistema";
import { severidadeMax } from "@/lib/conflitos";
import {
  diasEntre,
  fmtData,
  humaniza,
  severidadeClasse,
  SEVERIDADE_LABEL,
} from "@/lib/sistema";

export const Route = createFileRoute("/ferias")({
  validateSearch: (search: Record<string, unknown>) => ({
    registro: typeof search['registro'] === "string" ? (search['registro'] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Programação de Férias por Área | Gestão de Férias" },
      {
        name: "description",
        content:
          "Programe férias por área e turno, indique substitutos e visualize alertas de conflito com regra violada e ação recomendada.",
      },
      { property: "og:title", content: "Programação de Férias por Área" },
      {
        property: "og:description",
        content: "Programação de férias com motor de conflitos, substitutos e alertas críticos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FeriasPage,
});

function FeriasPage() {
  const cat = useCatalogos();
  const emp = useEmployees();
  const fer = useVacations();
  const mov = useMovements();
  const perfil = usePerfil();
  const excluir = useExcluirFerias();
  const reconhecer = useReconhecerConflito();

  const { registro: focoId } = Route.useSearch();
  const navigate = Route.useNavigate();

  const [aba, setAba] = useState("__todas__");
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState<VacationFull | null>(null);

  const areas = cat.data?.areas ?? [];
  const turnos = cat.data?.turnos ?? [];
  const funcoes = cat.data?.funcoes ?? [];
  const nomeArea = (id: string | null) => areas.find((a) => a.id === id)?.nome ?? "—";
  const nomeTurno = (id: string | null) => turnos.find((t) => t.id === id)?.nome ?? "—";
  const nomeFuncao = (id: string | null) => funcoes.find((f) => f.id === id)?.nome ?? "—";

  const areasVisiveis = useMemo(
    () => areas.filter((a) => perfil.podeVerArea(a.id)),
    [areas, perfil],
  );

  const registros = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (fer.data ?? []).filter((v) => {
      if (focoId) return v.id === focoId;
      const area = v.area_id_snapshot ?? v.employee?.area_id ?? null;
      if (aba !== "__todas__" && area !== aba) return false;
      if (!termo) return true;
      return (
        (v.employee?.nome ?? "").toLowerCase().includes(termo) ||
        (v.employee?.re ?? "").includes(termo)
      );
    });
  }, [fer.data, aba, busca, focoId]);

  return (
    <AppShell>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Férias</h1>
            <p className="text-sm text-muted-foreground">
              Programação por área com alertas de conflito calculados no banco de dados.
            </p>
          </div>
          <Button
            onClick={() => {
              setEditando(null);
              setAberto(true);
            }}
          >
            Programar férias
          </Button>
        </div>

        {focoId && (
          <Card className="border-primary/50 bg-accent/30">
            <CardContent className="flex flex-wrap items-center justify-between gap-2 py-3">
              <p className="text-sm text-foreground">
                Rastreando um registro específico vindo do painel executivo.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate({ search: { registro: undefined } })}
              >
                Ver todos os registros
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Input
            placeholder="Buscar por nome ou RE"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="max-w-xs"
          />
          <Tabs value={aba} onValueChange={setAba} className="flex-1">
            <TabsList className="flex h-auto flex-wrap justify-start">
              <TabsTrigger value="__todas__">Todas</TabsTrigger>
              {areasVisiveis.map((a) => (
                <TabsTrigger key={a.id} value={a.id}>
                  {a.nome}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {fer.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : (
          <div className="space-y-2">
            {registros.length === 0 && (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  Nenhum registro de férias para o filtro atual.
                </CardContent>
              </Card>
            )}
            {registros.map((v) => {
              const sev = severidadeMax(v.conflitos);
              return (
                <Card key={v.id}>
                  <CardContent className="space-y-2 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {v.employee?.nome}{" "}
                          <span className="text-muted-foreground">· RE {v.employee?.re ?? "—"}</span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {nomeFuncao(v.employee?.function_id ?? null)} ·{" "}
                          {nomeArea(v.area_id_snapshot ?? v.employee?.area_id ?? null)} ·{" "}
                          {nomeTurno(v.shift_id_snapshot ?? v.employee?.shift_id ?? null)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {fmtData(v.inicio)} — {fmtData(v.fim)} ({diasEntre(v.inicio, v.fim)} dias)
                          {" · "}
                          Substituto: {v.substituto_nome ?? "não indicado"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">
                          {humaniza(v.status)}
                        </Badge>
                        {sev && (
                          <span
                            className={`rounded px-2 py-0.5 text-[10px] font-medium ${severidadeClasse(sev)}`}
                          >
                            {SEVERIDADE_LABEL[sev]}
                          </span>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditando(v);
                            setAberto(true);
                          }}
                        >
                          Editar
                        </Button>
                        {perfil.podeManterCadastro && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={async () => {
                              try {
                                await excluir.mutateAsync(v.id);
                                toast.success("Registro excluído.");
                              } catch (e) {
                                toast.error(
                                  e instanceof Error ? e.message : "Não foi possível excluir.",
                                );
                              }
                            }}
                          >
                            Excluir
                          </Button>
                        )}
                      </div>
                    </div>

                    {v.conflitos.length > 0 && (
                      <ul className="space-y-1 rounded-lg border border-border bg-muted/30 p-2">
                        {v.conflitos.map((c) => (
                          <li key={c.id} className="flex flex-wrap items-center gap-2 text-xs">
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${severidadeClasse(c.severidade)}`}
                            >
                              {SEVERIDADE_LABEL[c.severidade]}
                            </span>
                            <span className="text-muted-foreground">{c.mensagem}</span>
                            {c.overlap_inicio && (
                              <span className="text-muted-foreground">
                                · sobreposição {fmtData(c.overlap_inicio)}–{fmtData(c.overlap_fim)} (
                                {c.dias_coincidentes} dias)
                              </span>
                            )}
                            <span className="text-muted-foreground/70">· regra {c.regra}</span>
                            {perfil.podeAprovar && !c.reconhecido && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2 text-[11px]"
                                onClick={async () => {
                                  await reconhecer.mutateAsync(c.id);
                                  toast.success("Alerta reconhecido.");
                                }}
                              >
                                Reconhecer
                              </Button>
                            )}
                            {c.reconhecido && (
                              <Badge variant="secondary" className="text-[10px]">
                                reconhecido
                              </Badge>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <FeriasFormDialog
        open={aberto}
        onOpenChange={setAberto}
        registro={editando}
        employees={emp.data ?? []}
        funcoes={funcoes}
        areas={areas}
        turnos={turnos}
        movimentacoes={mov.data ?? []}
        regras={cat.data?.regras ?? []}
        ferias={fer.data ?? []}
        nomeArea={nomeArea}
      />

    </AppShell>
  );
}
