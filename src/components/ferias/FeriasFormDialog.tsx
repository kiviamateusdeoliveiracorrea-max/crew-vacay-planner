import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useSalvarFerias, type VacationFull, type MovementFull } from "@/hooks/useSistema";
import type { Area, CoverageRule, Employee, Funcao, Turno, Vacation } from "@/lib/sistema";
import { fmtData, humaniza, severidadeClasse, SEVERIDADE_LABEL } from "@/lib/sistema";
import { avaliarFerias } from "@/lib/motor-conflitos";


const STATUS: Vacation["status"][] = [
  "PLANEJADA",
  "APROVADA",
  "EM_ANDAMENTO",
  "CONCLUIDA",
  "CANCELADA",
];

export function FeriasFormDialog({
  open,
  onOpenChange,
  registro,
  employees,
  funcoes,
  areas,
  turnos,
  movimentacoes,
  regras,
  ferias,
  nomeArea,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  registro: VacationFull | null;
  employees: Employee[];
  funcoes: Funcao[];
  areas: Area[];
  turnos: Turno[];
  movimentacoes: MovementFull[];
  regras: CoverageRule[];
  ferias: VacationFull[];
  nomeArea: (id: string | null) => string;
}) {

  const salvar = useSalvarFerias();
  const [employeeId, setEmployeeId] = useState("");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [status, setStatus] = useState<Vacation["status"]>("PLANEJADA");
  const [substituto, setSubstituto] = useState("");
  const [observacao, setObservacao] = useState("");
  const [busca, setBusca] = useState("");

  useEffect(() => {
    if (!open) return;
    setEmployeeId(registro?.employee_id ?? "");
    setInicio(registro?.inicio ?? "");
    setFim(registro?.fim ?? "");
    setStatus(registro?.status ?? "PLANEJADA");
    setSubstituto(registro?.substituto_employee_id ?? "");
    setObservacao(registro?.observacao ?? "");
    setBusca("");
  }, [open, registro]);

  const colaborador = employees.find((e) => e.id === employeeId) ?? null;

  const opcoes = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const base = employees.filter((e) => e.status === "ATIVO");
    if (!termo) return base.slice(0, 60);
    return base
      .filter((e) => e.nome.toLowerCase().includes(termo) || (e.re ?? "").includes(termo))
      .slice(0, 60);
  }, [employees, busca]);

  const substitutosPossiveis = useMemo(
    () =>
      employees
        .filter((e) => e.status === "ATIVO" && e.id !== employeeId)
        .filter((e) => !colaborador || e.function_id === colaborador.function_id)
        .slice(0, 200),
    [employees, employeeId, colaborador],
  );

  const previa = useMemo(() => {
    if (!colaborador || !inicio || !fim) return [];
    return avaliarFerias(
      { employees, funcoes, areas, turnos, movimentacoes, regras, ferias },
      {
        ...(registro?.id ? { id: registro.id } : {}),
        employee_id: colaborador.id,
        inicio,
        fim,
        status,
        substituto_employee_id: substituto || null,
        substituto_nome: null,
      },
    );
  }, [
    colaborador,
    inicio,
    fim,
    status,
    substituto,
    employees,
    funcoes,
    areas,
    turnos,
    movimentacoes,
    regras,
    ferias,
    registro,
  ]);


  async function submeter() {
    if (!employeeId || !inicio || !fim) {
      toast.error("Informe colaborador, início e fim.");
      return;
    }
    if (fim < inicio) {
      toast.error("A data final deve ser posterior à inicial.");
      return;
    }
    try {
      await salvar.mutateAsync({
        ...(registro?.id ? { id: registro.id } : {}),
        employee_id: employeeId,
        inicio,
        fim,
        status,
        substituto_employee_id: substituto || null,
        substituto_nome: substituto
          ? (employees.find((e) => e.id === substituto)?.nome ?? null)
          : null,
        observacao: observacao || null,
      });
      toast.success("Férias salvas. Conflitos recalculados.");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{registro ? "Editar férias" : "Programar férias"}</DialogTitle>
          <DialogDescription>
            A área e o turno vigentes na data inicial são registrados automaticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {!registro && (
            <div className="space-y-1">
              <Label>Buscar colaborador</Label>
              <Input
                placeholder="Nome ou RE"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
          )}
          <div className="space-y-1">
            <Label>Colaborador</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {opcoes.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.re ? `${e.re} · ` : ""}
                    {e.nome} — {nomeArea(e.area_id)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label>Início</Label>
              <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Fim</Label>
              <Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as Vacation["status"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {humaniza(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Substituto (mesma função)</Label>
            <Select value={substituto || "__none__"} onValueChange={(v) => setSubstituto(v === "__none__" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Sem substituto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sem substituto</SelectItem>
                {substitutosPossiveis.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.nome} — {nomeArea(e.area_id)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Observação</Label>
            <Textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2} />
          </div>

          {previa.length > 0 && (
            <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
              <p className="text-xs font-medium">Prévia de conflitos ({previa.length})</p>
              <ul className="space-y-2">
                {previa.map((a, i) => (
                  <li key={i} className="rounded-md border border-border bg-background p-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${severidadeClasse(a.severidade)}`}
                      >
                        {SEVERIDADE_LABEL[a.severidade]}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{humaniza(a.regra)}</span>
                      {a.overlap && (
                        <span className="text-[10px] text-muted-foreground">
                          {fmtData(a.overlap.inicio)} a {fmtData(a.overlap.fim)}
                          {a.dias ? ` · ${a.dias} dia(s)` : ""}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs">{a.mensagem}</p>
                    <p className="text-[11px] text-muted-foreground">Ação: {a.acao}</p>
                    {a.envolvidos.length > 0 && (
                      <p className="text-[11px] text-muted-foreground">
                        {a.envolvidos
                          .map(
                            (e) =>
                              `${e.nome} (RE ${e.re ?? "—"}) · ${e.funcao ?? "—"} · ${e.area ?? "—"} · ${e.turno ?? "—"}`,
                          )
                          .join(" | ")}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submeter} disabled={salvar.isPending}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
