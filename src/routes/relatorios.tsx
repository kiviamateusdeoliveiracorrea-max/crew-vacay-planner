import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCatalogos, usePerfil } from "@/hooks/useSistema";
import { registrarExportacao } from "@/lib/relatorios.functions";
import { exportarCsv, exportarXlsx } from "@/lib/exportar";
import {
  FILTROS_VAZIOS,
  RELATORIOS,
  parametros,
  tabelaAVencer,
  tabelaAuditoria,
  tabelaChamada,
  tabelaColaboradores,
  tabelaFerias,
  tabelaImportacoes,
  tabelaMovimentacoes,
  tabelaPendencias,
  tabelaResumo,
  type Ctx,
  type Filtros,
  type RelatorioId,
  type Tabela,
} from "@/lib/relatorios";

export const Route = createFileRoute("/relatorios")({
  head: () => ({
    meta: [
      { title: "Relatórios e Exportações | Gestão de Férias" },
      {
        name: "description",
        content:
          "Exporte colaboradores, férias, férias a vencer, movimentações, importações, auditoria e chamada diária em Excel ou CSV, respeitando as permissões de cada perfil.",
      },
      { property: "og:title", content: "Relatórios e Exportações" },
      {
        property: "og:description",
        content: "Exportações filtradas em XLSX e CSV com registro completo dos parâmetros usados.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RelatoriosPage,
});

const PAGINA = 1000;

/** Busca paginada — nada é alterado, apenas leitura sob as políticas RLS. */
async function todas<T>(
  tabela: string,
  select: string,
  ordem: { coluna: string; asc: boolean },
  progresso: (n: number) => void,
): Promise<T[]> {
  const out: T[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await supabase
      .from(tabela as never)
      .select(select)
      .order(ordem.coluna, { ascending: ordem.asc })
      .range(de, de + PAGINA - 1);
    if (error) throw new Error(error.message);
    const lote = (data ?? []) as unknown as T[];
    out.push(...lote);
    progresso(out.length);
    if (lote.length < PAGINA) return out;
  }
}

function RelatoriosPage() {
  const perfil = usePerfil();
  const { user } = useAuth();
  const cat = useCatalogos();
  const [rel, setRel] = useState<RelatorioId>("COLABORADORES");
  const [f, setF] = useState<Filtros>(FILTROS_VAZIOS);
  const [ocupado, setOcupado] = useState(false);
  const [passo, setPasso] = useState("");
  const [pct, setPct] = useState(0);

  const disponiveis = useMemo(
    () => RELATORIOS.filter((r) => !r.somenteAdmin || perfil.podeVerAuditoria),
    [perfil.podeVerAuditoria],
  );

  const set = (patch: Partial<Filtros>) => setF((p) => ({ ...p, ...patch }));
  const emailUsuario = user?.email ?? "usuário autenticado";

  async function montarContexto(): Promise<Ctx> {
    const c = cat.data!;
    const [{ data: movs }, { data: perfis }] = await Promise.all([
      supabase
        .from("employee_movements")
        .select("employee_id,status,temporaria,area_destino_id,shift_destino_id,data_efetiva,data_fim"),
      supabase.from("profiles").select("id,nome,email"),
    ]);
    return {
      areas: new Map(c.areas.map((a) => [a.id, { nome: a.nome, unit_id: a.unit_id }])),
      turnos: new Map(c.turnos.map((t) => [t.id, t.nome])),
      funcoes: new Map(c.funcoes.map((x) => [x.id, { nome: x.nome, chave: x.funcao_chave }])),
      unidades: new Map(c.unidades.map((u) => [u.id, u.nome])),
      usuarios: new Map((perfis ?? []).map((p) => [p.id, p.nome || p.email || p.id.slice(0, 8)])),
      movimentos: (movs ?? []) as never,
      hoje: new Date().toISOString().slice(0, 10),
      areasPermitidas: perfil.tem("ADMIN") || perfil.tem("ANALISTA") ? null : perfil.areasPermitidas,
    };
  }

  async function construir(ctx: Ctx, id: RelatorioId): Promise<Tabela[]> {
    const avanco = (etapa: string, base: number) => (n: number) => {
      setPasso(`${etapa} (${n} registros)`);
      setPct(base);
    };
    const emps = async () =>
      todas<never>("employees", "*", { coluna: "nome", asc: true }, avanco("Colaboradores", 25));
    const ferias = async () =>
      todas<never>(
        "vacations",
        "*, employee:employees!vacations_employee_id_fkey(*), conflitos:vacation_conflicts!vacation_conflicts_vacation_id_fkey(severidade,mensagem)",
        { coluna: "inicio", asc: true },
        avanco("Férias", 45),
      );
    const movs = async () =>
      todas<never>(
        "employee_movements",
        "*, employee:employees!employee_movements_employee_id_fkey(*)",
        { coluna: "data_efetiva", asc: false },
        avanco("Movimentações", 65),
      );

    switch (id) {
      case "COLABORADORES":
        return [tabelaColaboradores(ctx, await emps(), f)];
      case "FERIAS":
        return [tabelaFerias(ctx, await ferias(), f)];
      case "FERIAS_A_VENCER":
        return [tabelaAVencer(ctx, await emps(), await ferias(), f)];
      case "MOVIMENTACOES":
        return [tabelaMovimentacoes(ctx, await movs(), f)];
      case "IMPORTACOES":
        return [
          tabelaImportacoes(
            ctx,
            await todas<never>("import_batches", "*", { coluna: "created_at", asc: false }, avanco("Importações", 60)),
            f,
          ),
        ];
      case "AUDITORIA":
        return [
          tabelaAuditoria(
            ctx,
            await todas<never>("audit_log", "*", { coluna: "created_at", asc: false }, avanco("Auditoria", 60)),
            f,
          ),
        ];
      case "CHAMADA": {
        const regs = await todas<{ dia: Record<string, unknown> }>(
          "attendance_records",
          "*, dia:attendance_days!attendance_records_attendance_day_id_fkey(attendance_date,unit_id,area_id,shift_id,closed_at), motivo:absence_reasons!attendance_records_absence_reason_id_fkey(name)",
          { coluna: "created_at", asc: false },
          avanco("Chamada diária", 60),
        );
        const planas = regs.map((r) => {
          const x = r as unknown as Record<string, unknown>;
          const dia = (x["dia"] ?? {}) as Record<string, unknown>;
          const motivo = (x["motivo"] ?? null) as { name?: string } | null;
          return {
            attendance_date: String(dia["attendance_date"] ?? ""),
            unit_id: (dia["unit_id"] as string) ?? null,
            area_id: (dia["area_id"] as string) ?? null,
            shift_id: (dia["shift_id"] as string) ?? null,
            closed_at: (dia["closed_at"] as string) ?? null,
            employee_re: String(x["employee_re"] ?? ""),
            employee_name_snapshot: String(x["employee_name_snapshot"] ?? ""),
            function_snapshot: (x["function_snapshot"] as string) ?? null,
            attendance_status: String(x["attendance_status"] ?? ""),
            motivo: motivo?.name ?? null,
            arrival_time: (x["arrival_time"] as string) ?? null,
            notes: (x["notes"] as string) ?? null,
            registered_by: (x["registered_by"] as string) ?? null,
          };
        });
        return [tabelaChamada(ctx, planas, f)];
      }
      case "COMPLETO": {
        const [e, v, m] = [await emps(), await ferias(), await movs()];
        const colab = tabelaColaboradores(ctx, e, f);
        const fer = tabelaFerias(ctx, v, f);
        const av = tabelaAVencer(ctx, e, v, f);
        const mov = tabelaMovimentacoes(ctx, m, f);
        const pend = tabelaPendencias(fer, mov);
        return [tabelaResumo([colab, fer, av, mov, pend], f, emailUsuario), colab, fer, av, mov, pend];
      }
    }
  }

  async function exportar(formato: "XLSX" | "CSV") {
    if (ocupado || !cat.data) return;
    setOcupado(true);
    setPct(5);
    setPasso("Consultando dados permitidos…");
    try {
      const ctx = await montarContexto();
      const tabelas = await construir(ctx, rel);
      setPct(80);
      setPasso("Gerando arquivo…");
      const total = tabelas.reduce((s, t) => s + t.linhas.length, 0);
      if (total === 0) {
        toast.info("Nenhum registro encontrado para os filtros selecionados.");
        return;
      }
      const nome = RELATORIOS.find((r) => r.id === rel)!.nome;
      const rotulos = {
        unidade: cat.data.unidades.find((u) => u.id === f.unidade)?.nome,
        area: cat.data.areas.find((a) => a.id === f.area)?.nome,
        turno: cat.data.turnos.find((t) => t.id === f.turno)?.nome,
        funcao: cat.data.funcoes.find((x) => x.id === f.funcao)?.nome,
      };
      if (formato === "XLSX") {
        exportarXlsx(tabelas, parametros(nome, f, emailUsuario, rotulos), nome);
      } else {
        exportarCsv(tabelas[0]!, nome);
      }
      setPct(95);
      setPasso("Registrando na auditoria…");
      await registrarExportacao({
        data: {
          relatorio: rel,
          formato,
          filtros: Object.fromEntries(Object.entries(f).filter(([, v]) => v)),
          totais: Object.fromEntries(tabelas.map((t) => [t.nome, t.linhas.length])),
        },
      });
      setPct(100);
      toast.success(`${nome}: ${total} registro(s) exportado(s) em ${formato}.`);
    } catch (e) {
      toast.error(`Falha ao exportar: ${e instanceof Error ? e.message : "erro inesperado"}`);
    } finally {
      setOcupado(false);
      setPasso("");
      setTimeout(() => setPct(0), 800);
    }
  }

  const areasVisiveis = (cat.data?.areas ?? []).filter(
    (a) => perfil.tem("ADMIN") || perfil.tem("ANALISTA") || perfil.areasPermitidas.includes(a.id),
  );

  return (
    <AppShell>
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Relatórios e Exportações
          </h1>
          <p className="text-sm text-muted-foreground">
            A exportação devolve exatamente o que o seu perfil pode visualizar. Nenhum dado é
            alterado ao gerar o arquivo e cada exportação fica registrada na auditoria.
          </p>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Relatório</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {disponiveis.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRel(r.id)}
                className={`rounded-md border px-3 py-2 text-left text-xs transition-colors ${
                  rel === r.id
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:bg-accent"
                }`}
              >
                <span className="block font-medium">{r.nome}</span>
                <span className="block text-[11px] opacity-80">{r.descricao}</span>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Filtros</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-xs">Período — início</Label>
              <Input type="date" value={f.inicio} onChange={(e) => set({ inicio: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Período — fim</Label>
              <Input type="date" value={f.fim} onChange={(e) => set({ fim: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Unidade</Label>
              <Select value={f.unidade || "TODAS"} onValueChange={(v) => set({ unidade: v === "TODAS" ? "" : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="TODAS">Todas</SelectItem>
                  {(cat.data?.unidades ?? []).map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Área</Label>
              <Select value={f.area || "TODAS"} onValueChange={(v) => set({ area: v === "TODAS" ? "" : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="TODAS">Todas as autorizadas</SelectItem>
                  {areasVisiveis.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Turno</Label>
              <Select value={f.turno || "TODOS"} onValueChange={(v) => set({ turno: v === "TODOS" ? "" : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="TODOS">Todos</SelectItem>
                  {(cat.data?.turnos ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Função</Label>
              <Select value={f.funcao || "TODAS"} onValueChange={(v) => set({ funcao: v === "TODAS" ? "" : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="TODAS">Todas</SelectItem>
                  {(cat.data?.funcoes ?? []).map((x) => (
                    <SelectItem key={x.id} value={x.id}>{x.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Líder</Label>
              <Input placeholder="Nome do líder" value={f.lider} onChange={(e) => set({ lider: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Colaborador (nome ou RE)</Label>
              <Input value={f.colaborador} onChange={(e) => set({ colaborador: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Input placeholder="Ex.: ATIVO, APROVADA" value={f.status} onChange={(e) => set({ status: e.target.value.toUpperCase() })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Criticidade</Label>
              <Input placeholder="Ex.: CRITICO, ALTA" value={f.criticidade} onChange={(e) => set({ criticidade: e.target.value.toUpperCase() })} />
            </div>
            <div className="flex items-end">
              <Button variant="outline" size="sm" onClick={() => setF(FILTROS_VAZIOS)} disabled={ocupado}>
                Limpar filtros
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => exportar("XLSX")} disabled={ocupado || cat.isLoading}>
            {ocupado ? "Gerando…" : "Exportar Excel (XLSX)"}
          </Button>
          <Button variant="outline" onClick={() => exportar("CSV")} disabled={ocupado || cat.isLoading}>
            Exportar CSV
          </Button>
          {rel === "COMPLETO" && (
            <Badge variant="secondary" className="text-[10px]">
              CSV exporta apenas a aba Resumo — use XLSX para todas as abas
            </Badge>
          )}
          {perfil.tem("LIDER") && !perfil.tem("ADMIN") && !perfil.tem("ANALISTA") && (
            <Badge variant="outline" className="text-[10px]">
              Exportação limitada às áreas e turnos autorizados
            </Badge>
          )}
        </div>

        {ocupado && (
          <div className="space-y-1">
            <Progress value={pct} />
            <p className="text-xs text-muted-foreground">{passo}</p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
