import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDados, useExcluirFerias } from "@/hooks/useFerias";
import { AlertasPanel } from "@/components/ferias/AlertasPanel";
import { AreaTabela } from "@/components/ferias/AreaTabela";
import { FeriasDialog } from "@/components/ferias/FeriasDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { mapaConflitos, normaliza, severidadeDe, type Colaborador, type Registro } from "@/lib/ferias";
import { LogOut, Search } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Controle de Férias por Área e Função" },
      {
        name: "description",
        content:
          "Programe férias por área, bloqueie sobreposições da mesma função e receba alertas para operadores de empilhadeira.",
      },
      { property: "og:title", content: "Controle de Férias por Área e Função" },
      {
        property: "og:description",
        content: "Programação de férias por área com alertas automáticos de conflito de função.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Painel,
});

function Painel() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const { data, isLoading } = useDados();
  const excluir = useExcluirFerias();
  const [area, setArea] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [dialogo, setDialogo] = useState<{ colaborador: Colaborador; registro: Registro | null } | null>(null);

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth", replace: true });
  }, [loading, session, navigate]);

  const colaboradores = data?.colaboradores ?? [];
  const registros = useMemo(() => data?.registros ?? [], [data]);
  const mapa = useMemo(() => mapaConflitos(registros), [registros]);

  const areas = useMemo(
    () => Array.from(new Set(colaboradores.map((c) => c.area))).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [colaboradores],
  );

  useEffect(() => {
    if (!area && areas.length > 0) setArea(areas[0] ?? null);
  }, [areas, area]);

  const criticosPorArea = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of registros) {
      if (severidadeDe(mapa.get(r.id)) !== "ok") {
        m.set(r.colaborador.area, (m.get(r.colaborador.area) ?? 0) + 1);
      }
    }
    return m;
  }, [registros, mapa]);

  const daArea = colaboradores
    .filter((c) => c.area === area)
    .filter((c) => (busca ? normaliza(c.nome + c.funcao + (c.re ?? "")).includes(normaliza(busca)) : true))
    .sort((a, b) => a.funcao.localeCompare(b.funcao, "pt-BR") || a.nome.localeCompare(b.nome, "pt-BR"));

  async function sair() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  if (loading || !session) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-sidebar text-sidebar-foreground">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Controle Gerencial de Férias</h1>
            <p className="text-sm opacity-80">
              Programação por área e função · alerta automático para funções-chave
            </p>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="opacity-80">{session.user.email}</span>
            <Button size="sm" variant="secondary" onClick={sair}>
              <LogOut className="mr-1 h-4 w-4" /> Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        {isLoading ? (
          <p className="text-muted-foreground">Carregando base de colaboradores…</p>
        ) : (
          <>
            <section className="grid gap-4 sm:grid-cols-4">
              <Indicador titulo="Colaboradores" valor={colaboradores.length} />
              <Indicador titulo="Férias programadas" valor={registros.length} />
              <Indicador
                titulo="Funções-chave"
                valor={colaboradores.filter((c) => c.funcao_chave).length}
                detalhe="Operadores de empilhadeira"
              />
              <Indicador
                titulo="Conflitos"
                valor={registros.filter((r) => severidadeDe(mapa.get(r.id)) !== "ok").length}
                critico
              />
            </section>

            <AlertasPanel registros={registros} mapa={mapa} onSelecionar={setArea} />

            <section className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {areas.map((a) => {
                  const n = criticosPorArea.get(a) ?? 0;
                  return (
                    <button
                      key={a}
                      onClick={() => setArea(a)}
                      className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                        a === area
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card hover:bg-secondary"
                      }`}
                    >
                      {a}
                      {n > 0 && (
                        <Badge variant="destructive" className="h-5 px-1.5 text-[11px]">
                          {n}
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="relative max-w-sm">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Buscar por nome, função ou RE"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
              </div>

              <AreaTabela
                colaboradores={daArea}
                registros={registros.filter((r) => r.colaborador.area === area)}
                mapa={mapa}
                onLancar={(c) => setDialogo({ colaborador: c, registro: null })}
                onEditar={(c, r) => setDialogo({ colaborador: c, registro: r })}
                onExcluir={async (r) => {
                  await excluir.mutateAsync(r.id);
                  toast.success("Período removido.");
                }}
              />
            </section>
          </>
        )}
      </main>

      <FeriasDialog
        aberto={dialogo !== null}
        onOpenChange={(v) => !v && setDialogo(null)}
        colaborador={dialogo?.colaborador ?? null}
        registro={dialogo?.registro ?? null}
        registros={registros}
      />
    </div>
  );
}

function Indicador({
  titulo,
  valor,
  detalhe,
  critico,
}: {
  titulo: string;
  valor: number;
  detalhe?: string;
  critico?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-sm text-muted-foreground">{titulo}</p>
      <p className={`text-3xl font-semibold ${critico && valor > 0 ? "text-critical" : "text-foreground"}`}>
        {valor}
      </p>
      {detalhe && <p className="text-xs text-muted-foreground">{detalhe}</p>}
    </div>
  );
}
