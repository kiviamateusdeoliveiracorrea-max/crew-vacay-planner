import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuditoria, usePerfil } from "@/hooks/useSistema";
import { fmtDataHora } from "@/lib/sistema";

export const Route = createFileRoute("/auditoria")({
  head: () => ({
    meta: [
      { title: "Trilha de Auditoria | Gestão de Férias" },
      {
        name: "description",
        content:
          "Histórico de inclusões, alterações, aprovações, cancelamentos, importações e movimentações do sistema de férias.",
      },
      { property: "og:title", content: "Trilha de Auditoria" },
      {
        property: "og:description",
        content: "Registro completo de quem alterou o quê e quando no controle de férias.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuditoriaPage,
});

function AuditoriaPage() {
  const perfil = usePerfil();
  const { data, isLoading } = useAuditoria(300);
  const [busca, setBusca] = useState("");

  const registros = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return (data ?? []).filter(
      (r) => !t || r.tabela.toLowerCase().includes(t) || r.acao.toLowerCase().includes(t),
    );
  }, [data, busca]);

  if (!perfil.loading && !perfil.podeVerAuditoria) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Apenas administradores acessam a auditoria.</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Auditoria</h1>
          <p className="text-sm text-muted-foreground">
            Últimos 300 eventos registrados automaticamente pelo banco de dados.
          </p>
        </div>
        <Input
          placeholder="Filtrar por tabela ou ação"
          className="max-w-xs"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : (
          <div className="space-y-2">
            {registros.map((r) => (
              <Card key={r.id}>
                <CardContent className="py-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant="outline" className="text-[10px]">
                      {r.acao}
                    </Badge>
                    <span className="font-medium text-foreground">{r.tabela}</span>
                    <span className="text-muted-foreground">{fmtDataHora(r.created_at)}</span>
                    <span className="text-muted-foreground/70">registro {r.registro_id}</span>
                  </div>
                  {r.valor_posterior && (
                    <pre className="mt-2 max-h-40 overflow-auto rounded bg-muted/40 p-2 text-[10px] text-muted-foreground">
                      {JSON.stringify(r.valor_posterior, null, 1)}
                    </pre>
                  )}
                </CardContent>
              </Card>
            ))}
            {registros.length === 0 && (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  Nenhum evento encontrado.
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
