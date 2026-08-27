import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import intralogLogoAsset from "@/assets/intralog-logo.png.asset.json";
import { APP_NOME } from "@/components/layout/Marca";
import { mascararEmail, validarEmail } from "@/lib/senha";
import { registrarSolicitacaoRecuperacao } from "@/lib/recuperacao.functions";

const TITULO = "Recuperar acesso | Intralog Gestão de Férias";
const DESCRICAO =
  "Solicite um link seguro para criar uma nova senha de acesso ao painel de férias e presença da Intralog.";

const MENSAGEM_NEUTRA =
  "Se o e-mail estiver cadastrado, você receberá um link para criar uma nova senha. Verifique também a caixa de spam.";

const ESPERA_SEGUNDOS = 60;

export const Route = createFileRoute("/recuperar-senha")({
  head: () => ({
    meta: [
      { title: TITULO },
      { name: "description", content: DESCRICAO },
      { property: "og:title", content: TITULO },
      { property: "og:description", content: DESCRICAO },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RecuperarSenhaPage,
});

function RecuperarSenhaPage() {
  const [email, setEmail] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [espera, setEspera] = useState(0);

  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setAviso(null);

    const problema = validarEmail(email);
    if (problema) {
      setErro(problema);
      return;
    }
    if (espera > 0) {
      setErro(
        `Já enviamos uma solicitação recentemente. Aguarde ${espera} segundo(s) antes de pedir um novo link.`,
      );
      return;
    }

    setEnviando(true);
    let resultado: "ENVIADO" | "FALHA" | "LIMITE" = "ENVIADO";
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/redefinir-senha`,
      });
      if (error) {
        const msg = error.message ?? "";
        if (/rate limit|too many|429/i.test(msg)) {
          resultado = "LIMITE";
          setErro(
            "Recebemos muitas solicitações em pouco tempo. Aguarde alguns minutos e tente novamente.",
          );
        } else {
          resultado = "FALHA";
          setErro(
            "Não conseguimos concluir a solicitação agora. Verifique sua conexão e tente novamente.",
          );
        }
      } else {
        // Mensagem neutra: nunca revela se o e-mail existe no sistema.
        setAviso(MENSAGEM_NEUTRA);
        setEspera(ESPERA_SEGUNDOS);
      }
    } catch {
      resultado = "FALHA";
      setErro("Não conseguimos concluir a solicitação agora. Verifique sua conexão e tente novamente.");
    } finally {
      setEnviando(false);
      try {
        await registrarSolicitacaoRecuperacao({
          data: { emailMascarado: mascararEmail(email), resultado },
        });
      } catch {
        /* a auditoria não deve bloquear a recuperação do usuário */
      }
    }
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
            <CardTitle className="text-xl leading-snug">Recuperar acesso</CardTitle>
            <CardDescription>
              Informe seu e-mail corporativo e enviaremos um link para você criar uma nova senha.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={enviar} className="space-y-4" noValidate>
              <div className="space-y-2">
                <Label htmlFor="email-recuperacao">
                  E-mail corporativo <span aria-hidden className="text-destructive">*</span>
                </Label>
                <Input
                  id="email-recuperacao"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoFocus
                  value={email}
                  aria-invalid={!!erro}
                  aria-describedby="mensagem-recuperacao"
                  onChange={(ev) => setEmail(ev.target.value)}
                />
              </div>

              <div id="mensagem-recuperacao" aria-live="polite" className="space-y-2">
                {erro && (
                  <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                    {erro}
                  </p>
                )}
                {aviso && (
                  <p className="rounded-md border border-border bg-muted p-3 text-sm text-muted-foreground">
                    {aviso}
                  </p>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={enviando}>
                {enviando ? "Enviando…" : "Enviar link de recuperação"}
              </Button>
            </form>

            <Button asChild variant="outline" className="w-full">
              <Link to="/auth">Voltar para o login</Link>
            </Button>
          </CardContent>
        </Card>
        <p className="mt-4 rounded-md border border-border bg-card p-3 text-center text-xs leading-relaxed text-muted-foreground">
          Por segurança, o link tem prazo de validade e pode ser usado uma única vez. Nunca enviamos
          senhas por e-mail.
        </p>
      </div>
    </main>
  );
}
