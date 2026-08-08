import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCatalogos, usePerfil } from "@/hooks/useSistema";
import { PAPEIS, PAPEL_DESCRICAO, type Papel } from "@/lib/sistema";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Usuários e Permissões | Gestão de Férias" },
      {
        name: "description",
        content:
          "Atribua perfis ADMIN, ANALISTA, LIDER, COORDENADOR e GERENTE e libere as áreas visíveis para cada usuário.",
      },
      { property: "og:title", content: "Usuários e Permissões" },
      {
        property: "og:description",
        content: "Gestão de perfis de acesso e permissões por área da operação.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const perfil = usePerfil();
  const cat = useCatalogos();
  const qc = useQueryClient();

  const usuarios = useQuery({
    queryKey: ["usuarios"],
    enabled: perfil.tem("ADMIN"),
    queryFn: async () => {
      const [{ data: profiles, error: e1 }, { data: roles, error: e2 }, { data: perms, error: e3 }] =
        await Promise.all([
          supabase.from("profiles").select("*").order("email"),
          supabase.from("user_roles").select("*"),
          supabase.from("user_area_permissions").select("*"),
        ]);
      if (e1) throw e1;
      if (e2) throw e2;
      if (e3) throw e3;
      return (profiles ?? []).map((p) => ({
        ...p,
        papeis: (roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role as Papel),
        areas: (perms ?? []).filter((r) => r.user_id === p.id).map((r) => r.area_id),
      }));
    },
  });

  const areas = cat.data?.areas ?? [];

  async function alternarPapel(userId: string, papel: Papel, ativo: boolean) {
    const q = ativo
      ? supabase.from("user_roles").insert({ user_id: userId, role: papel })
      : supabase.from("user_roles").delete().eq("user_id", userId).eq("role", papel);
    const { error } = await q;
    if (error) toast.error(error.message);
    else {
      toast.success("Perfil atualizado.");
      qc.invalidateQueries({ queryKey: ["usuarios"] });
      qc.invalidateQueries({ queryKey: ["perfil"] });
    }
  }

  async function alternarArea(userId: string, areaId: string, ativo: boolean) {
    const q = ativo
      ? supabase.from("user_area_permissions").insert({ user_id: userId, area_id: areaId })
      : supabase
          .from("user_area_permissions")
          .delete()
          .eq("user_id", userId)
          .eq("area_id", areaId);
    const { error } = await q;
    if (error) toast.error(error.message);
    else {
      qc.invalidateQueries({ queryKey: ["usuarios"] });
      qc.invalidateQueries({ queryKey: ["perfil"] });
    }
  }

  if (!perfil.loading && !perfil.tem("ADMIN")) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">
          Apenas administradores gerenciam usuários e permissões.
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Usuários e permissões
          </h1>
          <p className="text-sm text-muted-foreground">
            As permissões valem no banco de dados (RLS), não apenas na interface.
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

        {usuarios.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando usuários…</p>
        ) : (
          <div className="space-y-3">
            {(usuarios.data ?? []).map((u) => (
              <Card key={u.id}>
                <CardContent className="space-y-3 py-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">{u.nome ?? u.email}</p>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    {PAPEIS.map((p) => (
                      <label key={p} className="flex items-center gap-2 text-xs">
                        <Checkbox
                          checked={u.papeis.includes(p)}
                          onCheckedChange={(c) => alternarPapel(u.id, p, !!c)}
                        />
                        {p}
                      </label>
                    ))}
                  </div>

                  <div>
                    <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
                      Áreas autorizadas
                    </p>
                    <div className="flex flex-wrap gap-3">
                      {areas.map((a) => (
                        <label key={a.id} className="flex items-center gap-2 text-xs">
                          <Checkbox
                            checked={u.areas.includes(a.id)}
                            onCheckedChange={(c) => alternarArea(u.id, a.id, !!c)}
                          />
                          {a.nome}
                        </label>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {(usuarios.data ?? []).length === 0 && (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  Nenhum usuário cadastrado ainda.
                  <div className="mt-3">
                    <Button variant="outline" onClick={() => usuarios.refetch()}>
                      Atualizar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
