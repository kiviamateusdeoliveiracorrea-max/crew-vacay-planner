import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCatalogos, useEmployees, usePerfil } from "@/hooks/useSistema";
import { useQueryClient } from "@tanstack/react-query";
import {
  ACAO_SUGERIDA,
  CAMPOS_DEF,
  CLASSE_COR,
  FONTES,
  autoMapear,
  camposDaFonte,
  classificar,
  detectarCamposSensiveis,
  podeAprovar,
  linhaProcessavel,
  validarDecisaoSetor,
  toISO,
  type CampoKey,
  type ColunaIgnorada,
  type DecisaoSetor,
  type DecisaoSetorTipo,
  type FonteKey,
  type LinhaImportada,
  type Mapeamento,
} from "@/lib/importacao";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MODELOS, VERSAO_MODELO, baixarModelo } from "@/lib/modelo-importacao";
import { humaniza, normaliza } from "@/lib/sistema";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export const Route = createFileRoute("/importar")({
  head: () => ({
    meta: [
      { title: "Importar Base de Colaboradores | Gestão de Férias" },
      {
        name: "description",
        content:
          "Importe extrações do SAP/RH, Controle de Headcount ou férias a vencer com mapeamento, validação, comparação linha a linha e aprovação antes de aplicar.",
      },
      { property: "og:title", content: "Importar Base de Colaboradores" },
      {
        property: "og:description",
        content:
          "Comparação da base recebida com a base atual, decisão por linha e aplicação somente após confirmação.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ImportarPage,
});

const NENHUM = "__nenhum__";
const TODAS = "__todas__";
const hoje = () => new Date().toISOString().slice(0, 10);
const tamanho = (b: number) =>
  b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;

type Resultado = Record<string, number> & { rejeitados: number; movimentacoes: number };

function ImportarPage() {
  const cat = useCatalogos();
  const emp = useEmployees();
  const perfil = usePerfil();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [fonte, setFonte] = useState<FonteKey>("SAP_ATIVOS");
  const [arquivo, setArquivo] = useState<{ nome: string; bytes: number; em: string } | null>(null);
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [aba, setAba] = useState("");
  const [colunas, setColunas] = useState<string[]>([]);
  const [ignoradas, setIgnoradas] = useState<ColunaIgnorada[]>([]);
  const [linhas, setLinhas] = useState<Record<string, string>[]>([]);
  const [mapeamento, setMapeamento] = useState<Mapeamento>({});
  const [nomeModelo, setNomeModelo] = useState("");
  const [modelos, setModelos] = useState<
    { id: string; nome: string; fonte: string; mapeamento: Mapeamento }[]
  >([]);
  const [analisado, setAnalisado] = useState<LinhaImportada[] | null>(null);
  const [decisoes, setDecisoes] = useState<Record<number, DecisaoSetor>>({});
  const [corrigindo, setCorrigindo] = useState<LinhaImportada | null>(null);
  const [rascunho, setRascunho] = useState<Record<string, string>>({});
  const [fClasse, setFClasse] = useState(TODAS);
  const [fArea, setFArea] = useState(TODAS);
  const [fTurno, setFTurno] = useState(TODAS);
  const [fStatus, setFStatus] = useState(TODAS);
  const [fValida, setFValida] = useState(TODAS);
  const [fDecisao, setFDecisao] = useState(TODAS);
  const [confirmando, setConfirmando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const campos = useMemo(() => camposDaFonte(fonte), [fonte]);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("import_templates")
        .select("id, nome, fonte, mapeamento")
        .order("created_at", { ascending: false });
      setModelos(
        (data ?? []).map((m) => ({
          id: m.id,
          nome: m.nome,
          fonte: m.fonte ?? "PERSONALIZADO",
          mapeamento: (m.mapeamento ?? {}) as Mapeamento,
        })),
      );
    })();
  }, []);

  function limparAnalise() {
    setAnalisado(null);
    setDecisoes({});
    setResultado(null);
  }

  async function carregarArquivo(file: File) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { cellDates: false });
    setWorkbook(wb);
    setArquivo({ nome: file.name, bytes: file.size, em: new Date().toLocaleString("pt-BR") });
    limparAnalise();
    const primeira = wb.SheetNames[0] ?? "";
    setAba(primeira);
    lerAba(wb, primeira, fonte);
  }

  function lerAba(wb: XLSX.WorkBook, nome: string, f: FonteKey) {
    const sheet = wb.Sheets[nome];
    if (!sheet) return;
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
      raw: false,
    });
    const cols = Object.keys(json[0] ?? {});
    const bloqueadas = detectarCamposSensiveis(cols);
    setColunas(cols);
    setIgnoradas(bloqueadas);
    setLinhas(
      json.map((r) =>
        Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v ?? "").trim()])),
      ),
    );
    setMapeamento(autoMapear(cols, f));
  }

  const catOk = cat.data && emp.data;

  function validar() {
    if (!catOk) return;
    const faltando = campos.filter((c) => c.obrigatorio && !mapeamento[c.key as CampoKey]);
    if (faltando.length) {
      toast.error(`Mapeie: ${faltando.map((f) => f.label).join(", ")}`);
      return;
    }
    const resultadoAnalise = classificar(
      linhas,
      mapeamento,
      emp.data!,
      cat.data!.areas,
      cat.data!.turnos,
      cat.data!.funcoes,
      fonte,
    );
    setAnalisado(resultadoAnalise);
    setResultado(null);
    const areaNome = new Map(cat.data!.areas.map((a) => [a.id, a.nome]));
    const turnoNome = new Map(cat.data!.turnos.map((t) => [t.id, t.nome]));
    setDecisoes(
      Object.fromEntries(
        resultadoAnalise
          .filter((l) => l.classificacao === "MUDANCA_DE_SETOR")
          .map((l) => {
            const atual = emp.data!.find((e) => e.id === l.employee_id);
            const dec: DecisaoSetor = {
              tipo: "DEFINITIVA",
              inicio: hoje(),
              fim: "",
              areaOrigem: areaNome.get(atual?.area_id ?? "") ?? null,
              areaDestino: l.dados["area"] || null,
              turnoOrigem: turnoNome.get(atual?.shift_id ?? "") ?? null,
              turnoDestino: l.dados["turno"] || turnoNome.get(atual?.shift_id ?? "") || null,
              justificativa: "",
            };
            return [l.linha, dec];
          }),
      ),
    );
    toast.success(
      `${resultadoAnalise.length} linha(s) analisada(s). Nada foi gravado — decida linha a linha.`,
    );
  }

  const resumo = useMemo(() => {
    const r: Record<string, number> = {};
    for (const l of analisado ?? []) r[l.classificacao] = (r[l.classificacao] ?? 0) + 1;
    return r;
  }, [analisado]);

  const aprovadas = useMemo(
    () => (analisado ?? []).filter((l) => l.decisao === "APROVADA"),
    [analisado],
  );

  const visiveis = useMemo(() => {
    return (analisado ?? []).filter((l) => {
      if (fClasse !== TODAS && l.classificacao !== fClasse) return false;
      if (fArea !== TODAS && normaliza(l.dados["area"] ?? "") !== normaliza(fArea)) return false;
      if (fTurno !== TODAS && normaliza(l.dados["turno"] ?? "") !== normaliza(fTurno)) return false;
      if (fStatus !== TODAS && normaliza(l.dados["status"] ?? "") !== normaliza(fStatus))
        return false;
      if (fValida === "VALIDA" && l.erros.length) return false;
      if (fValida === "INVALIDA" && !l.erros.length) return false;
      if (fDecisao !== TODAS && l.decisao !== fDecisao) return false;
      return true;
    });
  }, [analisado, fClasse, fArea, fTurno, fStatus, fValida, fDecisao]);

  const opcoes = (campo: string) =>
    Array.from(new Set((analisado ?? []).map((l) => l.dados[campo] ?? "").filter(Boolean))).sort();

  function definirDecisao(linha: number, decisao: LinhaImportada["decisao"]) {
    setAnalisado((prev) =>
      (prev ?? []).map((l) =>
        l.linha === linha ? { ...l, decisao, aplicar: decisao === "APROVADA" } : l,
      ),
    );
  }

  /** Atualiza parte da decisão de setor sem perder os demais campos. */
  function ajustarDecisao(linha: number, patch: Partial<DecisaoSetor>) {
    setDecisoes((prev) => ({
      ...prev,
      [linha]: {
        tipo: "DEFINITIVA",
        inicio: hoje(),
        fim: "",
        ...(prev[linha] ?? {}),
        ...patch,
      },
    }));
  }

  function aprovarValidas() {
    setAnalisado((prev) =>
      (prev ?? []).map((l) =>
        podeAprovar(l) && !l.erros.length
          ? { ...l, decisao: "APROVADA" as const, aplicar: true }
          : l,
      ),
    );
    toast.success("Todas as linhas válidas foram aprovadas na prévia.");
  }

  function cancelarLote() {
    setAnalisado(null);
    setDecisoes({});
    setResultado(null);
    toast.info("Lote cancelado. Nada foi gravado.");
  }

  function salvarCorrecao() {
    if (!corrigindo || !catOk) return;
    const brutas = linhas.map((b, i) =>
      i + 2 === corrigindo.linha
        ? Object.fromEntries(
            Object.entries(b).map(([k, v]) => {
              const campo = (Object.keys(mapeamento) as CampoKey[]).find(
                (ck) => mapeamento[ck] === k,
              );
              return [k, campo && rascunho[campo] !== undefined ? rascunho[campo]! : v];
            }),
          )
        : b,
    );
    setLinhas(brutas);
    const novo = classificar(
      brutas,
      mapeamento,
      emp.data!,
      cat.data!.areas,
      cat.data!.turnos,
      cat.data!.funcoes,
      fonte,
    );
    setAnalisado((prev) =>
      (prev ?? []).map((l) => {
        if (l.linha !== corrigindo.linha) return l;
        const atualizado = novo.find((n) => n.linha === l.linha)!;
        return { ...atualizado, justificativa: l.justificativa || "Linha corrigida na prévia" };
      }),
    );
    setCorrigindo(null);
    toast.success("Linha corrigida. Reclassificada na prévia.");
  }

  async function salvarModelo() {
    if (!nomeModelo.trim()) {
      toast.error("Informe um nome para o modelo.");
      return;
    }
    const { data, error } = await supabase
      .from("import_templates")
      .insert({ nome: nomeModelo.trim(), fonte, mapeamento, created_by: user?.id ?? null })
      .select("id, nome, fonte, mapeamento")
      .single();
    if (error || !data) {
      toast.error(error?.message ?? "Falha ao salvar o modelo.");
      return;
    }
    setModelos((m) => [
      {
        id: data.id,
        nome: data.nome,
        fonte: data.fonte ?? "PERSONALIZADO",
        mapeamento: (data.mapeamento ?? {}) as Mapeamento,
      },
      ...m,
    ]);
    setNomeModelo("");
    toast.success("Modelo de mapeamento salvo.");
  }

  async function aplicar() {
    if (!analisado || !cat.data) return;
    setConfirmando(false);
    setAplicando(true);
    try {
      const { data: batch, error: erroBatch } = await supabase
        .from("import_batches")
        .insert({
          arquivo_nome: arquivo?.nome ?? "",
          aba,
          fonte,
          status: "APROVADO",
          mapeamento,
          total_linhas: analisado.length,
          resumo,
          created_by: user?.id ?? null,
          aprovado_por: user?.id ?? null,
        })
        .select()
        .single();
      if (erroBatch) throw erroBatch;

      await supabase.from("import_rows").insert(
        analisado.map((l) => ({
          batch_id: batch.id,
          linha: l.linha,
          dados: l.dados,
          classificacao: l.classificacao,
          diferencas: l.diferencas,
          erros: l.erros,
          employee_id: l.employee_id,
          aplicar: l.decisao === "APROVADA",
          decisao: l.decisao,
          justificativa: l.justificativa || null,
          campos_ignorados: ignoradas.map((c) => c.coluna),
          setor_decisao: decisoes[l.linha]?.tipo ?? null,
          setor_decisao_inicio: decisoes[l.linha]?.inicio || null,
          setor_decisao_fim: decisoes[l.linha]?.fim || null,
        })),
      );

      const areas = new Map(cat.data.areas.map((a) => [normaliza(a.nome), a.id]));
      const turnos = new Map(cat.data.turnos.map((t) => [normaliza(t.nome), t.id]));
      const funcoes = new Map(cat.data.funcoes.map((f) => [normaliza(f.nome), f.id]));

      const garantir = async (
        tabela: "areas" | "shifts" | "functions",
        cache: Map<string, string>,
        nome: string,
      ) => {
        if (!nome) return null;
        const chave = normaliza(nome);
        const existente = cache.get(chave);
        if (existente) return existente;
        const { data, error } = await supabase.from(tabela).insert({ nome }).select().single();
        if (error) throw error;
        cache.set(chave, data.id);
        return data.id;
      };

      const conta: Resultado = {
        rejeitados: analisado.filter((l) => l.decisao === "REJEITADA").length,
        movimentacoes: 0,
      };
      const soma = (k: string) => {
        conta[k] = (conta[k] ?? 0) + 1;
      };

      for (const l of analisado) {
        // Guarda final: linha inválida ou bloqueada nunca é gravada, mesmo marcada como aprovada.
        if (!linhaProcessavel(l)) continue;
        const d = l.dados;
        const areaId = await garantir("areas", areas, d["area"] ?? "");
        const turnoId = await garantir("shifts", turnos, d["turno"] ?? "");
        const funcaoId = await garantir("functions", funcoes, d["funcao"] ?? "");

        if (l.classificacao === "VAGA_ABERTA") {
          const { error } = await supabase.from("job_openings").insert({
            codigo: d["vaga_id"] || `VAGA-${batch.id.slice(0, 8)}-${l.linha}`,
            area_id: areaId,
            shift_id: turnoId,
            function_id: funcaoId,
            status: "ABERTA",
            observacao: d["observacoes"] || `Importação ${arquivo?.nome ?? ""}`,
            created_by: user?.id ?? null,
          });
          if (error) throw error;
          soma("VAGA_ABERTA");
          continue;
        }

        if (l.classificacao === "NOVO_COLABORADOR") {
          // Registro nasce pendente de aprovação formal e a aprovação manual fica auditada.
          const novo: TablesInsert<"employees"> = {
            re: d["re"]!,
            nome: d["nome"]!,
            area_id: areaId,
            shift_id: turnoId,
            function_id: funcaoId,
            lider: d["lider"] || null,
            data_admissao: toISO(d["data_admissao"] ?? ""),
          };
          if (d["unidade"]) novo.unidade = d["unidade"];
          const { data: criado, error } = await supabase
            .from("employees")
            .insert(novo)
            .select("id")
            .single();
          if (error) throw error;
          await supabase.from("approvals").insert({
            entidade: "employees",
            entidade_id: criado.id,
            status: "APROVADO",
            area_id: areaId,
            solicitado_por: user?.id ?? null,
            decidido_por: user?.id ?? null,
            decidido_em: new Date().toISOString(),
            justificativa:
              l.justificativa || `Novo colaborador aprovado manualmente na importação ${arquivo?.nome ?? ""}`,
          });
          soma("NOVO_COLABORADOR");
          continue;
        }

        if (!l.employee_id) continue;

        if (l.classificacao === "DESLIGAMENTO") {
          const data = toISO(d["data_desligamento"] ?? "");
          if (!data && !l.justificativa) {
            toast.warning(`Linha ${l.linha}: desligamento sem data exige justificativa. Ignorada.`);
            continue;
          }
          const { error } = await supabase
            .from("employees")
            .update({ status: "DESLIGADO", data_desligamento: data ?? hoje() })
            .eq("id", l.employee_id);
          if (error) throw error;
          soma("DESLIGAMENTO");
        } else if (l.classificacao === "AFASTAMENTO") {
          const { error } = await supabase
            .from("employees")
            .update({ status: "AFASTADO" })
            .eq("id", l.employee_id);
          if (error) throw error;
          soma("AFASTAMENTO");
        } else if (
          l.classificacao === "RETORNO_DE_AFASTAMENTO" ||
          l.classificacao === "REATIVACAO"
        ) {
          const { error } = await supabase
            .from("employees")
            .update({ status: "ATIVO", data_desligamento: null })
            .eq("id", l.employee_id);
          if (error) throw error;
          soma(l.classificacao);
        } else if (l.classificacao === "MUDANCA_DE_SETOR") {
          const atual = emp.data?.find((e) => e.id === l.employee_id);
          const decisao = decisoes[l.linha] ?? {
            tipo: "DEFINITIVA" as DecisaoSetorTipo,
            inicio: hoje(),
            fim: "",
          };
          if (decisao.tipo === "IGNORAR") continue;
          if (decisao.tipo === "CORRECAO_CADASTRAL") {
            const { error } = await supabase
              .from("employees")
              .update({ area_id: areaId, shift_id: turnoId ?? atual?.shift_id ?? null })
              .eq("id", l.employee_id);
            if (error) throw error;
            soma("ATUALIZACAO_CADASTRAL");
            continue;
          }
          const temporaria = decisao.tipo !== "DEFINITIVA";
          // Nas temporárias vale exatamente o que o usuário confirmou na comparação.
          const origemArea = temporaria
            ? ((await garantir("areas", areas, decisao.areaOrigem ?? "")) ?? atual?.area_id ?? null)
            : (atual?.area_id ?? null);
          const destinoArea = temporaria
            ? ((await garantir("areas", areas, decisao.areaDestino ?? "")) ?? areaId)
            : areaId;
          const origemTurno = temporaria
            ? ((await garantir("shifts", turnos, decisao.turnoOrigem ?? "")) ??
              atual?.shift_id ??
              null)
            : (atual?.shift_id ?? null);
          const destinoTurno = temporaria
            ? ((await garantir("shifts", turnos, decisao.turnoDestino ?? "")) ??
              turnoId ??
              atual?.shift_id ??
              null)
            : (turnoId ?? atual?.shift_id ?? null);
          const { error } = await supabase.from("employee_movements").insert({
            employee_id: l.employee_id,
            re: d["re"]!,
            area_origem_id: origemArea,
            area_destino_id: destinoArea,
            shift_origem_id: origemTurno,
            shift_destino_id: destinoTurno,
            data_efetiva: decisao.inicio || hoje(),
            tipo:
              decisao.tipo === "DEFINITIVA"
                ? "TRANSFERENCIA_DEFINITIVA"
                : decisao.tipo === "COBERTURA_FERIAS"
                  ? "COBERTURA_DE_FERIAS"
                  : "EMPRESTIMO_TEMPORARIO",
            temporaria,
            data_fim: temporaria ? decisao.fim : null,
            motivo:
              (temporaria ? decisao.justificativa : "") ||
              l.justificativa ||
              `Importação ${arquivo?.nome ?? ""}`,
            status: "PENDENTE",
            created_by: user?.id ?? null,
          });
          if (error) throw error;
          conta.movimentacoes += 1;
          soma("MUDANCA_DE_SETOR");
        } else {
          const patch: TablesUpdate<"employees"> = {};
          if (d["nome"]) patch["nome"] = d["nome"];
          if (l.classificacao === "MUDANCA_DE_TURNO") patch["shift_id"] = turnoId;
          if (l.classificacao === "MUDANCA_DE_FUNCAO") patch["function_id"] = funcaoId;
          if (d["lider"]) patch["lider"] = d["lider"];
          const { error } = await supabase.from("employees").update(patch).eq("id", l.employee_id);
          if (error) throw error;
          soma(l.classificacao);
        }
      }

      await supabase
        .from("import_batches")
        .update({ status: "APLICADO", aplicado_em: new Date().toISOString() })
        .eq("id", batch.id);

      conta["TOTAL"] = analisado.length;
      conta["SEM_ALTERACAO"] = analisado.filter((l) => l.classificacao === "SEM_ALTERACAO").length;
      conta["INVALIDOS"] = analisado.filter((l) => l.erros.length).length;
      setResultado(conta);
      qc.invalidateQueries();
      toast.success("Lote processado. Veja o resultado abaixo.");
      setAnalisado(null);
      setDecisoes({});
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao aplicar importação.");
    } finally {
      setAplicando(false);
    }
  }

  if (!perfil.loading && !perfil.podeManterCadastro) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">
          Apenas ADMIN e ANALISTA podem importar bases.
        </p>
      </AppShell>
    );
  }

  const decisaoInvalida = aprovadas.some((l) => !!validarDecisaoSetor(l, decisoes[l.linha]));

  return (
    <AppShell>
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Importar base</h1>
          <p className="text-sm text-muted-foreground">
            Compare a extração recebida com a base atual antes de aplicar. Nada é gravado até a
            confirmação final; ausência no arquivo nunca desliga ninguém.
          </p>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">1. Fonte, arquivo e aba</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label>Tipo de importação</Label>
                <Select
                  value={fonte}
                  onValueChange={(v) => {
                    const nova = v as FonteKey;
                    setFonte(nova);
                    limparAnalise();
                    if (workbook && aba) lerAba(workbook, aba, nova);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FONTES.map((f) => (
                      <SelectItem key={f.key} value={f.key}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Arquivo (xlsx, xlsm, csv)</Label>
                <Input
                  type="file"
                  accept=".xlsx,.xlsm,.csv"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void carregarArquivo(f);
                  }}
                />
              </div>
              {workbook && (
                <div className="space-y-1">
                  <Label>Aba</Label>
                  <Select
                    value={aba}
                    onValueChange={(v) => {
                      setAba(v);
                      lerAba(workbook, v, fonte);
                      limparAnalise();
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {workbook.SheetNames.map((n) => (
                        <SelectItem key={n} value={n}>
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              {FONTES.find((f) => f.key === fonte)?.descricao}
            </p>

            {arquivo && workbook && (
              <div className="grid gap-2 rounded-lg border border-border p-3 text-xs sm:grid-cols-3 lg:grid-cols-4">
                <div>
                  <span className="text-muted-foreground">Arquivo</span>
                  <p className="font-medium text-foreground">{arquivo.nome}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Tamanho</span>
                  <p className="font-medium text-foreground">{tamanho(arquivo.bytes)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Abas</span>
                  <p className="font-medium text-foreground">{workbook.SheetNames.length}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Aba selecionada</span>
                  <p className="font-medium text-foreground">{aba || "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Linhas</span>
                  <p className="font-medium text-foreground">{linhas.length}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Responsável</span>
                  <p className="font-medium text-foreground">{user?.email ?? "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Carregado em</span>
                  <p className="font-medium text-foreground">{arquivo.em}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Gravação</span>
                  <p className="font-medium text-foreground">Nenhuma até a confirmação</p>
                </div>
              </div>
            )}

            {ignoradas.length > 0 && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                <p className="font-medium text-amber-700 dark:text-amber-400">
                  {ignoradas.length} coluna(s) não serão importadas
                </p>
                <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                  {ignoradas.map((c) => (
                    <li key={c.coluna}>
                      <strong>{c.coluna}</strong>: {c.motivo}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        {colunas.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">2. Mapeamento de colunas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {modelos.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs">Usar modelo salvo</Label>
                  <Select
                    onValueChange={(id) => {
                      const m = modelos.find((x) => x.id === id);
                      if (!m) return;
                      setMapeamento(m.mapeamento);
                      limparAnalise();
                      toast.success(`Modelo "${m.nome}" aplicado.`);
                    }}
                  >
                    <SelectTrigger className="max-w-xs">
                      <SelectValue placeholder="Selecionar modelo…" />
                    </SelectTrigger>
                    <SelectContent>
                      {modelos.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.nome} · {humaniza(m.fonte)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {campos.map((c) => (
                  <div key={c.key} className="space-y-1">
                    <Label className="text-xs">
                      {c.label}
                      {c.obrigatorio && <span className="text-destructive"> *</span>}
                    </Label>
                    <Select
                      value={mapeamento[c.key as CampoKey] ?? NENHUM}
                      onValueChange={(v) =>
                        setMapeamento((m) => ({
                          ...m,
                          [c.key as CampoKey]: v === NENHUM ? undefined : v,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NENHUM}>—</SelectItem>
                        {colunas
                          .filter((col) => !ignoradas.some((i) => i.coluna === col))
                          .map((col) => (
                            <SelectItem key={col} value={col}>
                              {col}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Salvar modelo de mapeamento</Label>
                  <Input
                    className="max-w-xs"
                    placeholder="Ex.: SAP mensal — ativos"
                    value={nomeModelo}
                    onChange={(e) => setNomeModelo(e.target.value)}
                  />
                </div>
                <Button variant="outline" onClick={() => void salvarModelo()}>
                  Salvar modelo
                </Button>
                <Button onClick={validar} disabled={!catOk}>
                  Validar e comparar
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Prévia: {linhas.length} linha(s) na aba selecionada. Aliases de cabeçalho (Número
                Pessoal, Matrícula, Real/Planejado, Turno Plan…) são reconhecidos automaticamente.
              </p>
            </CardContent>
          </Card>
        )}

        {analisado && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">3. Comparação e decisão por linha</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFClasse(TODAS)}
                  className={`rounded px-2 py-1 text-xs ${fClasse === TODAS ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                >
                  Todas: {analisado.length}
                </button>
                {Object.entries(resumo).map(([k, v]) => (
                  <button
                    type="button"
                    key={k}
                    onClick={() => setFClasse(fClasse === k ? TODAS : k)}
                    className={`rounded px-2 py-1 text-xs ${CLASSE_COR[k as keyof typeof CLASSE_COR]} ${fClasse === k ? "ring-2 ring-ring" : ""}`}
                  >
                    {humaniza(k)}: {v}
                  </button>
                ))}
              </div>

              <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {[
                  { label: "Área", value: fArea, set: setFArea, itens: opcoes("area") },
                  { label: "Turno", value: fTurno, set: setFTurno, itens: opcoes("turno") },
                  { label: "Status", value: fStatus, set: setFStatus, itens: opcoes("status") },
                  {
                    label: "Validação",
                    value: fValida,
                    set: setFValida,
                    itens: ["VALIDA", "INVALIDA"],
                  },
                  {
                    label: "Decisão",
                    value: fDecisao,
                    set: setFDecisao,
                    itens: ["PENDENTE", "APROVADA", "REJEITADA", "IGNORADA"],
                  },
                ].map((f) => (
                  <div key={f.label} className="space-y-1">
                    <Label className="text-xs">{f.label}</Label>
                    <Select value={f.value} onValueChange={(v) => f.set(v)}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={TODAS}>Todos</SelectItem>
                        {f.itens.map((i) => (
                          <SelectItem key={i} value={i}>
                            {humaniza(i)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>

              <div className="max-h-[460px] overflow-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-card text-left uppercase text-muted-foreground">
                    <tr className="border-b border-border">
                      <th className="p-2">RE</th>
                      <th className="p-2">Colaborador</th>
                      <th className="p-2">Classificação</th>
                      <th className="p-2">Campo alterado</th>
                      <th className="p-2">Valor atual</th>
                      <th className="p-2">Valor recebido</th>
                      <th className="p-2">Ação sugerida</th>
                      <th className="p-2">Decisão</th>
                      <th className="p-2">Justificativa</th>
                      <th className="p-2">Validação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visiveis.map((l) => {
                      const difs = Object.entries(l.diferencas);
                      return (
                        <tr key={l.linha} className="border-b border-border/60 align-top">
                          <td className="p-2">{l.dados["re"] || "—"}</td>
                          <td className="p-2">{l.dados["nome"] || l.dados["vaga_id"] || "—"}</td>
                          <td className="p-2">
                            <span
                              className={`rounded px-1.5 py-0.5 ${CLASSE_COR[l.classificacao]}`}
                            >
                              {humaniza(l.classificacao)}
                            </span>
                          </td>
                          <td className="p-2 text-muted-foreground">
                            {difs.map(([c]) => humaniza(c)).join(", ") || "—"}
                          </td>
                          <td className="p-2 text-muted-foreground">
                            {difs.map(([, d]) => d.de ?? "—").join(", ") || "—"}
                          </td>
                          <td className="p-2">{difs.map(([, d]) => d.para).join(", ") || "—"}</td>
                          <td className="p-2 text-muted-foreground">
                            {ACAO_SUGERIDA[l.classificacao]}
                            {l.classificacao === "MUDANCA_DE_SETOR" && (() => {
                              const dec = decisoes[l.linha];
                              const tipo = dec?.tipo ?? "DEFINITIVA";
                              const temporaria =
                                tipo === "TEMPORARIA" || tipo === "COBERTURA_FERIAS";
                              const comData = tipo !== "IGNORAR" && tipo !== "CORRECAO_CADASTRAL";
                              const erroDec = validarDecisaoSetor(l, dec);
                              return (
                                <div className="mt-1 flex flex-wrap items-center gap-1">
                                  <Select
                                    value={tipo}
                                    onValueChange={(v) =>
                                      ajustarDecisao(l.linha, { tipo: v as DecisaoSetorTipo })
                                    }
                                  >
                                    <SelectTrigger className="h-7 w-[150px] text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="DEFINITIVA">
                                        Transferência definitiva
                                      </SelectItem>
                                      <SelectItem value="TEMPORARIA">
                                        Empréstimo temporário
                                      </SelectItem>
                                      <SelectItem value="COBERTURA_FERIAS">
                                        Cobertura de férias
                                      </SelectItem>
                                      <SelectItem value="CORRECAO_CADASTRAL">
                                        Correção cadastral
                                      </SelectItem>
                                      <SelectItem value="IGNORAR">Ignorar alteração</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  {comData && (
                                    <Input
                                      type="date"
                                      title="Data efetiva"
                                      className="h-7 w-[135px] text-xs"
                                      value={dec?.inicio ?? ""}
                                      onChange={(e) =>
                                        ajustarDecisao(l.linha, { inicio: e.target.value })
                                      }
                                    />
                                  )}
                                  {temporaria && (
                                    <>
                                      <Input
                                        type="date"
                                        title="Data final"
                                        className="h-7 w-[135px] text-xs"
                                        value={dec?.fim ?? ""}
                                        onChange={(e) =>
                                          ajustarDecisao(l.linha, { fim: e.target.value })
                                        }
                                      />
                                      <Input
                                        title="Área de origem"
                                        placeholder="Área de origem"
                                        className="h-7 w-[150px] text-xs"
                                        value={dec?.areaOrigem ?? ""}
                                        onChange={(e) =>
                                          ajustarDecisao(l.linha, { areaOrigem: e.target.value })
                                        }
                                      />
                                      <Input
                                        title="Área de destino"
                                        placeholder="Área de destino"
                                        className="h-7 w-[150px] text-xs"
                                        value={dec?.areaDestino ?? ""}
                                        onChange={(e) =>
                                          ajustarDecisao(l.linha, { areaDestino: e.target.value })
                                        }
                                      />
                                      <Input
                                        title="Turno de origem"
                                        placeholder="Turno de origem"
                                        className="h-7 w-[130px] text-xs"
                                        value={dec?.turnoOrigem ?? ""}
                                        onChange={(e) =>
                                          ajustarDecisao(l.linha, { turnoOrigem: e.target.value })
                                        }
                                      />
                                      <Input
                                        title="Turno de destino"
                                        placeholder="Turno de destino"
                                        className="h-7 w-[130px] text-xs"
                                        value={dec?.turnoDestino ?? ""}
                                        onChange={(e) =>
                                          ajustarDecisao(l.linha, { turnoDestino: e.target.value })
                                        }
                                      />
                                      <Input
                                        title="Justificativa da movimentação temporária"
                                        placeholder="Justificativa"
                                        className="h-7 w-[180px] text-xs"
                                        value={dec?.justificativa ?? ""}
                                        onChange={(e) =>
                                          ajustarDecisao(l.linha, { justificativa: e.target.value })
                                        }
                                      />
                                    </>
                                  )}
                                  {erroDec && (
                                    <span className="w-full text-[11px] text-destructive">
                                      {erroDec}
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
                          </td>
                          <td className="p-2">
                            <div className="flex flex-wrap gap-1">
                              <Button
                                size="sm"
                                variant={l.decisao === "APROVADA" ? "default" : "outline"}
                                className="h-6 px-2 text-[11px]"
                                disabled={!podeAprovar(l)}
                                onClick={() => definirDecisao(l.linha, "APROVADA")}
                              >
                                Aprovar
                              </Button>
                              <Button
                                size="sm"
                                variant={l.decisao === "REJEITADA" ? "destructive" : "outline"}
                                className="h-6 px-2 text-[11px]"
                                onClick={() => definirDecisao(l.linha, "REJEITADA")}
                              >
                                Rejeitar
                              </Button>
                              <Button
                                size="sm"
                                variant={l.decisao === "IGNORADA" ? "secondary" : "outline"}
                                className="h-6 px-2 text-[11px]"
                                onClick={() => definirDecisao(l.linha, "IGNORADA")}
                              >
                                Ignorar
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2 text-[11px]"
                                onClick={() => {
                                  setCorrigindo(l);
                                  setRascunho({ ...l.dados });
                                }}
                              >
                                Corrigir
                              </Button>
                            </div>
                          </td>
                          <td className="p-2">
                            <Input
                              className="h-7 w-[160px] text-xs"
                              placeholder="Justificativa"
                              value={l.justificativa}
                              onChange={(e) =>
                                setAnalisado((prev) =>
                                  (prev ?? []).map((x) =>
                                    x.linha === l.linha
                                      ? { ...x, justificativa: e.target.value }
                                      : x,
                                  ),
                                )
                              }
                            />
                          </td>
                          <td className="p-2">
                            {l.erros.length ? (
                              <span className="text-destructive">{l.erros.join("; ")}</span>
                            ) : (
                              <span className="text-emerald-600 dark:text-emerald-400">Válida</span>
                            )}
                            {l.avisos.length ? (
                              <span className="mt-1 block text-amber-600 dark:text-amber-400">
                                {l.avisos.join("; ")}
                              </span>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button variant="outline" onClick={aprovarValidas} disabled={aplicando}>
                  Aprovar todas as válidas
                </Button>
                <Button
                  onClick={() => setConfirmando(true)}
                  disabled={aplicando || aprovadas.length === 0 || decisaoInvalida}
                >
                  {aplicando
                    ? "Processando…"
                    : `Processar alterações aprovadas (${aprovadas.length})`}
                </Button>
                <Button variant="ghost" onClick={cancelarLote} disabled={aplicando}>
                  Cancelar lote
                </Button>
                <Badge variant="secondary" className="text-[10px]">
                  Mudanças de setor viram movimentação pendente de aprovação
                </Badge>
                {decisaoInvalida && (
                  <span className="text-xs text-destructive">
                    Complete as mudanças de setor: data efetiva e, nas temporárias, data final,
                    áreas e turnos de origem/destino e justificativa.
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {resultado && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Resultado do lote</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {[
                  ["Total analisado", resultado["TOTAL"]],
                  ["Novos colaboradores", resultado["NOVO_COLABORADOR"]],
                  ["Atualizações cadastrais", resultado["ATUALIZACAO_CADASTRAL"]],
                  ["Movimentações", resultado.movimentacoes],
                  ["Mudanças de turno", resultado["MUDANCA_DE_TURNO"]],
                  ["Mudanças de função", resultado["MUDANCA_DE_FUNCAO"]],
                  ["Mudanças de líder", resultado["MUDANCA_DE_LIDER"]],
                  ["Afastamentos", resultado["AFASTAMENTO"]],
                  ["Retornos", resultado["RETORNO_DE_AFASTAMENTO"]],
                  ["Reativações", resultado["REATIVACAO"]],
                  ["Desligamentos", resultado["DESLIGAMENTO"]],
                  ["Vagas abertas", resultado["VAGA_ABERTA"]],
                  ["Rejeitados", resultado.rejeitados],
                  ["Inválidos", resultado["INVALIDOS"]],
                  ["Sem alteração", resultado["SEM_ALTERACAO"]],
                ].map(([label, valor]) => (
                  <div key={String(label)} className="rounded-lg border border-border p-2">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="text-lg font-semibold text-foreground">{Number(valor ?? 0)}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Dialog open={!!corrigindo} onOpenChange={(o) => !o && setCorrigindo(null)}>
          <DialogContent className="max-h-[80vh] overflow-auto">
            <DialogHeader>
              <DialogTitle>Corrigir linha {corrigindo?.linha}</DialogTitle>
              <DialogDescription>
                Ajuste os valores recebidos. A linha é reclassificada na prévia; nada é gravado
                agora.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2 sm:grid-cols-2">
              {campos
                .filter((c) => mapeamento[c.key as CampoKey])
                .map((c) => (
                  <div key={c.key} className="space-y-1">
                    <Label className="text-xs">{c.label}</Label>
                    <Input
                      value={rascunho[c.key] ?? ""}
                      onChange={(e) =>
                        setRascunho((r) => ({ ...r, [c.key]: e.target.value }))
                      }
                    />
                  </div>
                ))}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Justificativa da correção</Label>
              <Textarea
                value={corrigindo?.justificativa ?? ""}
                onChange={(e) =>
                  setCorrigindo((c) => (c ? { ...c, justificativa: e.target.value } : c))
                }
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCorrigindo(null)}>
                Cancelar
              </Button>
              <Button onClick={salvarCorrecao}>Aplicar correção na prévia</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={confirmando} onOpenChange={setConfirmando}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar processamento do lote</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-sm">
                  <p>
                    Até aqui nada foi gravado. Ao confirmar, o lote{" "}
                    <strong>{arquivo?.nome ?? "—"}</strong> (aba {aba || "—"}) será registrado e
                    apenas as linhas aprovadas serão aplicadas.
                  </p>
                  <ul className="list-disc pl-5">
                    <li>
                      {aprovadas.length} linha(s) aprovada(s) de {analisado?.length ?? 0}
                    </li>
                    <li>
                      {aprovadas.filter((l) => l.classificacao === "MUDANCA_DE_SETOR").length}{" "}
                      mudança(s) de setor viram movimentação pendente
                    </li>
                    <li>
                      {aprovadas.filter((l) => l.classificacao === "DESLIGAMENTO").length}{" "}
                      desligamento(s) com status ou data explícita
                    </li>
                    <li>Férias e movimentações existentes não são excluídas.</li>
                  </ul>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Voltar</AlertDialogCancel>
              <AlertDialogAction onClick={() => void aplicar()}>
                Confirmar e processar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppShell>
  );
}
