/**
 * Política de senha corporativa (padrão do aplicativo).
 * Não guarda, não transmite e não registra senhas em lugar algum.
 */

export type RequisitoSenha = {
  chave: string;
  texto: string;
  atende: boolean;
};

export const TAMANHO_MINIMO = 10;

export function requisitosSenha(senha: string, email = ""): RequisitoSenha[] {
  const limpo = senha ?? "";
  const emailNorm = email.trim().toLowerCase();
  return [
    {
      chave: "tamanho",
      texto: `Pelo menos ${TAMANHO_MINIMO} caracteres`,
      atende: limpo.length >= TAMANHO_MINIMO,
    },
    { chave: "maiuscula", texto: "Uma letra maiúscula", atende: /[A-ZÀ-Þ]/.test(limpo) },
    { chave: "minuscula", texto: "Uma letra minúscula", atende: /[a-zà-þ]/.test(limpo) },
    { chave: "numero", texto: "Um número", atende: /[0-9]/.test(limpo) },
    {
      chave: "especial",
      texto: "Um caractere especial (por exemplo: ! @ # $ %)",
      atende: /[^A-Za-zÀ-ÿ0-9]/.test(limpo),
    },
    {
      chave: "espacos",
      texto: "Sem espaços no início ou no fim",
      atende: limpo.length > 0 && limpo === limpo.trim(),
    },
    {
      chave: "diferente_email",
      texto: "Diferente do seu e-mail",
      atende: limpo.length > 0 && (!emailNorm || limpo.toLowerCase() !== emailNorm),
    },
  ];
}

export const senhaValida = (senha: string, email = "") =>
  requisitosSenha(senha, email).every((r) => r.atende);

/** Mensagem de validação do formulário; null quando está tudo certo. */
export function validarNovaSenha(senha: string, confirmacao: string, email = ""): string | null {
  if (!senha) return "Informe a nova senha.";
  if (!senhaValida(senha, email))
    return "A senha ainda não atende aos requisitos indicados abaixo do campo.";
  if (senha !== confirmacao) return "As senhas informadas não são iguais. Confira e tente novamente.";
  return null;
}

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validarEmail(email: string): string | null {
  const v = (email ?? "").trim();
  if (!v) return "Informe o seu e-mail corporativo.";
  if (!EMAIL_REGEX.test(v)) return "O e-mail informado não parece válido. Verifique e tente novamente.";
  return null;
}

/** Mostra apenas parte do e-mail para a trilha de auditoria. */
export function mascararEmail(email: string): string {
  const [usuario = "", dominio = ""] = (email ?? "").trim().toLowerCase().split("@");
  if (!dominio) return "—";
  const visivel = usuario.slice(0, 2);
  return `${visivel}${"*".repeat(Math.max(usuario.length - 2, 1))}@${dominio}`;
}
