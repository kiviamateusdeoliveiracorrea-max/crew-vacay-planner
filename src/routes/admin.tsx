import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useCatalogos, usePerfil } from "@/hooks/useSistema";
import {
  useRejeitarSolicitacao,
  useRemoverAcesso,
  useSalvarAcesso,
  useUsuariosAcesso,
} from "@/hooks/useAcessos";
import { PAPEIS, PAPEL_DESCRICAO, fmtDataHora, type Papel } from "@/lib/sistema";


export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Usuários e Acessos | Gestão de Férias" },
      {
        name: "description",
        content:
          "Atribua perfis ADMIN, ANALISTA, LIDER, COORDENADOR e GERENTE, libere unidades e áreas e acompanhe o último acesso de cada usuário.",
      },
      { property: "og:title", content: "Usuários e Acessos" },
      {
        property: "og:description",
        content: "Gestão de perfis de acesso, unidades e áreas autorizadas da operação.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminPage,
});

type Rascunho = { papeis: Papel[]; unidades: string[]; areas: string[]; ativo: boolean };

function AdminPage() {
  const perfil = usePerfil();
  const cat = useCatalogos();
  const ehAdmin = perfil.tem("ADMIN");
  const usuarios = useUsuariosAcesso(ehAdmin);
  const salvar = useSalvarAcesso();
  const remover = useRemoverAcesso();

  const [busca, setBusca] = useState("");
  const [rascunhos, setRascunhos] = useState<Record<string, Rascunho>>({});

  const areas = cat.data?.areas ?? [];
  const unidades = cat.data?.unidades ?? [];

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const todos = usuarios.data ?? [];
    return termo
      ? todos.filter((u) => (u.email ?? "").toLowerCase().includes(termo))
      : todos;
  }, [usuarios.data, busca]);

  const pendentes = lista.filter((u) => u.papeis.length === 0);
  const cadastrados = lista.filter((u) => u.papeis.length > 0);

  function estado(u: (typeof lista)[number]): Rascunho {
    return (
      rascunhos[u.id] ?? {
        papeis: u.papeis,
        unidades: u.unidades,
        areas: u.areas,
        ativo: u.ativo,
      }
    );
  }

  function atualizar(id: string, patch: Partial<Rascunho>, base: Rascunho) {
    setRascunhos((r) => ({ ...r, [id]: { ...base, ...patch } }));
  }

  function alternar(lst: string[], v: string, on: boolean) {
    return on ? Array.from(new Set([...lst, v])) : lst.filter((x) => x !== v);
  }

  function aplicar(id: string, r: Rascunho) {
    salvar.mutate(
      { userId: id, papeis: r.papeis, unidades: r.unidades, areas: r.areas, ativo: r.ativo },
      {
        onSuccess: () => {
          toast.success("Acesso atualizado.");
          setRascunhos((s) => {
            const { [id]: _, ...resto } = s;
            return resto;
          });
        },
        onError: (e) => toast.error((e as Error).message),
      },
    );
  }

  if (!perfil.loading && !ehAdmin) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">
          Apenas administradores gerenciam usuários e acessos.
        </p>
      </AppShell>
    );
  }

  function cartao(u: (typeof lista)[number]) {
    const r = estado(u);
    const alterado = !!rascunhos[u.id];
    return (
      <Card key={u.id} className={u.ativo ? "" : "opacity-70"}>
        <CardContent className="space-y-3 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">{u.nome ?? u.email ?? u.id}</p>
              <p className="text-xs text-muted-foreground">{u.email ?? "sem e-mail"}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Último acesso: {fmtDataHora(u.ultimoAcesso)} · Permissão concedida por:{" "}
                {u.concedidoPor ?? "—"}
              </p>
            </div>
            <label className="flex items-center gap-2 text-xs">
              <Switch
                checked={r.ativo}
                onCheckedChange={(c) => atualizar(u.id, { ativo: c }, r)}
              />
              {r.ativo ? "Ativo" : "Desativado"}
            </label>
          </div>

          <div className="flex flex-wrap gap-3">
            {PAPEIS.map((p) => (
              <label key={p} className="flex items-center gap-2 text-xs">
                <Checkbox
                  checked={r.papeis.includes(p)}
                  onCheckedChange={(c) =>
                    atualizar(u.id, { papeis: alternar(r.papeis, p, !!c) as Papel[] }, r)
                  }
                />
                {p}
              </label>
            ))}
          </div>

          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
              Unidades autorizadas (todas as áreas da unidade)
            </p>
            <div className="flex flex-wrap gap-3">
              {unidades.map((un) => (
                <label key={un.id} className="flex items-center gap-2 text-xs">
                  <Checkbox
                    checked={r.unidades.includes(un.id)}
                    onCheckedChange={(c) =>
                      atualizar(u.id, { unidades: alternar(r.unidades, un.id, !!c) }, r)
                    }
                  />
                  {un.nome}
                </label>
              ))}
              {unidades.length === 0 && (
                <span className="text-xs text-muted-foreground">Nenhuma unidade cadastrada.</span>
              )}
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
              Áreas autorizadas
            </p>
            <div className="flex flex-wrap gap-3">
              {areas.map((a) => {
                const porUnidade = !!a.unit_id && r.unidades.includes(a.unit_id);
                return (
                  <label key={a.id} className="flex items-center gap-2 text-xs">
                    <Checkbox
                      checked={porUnidade || r.areas.includes(a.id)}
                      disabled={porUnidade}
                      onCheckedChange={(c) =>
                        atualizar(u.id, { areas: alternar(r.areas, a.id, !!c) }, r)
                      }
                    />
                    {a.nome}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button size="sm" disabled={!alterado || salvar.isPending} onClick={() => aplicar(u.id, r)}>
              Salvar alterações
            </Button>
            {alterado && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  setRascunhos((s) => {
                    const { [u.id]: _, ...resto } = s;
                    return resto;
                  })
                }
              >
                Descartar
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="text-destructive"
              disabled={remover.isPending}
              onClick={() => {
                if (!confirm(`Remover todo o acesso de ${u.email ?? u.id}?`)) return;
                remover.mutate(u.id, {
                  onSuccess: () => toast.success("Acesso removido."),
                  onError: (e) => toast.error((e as Error).message),
                });
              }}
            >
              Remover acesso
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <AppShell>
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Usuários e Acessos</h1>
          <p className="text-sm text-muted-foreground">
            As permissões valem no banco de dados (RLS) e cada alteração é registrada na auditoria.
          </p>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Perfis disponíveis</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {PAPEIS.map((p) => (
              <div key={p} className="rounded-lg border border-border p-3">
                <Badge variant="secondary" className="text-[10px]">
                  {p}
                </Badge>
                <p className="mt-1 text-xs text-muted-foreground">{PAPEL_DESCRICAO[p]}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Input
          placeholder="Pesquisar por e-mail…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="max-w-sm"
        />

        {usuarios.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando usuários…</p>
        ) : usuarios.error ? (
          <p className="text-sm text-destructive">{(usuarios.error as Error).message}</p>
        ) : (
          <div className="space-y-6">
            <section className="space-y-3">
              <h2 className="text-sm font-medium text-foreground">
                Pendentes de liberação ({pendentes.length})
              </h2>
              {pendentes.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum usuário aguardando liberação.</p>
              ) : (
                pendentes.map(cartao)
              )}
            </section>

            <section className="space-y-3">
              <h2 className="text-sm font-medium text-foreground">
                Usuários com acesso ({cadastrados.length})
              </h2>
              {cadastrados.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum usuário com perfil ainda.</p>
              ) : (
                cadastrados.map(cartao)
              )}
            </section>
          </div>
        )}
      </div>
    </AppShell>
  );
}
