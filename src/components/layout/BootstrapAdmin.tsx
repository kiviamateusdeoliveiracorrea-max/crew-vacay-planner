import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useDiagnosticoAcesso, usePromoverPrimeiroAdmin } from "@/hooks/useAcessos";

export function BootstrapAdmin() {
  const diag = useDiagnosticoAcesso();
  const promover = usePromoverPrimeiroAdmin();

  if (diag.isLoading) return null;
  if (diag.error)
    return (
      <p className="mt-6 text-xs text-destructive">
        Diagnóstico indisponível: {(diag.error as Error).message}
      </p>
    );
  const d = diag.data;
  if (!d) return null;

  return (
    <div className="mt-8 rounded-lg border border-border bg-card p-4 text-left">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">Diagnóstico da conta</p>
      <dl className="mt-2 space-y-1 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">E-mail autenticado</dt>
          <dd className="font-medium text-foreground">{d.email ?? "—"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Cadastro de perfil</dt>
          <dd className="text-foreground">{d.temPerfil ? "Existe" : "Não existe (será criado)"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Perfis atribuídos</dt>
          <dd className="text-foreground">{d.papeis.length ? d.papeis.join(", ") : "Nenhum"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Usuários com perfil no sistema</dt>
          <dd className="text-foreground">{d.totalAdministradores}</dd>
        </div>
      </dl>

      {d.bootstrapDisponivel ? (
        <div className="mt-4 space-y-2">
          <p className="text-xs text-muted-foreground">
            Nenhum usuário possui perfil ainda. Você pode assumir o perfil ADMIN desta instalação:
            será criado o seu cadastro, o perfil ADMIN, o acesso a todas as unidades e áreas, e o
            registro na trilha de auditoria. Nenhum outro usuário é alterado.
          </p>
          <Button
            size="sm"
            disabled={promover.isPending}
            onClick={() =>
              promover.mutate(undefined, {
                onSuccess: () => toast.success("Você agora é o administrador do sistema."),
                onError: (e) => toast.error((e as Error).message),
              })
            }
          >
            {promover.isPending ? "Configurando…" : "Configurar minha conta como ADMIN"}
          </Button>
        </div>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">
          Já existe administrador configurado. Solicite a liberação do seu acesso em Usuários e
          Acessos.
        </p>
      )}
    </div>
  );
}
