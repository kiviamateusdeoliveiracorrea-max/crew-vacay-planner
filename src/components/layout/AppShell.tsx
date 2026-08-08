import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { type ReactNode, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePerfil } from "@/hooks/useSistema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const LINKS = [
  { to: "/", label: "Painel" },
  { to: "/ferias", label: "Férias" },
  { to: "/movimentacoes", label: "Movimentações" },
  { to: "/importar", label: "Importar base", cadastro: true },
  { to: "/auditoria", label: "Auditoria", admin: true },
  { to: "/admin", label: "Usuários e Acessos", admin: true },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const perfil = usePerfil();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth", replace: true });
  }, [loading, session, navigate]);

  if (loading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Carregando…
      </div>
    );
  }

  const links = LINKS.filter((l) => {
    if ("admin" in l && l.admin) return perfil.tem("ADMIN");
    if ("cadastro" in l && l.cadastro) return perfil.podeManterCadastro;
    return true;
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link to="/" className="text-sm font-semibold tracking-tight text-foreground">
            Gestão de Férias
          </Link>
          <nav className="flex flex-1 flex-wrap items-center gap-1">
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                  pathname === l.to
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            {perfil.papeis.map((p) => (
              <Badge key={p} variant="secondary" className="text-[10px]">
                {p}
              </Badge>
            ))}
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                await supabase.auth.signOut();
                navigate({ to: "/auth", replace: true });
              }}
            >
              Sair
            </Button>
          </div>
        </div>
      </header>

      {perfil.semPapel ? (
        <main className="mx-auto max-w-2xl px-4 py-16 text-center">
          <h1 className="text-lg font-semibold text-foreground">Acesso pendente de liberação</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sua conta ainda não possui um perfil atribuído. Peça a um administrador para liberar seu
            acesso e as áreas correspondentes.
          </p>
          <BootstrapAdmin />
        </main>
      ) : (
        <main className="mx-auto max-w-[1400px] px-4 py-6">{children}</main>
      )}
    </div>
  );
}
