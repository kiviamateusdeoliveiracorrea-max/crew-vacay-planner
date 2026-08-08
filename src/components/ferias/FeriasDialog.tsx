import { useMemo, useState, useEffect } from "react";
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
import { toast } from "sonner";
import { conflitosDe, dias, type Colaborador, type Registro } from "@/lib/ferias";
import { useSalvarFerias } from "@/hooks/useFerias";

type Props = {
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
  colaborador: Colaborador | null;
  registro: Registro | null;
  registros: Registro[];
};

export function FeriasDialog({ aberto, onOpenChange, colaborador, registro, registros }: Props) {
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [substituto, setSubstituto] = useState("");
  const [observacao, setObservacao] = useState("");
  const salvar = useSalvarFerias();

  useEffect(() => {
    if (!aberto) return;
    setInicio(registro?.inicio ?? "");
    setFim(registro?.fim ?? "");
    setSubstituto(registro?.substituto ?? "");
    setObservacao(registro?.observacao ?? "");
  }, [aberto, registro]);

  const previa = useMemo(() => {
    if (!colaborador || !inicio || !fim || fim < inicio) return [];
    const simulado: Registro = {
      id: registro?.id ?? "novo",
      colaborador_id: colaborador.id,
      inicio,
      fim,
      status: "PLANEJADA",
      substituto: null,
      observacao: null,
      colaborador,
    };
    return conflitosDe(simulado, [...registros.filter((r) => r.id !== registro?.id), simulado]);
  }, [colaborador, inicio, fim, registros, registro]);

  const bloqueado = previa.some((c) => c.tipo === "mesma-area");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!colaborador) return;
    if (fim < inicio) {
      toast.error("O retorno deve ser posterior à saída.");
      return;
    }
    if (bloqueado) {
      toast.error("Bloqueado: já existe alguém da mesma função dessa área de férias no período.");
      return;
    }
    try {
      await salvar.mutateAsync({
        id: registro?.id,
        colaborador_id: colaborador.id,
        inicio,
        fim,
        substituto: substituto.trim() || null,
        observacao: observacao.trim() || null,
      });
      const alertas = previa.filter((c) => c.tipo === "outra-area");
      if (alertas.length > 0) {
        toast.warning(`Salvo com ${alertas.length} alerta(s) de sobreposição em outra área.`);
      } else {
        toast.success("Férias lançadas.");
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{registro ? "Editar férias" : "Lançar férias"}</DialogTitle>
          <DialogDescription>
            {colaborador
              ? `${colaborador.nome} — ${colaborador.funcao} · ${colaborador.area}${colaborador.turno ? " · " + colaborador.turno : ""}`
              : ""}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="inicio">Saída</Label>
              <Input id="inicio" type="date" required value={inicio} onChange={(e) => setInicio(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fim">Retorno</Label>
              <Input id="fim" type="date" required value={fim} onChange={(e) => setFim(e.target.value)} />
            </div>
          </div>
          {inicio && fim && fim >= inicio && (
            <p className="text-sm text-muted-foreground">{dias(inicio, fim)} dias de afastamento</p>
          )}
          <div className="space-y-2">
            <Label htmlFor="sub">Substituto definido</Label>
            <Input
              id="sub"
              placeholder="Nome de quem cobre o período"
              value={substituto}
              onChange={(e) => setSubstituto(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="obs">Observação</Label>
            <Textarea id="obs" rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
          </div>

          {previa.length > 0 && (
            <div
              className={`space-y-1 rounded-md border p-3 text-sm ${
                bloqueado
                  ? "border-critical/40 bg-critical/10 text-critical"
                  : "border-warning/50 bg-warning/15 text-warning-foreground"
              }`}
            >
              <p className="font-semibold">
                {bloqueado ? "Conflito crítico — lançamento bloqueado" : "Atenção: sobreposição em outra área"}
              </p>
              <ul className="list-inside list-disc">
                {previa.map((c, i) => (
                  <li key={i}>{c.mensagem}</li>
                ))}
              </ul>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvar.isPending || bloqueado}>
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
