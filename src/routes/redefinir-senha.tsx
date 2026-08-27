import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Eye, EyeOff, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import intralogLogoAsset from "@/assets/intralog-logo.png.asset.json";
import { requisitosSenha, validarNovaSenha } from "@/lib/senha";
import { registrarRedefinicaoConcluida } from "@/lib/recuperacao.functions";

const TITULO = "Criar nova senha | Intralog Gestão de Férias";
const DESCRICAO = "Defina uma nova senha de acesso ao painel de férias e presença da Intralog.";

export const Route = createFileRoute("/redefinir-senha")({
  ssr: false,
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
  component: RedefinirSenhaPage,
});

type Estado = "verificando" | "pronto" | "link_invalido" | "concluido";

function mensagemDoLink(descricao: string): string {
  if (/expired|expirou/i.test(descricao))
    return "Este link expirou. Por segurança, ele vale por tempo limitado. Solicite um novo link para continuar.";
  if (/used|already/i.test(descricao))
    return "Este link já foi utilizado. Cada link permite criar uma nova senha uma única vez.";
  return "Este link não é válido. Solicite um novo link para criar sua senha.";
}

function RedefinirSenhaPage() {
  const navigate = useNavigate();
  const [estado, setEstado] = useState<Estado>("verificando");
  const [motivoLink, setMotivoLink] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [mostrar, setMostrar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let ativo = true;

    async function preparar() {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const query = new URLSearchParams(window.location.search);
      const descricaoErro = hash.get("error_description") ?? query.get("error_description");

      if (descricaoErro) {
        if (!ativo) return;
        setMotivoLink(mensagemDoLink(descricaoErro));
        setEstado("link_invalido");
        return;
      }

      const code = query.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          if (!ativo) return;
          setMotivoLink(mensagemDoLink(error.message ?? ""));
          setEstado("link_invalido");
          return;
        }
      }

      const { data } = await supabase.auth.getUser();
      if (!ativo) return;
      if (!data.user) {
        setMotivoLink(
          "Não encontramos um pedido de nova senha válido. Solicite um novo link para continuar.",
        );
        setEstado("link_invalido");
        return;
      }
      setEmail(data.user.email ?? "");
      setEstado("pronto");
    }

    // o cliente pode levar um instante para ler o link; damos essa folga
    const t = setTimeout(preparar, 350);
    return () => {
      ativo = false;
      clearTimeout(t);
    };
  }, []);

  const requisitos = requisitosSenha(senha, email);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const problema = validarNovaSenha(senha, confirmacao, email);
    setErro(problema);
    if (problema) return;

    setSalvando(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: senha });
      if (error) {
        const msg = error.message ?? "";
        if (/session|jwt|expired|not authenticated/i.test(msg)) {
          setMotivoLink(
            "Este link expirou ou já foi utilizado. Solicite um novo link para criar sua senha.",
          );
          setEstado("link_invalido");
          return;
        }
        if (/rate limit|too many/i.test(msg)) {
          setErro("Muitas tentativas em pouco tempo. Aguarde alguns instantes e tente novamente.");
          return;
        }
        if (/pwned|weak|short|password/i.test(msg)) {
          setErro("Essa senha não foi aceita. Escolha outra que atenda aos requisitos abaixo.");
          return;
        }
        setErro("Não foi possível salvar a nova senha agora. Verifique sua conexão e tente novamente.");
        return;
      }

      try {
        await registrarRedefinicaoConcluida({ data: undefined });
      } catch {
        /* a auditoria não deve impedir a conclusão */
      }

      // encerra a sessão de recuperação e as demais sessões abertas
      try {
        await supabase.auth.signOut({ scope: "global" });
      } catch {
        await supabase.auth.signOut();
      }

      setEstado("concluido");
      setTimeout(() => navigate({ to: "/auth", replace: true }), 2500);
    } finally {
      setSalvando(false);
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
            <CardTitle className="text-xl leading-snug">Criar nova senha</CardTitle>
            <CardDescription>
              {estado === "pronto" && email
                ? `Definindo a nova senha de ${email}.`
                : "Escolha uma senha forte para proteger o seu acesso."}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {estado === "verificando" && (
              <p className="text-sm text-muted-foreground" aria-live="polite">
                Validando seu link de recuperação…
              </p>
            )}

            {estado === "link_invalido" && (
              <div className="space-y-4" aria-live="polite">
                <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                  {motivoLink}
                </p>
                <Button asChild className="w-full">
                  <Link to="/recuperar-senha">Solicitar novo link</Link>
                </Button>
                <Button asChild variant="outline" className="w-full">
                  <Link to="/auth">Voltar para o login</Link>
                </Button>
              </div>
            )}

            {estado === "concluido" && (
              <div className="space-y-4" aria-live="polite">
                <p className="rounded-md border border-border bg-muted p-3 text-sm text-foreground">
                  Senha alterada com sucesso. Por segurança, entre novamente com a nova senha.
                </p>
                <Button asChild className="w-full">
                  <Link to="/auth">Ir para o login</Link>
                </Button>
              </div>
            )}

            {estado === "pronto" && (
              <form onSubmit={salvar} className="space-y-4" noValidate>
                <div className="space-y-2">
                  <Label htmlFor="nova-senha">
                    Nova senha <span aria-hidden className="text-destructive">*</span>
                  </Label>
                  <div className="relative">
                    <Input
                      id="nova-senha"
                      type={mostrar ? "text" : "password"}
                      autoComplete="new-password"
                      autoFocus
                      className="pr-10"
                      value={senha}
                      aria-describedby="requisitos-senha"
                      onChange={(ev) => setSenha(ev.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setMostrar((v) => !v)}
                      aria-label={mostrar ? "Ocultar senha" : "Mostrar senha"}
                      aria-pressed={mostrar}
                      className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
                    >
                      {mostrar ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmar-senha">
                    Confirmar nova senha <span aria-hidden className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="confirmar-senha"
                    type={mostrar ? "text" : "password"}
                    autoComplete="new-password"
                    value={confirmacao}
                    onChange={(ev) => setConfirmacao(ev.target.value)}
                  />
                </div>

                <ul id="requisitos-senha" className="space-y-1 text-sm">
                  {requisitos.map((r) => (
                    <li
                      key={r.chave}
                      className={
                        r.atende ? "flex items-center gap-2 text-success" : "flex items-center gap-2 text-muted-foreground"
                      }
                    >
                      {r.atende ? (
                        <Check className="size-4 shrink-0" aria-hidden />
                      ) : (
                        <X className="size-4 shrink-0" aria-hidden />
                      )}
                      <span>{r.texto}</span>
                      <span className="sr-only">{r.atende ? "requisito atendido" : "requisito pendente"}</span>
                    </li>
                  ))}
                </ul>

                <div aria-live="polite">
                  {erro && (
                    <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                      {erro}
                    </p>
                  )}
                </div>

                <Button type="submit" className="w-full" disabled={salvando}>
                  {salvando ? "Salvando…" : "Salvar nova senha"}
                </Button>
                <Button asChild variant="outline" className="w-full">
                  <Link to="/auth">Voltar para o login</Link>
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
