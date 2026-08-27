import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useAreasSolicitacao,
  useMinhaSolicitacao,
  useSolicitarAcesso,
} from "@/hooks/useAcessos";
import { fmtDataHora } from "@/lib/sistema";
import { useAvisoErro } from "@/hooks/useAvisoErro";

const STATUS_LABEL: Record<string, string> = {
  PENDENTE: "Aguardando aprovação",
  APROVADO: "Aprovada",
  REJEITADO: "Rejeitada",
};

export function SolicitarAcesso() {
  const minha = useMinhaSolicitacao();
  const areas = useAreasSolicitacao();
  const enviar = useSolicitarAcesso();

  const [areaId, setAreaId] = useState<string>("");
  const avisarErro = useAvisoErro();
  const [justificativa, setJustificativa] = useState("");

  const email = minha.data?.email ?? null;
  const solicitacao = minha.data?.solicitacao ?? null;
  const pendente = solicitacao?.status === "PENDENTE";

  return (
    <div className="mt-8 rounded-lg border border-border bg-card p-5 text-left">
      <dl className="space-y-2 text-sm">
        <div className="flex flex-wrap justify-between gap-2">
          <dt className="text-muted-foreground">E-mail autenticado</dt>
          <dd className="font-medium text-foreground">{email ?? "—"}</dd>
        </div>
        <div className="flex flex-wrap justify-between gap-2">
          <dt className="text-muted-foreground">Data e hora da solicitação</dt>
          <dd className="text-foreground">
            {solicitacao ? fmtDataHora(solicitacao.created_at) : "Nenhuma solicitação enviada"}
          </dd>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <dt className="text-muted-foreground">Status da solicitação</dt>
          <dd>
            {solicitacao ? (
              <Badge variant={pendente ? "secondary" : solicitacao.status === "APROVADO" ? "default" : "destructive"}>
                {STATUS_LABEL[solicitacao.status] ?? solicitacao.status}
              </Badge>
            ) : (
              <Badge variant="outline">Não solicitado</Badge>
            )}
          </dd>
        </div>
      </dl>

      {pendente ? (
        <p className="mt-5 rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          Sua solicitação foi registrada e os administradores foram notificados. A liberação
          depende de aprovação — nenhum acesso é concedido automaticamente.
        </p>
      ) : (
        <div className="mt-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="area-solicitada">Área solicitada</Label>
            <Select value={areaId} onValueChange={setAreaId}>
              <SelectTrigger id="area-solicitada">
                <SelectValue placeholder="Selecione a área" />
              </SelectTrigger>
              <SelectContent>
                {(areas.data ?? []).map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.nome} — {a.unidade}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="justificativa">Justificativa</Label>
            <Textarea
              id="justificativa"
              maxLength={1000}
              rows={4}
              placeholder="Descreva por que precisa de acesso (mínimo de 10 caracteres)."
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            A liberação depende de aprovação de um administrador. O envio desta solicitação não
            concede acesso aos dados do sistema.
          </p>

          <Button
            disabled={enviar.isPending || justificativa.trim().length < 10}
            onClick={() =>
              enviar.mutate(
                { areaId: areaId || null, justificativa: justificativa.trim() },
                {
                  onSuccess: () => {
                    setJustificativa("");
                    setAreaId("");
                    toast.success("Solicitação enviada. Aguarde a aprovação de um administrador.");
                  },
                  onError: (e) => avisarErro(e, "Não foi possível enviar sua solicitação. Tente novamente."),
                },
              )
            }
          >
            {enviar.isPending ? "Enviando…" : "Solicitar acesso"}
          </Button>
        </div>
      )}
    </div>
  );
}
