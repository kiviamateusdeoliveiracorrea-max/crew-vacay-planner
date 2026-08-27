import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";
import {
  LayoutDashboard,
  CalendarDays,
  ArrowLeftRight,
  ClipboardCheck,
  Upload,
  FileSpreadsheet,
  ShieldCheck,
  Users,
  Bell,
  LogOut,
  Menu as MenuIcon,
  Building2,
  Clock3,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePerfil } from "@/hooks/useSistema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { BootstrapAdmin } from "@/components/layout/BootstrapAdmin";
import { SolicitarAcesso } from "@/components/layout/SolicitarAcesso";
import {
  APP_NOME,
  APP_SUBTITULO,
  LogoIntralog,
  UNIDADE_PADRAO,
} from "@/components/layout/Marca";

const LINKS = [
  { to: "/", label: "Visão Geral", icon: LayoutDashboard },
  { to: "/ferias", label: "Férias", icon: CalendarDays },
  { to: "/movimentacoes", label: "Movimentações", icon: ArrowLeftRight },
  { to: "/chamada", label: "Chamada Diária", icon: ClipboardCheck },
  { to: "/importar", label: "Importar Base", icon: Upload, cadastro: true },
  { to: "/relatorios", label: "Relatórios e Exportações", icon: FileSpreadsheet },
  { to: "/admin", label: "Usuários e Acessos", icon: Users, admin: true },
  { to: "/auditoria", label: "Auditoria", icon: ShieldCheck, admin: true },
] as const;

function useHorario() {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return agora.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AppShell({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const perfil = usePerfil();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const atualizado = useHorario();
  const [menuAberto, setMenuAberto] = useState(false);

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth", replace: true });
  }, [loading, session, navigate]);

  async function sair() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  if (loading || !session) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background">
        <LogoIntralog className="h-9 animate-pulse" />
        <p className="text-sm text-muted-foreground">Carregando o ambiente…</p>
      </div>
    );
  }

  const links = LINKS.filter((l) => {
    if ("admin" in l && l.admin) return perfil.tem("ADMIN");
    if ("cadastro" in l && l.cadastro) return perfil.podeManterCadastro;
    return true;
  });

  const email = session.user.email ?? "";
  const nome =
    (session.user.user_metadata?.["full_name"] as string | undefined) ||
    email.split("@")[0] ||
    "Usuário";
  const primeiroNome = nome.split(/[.\s]/)[0] || nome;
  const iniciais = primeiroNome.slice(0, 2).toUpperCase();

  const navItems = (
    <>
      {links.map((l) => {
        const Icon = l.icon;
        const ativo = pathname === l.to;
        return (
          <Link
            key={l.to}
            to={l.to}
            onClick={() => setMenuAberto(false)}
            aria-current={ativo ? "page" : undefined}
            className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              ativo
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            }`}
          >
            <Icon aria-hidden className="h-4 w-4 shrink-0" />
            <span>{l.label}</span>
          </Link>
        );
      })}
    </>
  );

  return (
    <TooltipProvider delayDuration={200}>
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-30 border-b border-border bg-card/95 shadow-[var(--shadow-header)] backdrop-blur">
          <div className="mx-auto grid max-w-[1400px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 lg:flex lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <Sheet open={menuAberto} onOpenChange={setMenuAberto}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menu">
                    <MenuIcon className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-72 p-4">
                  <LogoIntralog className="h-8" />
                  <p className="mt-3 text-sm font-semibold text-foreground">{APP_NOME}</p>
                  <p className="text-xs text-muted-foreground">{APP_SUBTITULO}</p>
                  <Separator className="my-4" />
                  <nav className="flex flex-col gap-1" aria-label="Menu principal">
                    {navItems}
                  </nav>
                </SheetContent>
              </Sheet>

              <Link to="/" className="flex min-w-0 items-center gap-3" aria-label="Ir para a visão geral">
                <LogoIntralog className="h-8" />
                <span className="hidden min-w-0 border-l border-border pl-3 sm:block">
                  <span className="block truncate text-sm font-semibold text-foreground">{APP_NOME}</span>
                  <span className="block truncate text-xs text-muted-foreground">{APP_SUBTITULO}</span>
                </span>
              </Link>
            </div>

            <div className="flex items-center gap-2">
              <span className="hidden items-center gap-1.5 rounded-md border border-border bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground md:inline-flex">
                <Building2 aria-hidden className="h-3.5 w-3.5" />
                {UNIDADE_PADRAO}
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="hidden items-center gap-1.5 text-xs text-muted-foreground xl:inline-flex">
                    <Clock3 aria-hidden className="h-3.5 w-3.5" />
                    {atualizado}
                  </span>
                </TooltipTrigger>
                <TooltipContent>Data e hora da última atualização da tela</TooltipContent>
              </Tooltip>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Central de notificações">
                    <Bell className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-72">
                  <p className="text-sm font-semibold text-foreground">Central de notificações</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    As pendências que exigem ação ficam reunidas na Visão Geral.
                  </p>
                  <Button asChild variant="outline" size="sm" className="mt-3 w-full">
                    <Link to="/">Abrir pendências</Link>
                  </Button>
                </PopoverContent>
              </Popover>

              <div className="hidden items-center gap-2 border-l border-border pl-2 sm:flex">
                <span
                  aria-hidden
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground"
                >
                  {iniciais}
                </span>
                <span className="min-w-0">
                  <span className="block max-w-[9rem] truncate text-sm font-medium capitalize text-foreground">
                    {primeiroNome}
                  </span>
                  <span className="flex flex-wrap gap-1">
                    {perfil.papeis.map((p) => (
                      <Badge key={p} variant="secondary" className="px-1.5 py-0 text-[10px]">
                        {p}
                      </Badge>
                    ))}
                  </span>
                </span>
              </div>

              <Button size="sm" variant="ghost" onClick={sair} aria-label="Sair do sistema">
                <LogOut aria-hidden className="h-4 w-4" />
                <span className="hidden sm:inline">Sair</span>
              </Button>
            </div>
          </div>

          <nav
            aria-label="Menu principal"
            className="mx-auto hidden max-w-[1400px] flex-wrap items-center gap-1 px-4 pb-2 lg:flex"
          >
            {navItems}
          </nav>
        </header>

        {perfil.semPapel ? (
          <main className="mx-auto max-w-2xl px-4 py-14 text-center">
            <div className="flex justify-center">
              <LogoIntralog className="h-10" />
            </div>
            <h1 className="mt-6 text-xl font-semibold text-foreground">Acesso pendente de liberação</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Sua conta ainda não possui um perfil atribuído. Solicite acesso abaixo — a liberação
              depende da aprovação de um administrador.
            </p>
            <SolicitarAcesso />
            <BootstrapAdmin />
            <div className="mt-8">
              <Button variant="outline" size="sm" onClick={sair}>
                <LogOut aria-hidden className="h-4 w-4" />
                Sair
              </Button>
            </div>
          </main>
        ) : (
          <main className="mx-auto max-w-[1400px] px-4 py-6">{children}</main>
        )}
      </div>
    </TooltipProvider>
  );
}
