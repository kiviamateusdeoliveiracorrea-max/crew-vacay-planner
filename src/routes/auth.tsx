import { mensagemAutenticacao } from "@/lib/mensagens";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import intralogLogoAsset from "@/assets/intralog-logo.png.asset.json";
import { APP_NOME, APP_SUBTITULO } from "@/components/layout/Marca";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar | Intralog Gestão de Férias" },
      { name: "description", content: "Acesse o painel gerencial de férias, presença e movimentações da Intralog." },
      { property: "og:title", content: "Entrar | Intralog Gestão de Férias" },
      { property: "og:description", content: "Acesse o painel gerencial de férias, presença e movimentações da Intralog." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [modo, setModo] = useState<"entrar" | "criar">("entrar");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && session) navigate({ to: "/", replace: true });
  }, [loading, session, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (modo === "entrar") {
        const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password: senha,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.success("Conta criada! Você já pode acessar.");
      }
    } catch (err) {
      toast.error(mensagemAutenticacao(err));
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("Não foi possível entrar com o Google. Tente novamente.");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/", replace: true });
  }

  async function recuperar() {
    if (!email) {
      toast.error("Informe o e-mail corporativo para receber o link de recuperação.");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    if (error) {
      toast.error("Não foi possível enviar o link de recuperação agora. Tente novamente em alguns instantes.");
      return;
    }
    toast.success("Se o e-mail estiver cadastrado, enviaremos um link de recuperação.");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-secondary px-4 py-10">
      <div className="w-full max-w-md">
        <Card className="shadow-[var(--shadow-card)]">
          <CardHeader className="text-center">
            <div className="mb-3 flex justify-center">
              <img
                src={intralogLogoAsset.url}
                alt="Intralog"
                width={2048}
                height={561}
                className="h-11 w-auto object-contain p-0.5"
              />
            </div>
            <CardTitle className="text-xl leading-snug">{APP_NOME}</CardTitle>
            <CardDescription>{APP_SUBTITULO}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={submit} className="space-y-4" noValidate={false}>
              <div className="space-y-2">
                <Label htmlFor="email">
                  E-mail corporativo <span aria-hidden className="text-destructive">*</span>
                </Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="senha">
                  Senha <span aria-hidden className="text-destructive">*</span>
                </Label>
                <Input
                  id="senha"
                  type="password"
                  autoComplete={modo === "entrar" ? "current-password" : "new-password"}
                  required
                  minLength={6}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Validando…" : modo === "entrar" ? "Entrar" : "Criar conta"}
              </Button>
            </form>
            <Button variant="outline" className="w-full" onClick={google}>
              Entrar com Google
            </Button>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <button
                type="button"
                className="text-muted-foreground underline-offset-4 hover:underline"
                onClick={() => setModo(modo === "entrar" ? "criar" : "entrar")}
              >
                {modo === "entrar" ? "Não tem acesso? Criar conta" : "Já tenho conta, entrar"}
              </button>
              <button
                type="button"
                className="text-muted-foreground underline-offset-4 hover:underline"
                onClick={recuperar}
              >
                Recuperar acesso
              </button>
            </div>
          </CardContent>
        </Card>
        <p className="mt-4 rounded-md border border-border bg-card p-3 text-center text-xs leading-relaxed text-muted-foreground">
          Acesso destinado a usuários autorizados. As ações realizadas no sistema podem ser
          registradas para fins de segurança e auditoria.
        </p>
      </div>
    </main>
  );
}
