import type { ClassificacaoImport, Employee, Area, Turno, Funcao } from "@/lib/sistema";
import { normaliza } from "@/lib/sistema";

/* ------------------------------------------------------------------ */
/* Fontes de importação                                                */
/* ------------------------------------------------------------------ */

export const FONTES = [
  {
    key: "SAP_ATIVOS",
    label: "SAP RH — Colaboradores ativos",
    descricao: "Extração do SAP com o quadro ativo. Ausência no arquivo nunca desliga ninguém.",
  },
  {
    key: "SAP_DESLIGADOS",
    label: "SAP RH — Desligados",
    descricao: "Extração de desligamentos. Exige status explícito ou data de desligamento.",
  },
  {
    key: "HEADCOUNT",
    label: "Controle de Headcount",
    descricao: "Planilha de headcount com setor/turno real e planejado, vagas e férias.",
  },
  {
    key: "FERIAS_A_VENCER",
    label: "Férias a vencer",
    descricao: "Relatório de períodos de férias a vencer (saída e retorno).",
  },
  {
    key: "PERSONALIZADO",
    label: "Modelo personalizado",
    descricao: "Mapeamento livre de qualquer planilha.",
  },
] as const;

export type FonteKey = (typeof FONTES)[number]["key"];

/* ------------------------------------------------------------------ */
/* Campos do sistema + aliases de cabeçalho                            */
/* ------------------------------------------------------------------ */

type CampoDef = {
  key: string;
  label: string;
  aliases: string[];
};

export const CAMPOS_DEF = [
  { key: "re", label: "RE / Matrícula", aliases: ["RE", "NUMERO PESSOAL", "NO PESSOAL", "N PESSOAL", "MATRICULA", "EMPLOYEE NUMBER", "CHAPA"] },
  { key: "nome", label: "Nome", aliases: ["NOME", "NOME DO COLABORADOR", "COLABORADOR", "NOME COMPLETO"] },
  { key: "wwid", label: "WWID", aliases: ["WWID", "ID GLOBAL"] },
  { key: "vaga_id", label: "ID da vaga", aliases: ["ID DA VAGA", "ID VAGA", "VAGA", "POSITION ID", "ID POSICAO"] },
  { key: "area", label: "Setor real", aliases: ["SETOR REAL", "REAL SETOR", "SETOR", "AREA", "REAL", "CENTRO DE CUSTO"] },
  { key: "setor_planejado", label: "Setor planejado", aliases: ["SETOR PLANEJADO", "PLANEJADO SETOR", "PLANEJADO"] },
  { key: "turno", label: "Turno real", aliases: ["TURNO REAL", "TURNO", "REAL TURNO"] },
  { key: "turno_planejado", label: "Turno planejado", aliases: ["TURNO PLANEJADO", "TURNO PLAN", "PLAN TURNO"] },
  { key: "funcao", label: "Atividade / Função", aliases: ["ATIVIDADE", "FUNCAO", "ATIVIDADE OU FUNCAO", "FUNCAO REAL"] },
  { key: "cargo", label: "Cargo real", aliases: ["CARGO REAL", "CARGO", "POSICAO", "JOB TITLE"] },
  { key: "cargo_padronizado", label: "Cargo padronizado", aliases: ["CARGO PADRONIZADO", "CARGO PADRAO"] },
  { key: "cargo_planejado", label: "Cargo planejado", aliases: ["CARGO PLANEJADO"] },
  { key: "status_vaga", label: "Status da vaga", aliases: ["STATUS DA VAGA", "STATUS VAGA", "SITUACAO DA VAGA"] },
  { key: "lider", label: "Líder responsável", aliases: ["LIDER", "LIDER RESPONSAVEL", "GESTOR", "SUPERVISOR"] },
  { key: "unidade", label: "Unidade", aliases: ["UNIDADE", "PLANTA", "SITE", "FILIAL"] },
  { key: "horario", label: "Horário", aliases: ["HORARIO", "HORARIO DE TRABALHO", "JORNADA"] },
  { key: "status", label: "Status do vínculo", aliases: ["STATUS", "STATUS DO VINCULO", "SITUACAO", "SITUACAO DO VINCULO"] },
  { key: "data_admissao", label: "Data de admissão", aliases: ["DATA DE ADMISSAO", "ADMISSAO", "DATA ADMISSAO", "HIRE DATE"] },
  { key: "data_desligamento", label: "Data de desligamento", aliases: ["DATA DE DESLIGAMENTO", "DESLIGAMENTO", "DATA DESLIGAMENTO", "DEMISSAO", "TERMINATION DATE"] },
  { key: "ferias_saida", label: "Férias — saída", aliases: ["FERIAS SAIDA", "SAIDA FERIAS", "INICIO FERIAS", "FERIAS INICIO"] },
  { key: "ferias_retorno", label: "Férias — retorno", aliases: ["FERIAS RETORNO", "RETORNO FERIAS", "FIM FERIAS", "FERIAS FIM"] },
  { key: "observacoes", label: "Observações", aliases: ["OBSERVACOES", "OBSERVACAO", "OBS"] },
] as const satisfies readonly CampoDef[];

export type CampoKey = (typeof CAMPOS_DEF)[number]["key"];
export type Mapeamento = Partial<Record<CampoKey, string>>;

const K = (...keys: CampoKey[]) => keys;

const CAMPOS_SAP = K(
  "re", "nome", "cargo", "horario", "status", "data_admissao", "data_desligamento", "area", "turno",
  "funcao", "lider", "unidade",
);

const CAMPOS_HEADCOUNT = K(
  "vaga_id", "re", "nome", "wwid", "cargo", "cargo_padronizado", "turno", "area", "setor_planejado",
  "turno_planejado", "funcao", "lider", "ferias_saida", "ferias_retorno", "observacoes",
  "cargo_planejado", "status_vaga", "status", "unidade",
);

const CAMPOS_FERIAS = K("re", "nome", "area", "turno", "funcao", "ferias_saida", "ferias_retorno", "observacoes");

export const CAMPOS_POR_FONTE: Record<FonteKey, CampoKey[]> = {
  SAP_ATIVOS: CAMPOS_SAP,
  SAP_DESLIGADOS: CAMPOS_SAP,
  HEADCOUNT: CAMPOS_HEADCOUNT,
  FERIAS_A_VENCER: CAMPOS_FERIAS,
  PERSONALIZADO: CAMPOS_DEF.map((c) => c.key),
};

export const OBRIGATORIOS_POR_FONTE: Record<FonteKey, CampoKey[]> = {
  SAP_ATIVOS: K("re", "nome"),
  SAP_DESLIGADOS: K("re", "nome"),
  HEADCOUNT: K("re", "nome", "area"),
  FERIAS_A_VENCER: K("re", "ferias_saida", "ferias_retorno"),
  PERSONALIZADO: K("re", "nome"),
};

/** Compatibilidade com o formato antigo (fonte personalizada). */
export const CAMPOS = CAMPOS_DEF.map((c) => ({
  key: c.key,
  label: c.label,
  obrigatorio: c.key === "re" || c.key === "nome",
}));

export function camposDaFonte(fonte: FonteKey) {
  const obrig = new Set<string>(OBRIGATORIOS_POR_FONTE[fonte]);
  return CAMPOS_POR_FONTE[fonte].map((key) => {
    const def = CAMPOS_DEF.find((c) => c.key === key)!;
    return { key, label: def.label, obrigatorio: obrig.has(key) };
  });
}

/* ------------------------------------------------------------------ */
/* Campos que nunca são importados                                     */
/* ------------------------------------------------------------------ */

export const AVISO_CAMPO_SENSIVEL =
  "Campo não necessário para este controle e não será importado.";

const SENSIVEIS: { termo: string; rotulo: string }[] = [
  { termo: "CPF", rotulo: "CPF" },
  { termo: "RG", rotulo: "RG" },
  { termo: "IDENTIDADE", rotulo: "RG" },
  { termo: "BANCO", rotulo: "Banco" },
  { termo: "AGENCIA", rotulo: "Conta bancária" },
  { termo: "CONTA", rotulo: "Conta bancária" },
  { termo: "PIX", rotulo: "Dados bancários" },
  { termo: "ENDERECO", rotulo: "Endereço" },
  { termo: "LOGRADOURO", rotulo: "Endereço" },
  { termo: "BAIRRO", rotulo: "Endereço" },
  { termo: "CEP", rotulo: "Endereço" },
  { termo: "TELEFONE", rotulo: "Telefone pessoal" },
  { termo: "CELULAR", rotulo: "Telefone pessoal" },
  { termo: "NASCIMENTO", rotulo: "Data de nascimento" },
  { termo: "IDADE", rotulo: "Idade" },
  { termo: "ESTADO CIVIL", rotulo: "Estado civil" },
  { termo: "ATESTADO", rotulo: "Dados médicos" },
  { termo: "MEDIC", rotulo: "Dados médicos" },
  { termo: "CID", rotulo: "Dados médicos" },
  { termo: "ASO", rotulo: "Dados médicos" },
  { termo: "SALARIO", rotulo: "Remuneração" },
  { termo: "DEPENDENTE", rotulo: "Dados pessoais" },
];

export type ColunaIgnorada = { coluna: string; motivo: string };

export function detectarCamposSensiveis(colunas: string[]): ColunaIgnorada[] {
  const out: ColunaIgnorada[] = [];
  for (const col of colunas) {
    const n = normaliza(col);
    const achou = SENSIVEIS.find(({ termo }) =>
      termo.length <= 3 ? n.split(/[^A-Z0-9]+/).includes(termo) : n.includes(termo),
    );
    if (achou) out.push({ coluna: col, motivo: `${achou.rotulo} — ${AVISO_CAMPO_SENSIVEL}` });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Auto-mapeamento por alias de cabeçalho                              */
/* ------------------------------------------------------------------ */

export function autoMapear(colunas: string[], fonte: FonteKey): Mapeamento {
  const ignoradas = new Set(detectarCamposSensiveis(colunas).map((c) => c.coluna));
  const disponiveis = colunas.filter((c) => !ignoradas.has(c));
  const usadas = new Set<string>();
  const auto: Mapeamento = {};
  const chaves = CAMPOS_POR_FONTE[fonte];
  const aliasesDe = (key: CampoKey) =>
    CAMPOS_DEF.find((c) => c.key === key)!.aliases.map(normaliza);

  // 1ª passada: correspondência exata de cabeçalho (evita que "Turno Plan" caia em "Turno").
  for (const key of chaves) {
    const alvos = aliasesDe(key);
    const exato = disponiveis.find((c) => !usadas.has(c) && alvos.includes(normaliza(c)));
    if (exato) {
      auto[key] = exato;
      usadas.add(exato);
    }
  }
  // 2ª passada: correspondência parcial.
  for (const key of chaves) {
    if (auto[key]) continue;
    const alvos = aliasesDe(key);
    const parcial = disponiveis.find(
      (c) => !usadas.has(c) && alvos.some((a) => a.length >= 4 && normaliza(c).includes(a)),
    );
    if (parcial) {
      auto[key] = parcial;
      usadas.add(parcial);
    }
  }
  return auto;
}

/* ------------------------------------------------------------------ */
/* Classificação                                                       */
/* ------------------------------------------------------------------ */

export type DecisaoLinha = "PENDENTE" | "APROVADA" | "REJEITADA" | "IGNORADA";

export type DecisaoSetorTipo =
  | "DEFINITIVA"
  | "TEMPORARIA"
  | "COBERTURA_FERIAS"
  | "CORRECAO_CADASTRAL"
  | "IGNORAR";

export type DecisaoSetor = {
  tipo: DecisaoSetorTipo;
  inicio: string;
  fim: string;
  /** Movimentação temporária: origem/destino e justificativa são obrigatórios. */
  areaOrigem?: string | null;
  areaDestino?: string | null;
  turnoOrigem?: string | null;
  turnoDestino?: string | null;
  justificativa?: string;
};

export type LinhaImportada = {
  linha: number;
  dados: Record<string, string>;
  classificacao: ClassificacaoImport;
  diferencas: Record<string, { de: string | null; para: string | null }>;
  erros: string[];
  avisos: string[];
  employee_id: string | null;
  aplicar: boolean;
  decisao: DecisaoLinha;
  justificativa: string;
  acao_sugerida: string;
};

const asTexto = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

export function toISO(valor: string): string | null {
  const v = valor.trim();
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const br = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (br) {
    const [, d, m, y] = br;
    const ano = y!.length === 2 ? `20${y}` : y!;
    return `${ano}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
  }
  const serial = Number(v);
  if (Number.isFinite(serial) && serial > 20000 && serial < 60000) {
    const ms = Math.round((serial - 25569) * 86400 * 1000);
    return new Date(ms).toISOString().slice(0, 10);
  }
  return null;
}

const DESLIGADO = ["DESLIGADO", "DEMITIDO", "INATIVO", "RESCISAO", "RESCISÃO", "TERMINATED"];
const AFASTADO = ["AFASTADO", "AFASTAMENTO", "LICENCA", "LICENÇA", "INSS", "AUXILIO DOENCA"];
const VAGA_ABERTA_TERMOS = ["ABERTA", "VAGA ABERTA", "EM ABERTO", "OPEN", "A CONTRATAR", "VAGO"];

export const ACAO_SUGERIDA: Record<ClassificacaoImport, string> = {
  NOVO_COLABORADOR: "Cadastrar após aprovação manual",
  ATUALIZACAO_CADASTRAL: "Atualizar dados cadastrais",
  MUDANCA_DE_SETOR: "Escolher o tipo de movimentação",
  MUDANCA_DE_TURNO: "Atualizar turno vigente",
  MUDANCA_DE_FUNCAO: "Atualizar função",
  MUDANCA_DE_LIDER: "Atualizar líder responsável",
  AFASTAMENTO: "Marcar colaborador como afastado",
  RETORNO_DE_AFASTAMENTO: "Reativar colaborador afastado",
  DESLIGAMENTO: "Registrar desligamento com data",
  REATIVACAO: "Reativar colaborador desligado",
  VAGA_ABERTA: "Registrar vaga em aberto (não cria colaborador)",
  DUPLICIDADE: "Corrigir o RE duplicado no arquivo",
  DADO_INVALIDO: "Corrigir a linha no arquivo",
  SEM_ALTERACAO: "Nenhuma ação necessária",
};

const BLOQUEADAS: ClassificacaoImport[] = ["DADO_INVALIDO", "DUPLICIDADE", "SEM_ALTERACAO"];

export function classificar(
  linhas: Record<string, string>[],
  mapeamento: Mapeamento,
  employees: Employee[],
  areas: Area[],
  turnos: Turno[],
  funcoes: Funcao[],
  fonte: FonteKey = "PERSONALIZADO",
): LinhaImportada[] {
  const campos = camposDaFonte(fonte);
  const porRe = new Map(employees.filter((e) => e.re).map((e) => [normaliza(e.re!), e]));
  const nomeArea = new Map(areas.map((a) => [a.id, normaliza(a.nome)]));
  const nomeTurno = new Map(turnos.map((t) => [t.id, normaliza(t.nome)]));
  const nomeFuncao = new Map(funcoes.map((f) => [f.id, normaliza(f.nome)]));

  const chaveDe = (bruta: Record<string, string>) =>
    normaliza(asTexto(bruta[mapeamento["re"] ?? ""]));
  const contagem = new Map<string, number>();
  for (const b of linhas) {
    const c = chaveDe(b);
    if (c) contagem.set(c, (contagem.get(c) ?? 0) + 1);
  }

  return linhas.map((bruta, i) => {
    const val = (k: CampoKey) => asTexto(bruta[mapeamento[k] ?? ""]);
    const dados: Record<string, string> = {};
    for (const c of CAMPOS_DEF) dados[c.key] = val(c.key);

    const erros: string[] = [];
    const chave = normaliza(dados["re"] ?? "");
    const statusTxt = normaliza(dados["status"] ?? "");
    const statusVaga = normaliza(dados["status_vaga"] ?? "");
    const ehVaga =
      !chave && (!!dados["vaga_id"] || VAGA_ABERTA_TERMOS.some((t) => statusVaga.includes(t)));

    for (const c of campos) {
      if (!c.obrigatorio) continue;
      if (ehVaga && (c.key === "re" || c.key === "nome")) continue;
      if (!dados[c.key]) erros.push(`${c.label} vazio`);
    }
    for (const campoData of ["data_desligamento", "data_admissao", "ferias_saida", "ferias_retorno"]) {
      if (dados[campoData] && !toISO(dados[campoData]!)) {
        const def = CAMPOS_DEF.find((c) => c.key === campoData)!;
        erros.push(`${def.label} inválida`);
      }
    }

    const avisos: string[] = [];
    const conhecido = (valor: string, mapa: Map<string, string>) =>
      !valor || [...mapa.values()].includes(normaliza(valor));
    if (!conhecido(dados["area"] ?? "", nomeArea))
      avisos.push(`Setor "${dados["area"]}" não existe no cadastro — será criado ao aprovar.`);
    if (!conhecido(dados["turno"] ?? "", nomeTurno))
      avisos.push(`Turno "${dados["turno"]}" não existe no cadastro — será criado ao aprovar.`);
    if (!conhecido(dados["funcao"] ?? "", nomeFuncao))
      avisos.push(`Função "${dados["funcao"]}" não existe no cadastro — será criada ao aprovar.`);

    const duplicado = !!chave && (contagem.get(chave) ?? 0) > 1;
    const atual = chave ? porRe.get(chave) : undefined;

    const diferencas: LinhaImportada["diferencas"] = {};
    const compara = (campo: string, de: string | null, para: string) => {
      if (para && normaliza(para) !== normaliza(de ?? "")) diferencas[campo] = { de, para };
    };

    if (atual) {
      compara("nome", atual.nome, dados["nome"] ?? "");
      compara("area", nomeArea.get(atual.area_id ?? "") ?? null, dados["area"] ?? "");
      compara("turno", nomeTurno.get(atual.shift_id ?? "") ?? null, dados["turno"] ?? "");
      compara("funcao", nomeFuncao.get(atual.function_id ?? "") ?? null, dados["funcao"] ?? "");
      compara("lider", atual.lider, dados["lider"] ?? "");
    }

    const desligadoNoArquivo =
      DESLIGADO.some((t) => statusTxt.includes(t)) || !!toISO(dados["data_desligamento"] ?? "");
    const afastadoNoArquivo = AFASTADO.some((t) => statusTxt.includes(t));
    const ativoNoArquivo =
      !!statusTxt && !desligadoNoArquivo && !afastadoNoArquivo;

    let classificacao: ClassificacaoImport;
    if (ehVaga) classificacao = "VAGA_ABERTA";
    else if (!chave) {
      erros.push("Linha sem RE / matrícula — identificação obrigatória");
      classificacao = "DADO_INVALIDO";
    } else if (erros.length) classificacao = "DADO_INVALIDO";
    else if (duplicado) classificacao = "DUPLICIDADE";
    else if (!atual) classificacao = "NOVO_COLABORADOR";
    else if (desligadoNoArquivo && atual.status !== "DESLIGADO") classificacao = "DESLIGAMENTO";
    else if (afastadoNoArquivo && atual.status !== "AFASTADO") classificacao = "AFASTAMENTO";
    else if (ativoNoArquivo && atual.status === "AFASTADO") classificacao = "RETORNO_DE_AFASTAMENTO";
    else if (ativoNoArquivo && atual.status === "DESLIGADO") classificacao = "REATIVACAO";
    else if (diferencas["area"]) classificacao = "MUDANCA_DE_SETOR";
    else if (diferencas["turno"]) classificacao = "MUDANCA_DE_TURNO";
    else if (diferencas["funcao"]) classificacao = "MUDANCA_DE_FUNCAO";
    else if (diferencas["lider"] && !diferencas["nome"]) classificacao = "MUDANCA_DE_LIDER";
    else if (Object.keys(diferencas).length) classificacao = "ATUALIZACAO_CADASTRAL";
    else classificacao = "SEM_ALTERACAO";

    if (duplicado && classificacao !== "DADO_INVALIDO") {
      erros.push("RE duplicado no arquivo — linhas bloqueadas");
    }

    return {
      linha: i + 2,
      dados,
      classificacao,
      diferencas,
      erros,
      avisos,
      employee_id: atual?.id ?? null,
      // Nada é aplicado sem decisão explícita do usuário na tela de comparação.
      aplicar: false,
      decisao: "PENDENTE",
      justificativa: "",
      acao_sugerida: ACAO_SUGERIDA[classificacao],
    };
  });
}

export const podeAprovar = (l: LinhaImportada) =>
  !BLOQUEADAS.includes(l.classificacao) && !l.erros.length;

/** Guarda final: só linhas aprovadas e válidas podem ser gravadas. */
export const linhaProcessavel = (l: LinhaImportada) => l.decisao === "APROVADA" && podeAprovar(l);

/** Valida a decisão de mudança de setor (empréstimo exige data inicial e final). */
export function validarDecisaoSetor(
  l: LinhaImportada,
  d: DecisaoSetor | undefined,
): string | null {
  if (l.classificacao !== "MUDANCA_DE_SETOR") return null;
  if (!d) return null;
  if (d.tipo === "IGNORAR" || d.tipo === "CORRECAO_CADASTRAL") return null;
  if (!d.inicio) return "Informe a data efetiva da movimentação.";
  if (d.tipo !== "DEFINITIVA" && !d.fim)
    return "Movimentação temporária exige data final.";
  if (d.tipo !== "DEFINITIVA" && d.fim && d.fim <= d.inicio)
    return "A data final deve ser posterior à data efetiva.";
  return null;
}

export const TIPO_MOVIMENTACAO: Record<
  Exclude<DecisaoSetorTipo, "IGNORAR" | "CORRECAO_CADASTRAL">,
  "TRANSFERENCIA_DEFINITIVA" | "EMPRESTIMO_TEMPORARIO" | "COBERTURA_DE_FERIAS"
> = {
  DEFINITIVA: "TRANSFERENCIA_DEFINITIVA",
  TEMPORARIA: "EMPRESTIMO_TEMPORARIO",
  COBERTURA_FERIAS: "COBERTURA_DE_FERIAS",
};

export const CLASSE_COR: Record<ClassificacaoImport, string> = {
  NOVO_COLABORADOR: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  REATIVACAO: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  RETORNO_DE_AFASTAMENTO: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  ATUALIZACAO_CADASTRAL: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  MUDANCA_DE_LIDER: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  VAGA_ABERTA: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  MUDANCA_DE_SETOR: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  MUDANCA_DE_TURNO: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  MUDANCA_DE_FUNCAO: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  AFASTAMENTO: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  DESLIGAMENTO: "bg-destructive/15 text-destructive",
  DUPLICIDADE: "bg-destructive/15 text-destructive",
  DADO_INVALIDO: "bg-destructive/15 text-destructive",
  SEM_ALTERACAO: "bg-muted text-muted-foreground",
};
