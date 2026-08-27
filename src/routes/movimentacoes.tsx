import { useAvisoErro } from "@/hooks/useAvisoErro";
import { rotularCodigo } from "@/lib/mensagens";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { fmtData, humaniza, TIPOS_MOVIMENTACAO } from "@/lib/sistema";

const STATUS = ["PENDENTE", "APROVADA", "REJEITADA", "CANCELADA"] as const;
const TODOS = "__todos__";

export const Route = createFileRoute("/movimentacoes")({
  validateSearch: (search: Record<string, unknown>) => ({
    registro: typeof search['registro'] === "string" ? (search['registro'] as string) : undefined,
  }),
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
  const avisarErro = useAvisoErro();
  const decidir = useDecidirMovimentacao();

  const { registro: focoId } = Route.useSearch();
  const navigate = Route.useNavigate();

  const [busca, setBusca] = useState("");
  const [fTipo, setFTipo] = useState<string>(TODOS);
  const [fStatus, setFStatus] = useState<string>(TODOS);
  const [fArea, setFArea] = useState<string>(TODOS);
  const [fVinculo, setFVinculo] = useState<string>(TODOS);
  const [soPendentes, setSoPendentes] = useState(false);
  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState<MovementFull | null>(null);
  const [historicoDe, setHistoricoDe] = useState<MovementFull | null>(null);

  const areas = cat.data?.areas ?? [];
  const turnos = cat.data?.turnos ?? [];
  const nomeArea = (id: string | null) => areas.find((a) => a.id === id)?.nome ?? "—";
  const nomeTurno = (id: string | null) => turnos.find((t) => t.id === id)?.nome ?? "—";

  const todas = mov.data ?? [];
  const pendentes = todas.filter((m) => m.status === "PENDENTE");
  const hoje = new Date().toISOString().slice(0, 10);
  const temporariasVigentes = todas.filter(
    (m) =>
      m.status === "APROVADA" &&
      m.temporaria &&
      m.data_efetiva <= hoje &&
      (m.data_fim ?? "9999-12-31") >= hoje,
  );

  const registros = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return todas.filter((m) => {
      if (focoId) return m.id === focoId;
      if (termo && !(m.employee?.nome ?? "").toLowerCase().includes(termo) && !(m.re ?? "").includes(termo))
        return false;
      if (fTipo !== TODOS && m.tipo !== fTipo) return false;
      if (soPendentes ? m.status !== "PENDENTE" : fStatus !== TODOS && m.status !== fStatus)
        return false;
      if (fArea !== TODOS && m.area_origem_id !== fArea && m.area_destino_id !== fArea) return false;
      if (fVinculo === "TEMPORARIA" && !m.temporaria) return false;
      if (fVinculo === "DEFINITIVA" && m.temporaria) return false;
      return true;
    });
  }, [todas, busca, focoId, fTipo, fStatus, fArea, fVinculo, soPendentes]);

  const historico = useMemo(() => {
    if (!historicoDe) return [];
    return todas
      .filter((m) => m.employee_id === historicoDe.employee_id)
      .slice()
      .sort((a, b) => b.data_efetiva.localeCompare(a.data_efetiva));
  }, [todas, historicoDe]);

  const feriasDoColaborador = (employeeId: string) =>
    (fer.data ?? [])
      .filter((v) => v.employee_id === employeeId && v.status !== "CANCELADA")
      .map((v) => ({ inicio: v.inicio, fim: v.fim }));

  const limparFiltros = () => {
    setBusca("");
    setFTipo(TODOS);
    setFStatus(TODOS);
    setFArea(TODOS);
    setFVinculo(TODOS);
    setSoPendentes(false);
  };

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

        <div className="grid gap-3 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => {
              setSoPendentes(true);
              setFStatus(TODOS);
            }}
            className="rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-accent"
          >
            <p className="text-xs text-muted-foreground">Pendentes de aprovação</p>
            <p className="text-2xl font-semibold text-foreground">{pendentes.length}</p>
          </button>
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">Temporárias vigentes hoje</p>
            <p className="text-2xl font-semibold text-foreground">{temporariasVigentes.length}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">Total registrado</p>
            <p className="text-2xl font-semibold text-foreground">{todas.length}</p>
          </div>
        </div>

        {focoId && (
          <Card className="border-primary/50 bg-accent/30">
            <CardContent className="flex flex-wrap items-center justify-between gap-2 py-3">
              <p className="text-sm text-foreground">
                Rastreando uma movimentação específica vinda do painel executivo.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate({ search: { registro: undefined } })}
              >
                Ver todas as movimentações
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Buscar por nome ou RE"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="max-w-xs"
          />
          <Select value={fTipo} onValueChange={setFTipo}>
            <SelectTrigger className="w-[190px]">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos os tipos</SelectItem>
              {TIPOS_MOVIMENTACAO.map((t) => (
                <SelectItem key={t} value={t}>
                  {rotularCodigo(t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={soPendentes ? "PENDENTE" : fStatus}
            onValueChange={(v) => {
              setSoPendentes(false);
              setFStatus(v);
            }}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos os status</SelectItem>
              {STATUS.map((s) => (
                <SelectItem key={s} value={s}>
                  {rotularCodigo(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={fArea} onValueChange={setFArea}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Setor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos os setores</SelectItem>
              {areas.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={fVinculo} onValueChange={setFVinculo}>
            <SelectTrigger className="w-[170px]">
              <SelectValue placeholder="Vínculo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Temporárias e definitivas</SelectItem>
              <SelectItem value="TEMPORARIA">Somente temporárias</SelectItem>
              <SelectItem value="DEFINITIVA">Somente definitivas</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" onClick={limparFiltros}>
            Limpar filtros
          </Button>
        </div>

        {mov.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : (
          <div className="space-y-2">
            {registros.length === 0 && (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  Nenhuma movimentação encontrada com os filtros atuais.
                </CardContent>
              </Card>
            )}
            {registros.map((m) => (
              <Card key={m.id}>
                <CardContent className="flex flex-wrap items-start justify-between gap-3 py-4">
                  <div>
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                      {m.employee?.nome} <span className="text-muted-foreground">· RE {m.re}</span>
                      {m.temporaria && (
                        <Badge className="bg-amber-500/15 text-[10px] text-amber-700 dark:text-amber-400">
                          Temporário
                        </Badge>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {rotularCodigo(m.tipo)} · {nomeArea(m.area_origem_id)} → {nomeArea(m.area_destino_id)}
                      {" · "}
                      {nomeTurno(m.shift_origem_id)} → {nomeTurno(m.shift_destino_id)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Efetiva em {fmtData(m.data_efetiva)}
                      {m.temporaria
                        ? ` · retorno previsto em ${fmtData(m.data_fim)}`
                        : " · definitiva"}
                      {m.motivo ? ` · ${m.motivo}` : ""}
                    </p>
                    {m.observacao && (
                      <p className="mt-1 text-xs text-muted-foreground">Obs.: {m.observacao}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      {rotularCodigo(m.status)}
                    </Badge>
                    <Button size="sm" variant="ghost" onClick={() => setHistoricoDe(m)}>
                      Histórico
                    </Button>
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
                            try {
                              await decidir.mutateAsync({ id: m.id, status: "APROVADA" });
                              toast.success("Movimentação aprovada. Conflitos recalculados.");
                            } catch (e) {
                              avisarErro(e, "Não foi possível aprovar a movimentação. Tente novamente.");
                            }
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
                    {perfil.podeAprovar && m.status === "APROVADA" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          await decidir.mutateAsync({ id: m.id, status: "CANCELADA" });
                          toast.success("Movimentação cancelada — a alocação não é alterada.");
                        }}
                      >
                        Cancelar
                      </Button>
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
        movimentacoes={todas}
        feriasDoColaborador={feriasDoColaborador}
      />

      <Dialog open={!!historicoDe} onOpenChange={(o) => !o && setHistoricoDe(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Histórico de {historicoDe?.employee?.nome ?? "colaborador"}</DialogTitle>
            <DialogDescription>
              RE {historicoDe?.re} · todos os registros são preservados, nada é sobrescrito.
            </DialogDescription>
          </DialogHeader>
          <ol className="space-y-2">
            {historico.map((h) => (
              <li key={h.id} className="rounded-lg border border-border p-3 text-xs">
                <p className="flex flex-wrap items-center gap-2 font-medium text-foreground">
                  {fmtData(h.data_efetiva)} · {rotularCodigo(h.tipo)}
                  <Badge variant="outline" className="text-[10px]">
                    {rotularCodigo(h.status)}
                  </Badge>
                  {h.temporaria && (
                    <Badge className="bg-amber-500/15 text-[10px] text-amber-700 dark:text-amber-400">
                      Temporário
                    </Badge>
                  )}
                </p>
                <p className="mt-1 text-muted-foreground">
                  {nomeArea(h.area_origem_id)} → {nomeArea(h.area_destino_id)} ·{" "}
                  {nomeTurno(h.shift_origem_id)} → {nomeTurno(h.shift_destino_id)}
                  {h.temporaria ? ` · retorno previsto em ${fmtData(h.data_fim)}` : ""}
                </p>
                {h.motivo && <p className="mt-1 text-muted-foreground">Motivo: {h.motivo}</p>}
              </li>
            ))}
          </ol>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
