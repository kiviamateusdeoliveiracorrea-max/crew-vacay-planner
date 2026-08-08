import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
  CAMPOS,
  CLASSE_COR,
  classificar,
  toISO,
  type CampoKey,
  type LinhaImportada,
  type Mapeamento,
} from "@/lib/importacao";
import { humaniza, normaliza } from "@/lib/sistema";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export const Route = createFileRoute("/importar")({
  head: () => ({
    meta: [
      { title: "Importar Base de Colaboradores | Gestão de Férias" },
      {
        name: "description",
        content:
          "Importe planilhas xlsx, xlsm ou csv com mapeamento de colunas, validação, comparação com a base atual e aprovação antes de aplicar.",
      },
      { property: "og:title", content: "Importar Base de Colaboradores" },
      {
        property: "og:description",
        content: "Importação com mapeamento, prévia, validação e aprovação das alterações.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ImportarPage,
});

const NENHUM = "__nenhum__";

function ImportarPage() {
  const cat = useCatalogos();
  const emp = useEmployees();
  const perfil = usePerfil();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [arquivo, setArquivo] = useState<string>("");
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [aba, setAba] = useState("");
  const [colunas, setColunas] = useState<string[]>([]);
  const [linhas, setLinhas] = useState<Record<string, string>[]>([]);
  const [mapeamento, setMapeamento] = useState<Mapeamento>({});
  const [nomeModelo, setNomeModelo] = useState("");
  const [analisado, setAnalisado] = useState<LinhaImportada[] | null>(null);
  const [aplicando, setAplicando] = useState(false);

  async function carregarArquivo(file: File) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { cellDates: false });
    setWorkbook(wb);
    setArquivo(file.name);
    setAnalisado(null);
    const primeira = wb.SheetNames[0] ?? "";
    setAba(primeira);
    lerAba(wb, primeira);
  }

  function lerAba(wb: XLSX.WorkBook, nome: string) {
    const sheet = wb.Sheets[nome];
    if (!sheet) return;
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
    const cols = Object.keys(json[0] ?? {});
    setColunas(cols);
    setLinhas(json.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v ?? "").trim()]))));
    // auto-mapeamento por semelhança de nome
    const auto: Mapeamento = {};
    for (const campo of CAMPOS) {
      const alvo = normaliza(campo.key);
      const achou = cols.find((c) => {
        const n = normaliza(c);
        return (
          n === alvo ||
          n.includes(alvo) ||
          (campo.key === "area" && (n.includes("SETOR") || n.includes("AREA"))) ||
          (campo.key === "re" && (n === "RE" || n.includes("MATRIC"))) ||
          (campo.key === "funcao" && n.includes("FUNC")) ||
          (campo.key === "lider" && n.includes("LIDER"))
        );
      });
      if (achou) auto[campo.key] = achou;
    }
    setMapeamento(auto);
  }

  const catOk = cat.data && emp.data;

  function validar() {
    if (!catOk) return;
    const faltando = CAMPOS.filter((c) => c.obrigatorio && !mapeamento[c.key]);
    if (faltando.length) {
      toast.error(`Mapeie: ${faltando.map((f) => f.label).join(", ")}`);
      return;
    }
    const resultado = classificar(
      linhas,
      mapeamento,
      emp.data!,
      cat.data!.areas,
      cat.data!.turnos,
      cat.data!.funcoes,
    );
    setAnalisado(resultado);
    toast.success(`${resultado.length} linhas analisadas.`);
  }

  const resumo = useMemo(() => {
    const r: Record<string, number> = {};
    for (const l of analisado ?? []) r[l.classificacao] = (r[l.classificacao] ?? 0) + 1;
    return r;
  }, [analisado]);

  async function salvarModelo() {
    if (!nomeModelo.trim()) {
      toast.error("Informe um nome para o modelo.");
      return;
    }
    const { error } = await supabase
      .from("import_mappings")
      .insert({ nome: nomeModelo.trim(), mapeamento, created_by: user?.id ?? null });
    if (error) toast.error(error.message);
    else toast.success("Modelo de mapeamento salvo.");
  }

  async function aplicar() {
    if (!analisado || !cat.data) return;
    setAplicando(true);
    try {
      const { data: batch, error: erroBatch } = await supabase
        .from("import_batches")
        .insert({
          arquivo_nome: arquivo,
          aba,
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
          aplicar: l.aplicar,
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

      let aplicadas = 0;
      let pendentes = 0;

      for (const l of analisado) {
        if (!l.aplicar) continue;
        const d = l.dados;
        const areaId = await garantir("areas", areas, d["area"] ?? "");
        const turnoId = await garantir("shifts", turnos, d["turno"] ?? "");
        const funcaoId = await garantir("functions", funcoes, d["funcao"] ?? "");

        if (l.classificacao === "NOVO_COLABORADOR") {
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
          const { error } = await supabase.from("employees").insert(novo);
          if (error) throw error;
          aplicadas++;
        } else if (l.classificacao === "DESLIGAMENTO" && l.employee_id) {
          const { error } = await supabase
            .from("employees")
            .update({
              status: "DESLIGADO",
              data_desligamento: toISO(d["data_desligamento"] ?? "") ?? new Date().toISOString().slice(0, 10),
            })
            .eq("id", l.employee_id);
          if (error) throw error;
          aplicadas++;
        } else if (l.classificacao === "MUDANCA_DE_SETOR" && l.employee_id) {
          const atual = emp.data?.find((e) => e.id === l.employee_id);
          const { error } = await supabase.from("employee_movements").insert({
            employee_id: l.employee_id,
            re: d["re"]!,
            area_origem_id: atual?.area_id ?? null,
            area_destino_id: areaId,
            shift_origem_id: atual?.shift_id ?? null,
            shift_destino_id: turnoId ?? atual?.shift_id ?? null,
            data_efetiva: new Date().toISOString().slice(0, 10),
            tipo: "TRANSFERENCIA_DEFINITIVA",
            temporaria: false,
            motivo: `Importação ${arquivo}`,
            status: "PENDENTE",
            created_by: user?.id ?? null,
          });
          if (error) throw error;
          pendentes++;
        } else if (l.employee_id) {
          const patch: TablesUpdate<"employees"> = { nome: d["nome"]! };
          if (l.classificacao === "MUDANCA_DE_TURNO") patch["shift_id"] = turnoId;
          if (l.classificacao === "MUDANCA_DE_FUNCAO") patch["function_id"] = funcaoId;
          if (d["lider"]) patch["lider"] = d["lider"];
          const { error } = await supabase.from("employees").update(patch).eq("id", l.employee_id);
          if (error) throw error;
          aplicadas++;
        }
      }

      await supabase
        .from("import_batches")
        .update({ status: "APLICADO", aplicado_em: new Date().toISOString() })
        .eq("id", batch.id);

      qc.invalidateQueries();
      toast.success(
        `${aplicadas} alteração(ões) aplicada(s). ${pendentes} mudança(s) de setor aguardando aprovação.`,
      );
      setAnalisado(null);
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

  return (
    <AppShell>
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Importar base</h1>
          <p className="text-sm text-muted-foreground">
            xlsx, xlsm ou csv — escolha a aba, mapeie as colunas, valide, compare e aprove antes de
            aplicar. Ausência no arquivo nunca desliga ninguém.
          </p>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">1. Arquivo e aba</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Arquivo</Label>
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
                    lerAba(workbook, v);
                    setAnalisado(null);
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
          </CardContent>
        </Card>

        {colunas.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">2. Mapeamento de colunas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {CAMPOS.map((c) => (
                  <div key={c.key} className="space-y-1">
                    <Label className="text-xs">
                      {c.label}
                      {c.obrigatorio && <span className="text-destructive"> *</span>}
                    </Label>
                    <Select
                      value={mapeamento[c.key] ?? NENHUM}
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
                        {colunas.map((col) => (
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
                    placeholder="Ex.: Base RH mensal"
                    value={nomeModelo}
                    onChange={(e) => setNomeModelo(e.target.value)}
                  />
                </div>
                <Button variant="outline" onClick={salvarModelo}>
                  Salvar modelo
                </Button>
                <Button onClick={validar} disabled={!catOk}>
                  Validar e comparar
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Prévia: {linhas.length} linha(s) na aba selecionada.
              </p>
            </CardContent>
          </Card>
        )}

        {analisado && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">3. Prévia, classificação e aprovação</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {Object.entries(resumo).map(([k, v]) => (
                  <span key={k} className={`rounded px-2 py-1 text-xs ${CLASSE_COR[k as keyof typeof CLASSE_COR]}`}>
                    {humaniza(k)}: {v}
                  </span>
                ))}
              </div>

              <div className="max-h-[420px] overflow-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-card text-left uppercase text-muted-foreground">
                    <tr className="border-b border-border">
                      <th className="p-2">Aplicar</th>
                      <th className="p-2">Linha</th>
                      <th className="p-2">RE</th>
                      <th className="p-2">Nome</th>
                      <th className="p-2">Classificação</th>
                      <th className="p-2">Diferenças / Erros</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analisado.map((l) => (
                      <tr key={l.linha} className="border-b border-border/60">
                        <td className="p-2">
                          <Checkbox
                            checked={l.aplicar}
                            disabled={
                              l.classificacao === "DADO_INVALIDO" ||
                              l.classificacao === "DUPLICIDADE"
                            }
                            onCheckedChange={(c) =>
                              setAnalisado((prev) =>
                                (prev ?? []).map((x) =>
                                  x.linha === l.linha ? { ...x, aplicar: !!c } : x,
                                ),
                              )
                            }
                          />
                        </td>
                        <td className="p-2 text-muted-foreground">{l.linha}</td>
                        <td className="p-2">{l.dados["re"]}</td>
                        <td className="p-2">{l.dados["nome"]}</td>
                        <td className="p-2">
                          <span className={`rounded px-1.5 py-0.5 ${CLASSE_COR[l.classificacao]}`}>
                            {humaniza(l.classificacao)}
                          </span>
                        </td>
                        <td className="p-2 text-muted-foreground">
                          {l.erros.length > 0
                            ? l.erros.join("; ")
                            : Object.entries(l.diferencas)
                                .map(([c, d]) => `${c}: ${d.de ?? "—"} → ${d.para}`)
                                .join("; ") || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center gap-3">
                <Button onClick={aplicar} disabled={aplicando}>
                  {aplicando ? "Aplicando…" : "Aprovar e aplicar alterações"}
                </Button>
                <Badge variant="secondary" className="text-[10px]">
                  Mudanças de setor entram como movimentação pendente
                </Badge>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
