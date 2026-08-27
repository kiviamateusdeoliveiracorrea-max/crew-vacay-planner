import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { useCatalogos, useEmployees, useMovements, usePerfil, useVacations } from "@/hooks/useSistema";
import {
  useAbrirChamada,
  useAtualizarRegistro,
  useChamadas,
  useCorrecoes,
  useCorrigirRegistro,
  useFecharChamada,
  useMotivos,
  useReabrirChamada,
  useRegistros,
} from "@/hooks/useChamada";
import {
  ACOES_RAPIDAS,
  bloqueiosFechamento,
  MARCA_DIVERGENCIA,
  montarPrevistos,
  resumir,
  statusClasse,
  STATUS_CHAMADA_LABEL,
  STATUS_PRESENCA_LABEL,
  type ChamadaRegistro,
  type StatusPresenca,
} from "@/lib/chamada";
import { fmtData, fmtDataHora } from "@/lib/sistema";

const SEM_TURNO = "__sem_turno__";

export const Route = createFileRoute("/chamada")({
  head: () => ({
    meta: [
      { title: "Chamada Diária | Gestão de Férias" },
      {
        name: "description",
        content:
          "Controle gerencial diário de presença operacional por área e turno, com ocorrências, fechamento e reabertura auditada.",
      },
      { property: "og:title", content: "Chamada Diária" },
      {
        property: "og:description",
        content: "Presença operacional diária por área e turno, com ocorrências e trilha de auditoria.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ChamadaPage,
});

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

function ChamadaPage() {
  const perfil = usePerfil();
  const catalogos = useCatalogos();
  const employees = useEmployees();
  const movements = useMovements();
  const vacations = useVacations();
  const motivos = useMotivos();
  const chamadas = useChamadas();

  const [data, setData] = useState(hoje);
  const [areaId, setAreaId] = useState<string>("");
  const [shiftId, setShiftId] = useState<string>(SEM_TURNO);
  const [selecionada, setSelecionada] = useState<string | null>(null);

  const registros = useRegistros(selecionada);
  const abrir = useAbrirChamada();
  const atualizar = useAtualizarRegistro();
  const fechar = useFecharChamada();
  const reabrir = useReabrirChamada();
  const corrigir = useCorrigirRegistro();

  const [dlgFechar, setDlgFechar] = useState(false);
  const [confirmarPendentes, setConfirmarPendentes] = useState(true);
  const [dlgReabrir, setDlgReabrir] = useState(false);
  const [justificativa, setJustificativa] = useState("");
  const [historicoDe, setHistoricoDe] = useState<ChamadaRegistro | null>(null);
  const [correcaoDe, setCorrecaoDe] = useState<ChamadaRegistro | null>(null);
  const [divergenciaDe, setDivergenciaDe] = useState<{
    registro: ChamadaRegistro;
    status: StatusPresenca;
    motivo?: string | undefined;
  } | null>(null);
  const [tratativa, setTratativa] = useState("");


  const areas = useMemo(
    () =>
      (catalogos.data?.areas ?? []).filter(
        (a) => a.ativo && (perfil.tem("ADMIN") || perfil.tem("ANALISTA") || perfil.podeVerArea(a.id)),
      ),
    [catalogos.data, perfil],
  );
  const turnos = catalogos.data?.turnos ?? [];
  const unidades = catalogos.data?.unidades ?? [];
  const nomeArea = (id: string | null) => areas.find((a) => a.id === id)?.nome ?? "—";
  const nomeTurno = (id: string | null) => turnos.find((t) => t.id === id)?.nome ?? "—";
  const nomeUnidade = (id: string | null) => unidades.find((u) => u.id === id)?.nome ?? "—";

  const previstos = useMemo(() => {
    if (!areaId || !employees.data || !movements.data || !vacations.data || !catalogos.data)
      return [];
    return montarPrevistos(
      {
        employees: employees.data,
        movimentacoes: movements.data,
        ferias: vacations.data,
        funcoes: catalogos.data.funcoes,
      },
      data,
      areaId,
      shiftId === SEM_TURNO ? null : shiftId,
    );
  }, [areaId, shiftId, data, employees.data, movements.data, vacations.data, catalogos.data]);

  const dia = (chamadas.data ?? []).find((c) => c.id === selecionada) ?? null;
  const linhas = registros.data ?? [];
  const resumo = resumir(linhas);
  const bloqueios = dia ? bloqueiosFechamento(linhas, dia) : [];
  const fechada = dia?.status === "FECHADA" || dia?.status === "CANCELADA";
  const podeReabrir = perfil.podeAprovar || perfil.tem("ANALISTA");
  const podeCorrigir = perfil.podeAprovar || perfil.tem("ANALISTA");

  const motivoPorCodigo = (code?: string) =>
    motivos.data?.find((m) => m.code === code)?.id ?? null;
  const nomeMotivo = (id: string | null) =>
    motivos.data?.find((m) => m.id === id)?.name ?? "—";

  const protegido = (r: ChamadaRegistro) =>
    r.attendance_status === "AFASTADO" ||
    r.attendance_status === "FERIAS" ||
    !!r.notes?.includes(MARCA_DIVERGENCIA);

  async function aplicarAcao(r: ChamadaRegistro, status: StatusPresenca, motivoCode?: string) {
    if (fechada) {
      toast.error("Chamada fechada. Use a correção com justificativa.");
      return;
    }
    if (protegido(r) && status !== r.attendance_status) {
      setDivergenciaDe({ registro: r, status, motivo: motivoCode });
      setTratativa("");
      return;
    }
    await atualizar.mutateAsync({
      id: r.id,
      dayId: r.attendance_day_id,
      patch: {
        attendance_status: status,
        absence_reason_id: motivoCode ? motivoPorCodigo(motivoCode) : null,
        source: "MANUAL",
      },
    });
  }


  return (
    <AppShell>
      <div className="space-y-6">
        <header>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Chamada Diária</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Controle gerencial diário de presença operacional. Não substitui o registro oficial de
            ponto.
          </p>
        </header>

        {/* Abertura */}
        <Card>
          <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Data</label>
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Área</label>
              <Select value={areaId} onValueChange={setAreaId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a área" />
                </SelectTrigger>
                <SelectContent>
                  {areas.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Turno</label>
              <Select value={shiftId} onValueChange={setShiftId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_TURNO}>Todos os turnos</SelectItem>
                  {turnos.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Previstos</label>
              <div className="flex h-9 items-center text-sm text-foreground">
                {areaId ? `${previstos.length} colaborador(es)` : "Selecione a área"}
              </div>
            </div>
            <div className="flex items-end">
              <Button
                className="w-full"
                disabled={!areaId || abrir.isPending || previstos.length === 0}
                onClick={async () => {
                  const area = areas.find((a) => a.id === areaId);
                  try {
                    const nova = await abrir.mutateAsync({
                      attendance_date: data,
                      unit_id: area?.unit_id ?? null,
                      area_id: areaId,
                      shift_id: shiftId === SEM_TURNO ? null : shiftId,
                      notes: null,
                      previstos,
                    });
                    setSelecionada(nova.id);
                    toast.success("Chamada aberta com a lista prevista carregada.");
                  } catch (e) {
                    const msg = (e as { message?: string }).message ?? "";
                    toast.error(
                      msg.includes("uq_attendance_day_ativa")
                        ? "Já existe uma chamada ativa para esta data, unidade, área e turno."
                        : msg || "Não foi possível abrir a chamada.",
                    );
                  }
                }}
              >
                Abrir chamada
              </Button>
            </div>
            {areaId && previstos.some((p) => p.avisos.length) && (
              <div className="sm:col-span-2 lg:col-span-5 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
                {previstos
                  .filter((p) => p.avisos.length)
                  .slice(0, 4)
                  .map((p) => (
                    <div key={p.employee_id}>
                      {p.employee_re} — {p.employee_name_snapshot}: {p.avisos.join("; ")}
                    </div>
                  ))}
              </div>
            )}
            {areaId && previstos.some((p) => p.divergencias.length) && (
              <div className="sm:col-span-2 lg:col-span-5 space-y-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                <div className="font-semibold">{MARCA_DIVERGENCIA}</div>
                {previstos
                  .filter((p) => p.divergencias.length)
                  .map((p) => (
                    <div key={p.employee_id}>
                      <div className="font-medium">
                        {p.employee_re} — {p.employee_name_snapshot}
                      </div>
                      {p.divergencias.map((d) => (
                        <div key={d.regra} className="pl-2">
                          • {d.mensagem}{" "}
                          {d.origens.map((o) => (
                            <a
                              key={o.id + d.regra}
                              href={o.rota}
                              className="underline underline-offset-2"
                            >
                              [{o.rotulo}]
                            </a>
                          ))}
                        </div>
                      ))}
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Chamadas recentes */}
        <Card>
          <CardContent className="p-4">
            <div className="mb-2 text-sm font-medium text-foreground">Chamadas recentes</div>
            <div className="flex flex-wrap gap-2">
              {(chamadas.data ?? []).length === 0 && (
                <span className="text-sm text-muted-foreground">Nenhuma chamada registrada.</span>
              )}
              {(chamadas.data ?? []).map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelecionada(c.id)}
                  className={`rounded-md border px-3 py-1.5 text-left text-xs transition-colors ${
                    selecionada === c.id
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:bg-accent"
                  }`}
                >
                  <div className="font-medium text-foreground">
                    {fmtData(c.attendance_date)} · {nomeArea(c.area_id)}
                  </div>
                  <div>
                    {nomeTurno(c.shift_id)} · {STATUS_CHAMADA_LABEL[c.status]}
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {dia && (
          <>
            {/* Cabeçalho da chamada */}
            <Card>
              <CardContent className="grid gap-3 p-4 text-sm sm:grid-cols-3 lg:grid-cols-4">
                <Info rotulo="Data" valor={fmtData(dia.attendance_date)} />
                <Info rotulo="Unidade" valor={nomeUnidade(dia.unit_id)} />
                <Info rotulo="Área" valor={nomeArea(dia.area_id)} />
                <Info rotulo="Turno" valor={nomeTurno(dia.shift_id)} />
                <Info rotulo="Responsável" valor={dia.responsible_user_id ? "Registrado" : "—"} />
                <div>
                  <div className="text-xs text-muted-foreground">Status</div>
                  <Badge variant="secondary">{STATUS_CHAMADA_LABEL[dia.status]}</Badge>
                </div>
                <Info rotulo="Abertura" valor={fmtDataHora(dia.opened_at)} />
                <Info rotulo="Fechamento" valor={fmtDataHora(dia.closed_at)} />
                {dia.reopening_justification && (
                  <div className="sm:col-span-3 lg:col-span-4 text-xs text-muted-foreground">
                    Reaberta em {fmtDataHora(dia.reopened_at)} — {dia.reopening_justification}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Resumo */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              <Kpi rotulo="Previsto" valor={resumo.previsto} />
              <Kpi rotulo="Presentes" valor={resumo.presentes} />
              <Kpi rotulo="Faltas" valor={resumo.faltas} />
              <Kpi rotulo="Faltas justif." valor={resumo.faltasJustificadas} />
              <Kpi rotulo="Atestados" valor={resumo.atestados} />
              <Kpi rotulo="Férias" valor={resumo.ferias} />
              <Kpi rotulo="Afastados" valor={resumo.afastados} />
              <Kpi rotulo="Folgas" valor={resumo.folgas} />
              <Kpi rotulo="Atrasos" valor={resumo.atrasos} />
              <Kpi rotulo="Apoio outra área" valor={resumo.apoio} />
              <Kpi rotulo="Pendentes" valor={resumo.pendentes} />
            </div>

            <div className="flex flex-wrap gap-2">
              {!fechada && (
                <Button onClick={() => setDlgFechar(true)}>Fechar chamada</Button>
              )}
              {fechada && podeReabrir && (
                <Button variant="outline" onClick={() => setDlgReabrir(true)}>
                  Reabrir chamada
                </Button>
              )}
              {fechada && !podeReabrir && (
                <span className="text-sm text-muted-foreground">
                  Chamada fechada. A reabertura depende de perfil autorizado.
                </span>
              )}
            </div>

            {/* Listagem */}
            <Card>
              <CardContent className="overflow-x-auto p-0">
                <table className="w-full min-w-[1100px] text-sm">
                  <thead className="border-b border-border bg-muted/40 text-xs uppercase text-muted-foreground">
                    <tr>
                      <Th>RE</Th>
                      <Th>Colaborador</Th>
                      <Th>Função</Th>
                      <Th>Área planejada</Th>
                      <Th>Área efetiva</Th>
                      <Th>Turno</Th>
                      <Th>Status</Th>
                      <Th>Motivo</Th>
                      <Th>Chegada</Th>
                      <Th>Observação</Th>
                      <Th>Ações</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((r) => (
                      <tr key={r.id} className="border-b border-border/60 align-top">
                        <Td>{r.employee_re}</Td>
                        <Td className="font-medium text-foreground">{r.employee_name_snapshot}</Td>
                        <Td>{r.function_snapshot ?? "—"}</Td>
                        <Td>{nomeArea(r.planned_area_id)}</Td>
                        <Td>{nomeArea(r.effective_area_id)}</Td>
                        <Td>{nomeTurno(r.effective_shift_id ?? r.planned_shift_id)}</Td>
                        <Td>
                          <span
                            className={`inline-block rounded px-2 py-0.5 text-[11px] ${statusClasse(r.attendance_status)}`}
                          >
                            {STATUS_PRESENCA_LABEL[r.attendance_status]}
                          </span>
                        </Td>
                        <Td>{nomeMotivo(r.absence_reason_id)}</Td>
                        <Td>
                          <Input
                            type="time"
                            className="h-8 w-28"
                            disabled={fechada}
                            value={r.arrival_time?.slice(0, 5) ?? ""}
                            onChange={(e) =>
                              atualizar.mutate({
                                id: r.id,
                                dayId: r.attendance_day_id,
                                patch: { arrival_time: e.target.value || null },
                              })
                            }
                          />
                        </Td>
                        <Td className="max-w-[180px] text-xs">
                          {r.notes?.includes(MARCA_DIVERGENCIA) ? (
                            <span className="font-medium text-destructive">{r.notes}</span>
                          ) : (
                            (r.notes ?? "—")
                          )}
                        </Td>
                        <Td>
                          <div className="flex flex-wrap gap-1">
                            {!fechada && r.attendance_status !== "PRESENTE" && (
                              <button
                                title="Presente"
                                onClick={() => void aplicarAcao(r, "PRESENTE")}
                                className="rounded border border-emerald-500/40 px-1.5 py-0.5 text-[10px] text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400"
                              >
                                Presente
                              </button>
                            )}
                            {!fechada &&
                              ACOES_RAPIDAS.map((a) => (
                                <button
                                  key={a.status}
                                  title={a.label}
                                  onClick={() => void aplicarAcao(r, a.status, a.motivo)}
                                  className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                                >
                                  {a.label}
                                </button>
                              ))}
                            {!fechada && r.attendance_status !== "PENDENTE" && (
                              <button
                                onClick={() => void aplicarAcao(r, "PENDENTE")}
                                className="rounded border border-destructive/40 px-1.5 py-0.5 text-[10px] text-destructive hover:bg-destructive/10"
                              >
                                Remover ocorrência
                              </button>
                            )}
                            {fechada && podeCorrigir && (
                              <button
                                onClick={() => setCorrecaoDe(r)}
                                className="rounded border border-border px-1.5 py-0.5 text-[10px] hover:bg-accent"
                              >
                                Corrigir
                              </button>
                            )}
                            <button
                              onClick={() => setHistoricoDe(r)}
                              className="rounded border border-border px-1.5 py-0.5 text-[10px] hover:bg-accent"
                            >
                              Ver histórico
                            </button>
                          </div>
                        </Td>
                      </tr>
                    ))}
                    {linhas.length === 0 && (
                      <tr>
                        <td colSpan={11} className="p-6 text-center text-sm text-muted-foreground">
                          Nenhum colaborador nesta chamada.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Fechamento */}
      <Dialog open={dlgFechar} onOpenChange={setDlgFechar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fechar chamada</DialogTitle>
            <DialogDescription>
              Revise o resumo antes de confirmar. Após o fechamento a edição direta é bloqueada.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-1 text-xs">
              <span>Total previsto: <b>{resumo.previsto}</b></span>
              <span>Presentes: <b>{resumo.presentes}</b></span>
              <span>Faltas: <b>{resumo.faltas}</b></span>
              <span>Faltas justificadas: <b>{resumo.faltasJustificadas}</b></span>
              <span>Atestados: <b>{resumo.atestados}</b></span>
              <span>Férias: <b>{resumo.ferias}</b></span>
              <span>Afastados: <b>{resumo.afastados}</b></span>
              <span>Folgas/compensação: <b>{resumo.folgas}</b></span>
              <span>Atrasos/saídas: <b>{resumo.atrasos}</b></span>
              <span>Apoio outra área: <b>{resumo.apoio}</b></span>
              <span>Pendentes: <b>{resumo.pendentes}</b></span>
            </div>

            {resumo.pendentes > 0 && (
              <div className="rounded-md border border-border p-3">
                <div className="mb-2 text-xs text-muted-foreground">
                  {resumo.pendentes} colaborador(es) permanecem pendentes:
                </div>
                <div className="max-h-32 overflow-y-auto text-xs">
                  {linhas
                    .filter((r) => r.attendance_status === "PENDENTE")
                    .map((r) => (
                      <div key={r.id}>
                        {r.employee_re} — {r.employee_name_snapshot}
                      </div>
                    ))}
                </div>
                <label className="mt-3 flex items-center gap-2 text-xs">
                  <Checkbox
                    checked={confirmarPendentes}
                    onCheckedChange={(v) => setConfirmarPendentes(v === true)}
                  />
                  Confirmar os pendentes como PRESENTE
                </label>
              </div>
            )}

            {bloqueios.length > 0 && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                {bloqueios.map((b) => (
                  <div key={b}>• {b}</div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlgFechar(false)}>
              Cancelar
            </Button>
            <Button
              disabled={
                bloqueios.length > 0 ||
                fechar.isPending ||
                (resumo.pendentes > 0 && !confirmarPendentes)
              }
              onClick={async () => {
                if (!dia) return;
                await fechar.mutateAsync({ dayId: dia.id, confirmarPendentes });
                setDlgFechar(false);
                toast.success("Chamada fechada e registrada na auditoria.");
              }}
            >
              Confirmar fechamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reabertura */}
      <Dialog open={dlgReabrir} onOpenChange={setDlgReabrir}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reabrir chamada</DialogTitle>
            <DialogDescription>
              O fechamento anterior é preservado; a reabertura registra usuário, data e hora.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Justificativa da reabertura"
            value={justificativa}
            onChange={(e) => setJustificativa(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlgReabrir(false)}>
              Cancelar
            </Button>
            <Button
              disabled={justificativa.trim().length < 10 || reabrir.isPending}
              onClick={async () => {
                if (!dia) return;
                await reabrir.mutateAsync({ dayId: dia.id, justificativa: justificativa.trim() });
                setJustificativa("");
                setDlgReabrir(false);
                toast.success("Chamada reaberta.");
              }}
            >
              Reabrir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CorrecaoDialog
        registro={correcaoDe}
        onClose={() => setCorrecaoDe(null)}
        onSalvar={async (novoStatus, novoMotivo, just) => {
          if (!correcaoDe) return;
          await corrigir.mutateAsync({
            dayId: correcaoDe.attendance_day_id,
            registro: correcaoDe,
            novoStatus,
            novoMotivo,
            justificativa: just,
          });
          setCorrecaoDe(null);
          toast.success("Correção registrada com justificativa.");
        }}
        motivos={(motivos.data ?? []).map((m) => ({ id: m.id, name: m.name }))}
      />

      <HistoricoDialog
        registro={historicoDe}
        onClose={() => setHistoricoDe(null)}
        nomeMotivo={nomeMotivo}
      />
    </AppShell>
  );
}

function Info({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{rotulo}</div>
      <div className="text-foreground">{valor}</div>
    </div>
  );
}

function Kpi({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{rotulo}</div>
        <div className="text-lg font-semibold text-foreground">{valor}</div>
      </CardContent>
    </Card>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-left font-medium">{children}</th>;
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2 text-muted-foreground ${className}`}>{children}</td>;
}

function CorrecaoDialog({
  registro,
  motivos,
  onClose,
  onSalvar,
}: {
  registro: ChamadaRegistro | null;
  motivos: { id: string; name: string }[];
  onClose: () => void;
  onSalvar: (s: StatusPresenca, motivo: string | null, just: string) => Promise<void>;
}) {
  const [status, setStatus] = useState<StatusPresenca>("PRESENTE");
  const [motivo, setMotivo] = useState<string>("__nenhum__");
  const [just, setJust] = useState("");

  return (
    <Dialog open={!!registro} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Corrigir registro</DialogTitle>
          <DialogDescription>
            {registro?.employee_re} — {registro?.employee_name_snapshot}. O valor anterior e o novo
            ficam registrados.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Select value={status} onValueChange={(v) => setStatus(v as StatusPresenca)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(STATUS_PRESENCA_LABEL) as StatusPresenca[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_PRESENCA_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={motivo} onValueChange={setMotivo}>
            <SelectTrigger>
              <SelectValue placeholder="Motivo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__nenhum__">Sem motivo</SelectItem>
              {motivos.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea
            placeholder="Justificativa da correção"
            value={just}
            onChange={(e) => setJust(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={just.trim().length < 10}
            onClick={() =>
              void onSalvar(status, motivo === "__nenhum__" ? null : motivo, just.trim())
            }
          >
            Salvar correção
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HistoricoDialog({
  registro,
  onClose,
  nomeMotivo,
}: {
  registro: ChamadaRegistro | null;
  onClose: () => void;
  nomeMotivo: (id: string | null) => string;
}) {
  const correcoes = useCorrecoes(registro?.id ?? null);
  return (
    <Dialog open={!!registro} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Histórico do registro</DialogTitle>
          <DialogDescription>
            {registro?.employee_re} — {registro?.employee_name_snapshot}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <div className="text-xs text-muted-foreground">
            Lançado em {fmtDataHora(registro?.registered_at)} · origem {registro?.source}
          </div>
          {(correcoes.data ?? []).length === 0 && (
            <div className="text-sm text-muted-foreground">Nenhuma correção registrada.</div>
          )}
          {(correcoes.data ?? []).map((c) => (
            <div key={c.id} className="rounded-md border border-border p-2 text-xs">
              <div>
                {STATUS_PRESENCA_LABEL[c.previous_status ?? "PENDENTE"]} →{" "}
                <b>{STATUS_PRESENCA_LABEL[c.new_status]}</b>
              </div>
              <div className="text-muted-foreground">
                Motivo: {nomeMotivo(c.previous_reason)} → {nomeMotivo(c.new_reason)}
              </div>
              <div className="text-muted-foreground">{c.justification}</div>
              <div className="text-muted-foreground">{fmtDataHora(c.created_at)}</div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
