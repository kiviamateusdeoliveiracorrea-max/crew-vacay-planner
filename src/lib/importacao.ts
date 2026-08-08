import type { ClassificacaoImport, Employee, Area, Turno, Funcao } from "@/lib/sistema";
import { normaliza } from "@/lib/sistema";

export const CAMPOS = [
  { key: "re", label: "RE / Matrícula", obrigatorio: true },
  { key: "nome", label: "Nome", obrigatorio: true },
  { key: "area", label: "Setor / Área", obrigatorio: true },
  { key: "turno", label: "Turno", obrigatorio: false },
  { key: "funcao", label: "Função", obrigatorio: true },
  { key: "lider", label: "Líder", obrigatorio: false },
  { key: "unidade", label: "Unidade", obrigatorio: false },
  { key: "status", label: "Status", obrigatorio: false },
  { key: "data_admissao", label: "Data de admissão", obrigatorio: false },
  { key: "data_desligamento", label: "Data de desligamento", obrigatorio: false },
] as const;

export type CampoKey = (typeof CAMPOS)[number]["key"];
export type Mapeamento = Partial<Record<CampoKey, string>>;

export type LinhaImportada = {
  linha: number;
  dados: Record<string, string>;
  classificacao: ClassificacaoImport;
  diferencas: Record<string, { de: string | null; para: string | null }>;
  erros: string[];
  employee_id: string | null;
  aplicar: boolean;
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

const DESLIGADO = ["DESLIGADO", "DEMITIDO", "INATIVO", "RESCISAO", "RESCISÃO"];

export function classificar(
  linhas: Record<string, string>[],
  mapeamento: Mapeamento,
  employees: Employee[],
  areas: Area[],
  turnos: Turno[],
  funcoes: Funcao[],
): LinhaImportada[] {
  const porRe = new Map(employees.filter((e) => e.re).map((e) => [normaliza(e.re!), e]));
  const nomeArea = new Map(areas.map((a) => [a.id, normaliza(a.nome)]));
  const nomeTurno = new Map(turnos.map((t) => [t.id, normaliza(t.nome)]));
  const nomeFuncao = new Map(funcoes.map((f) => [f.id, normaliza(f.nome)]));
  const vistos = new Set<string>();

  return linhas.map((bruta, i) => {
    const val = (k: CampoKey) => asTexto(bruta[mapeamento[k] ?? ""]);
    const dados: Record<string, string> = {};
    for (const c of CAMPOS) dados[c.key] = val(c.key);

    const erros: string[] = [];
    for (const c of CAMPOS) if (c.obrigatorio && !dados[c.key]) erros.push(`${c.label} vazio`);
    if (dados["data_desligamento"] && !toISO(dados["data_desligamento"]!))
      erros.push("Data de desligamento inválida");
    if (dados["data_admissao"] && !toISO(dados["data_admissao"]!))
      erros.push("Data de admissão inválida");

    const chave = normaliza(dados["re"] ?? "");
    const duplicado = chave && vistos.has(chave);
    if (chave) vistos.add(chave);

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

    const statusDesligado =
      DESLIGADO.includes(normaliza(dados["status"] ?? "")) || !!dados["data_desligamento"];

    let classificacao: ClassificacaoImport;
    if (erros.length) classificacao = "DADO_INVALIDO";
    else if (duplicado) classificacao = "DUPLICIDADE";
    else if (!atual) classificacao = "NOVO_COLABORADOR";
    else if (statusDesligado && atual.status !== "DESLIGADO") classificacao = "DESLIGAMENTO";
    else if (diferencas["area"]) classificacao = "MUDANCA_DE_SETOR";
    else if (diferencas["turno"]) classificacao = "MUDANCA_DE_TURNO";
    else if (diferencas["funcao"]) classificacao = "MUDANCA_DE_FUNCAO";
    else if (Object.keys(diferencas).length) classificacao = "ATUALIZACAO_CADASTRAL";
    else classificacao = "SEM_ALTERACAO";

    return {
      linha: i + 2,
      dados,
      classificacao,
      diferencas,
      erros,
      employee_id: atual?.id ?? null,
      // Ausência no arquivo nunca desliga ninguém; mudanças de setor ficam pendentes de aprovação.
      aplicar:
        classificacao !== "DADO_INVALIDO" &&
        classificacao !== "DUPLICIDADE" &&
        classificacao !== "SEM_ALTERACAO",
    };
  });
}

export const CLASSE_COR: Record<ClassificacaoImport, string> = {
  NOVO_COLABORADOR: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  ATUALIZACAO_CADASTRAL: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  MUDANCA_DE_SETOR: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  MUDANCA_DE_TURNO: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  MUDANCA_DE_FUNCAO: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  DESLIGAMENTO: "bg-destructive/15 text-destructive",
  DUPLICIDADE: "bg-destructive/15 text-destructive",
  DADO_INVALIDO: "bg-destructive/15 text-destructive",
  SEM_ALTERACAO: "bg-muted text-muted-foreground",
};
