import { useAvisoErro } from "@/hooks/useAvisoErro";
import { rotularCodigo } from "@/lib/mensagens";
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
import { fmtData, humaniza, sobrepoe, TIPOS_MOVIMENTACAO } from "@/lib/sistema";
import {
  ehDefinitivo,
  ehTemporario,
  lotacaoDefinitiva,
  lotacaoVigente,
  normalizaPorTipo,
  temporariaAberta,
  temporariaSobreposta,
  validaMovimentacao,
} from "@/lib/movimentacao";

export function MovimentacaoDialog({
  open,
  onOpenChange,
  registro,
  employees,
  areas,
  turnos,
  movimentacoes,
  feriasDoColaborador,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  registro: MovementFull | null;
  employees: Employee[];
  areas: Area[];
  turnos: Turno[];
  movimentacoes: MovementFull[];
  feriasDoColaborador: (employeeId: string) => { inicio: string; fim: string }[];
}) {
  const salvar = useSalvarMovimentacao();
  const [employeeId, setEmployeeId] = useState("");
  const avisarErro = useAvisoErro();
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState<Movement["tipo"]>("TRANSFERENCIA_DEFINITIVA");
  const [areaDestino, setAreaDestino] = useState("");
  const [turnoDestino, setTurnoDestino] = useState("");
  const [dataEfetiva, setDataEfetiva] = useState("");
  const [temporaria, setTemporaria] = useState(false);
  const [dataFim, setDataFim] = useState("");
  const [motivo, setMotivo] = useState("");
  const [observacao, setObservacao] = useState("");
  const [status, setStatus] = useState<Movement["status"]>("PENDENTE");

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
    setStatus(registro?.status ?? "PENDENTE");
    setBusca("");
  }, [open, registro]);


  const colaborador = employees.find((e) => e.id === employeeId) ?? null;
  const tipoTravado = ehDefinitivo(tipo) || ehTemporario(tipo);

  const opcoes = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const base = employees.filter((e) => e.status === "ATIVO");
    if (!termo) return base.slice(0, 60);
    return base
      .filter((e) => e.nome.toLowerCase().includes(termo) || (e.re ?? "").includes(termo))
      .slice(0, 60);
  }, [employees, busca]);

  // Espelha a normalização do banco: definitiva nunca temporária, empréstimo sempre.
  useEffect(() => {
    if (ehDefinitivo(tipo)) {
      setTemporaria(false);
      setDataFim("");
    }
    if (ehTemporario(tipo)) setTemporaria(true);
  }, [tipo]);

  const referencia = dataEfetiva || new Date().toISOString().slice(0, 10);

  const vigente = useMemo(
    () => (colaborador ? lotacaoVigente(movimentacoes, colaborador, referencia) : null),
    [colaborador, movimentacoes, referencia],
  );
  const definitiva = useMemo(
    () => (colaborador ? lotacaoDefinitiva(movimentacoes, colaborador, referencia) : null),
    [colaborador, movimentacoes, referencia],
  );

  // Retorno à origem: destino é sempre a lotação permanente.
  useEffect(() => {
    if (tipo === "RETORNO_A_ORIGEM" && definitiva?.areaId) {
      setAreaDestino(definitiva.areaId);
      setTurnoDestino(definitiva.shiftId ?? "");
    }
  }, [tipo, definitiva?.areaId, definitiva?.shiftId]);

  const emprestimoAberto = useMemo(
    () => (colaborador ? temporariaAberta(movimentacoes, colaborador.id, referencia) : null),
    [colaborador, movimentacoes, referencia],
  );

  const sobreposta = useMemo(() => {
    if (!colaborador || !temporaria || !dataEfetiva) return null;
    return temporariaSobreposta(
      movimentacoes,
      colaborador.id,
      { inicio: dataEfetiva, fim: dataFim || dataEfetiva },
      registro?.id,
    );
  }, [colaborador, movimentacoes, temporaria, dataEfetiva, dataFim, registro?.id]);

  const areaOrigem = registro?.area_origem_id ?? vigente?.areaId ?? colaborador?.area_id ?? null;
  const turnoOrigem = registro?.shift_origem_id ?? vigente?.shiftId ?? colaborador?.shift_id ?? null;

  const erros = useMemo(
    () =>
      validaMovimentacao({
        tipo,
        areaDestinoId: areaDestino || null,
        areaOrigemId: areaOrigem,
        shiftOrigemId: turnoOrigem,
        shiftDestinoId: turnoDestino || null,
        dataEfetiva,
        temporaria,
        dataFim: dataFim || null,
      }),
    [tipo, areaDestino, areaOrigem, turnoOrigem, turnoDestino, dataEfetiva, temporaria, dataFim],
  );

  const conflitaFerias = useMemo(() => {
    if (!employeeId || !dataEfetiva) return false;
    const periodo = { inicio: dataEfetiva, fim: temporaria && dataFim ? dataFim : dataEfetiva };
    return feriasDoColaborador(employeeId).some((f) => sobrepoe(f, periodo));
  }, [employeeId, dataEfetiva, dataFim, temporaria, feriasDoColaborador]);

  const nomeArea = (id: string | null) => areas.find((a) => a.id === id)?.nome ?? "—";
  const nomeTurno = (id: string | null) => turnos.find((t) => t.id === id)?.nome ?? "—";

  async function submeter() {
    if (!colaborador) {
      toast.error("Selecione o colaborador.");
      return;
    }
    const form = normalizaPorTipo({
      tipo,
      areaDestinoId: areaDestino || null,
      areaOrigemId: areaOrigem,
      shiftOrigemId: turnoOrigem,
      shiftDestinoId: turnoDestino || null,
      dataEfetiva,
      temporaria,
      dataFim: dataFim || null,
    });
    const problemas = validaMovimentacao(form);
    if (problemas.length > 0) {
      toast.error(problemas[0]!);
      return;
    }
    if (sobreposta) {
      toast.error("Já existe uma movimentação para esse colaborador no período informado.");
      return;
    }
    try {
      await salvar.mutateAsync({
        ...(registro?.id ? { id: registro.id } : {}),
        employee_id: colaborador.id,
        re: colaborador.re ?? "",
        // origem = lotação vigente na data efetiva (o banco recalcula se vier nula)
        area_origem_id: areaOrigem,
        shift_origem_id: turnoOrigem,
        area_destino_id: form.areaDestinoId,
        shift_destino_id: turnoDestino || turnoOrigem,
        data_efetiva: form.dataEfetiva,
        tipo: form.tipo,
        temporaria: form.temporaria,
        data_fim: form.dataFim,
        motivo: motivo || null,
        observacao: observacao || null,
        status,
      } as never);
      toast.success("Movimentação registrada. Conflitos recalculados.");
      onOpenChange(false);
    } catch (e) {
      avisarErro(e, "Não foi possível salvar a movimentação. Tente novamente.");
    }
  }



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

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label>RE / matrícula</Label>
              <Input value={colaborador?.re ?? ""} readOnly disabled placeholder="—" />
            </div>
            <div className="space-y-1">
              <Label>Setor de origem</Label>
              <Input value={nomeArea(areaOrigem)} readOnly disabled />
            </div>
            <div className="space-y-1">
              <Label>Turno de origem</Label>
              <Input value={nomeTurno(turnoOrigem)} readOnly disabled />
            </div>
          </div>


          {colaborador && vigente && definitiva && (
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              <p>
                Lotação vigente em {fmtData(referencia)}: <strong>{nomeArea(vigente.areaId)}</strong> ·{" "}
                {nomeTurno(vigente.shiftId)}
                {vigente.temporaria ? " (temporária)" : ""}
              </p>
              {vigente.temporaria && (
                <p className="mt-1">
                  Lotação permanente: {nomeArea(definitiva.areaId)} · {nomeTurno(definitiva.shiftId)}
                  {emprestimoAberto?.data_fim
                    ? ` · empréstimo até ${fmtData(emprestimoAberto.data_fim)}`
                    : ""}
                </p>
              )}
            </div>
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
                      {rotularCodigo(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Setor de destino</Label>
              <Select
                value={areaDestino}
                onValueChange={setAreaDestino}
                disabled={tipo === "RETORNO_A_ORIGEM"}
              >
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
              {tipo === "RETORNO_A_ORIGEM" && (
                <p className="text-[11px] text-muted-foreground">
                  Destino fixado na lotação permanente do colaborador.
                </p>
              )}
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
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as Movement["status"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["PENDENTE", "APROVADA", "REJEITADA", "CANCELADA"] as const).map((s) => (
                    <SelectItem key={s} value={s}>
                      {rotularCodigo(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Somente movimentações aprovadas alteram a alocação.
              </p>
            </div>
            <div className="space-y-1">
              <Label>Aprovador</Label>
              <Input
                value={registro?.aprovador_id ? "Registrado na aprovação" : "Pendente de decisão"}
                readOnly
                disabled
              />
            </div>
          </div>


          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3">
            <Switch
              checked={temporaria}
              onCheckedChange={setTemporaria}
              id="temp"
              disabled={tipoTravado}
            />
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
            {tipoTravado && (
              <p className="w-full text-[11px] text-muted-foreground">
                {ehDefinitivo(tipo)
                  ? "Este tipo altera a lotação de forma permanente a partir da data efetiva."
                  : "Este tipo é sempre temporário e exige data final."}
              </p>
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

          {tipo === "RETORNO_A_ORIGEM" && emprestimoAberto && (
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              Ao aprovar, o empréstimo vigente será encerrado no dia anterior ao retorno.
            </div>
          )}

          {sobreposta && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              Conflito: já existe movimentação temporária aprovada de {fmtData(sobreposta.data_efetiva)} a{" "}
              {fmtData(sobreposta.data_fim)} para este colaborador.
            </div>
          )}

          {erros.length > 0 && (
            <ul className="space-y-1 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
              {erros.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}

          {conflitaFerias && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              Este colaborador possui férias no período da movimentação — será gerado alerta crítico.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submeter} disabled={salvar.isPending || erros.length > 0 || !!sobreposta}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
