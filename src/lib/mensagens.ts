import { humaniza } from "@/lib/sistema";

/**
 * Camada de linguagem: converte mensagens técnicas e códigos internos
 * em textos claros para quem usa o aplicativo.
 * Nada aqui altera dados, regras, enums ou nomes de campos do banco.
 */

/** Rótulos amigáveis para códigos internos exibidos na tela. */
const DICIONARIO: Record<string, string> = {
  // Conflitos e criticidade
  CRITICO_SEM_SUBSTITUTO: "Crítico: substituto não definido.",
  FUNCAO_CHAVE_SEM_SUBSTITUTO: "Função-chave sem substituto disponível.",
  CAPACIDADE_MINIMA: "Equipe abaixo da capacidade mínima no período.",
  MESMA_FUNCAO_MESMA_AREA: "Mesma função em férias na mesma área.",
  MESMA_FUNCAO_OUTRA_AREA: "Mesma função em férias em outra área.",
  BLOQUEIO: "Bloqueio",
  CRITICO: "Crítico",
  ATENCAO: "Atenção",
  INFORMATIVO: "Informativo",

  // Presença
  PENDENTE: "Pendente",
  PRESENTE: "Presente",
  FALTA: "Falta",
  FALTA_SEM_JUSTIFICATIVA: "Falta sem justificativa",
  FALTA_JUSTIFICADA: "Falta justificada",
  ATESTADO: "Atestado",
  FERIAS: "Férias",
  AFASTADO: "Afastado",
  FOLGA: "Folga",
  ATRASO: "Atraso",
  APOIO_OUTRA_AREA: "Apoio em outra área",
  DIVERGENCIA: "Divergência — revisão necessária",

  // Importação
  NOVO_COLABORADOR: "Novo colaborador",
  ATUALIZACAO_CADASTRAL: "Atualização cadastral",
  MUDANCA_DE_SETOR: "Mudança de setor",
  MUDANCA_DE_TURNO: "Mudança de turno",
  MUDANCA_DE_FUNCAO: "Mudança de função",
  MUDANCA_DE_LIDER: "Mudança de líder",
  AFASTAMENTO: "Afastamento",
  RETORNO_DE_AFASTAMENTO: "Retorno de afastamento",
  DESLIGAMENTO: "Desligamento",
  REATIVACAO: "Reativação",
  VAGA_ABERTA: "Vaga aberta",
  DUPLICIDADE: "Registro duplicado",
  DADO_INVALIDO: "Dado inválido",
  SEM_ALTERACAO: "Sem alteração",
};

/** Texto amigável para um código interno; mantém o valor legível se não houver tradução. */
export const rotularCodigo = (valor: string | null | undefined) => {
  if (!valor) return "—";
  return DICIONARIO[valor] ?? humaniza(valor);
};

/** Frases técnicas comuns → mensagens humanizadas. */
const PADROES: { teste: RegExp; texto: string }[] = [
  {
    teste: /(unauthorized|not authorized|permission denied|row[- ]level security|violates row-level|forbidden|403|401|jwt)/i,
    texto: "Você não possui permissão para acessar esta informação.",
  },
  {
    teste: /(employee[_ ]movement[_ ]overlap|movimenta(ç|c)(ã|a)o.*sobrepos|overlapping movement)/i,
    texto: "Já existe uma movimentação para esse colaborador no período informado.",
  },
  {
    teste: /(duplicate key|already exists|unique constraint|23505)/i,
    texto: "Este registro já existe. Verifique os dados informados.",
  },
  {
    teste: /(foreign key|23503|violates foreign)/i,
    texto: "Não foi possível concluir: existe outro registro vinculado a esta informação.",
  },
  {
    teste: /(validation error|invalid input|check constraint|22p02|23514|zod)/i,
    texto: "Revise os campos destacados antes de continuar.",
  },
  {
    teste: /(no rows|no records found|not found|pgrst116|404)/i,
    texto: "Nenhum registro foi encontrado com os filtros selecionados.",
  },
  {
    teste: /(network|failed to fetch|timeout|econn|offline|502|503|504)/i,
    texto: "Não conseguimos falar com o servidor agora. Verifique a conexão e tente novamente.",
  },
  {
    teste: /(mutation failed|internal server error|unexpected|500)/i,
    texto: "Não foi possível salvar a alteração. Tente novamente.",
  },
];

const PARECE_TECNICO =
  /[{}[\]<>_]|https?:\/\/|error:|exception|null|undefined|supabase|postgres|pgrst|\b[0-9a-f]{8}-[0-9a-f]{4}\b/i;

export type MensagemErro = { texto: string; detalhe: string };

/** Converte qualquer erro em uma mensagem clara, guardando o detalhe técnico. */
export function mensagemErro(erro: unknown, padrao = "Não foi possível concluir a ação. Tente novamente."): MensagemErro {
  const bruto =
    erro instanceof Error
      ? erro.message
      : typeof erro === "string"
        ? erro
        : erro && typeof erro === "object" && "message" in erro
          ? String((erro as { message: unknown }).message)
          : "";

  const detalhe = bruto.trim();

  for (const p of PADROES) {
    if (p.teste.test(detalhe)) return { texto: p.texto, detalhe: detalhe || p.texto };
  }

  // Mensagens já escritas em português e sem ruído técnico são mantidas.
  if (detalhe && detalhe.length <= 180 && !PARECE_TECNICO.test(detalhe)) {
    return { texto: detalhe, detalhe };
  }

  return { texto: padrao, detalhe: detalhe || padrao };
}
