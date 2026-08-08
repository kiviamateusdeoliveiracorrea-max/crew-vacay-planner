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
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useSalvarMovimentacao, type MovementFull } from "@/hooks/useSistema";
import type { Area, Employee, Movement, Turno } from "@/lib/sistema";
import { humaniza, sobrepoe, TIPOS_MOVIMENTACAO } from "@/lib/sistema";

export function MovimentacaoDialog({
  open,
  onOpenChange,
  registro,
  employees,
  areas,
  turnos,
  feriasDoColaborador,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  registro: MovementFull | null;
  employees: Employee[];
  areas: Area[];
  turnos: Turno[];
  feriasDoColaborador: (employeeId: string) => { inicio: string; fim: string }[];
}) {
  const salvar = useSalvarMovimentacao();
  const [employeeId, setEmployeeId] = useState("");
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState<Movement["tipo"]>("TRANSFERENCIA_DEFINITIVA");
  const [areaDestino, setAreaDestino] = useState("");
  const [turnoDestino, setTurnoDestino] = useState("");
  const [dataEfetiva, setDataEfetiva] = useState("");
  const [temporaria, setTemporaria] = useState(false);
  const [dataFim, setDataFim] = useState("");
  const [motivo, setMotivo] = useState("");
  const [observacao, setObservacao] = useState("");

  useEffect(() => {
    if (!open) return;
    setEmployeeId(registro?.employee_id ?? "");
    setTipo(registro?.tipo ?? "TRANSFERENCIA_DEFINITIVA");
    setAreaDestino(registro?.area_destino_id ?? "");
    setTurnoDestino(registro?.shift_destino_id ?? "");
    setDataEfetiva(registro?.data_efetiva ?? "");
    setTemporaria(registro?.temporaria ?? false);
    setDataFim(registro?.data_fim ?? "");
    setMotivo(registro?.motivo ?? "");
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

  useEffect(() => {
    if (tipo === "TRANSFERENCIA_DEFINITIVA" || tipo === "RETORNO_A_ORIGEM") setTemporaria(false);
    if (tipo === "EMPRESTIMO_TEMPORARIO" || tipo === "COBERTURA_DE_FERIAS") setTemporaria(true);
  }, [tipo]);

  const aviso = useMemo(() => {
    if (!employeeId || !dataEfetiva) return null;
    const periodo = { inicio: dataEfetiva, fim: temporaria && dataFim ? dataFim : dataEfetiva };
    const conflita = feriasDoColaborador(employeeId).some((f) => sobrepoe(f, periodo));
    return conflita
      ? "Este colaborador possui férias no período da movimentação — será gerado alerta crítico."
      : null;
  }, [employeeId, dataEfetiva, dataFim, temporaria, feriasDoColaborador]);

  async function submeter() {
    if (!colaborador || !dataEfetiva || !areaDestino) {
      toast.error("Informe colaborador, área de destino e data efetiva.");
      return;
    }
    if (temporaria && !dataFim) {
      toast.error("Movimentação temporária exige data final.");
      return;
    }
    try {
      await salvar.mutateAsync({
        ...(registro?.id ? { id: registro.id } : {}),
        employee_id: colaborador.id,
        re: colaborador.re ?? "",
        area_origem_id: registro?.area_origem_id ?? colaborador.area_id,
        shift_origem_id: registro?.shift_origem_id ?? colaborador.shift_id,
        area_destino_id: areaDestino,
        shift_destino_id: turnoDestino || colaborador.shift_id,
        data_efetiva: dataEfetiva,
        tipo,
        temporaria,
        data_fim: temporaria ? dataFim : null,
        motivo: motivo || null,
        observacao: observacao || null,
      } as never);
      toast.success("Movimentação registrada. Conflitos recalculados.");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    }
  }

  const nomeArea = (id: string | null) => areas.find((a) => a.id === id)?.nome ?? "—";
  const nomeTurno = (id: string | null) => turnos.find((t) => t.id === id)?.nome ?? "—";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{registro ? "Editar movimentação" : "Nova movimentação"}</DialogTitle>
          <DialogDescription>
            O histórico anterior é preservado; a área vigente muda apenas a partir da data efetiva.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {!registro && (
            <div className="space-y-1">
              <Label>Buscar colaborador</Label>
              <Input placeholder="Nome ou RE" value={busca} onChange={(e) => setBusca(e.target.value)} />
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
                    {e.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {colaborador && (
            <p className="text-xs text-muted-foreground">
              Origem atual: {nomeArea(colaborador.area_id)} · {nomeTurno(colaborador.shift_id)}
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as Movement["tipo"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_MOVIMENTACAO.map((t) => (
                    <SelectItem key={t} value={t}>
                      {humaniza(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Setor de destino</Label>
              <Select value={areaDestino} onValueChange={setAreaDestino}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
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
              <Label>Turno de destino</Label>
              <Select value={turnoDestino} onValueChange={setTurnoDestino}>
                <SelectTrigger>
                  <SelectValue placeholder="Manter turno atual" />
                </SelectTrigger>
                <SelectContent>
                  {turnos.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Data efetiva</Label>
              <Input type="date" value={dataEfetiva} onChange={(e) => setDataEfetiva(e.target.value)} />
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-lg border border-border p-3">
            <Switch checked={temporaria} onCheckedChange={setTemporaria} id="temp" />
            <Label htmlFor="temp" className="text-sm">
              Movimentação temporária
            </Label>
            {temporaria && (
              <Input
                type="date"
                className="ml-auto max-w-[180px]"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
              />
            )}
          </div>

          <div className="space-y-1">
            <Label>Motivo</Label>
            <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Observação</Label>
            <Textarea rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
          </div>

          {aviso && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              {aviso}
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
