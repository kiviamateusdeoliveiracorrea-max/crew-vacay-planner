import { Link } from "@tanstack/react-router";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuditoriaRegistro, type MovementFull, type VacationFull } from "@/hooks/useSistema";
import {
  diasEntre,
  fmtData,
  humaniza,
  severidadeClasse,
  SEVERIDADE_LABEL,
} from "@/lib/sistema";

export type RegistroFoco =
  | { tipo: "ferias"; item: VacationFull }
  | { tipo: "movimentacao"; item: MovementFull }
  | null;

function Campo({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      <p className="text-sm text-foreground">{valor ?? "—"}</p>
    </div>
  );
}

export function RegistroDialog({
  registro,
  onClose,
  nomeArea,
  nomeTurno,
  nomeFuncao,
}: {
  registro: RegistroFoco;
  onClose: () => void;
  nomeArea: (id: string | null) => string;
  nomeTurno: (id: string | null) => string;
  nomeFuncao: (id: string | null) => string;
}) {
  const id = registro?.item.id ?? null;
  const trilha = useAuditoriaRegistro(id);

  const ferias = registro?.tipo === "ferias" ? registro.item : null;
  const mov = registro?.tipo === "movimentacao" ? registro.item : null;

  return (
    <Dialog open={!!registro} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {ferias ? "Registro de férias" : "Registro de movimentação"}
          </DialogTitle>
          <DialogDescription>
            Origem do indicador: dados persistidos no banco e trilha de auditoria do registro
            {id ? ` ${id.slice(0, 8)}…` : ""}.
          </DialogDescription>
        </DialogHeader>

        {ferias && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Campo rotulo="Colaborador" valor={ferias.employee?.nome} />
              <Campo rotulo="RE" valor={ferias.employee?.re} />
              <Campo rotulo="Função" valor={nomeFuncao(ferias.employee?.function_id ?? null)} />
              <Campo
                rotulo="Área vigente"
                valor={nomeArea(ferias.area_id_snapshot ?? ferias.employee?.area_id ?? null)}
              />
              <Campo
                rotulo="Turno vigente"
                valor={nomeTurno(ferias.shift_id_snapshot ?? ferias.employee?.shift_id ?? null)}
              />
              <Campo rotulo="Status" valor={humaniza(ferias.status)} />
              <Campo rotulo="Início" valor={fmtData(ferias.inicio)} />
              <Campo rotulo="Fim" valor={fmtData(ferias.fim)} />
              <Campo rotulo="Dias" valor={diasEntre(ferias.inicio, ferias.fim)} />
              <Campo rotulo="Substituto" valor={ferias.substituto_nome ?? "não indicado"} />
              <Campo rotulo="Observação" valor={ferias.observacao ?? "—"} />
              <Campo rotulo="Criado em" valor={fmtData(ferias.created_at?.slice(0, 10))} />
            </div>

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Alertas que originaram os indicadores
              </p>
              {ferias.conflitos.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum alerta para este registro.</p>
              ) : (
                <ul className="space-y-1 rounded-lg border border-border bg-muted/30 p-2">
                  {ferias.conflitos.map((c) => (
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
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <Button asChild size="sm" variant="outline">
              <Link to="/ferias" search={{ registro: ferias.id }} onClick={onClose}>
                Abrir no módulo de Férias
              </Link>
            </Button>
          </div>
        )}

        {mov && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Campo rotulo="Colaborador" valor={mov.employee?.nome} />
              <Campo rotulo="RE" valor={mov.re} />
              <Campo rotulo="Tipo" valor={humaniza(mov.tipo)} />
              <Campo rotulo="Setor origem" valor={nomeArea(mov.area_origem_id)} />
              <Campo rotulo="Setor destino" valor={nomeArea(mov.area_destino_id)} />
              <Campo rotulo="Turno origem" valor={nomeTurno(mov.shift_origem_id)} />
              <Campo rotulo="Turno destino" valor={nomeTurno(mov.shift_destino_id)} />
              <Campo rotulo="Data efetiva" valor={fmtData(mov.data_efetiva)} />
              <Campo
                rotulo="Temporária"
                valor={mov.temporaria ? `Sim — até ${fmtData(mov.data_fim)}` : "Não"}
              />
              <Campo rotulo="Status" valor={humaniza(mov.status)} />
              <Campo rotulo="Motivo" valor={mov.motivo ?? "—"} />
              <Campo rotulo="Observação" valor={mov.observacao ?? "—"} />
            </div>

            <Button asChild size="sm" variant="outline">
              <Link to="/movimentacoes" search={{ registro: mov.id }} onClick={onClose}>
                Abrir no módulo de Movimentações
              </Link>
            </Button>
          </div>
        )}

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Trilha de auditoria
          </p>
          {trilha.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando trilha…</p>
          ) : (trilha.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sem eventos de auditoria visíveis para o seu perfil.
            </p>
          ) : (
            <ul className="space-y-1">
              {(trilha.data ?? []).map((a) => (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center gap-2 rounded-md border border-border px-2 py-1 text-xs"
                >
                  <Badge variant="outline" className="text-[10px]">
                    {a.acao}
                  </Badge>
                  <span className="text-muted-foreground">{a.tabela}</span>
                  <span className="text-muted-foreground/70">
                    {new Date(a.created_at).toLocaleString("pt-BR")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
