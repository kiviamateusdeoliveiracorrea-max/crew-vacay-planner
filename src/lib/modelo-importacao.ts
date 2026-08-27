import * as XLSX from "xlsx";
import {
  CAMPOS_DEF,
  CAMPOS_POR_FONTE,
  OBRIGATORIOS_POR_FONTE,
  FONTES,
  type CampoKey,
  type FonteKey,
} from "@/lib/importacao";

export const VERSAO_MODELO = "1.0";

export type ModeloKey = FonteKey | "MOVIMENTACOES";

export const MODELOS: { key: ModeloKey; label: string }[] = [
  { key: "HEADCOUNT", label: "Modelo Controle de Headcount" },
  { key: "SAP_ATIVOS", label: "Modelo SAP RH — Ativos" },
  { key: "SAP_DESLIGADOS", label: "Modelo SAP RH — Desligados" },
  { key: "FERIAS_A_VENCER", label: "Modelo Férias a Vencer" },
  { key: "MOVIMENTACOES", label: "Modelo Movimentações" },
];

export type Catalogos = {
  areas: string[];
  turnos: string[];
  funcoes: string[];
};

/** Cabeçalho gravado no modelo: usa o alias principal, reconhecido pelo auto-mapeamento. */
export const cabecalhoDoCampo = (key: CampoKey) =>
  CAMPOS_DEF.find((c) => c.key === key)!.aliases[0];

const CAMPOS_DATA: CampoKey[] = [
  "data_admissao",
  "data_desligamento",
  "ferias_saida",
  "ferias_retorno",
];

const EXEMPLO: Partial<Record<CampoKey, string>> = {
  re: "EXEMPLO-100001",
  nome: "EXEMPLO - Maria da Silva",
  wwid: "EXEMPLO-WW1234",
  vaga_id: "EXEMPLO-VG-01",
  area: "EXEMPLO - Expedição",
  setor_planejado: "EXEMPLO - Expedição",
  turno: "EXEMPLO - 1º Turno",
  turno_planejado: "EXEMPLO - 1º Turno",
  funcao: "EXEMPLO - Operador de Empilhadeira",
  cargo: "EXEMPLO - Operador Logístico II",
  cargo_padronizado: "EXEMPLO - Operador Logístico",
  cargo_planejado: "EXEMPLO - Operador Logístico",
  status_vaga: "EXEMPLO - Ocupada",
  lider: "EXEMPLO - João Souza",
  unidade: "EXEMPLO - Unidade Matriz",
  horario: "EXEMPLO - 06:00 às 15:20",
  status: "ATIVO",
  data_admissao: "01/02/2023",
  data_desligamento: "",
  ferias_saida: "05/01/2027",
  ferias_retorno: "04/02/2027",
  observacoes: "EXEMPLO - linha de demonstração, apague antes de importar",
};

/** Colunas extras do modelo de movimentações (análise manual, não são mapeadas). */
const COLUNAS_MOVIMENTACAO: { coluna: string; exemplo: string; nota: string }[] = [
  {
    coluna: "TIPO DE MOVIMENTACAO",
    exemplo: "DEFINITIVA",
    nota: "Valores aceitos: DEFINITIVA, TEMPORARIA, COBERTURA_FERIAS, CORRECAO_CADASTRAL.",
  },
  { coluna: "SETOR DE ORIGEM", exemplo: "EXEMPLO - Recebimento", nota: "Área atual do colaborador." },
  { coluna: "TURNO DE ORIGEM", exemplo: "EXEMPLO - 2º Turno", nota: "Turno atual do colaborador." },
  {
    coluna: "DATA EFETIVA",
    exemplo: "01/09/2026",
    nota: "Obrigatória para transferência definitiva (dd/mm/aaaa).",
  },
  {
    coluna: "DATA FINAL",
    exemplo: "30/09/2026",
    nota: "Obrigatória para movimentação temporária/cobertura; deve ser posterior à data efetiva.",
  },
  {
    coluna: "JUSTIFICATIVA",
    exemplo: "EXEMPLO - cobertura de férias do titular",
    nota: "Obrigatória para movimentação temporária/cobertura.",
  },
];

const CAMPOS_MOVIMENTACAO: CampoKey[] = [
  "re",
  "nome",
  "area",
  "turno",
  "funcao",
  "lider",
  "unidade",
  "observacoes",
];

function camposDoModelo(modelo: ModeloKey): { campos: CampoKey[]; obrigatorios: CampoKey[] } {
  if (modelo === "MOVIMENTACOES") {
    return { campos: CAMPOS_MOVIMENTACAO, obrigatorios: ["re", "nome", "area"] };
  }
  return {
    campos: CAMPOS_POR_FONTE[modelo],
    obrigatorios: [...OBRIGATORIOS_POR_FONTE[modelo]],
  };
}

const NAO_PERMITIDOS = [
  "CPF, RG e demais documentos pessoais",
  "Dados bancários (banco, agência, conta, PIX)",
  "Endereço, CEP, telefone e celular",
  "Data de nascimento, idade, estado civil e dependentes",
  "Salário e qualquer informação de remuneração",
  "Atestados, CID, ASO e qualquer dado médico",
];

export type ModeloGerado = { wb: XLSX.WorkBook; nomeArquivo: string; titulo: string };

export function gerarModelo(modelo: ModeloKey, catalogos?: Partial<Catalogos>): ModeloGerado {
  const titulo = MODELOS.find((m) => m.key === modelo)!.label;
  const { campos, obrigatorios } = camposDoModelo(modelo);
  const geradoEm = new Date();
  const geradoEmTexto = geradoEm.toLocaleString("pt-BR");

  const cabecalhos = [
    ...campos.map(cabecalhoDoCampo),
    ...(modelo === "MOVIMENTACOES" ? COLUNAS_MOVIMENTACAO.map((c) => c.coluna) : []),
  ];
  const exemplo = [
    ...campos.map((k) => EXEMPLO[k] ?? "EXEMPLO"),
    ...(modelo === "MOVIMENTACOES" ? COLUNAS_MOVIMENTACAO.map((c) => c.exemplo) : []),
  ];

  const wsDados = XLSX.utils.aoa_to_sheet([cabecalhos, exemplo]);
  wsDados["!cols"] = cabecalhos.map((h) => ({ wch: Math.max(14, Math.min(34, h.length + 6)) }));

  const obrigatoriosLabel = obrigatorios
    .map((k) => `${cabecalhoDoCampo(k)} (${CAMPOS_DEF.find((c) => c.key === k)!.label})`)
    .join(" | ");

  const lista = (v?: string[]) =>
    v && v.length > 0 ? v.join(" | ") : "Consulte os cadastros do sistema";

  const instrucoes: string[][] = [
    ["MODELO DE IMPORTAÇÃO", titulo],
    ["Versão do modelo", VERSAO_MODELO],
    ["Data de geração", geradoEmTexto],
    ["Aba de dados", "Dados"],
    [],
    ["COMO USAR"],
    ["1", "Preencha a aba 'Dados' a partir da linha 2. Não altere os cabeçalhos."],
    ["2", "Apague a linha de EXEMPLO antes de importar."],
    ["3", "Abra Importar Base, selecione o tipo correspondente e envie o arquivo."],
    [
      "4",
      "Os cabeçalhos são reconhecidos automaticamente: não é necessário remapear as colunas.",
    ],
    ["5", "Nada é gravado até clicar em 'Processar alterações aprovadas'."],
    [],
    ["CAMPOS OBRIGATÓRIOS (destacados)", obrigatoriosLabel],
    [],
    ["CAMPO", "CABEÇALHO NA PLANILHA", "OBRIGATÓRIO", "ORIENTAÇÃO"],
    ...campos.map((k) => {
      const def = CAMPOS_DEF.find((c) => c.key === k)!;
      const obrig = obrigatorios.includes(k);
      let nota = "Texto livre.";
      if (k === "re") nota = "Identificador único da empresa. Nunca use o nome como identificador.";
      else if (CAMPOS_DATA.includes(k)) nota = "Data no formato dd/mm/aaaa (ou aaaa-mm-dd).";
      else if (k === "area" || k === "setor_planejado") nota = `Valores aceitos: ${lista(catalogos?.areas)}`;
      else if (k === "turno" || k === "turno_planejado") nota = `Valores aceitos: ${lista(catalogos?.turnos)}`;
      else if (k === "funcao") nota = `Valores aceitos: ${lista(catalogos?.funcoes)}`;
      else if (k === "status") nota = "Valores aceitos: ATIVO | AFASTADO | DESLIGADO | FERIAS.";
      else if (k === "status_vaga") nota = "Valores aceitos: Ocupada | Vaga aberta | Em contratação.";
      return [def.label, cabecalhoDoCampo(k), obrig ? "SIM — OBRIGATÓRIO" : "Opcional", nota];
    }),
    ...(modelo === "MOVIMENTACOES"
      ? [
          [],
          ["COLUNAS DE MOVIMENTAÇÃO (usadas na análise da importação)"],
          ...COLUNAS_MOVIMENTACAO.map((c) => ["—", c.coluna, "Conforme o tipo", c.nota]),
        ]
      : []),
    [],
    ["DATAS"],
    ["Formato preferencial", "dd/mm/aaaa (ex.: 05/01/2027). Também aceito: aaaa-mm-dd."],
    ["Férias", "Saída é o primeiro dia de férias; retorno é o dia de volta ao trabalho."],
    ["Desligamento", "Exige status explícito de desligado e/ou data de desligamento."],
    ["Movimentação temporária", "Exige data inicial e data final posterior à inicial."],
    [],
    ["CAMPOS NÃO PERMITIDOS (serão ignorados na importação)"],
    ...NAO_PERMITIDOS.map((t) => ["—", t]),
    [],
    ["REGRAS IMPORTANTES"],
    ["—", "Ausência de um colaborador no arquivo NÃO significa desligamento."],
    ["—", "RE duplicado bloqueia as linhas envolvidas."],
    ["—", "Linha sem RE é considerada inválida."],
    ["—", "Novos colaboradores ficam pendentes de aprovação."],
  ];

  const wsInstrucoes = XLSX.utils.aoa_to_sheet(instrucoes);
  wsInstrucoes["!cols"] = [{ wch: 30 }, { wch: 34 }, { wch: 20 }, { wch: 80 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsInstrucoes, "Instruções");
  XLSX.utils.book_append_sheet(wb, wsDados, "Dados");

  const slug = titulo
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  const dia = geradoEm.toISOString().slice(0, 10);

  return { wb, titulo, nomeArquivo: `${slug}-v${VERSAO_MODELO}-${dia}.xlsx` };
}

export function baixarModelo(modelo: ModeloKey, catalogos?: Partial<Catalogos>) {
  const { wb, nomeArquivo } = gerarModelo(modelo, catalogos);
  XLSX.writeFile(wb, nomeArquivo);
  return nomeArquivo;
}

/** Fonte de importação sugerida ao reenviar o modelo preenchido. */
export const fonteDoModelo = (modelo: ModeloKey): FonteKey =>
  modelo === "MOVIMENTACOES" ? "PERSONALIZADO" : modelo;

export const rotuloFonte = (fonte: FonteKey) => FONTES.find((f) => f.key === fonte)!.label;
