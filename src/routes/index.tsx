import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { UNIDADE_PADRAO } from "@/components/layout/Marca";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { DrilldownDialog, type Drilldown } from "@/components/painel/DrilldownDialog";
import { RegistroDialog, type RegistroFoco } from "@/components/painel/RegistroDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, Download, FileSpreadsheet, List } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { exportarCsvComCabecalho, exportarXlsx } from "@/lib/exportar";
import { registrarExportacao } from "@/lib/relatorios.functions";
import type { Filtros, Tabela } from "@/lib/relatorios";
import {
  ctxPainel,
  filtrosDoPainel,
  parametrosPainel,
  tabelaAgregada,
  tabelaAVencerPainel,
  tabelaFeriasPainel,
  tabelaMovPainel,
} from "@/lib/painel-export";
import {
  usePerfil,
  useCatalogos,
  useEmployees,
  useMovements,
  useVacations,
  type MovementFull,
  type VacationFull,
} from "@/hooks/useSistema";
import { useResumoDoDia, useLotesPendentes } from "@/hooks/usePainelInicio";
import { ehCritico, severidadeMax } from "@/lib/conflitos";
import { fmtDataHora, humaniza, mesDe, sobrepoe, SEVERIDADE_PESO, type Severidade } from "@/lib/sistema";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Painel Gerencial de Férias | Operação Logística" },
      {
        name: "description",
        content:
          "Indicadores de férias por área, turno e função, conflitos críticos, funções-chave impactadas e movimentações previstas.",
      },
      { property: "og:title", content: "Painel Gerencial de Férias" },
      {
        property: "og:description",
        content: "Acompanhe férias, conflitos críticos e movimentações da operação em tempo real.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Painel,
});

const TODOS = "__todos__";

function Painel() {
  const perfil = usePerfil();
  const { user } = useAuth();
  const cat = useCatalogos();
  const emp = useEmployees();
  const fer = useVacations();
  const mov = useMovements();

  const [unidade, setUnidade] = useState(TODOS);
  const [areaId, setAreaId] = useState(TODOS);
  const [shiftId, setShiftId] = useState(TODOS);
  const [functionId, setFunctionId] = useState(TODOS);
  const [mes, setMes] = useState("");
  const [status, setStatus] = useState(TODOS);
  const [criticidade, setCriticidade] = useState(TODOS);
  const [drill, setDrill] = useState<Drilldown>(null);
  const [foco, setFoco] = useState<RegistroFoco>(null);
  const [exportando, setExportando] = useState(false);

  const areas = cat.data?.areas ?? [];
  const turnos = cat.data?.turnos ?? [];
  const funcoes = cat.data?.funcoes ?? [];
  const employees = emp.data ?? [];

  const nomeArea = (id: string | null) => areas.find((a) => a.id === id)?.nome ?? "—";
  const nomeTurno = (id: string | null) => turnos.find((t) => t.id === id)?.nome ?? "—";
  const nomeFuncao = (id: string | null) => funcoes.find((f) => f.id === id)?.nome ?? "—";

  const unidades = useMemo(
    () => Array.from(new Set(areas.map((a) => a.unidade).filter(Boolean))) as string[],
    [areas],
  );

  const areasVisiveis = useMemo(
    () => areas.filter((a) => unidade === TODOS || a.unidade === unidade),
    [areas, unidade],
  );

  const ferias = useMemo<VacationFull[]>(() => {
    const idsArea = new Set(areasVisiveis.map((a) => a.id));
    return (fer.data ?? []).filter((v) => {
      if (!v.employee) return false;
      const area = v.area_id_snapshot ?? v.employee.area_id;
      if (!idsArea.has(area ?? "")) return false;
      if (areaId !== TODOS && area !== areaId) return false;
      const turno = v.shift_id_snapshot ?? v.employee.shift_id;
      if (shiftId !== TODOS && turno !== shiftId) return false;
      if (functionId !== TODOS && v.employee.function_id !== functionId) return false;
      if (status !== TODOS && v.status !== status) return false;
      if (mes && !(mesDe(v.inicio) <= mes && mes <= mesDe(v.fim))) return false;
      if (criticidade !== TODOS) {
        const s = severidadeMax(v.conflitos);
        if (!s || SEVERIDADE_PESO[s] < SEVERIDADE_PESO[criticidade as Severidade]) return false;
      }
      return true;
    });
  }, [fer.data, areasVisiveis, areaId, shiftId, functionId, status, mes, criticidade]);

  const movimentacoes = useMemo<MovementFull[]>(() => {
    const idsArea = new Set(areasVisiveis.map((a) => a.id));
    return (mov.data ?? []).filter((m) => {
      const relevante =
        idsArea.has(m.area_origem_id ?? "") || idsArea.has(m.area_destino_id ?? "");
      if (!relevante) return false;
      if (areaId !== TODOS && m.area_origem_id !== areaId && m.area_destino_id !== areaId)
        return false;
      if (shiftId !== TODOS && m.shift_origem_id !== shiftId && m.shift_destino_id !== shiftId)
        return false;
      if (mes && mesDe(m.data_efetiva) !== mes && !(m.temporaria && m.data_fim && mesDe(m.data_efetiva) <= mes && mes <= mesDe(m.data_fim)))
        return false;
      return true;
    });
  }, [mov.data, areasVisiveis, areaId, shiftId, mes]);

  const ativas = ferias.filter((v) => v.status !== "CANCELADA");
  const criticas = ativas.filter((v) => ehCritico(v.conflitos));
  const chaveImpactadas = ativas.filter(
    (v) => funcoes.find((f) => f.id === v.employee?.function_id)?.funcao_chave,
  );
  const semSubstituto = ativas.filter((v) => !v.substituto_employee_id && !v.substituto_nome);
  const movDuranteFerias = ativas.filter((v) =>
    v.conflitos.some((c) => c.regra === "MOVIMENTACAO_DURANTE_FERIAS" || !!c.movement_id),
  );
  const pendencias = movimentacoes.filter((m) => m.status === "PENDENTE");
  const previstas = movimentacoes.filter(
    (m) => m.status !== "CANCELADA" && m.status !== "REJEITADA",
  );

  /* ------------------------------------------------- resumo do dia e ações */

  const hoje = new Date().toISOString().slice(0, 10);
  const emSeteDias = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const resumoDia = useResumoDoDia(hoje);
  const lotes = useLotesPendentes();

  const registrosHoje = resumoDia.data?.registros ?? [];
  const presentesHoje = registrosHoje.filter((r) => r.attendance_status === "PRESENTE");
  const ausentesHoje = registrosHoje.filter((r) =>
    ["FALTA", "FALTA_JUSTIFICADA", "ATESTADO"].includes(r.attendance_status),
  );
  const chamadasNaoFechadas = (resumoDia.data?.dias ?? []).filter(
    (d) => d.status !== "FECHADA" && d.status !== "CANCELADA",
  );
  const chamadasPendentesHoje = (resumoDia.data?.diasDoDia ?? []).filter(
    (d) => d.status !== "FECHADA" && d.status !== "CANCELADA",
  );

  const feriasHoje = ativas.filter((v) => v.inicio <= hoje && hoje <= v.fim);
  const afastados = useMemo(() => {
    const idsArea = new Set(areasVisiveis.map((a) => a.id));
    return employees.filter(
      (e) =>
        e.status === "AFASTADO" &&
        idsArea.has(e.area_id ?? "") &&
        (areaId === TODOS || e.area_id === areaId) &&
        (shiftId === TODOS || e.shift_id === shiftId),
    );
  }, [employees, areasVisiveis, areaId, shiftId]);

  const temporariasVigentes = previstas.filter(
    (m) => m.temporaria && m.data_efetiva <= hoje && (!m.data_fim || m.data_fim >= hoje),
  );
  const temporariasEncerrando = temporariasVigentes.filter(
    (m) => !!m.data_fim && m.data_fim <= emSeteDias,
  );
  const chaveSemSubstituto = ativas.filter(
    (v) =>
      funcoes.find((f) => f.id === v.employee?.function_id)?.funcao_chave &&
      !v.substituto_employee_id &&
      !v.substituto_nome,
  );

  const tab = (nome: string, colunas: string[], linhas: (string | number)[][]): Tabela => ({
    nome,
    colunas,
    linhas,
  });

  const tabRegistros = (nome: string, itens: typeof registrosHoje) =>
    tab(
      nome,
      ["RE", "Colaborador", "Função", "Situação", "Motivo", "Observação"],
      itens.map((r) => [
        r.employee_re ?? "—",
        r.employee_name_snapshot ?? "—",
        r.function_snapshot ?? "—",
        humaniza(r.attendance_status),
        r.absence_reason_id ?? "—",
        r.notes ?? "—",
      ]),
    );

  const tabChamadas = (nome: string, itens: typeof chamadasNaoFechadas) =>
    tab(
      nome,
      ["Data", "Área", "Turno", "Situação", "Observação"],
      itens.map((d) => [
        d.attendance_date,
        nomeArea(d.area_id),
        nomeTurno(d.shift_id),
        humaniza(d.status),
        d.notes ?? "—",
      ]),
    );


  const porMes = useMemo(() => {
    const mapa = new Map<string, VacationFull[]>();
    for (const v of ativas) {
      const k = mesDe(v.inicio);
      mapa.set(k, [...(mapa.get(k) ?? []), v]);
    }
    return [...mapa.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [ativas]);

  const porArea = useMemo(() => {
    const mapa = new Map<string, VacationFull[]>();
    for (const v of ativas) {
      const k = v.area_id_snapshot ?? v.employee?.area_id ?? "";
      mapa.set(k, [...(mapa.get(k) ?? []), v]);
    }
    return [...mapa.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [ativas]);

  const capacidade = useMemo(() => {
    const idsArea = new Set(areasVisiveis.map((a) => a.id));
    const ref = mes || new Date().toISOString().slice(0, 7);
    const inicioMes = `${ref}-01`;
    const fimMes = `${ref}-31`;
    const linhas = new Map<
      string,
      {
        funcao: string;
        turno: string;
        total: number;
        ferias: number;
        chave: boolean;
        itens: VacationFull[];
      }
    >();
    for (const e of employees) {
      if (e.status !== "ATIVO") continue;
      if (!idsArea.has(e.area_id ?? "")) continue;
      if (areaId !== TODOS && e.area_id !== areaId) continue;
      if (shiftId !== TODOS && e.shift_id !== shiftId) continue;
      if (functionId !== TODOS && e.function_id !== functionId) continue;
      const key = `${e.function_id}|${e.shift_id}`;
      const f = funcoes.find((x) => x.id === e.function_id);
      const linha =
        linhas.get(key) ??
        {
          funcao: f?.nome ?? "—",
          turno: nomeTurno(e.shift_id),
          total: 0,
          ferias: 0,
          chave: !!f?.funcao_chave,
          itens: [] as VacationFull[],
        };
      linha.total += 1;
      const doColaborador = ativas.filter(
        (v) => v.employee_id === e.id && sobrepoe(v, { inicio: inicioMes, fim: fimMes }),
      );
      if (doColaborador.length > 0) {
        linha.ferias += 1;
        linha.itens.push(...doColaborador);
      }
      linhas.set(key, linha);
    }
    return [...linhas.values()].sort(
      (a, b) => b.total - b.ferias - (a.total - a.ferias) || a.funcao.localeCompare(b.funcao),
    );
  }, [employees, areasVisiveis, areaId, shiftId, functionId, funcoes, ativas, mes, turnos]);

  const carregando = cat.isLoading || fer.isLoading || mov.isLoading || emp.isLoading;

  /* ------------------------------------------------- exportação dos indicadores */

  const ctx = useMemo(
    () =>
      ctxPainel(
        {
          areas: areas.map((a) => ({ id: a.id, nome: a.nome, unit_id: a.unit_id })),
          turnos: turnos.map((t) => ({ id: t.id, nome: t.nome })),
          funcoes: funcoes.map((f) => ({ id: f.id, nome: f.nome, funcao_chave: f.funcao_chave })),
          unidades: (cat.data?.unidades ?? []).map((u) => ({ id: u.id, nome: u.nome })),
        },
        (mov.data ?? []) as never,
        perfil.tem("ADMIN") || perfil.tem("ANALISTA") ? null : perfil.areasPermitidas,
      ),
    [areas, turnos, funcoes, cat.data, mov.data, perfil.papeis, perfil.areasPermitidas],
  );

  const filtrosAtivos = useMemo(
    () =>
      filtrosDoPainel({
        unidade: unidade === TODOS ? "" : unidade,
        area: areaId === TODOS ? "" : areaId,
        turno: shiftId === TODOS ? "" : shiftId,
        funcao: functionId === TODOS ? "" : functionId,
        mes,
        status: status === TODOS ? "" : status,
        criticidade: criticidade === TODOS ? "" : criticidade,
      }),
    [unidade, areaId, shiftId, functionId, mes, status, criticidade],
  );

  const rotulosFiltros = useMemo<Partial<Record<keyof Filtros, string>>>(
    () => {
      const r: Partial<Record<keyof Filtros, string>> = {};
      if (unidade !== TODOS) r.unidade = unidade;
      if (areaId !== TODOS) r.area = nomeArea(areaId);
      if (shiftId !== TODOS) r.turno = nomeTurno(shiftId);
      if (functionId !== TODOS) r.funcao = nomeFuncao(functionId);
      return r;
    },
    [unidade, areaId, shiftId, functionId, areas, turnos, funcoes],
  );

  const tFerias = (itens: VacationFull[]) => tabelaFeriasPainel(ctx, itens as never);
  const tMov = (itens: MovementFull[]) => tabelaMovPainel(ctx, itens as never);

  const empsFiltrados = useMemo(() => {
    const idsArea = new Set(areasVisiveis.map((a) => a.id));
    return employees.filter((e) => {
      if (e.status !== "ATIVO") return false;
      if (!idsArea.has(e.area_id ?? "")) return false;
      if (areaId !== TODOS && e.area_id !== areaId) return false;
      if (shiftId !== TODOS && e.shift_id !== shiftId) return false;
      if (functionId !== TODOS && e.function_id !== functionId) return false;
      return true;
    });
  }, [employees, areasVisiveis, areaId, shiftId, functionId]);

  const aVencer = useMemo(
    () => tabelaAVencerPainel(ctx, empsFiltrados as never, ativas as never),
    [ctx, empsFiltrados, fer.data, areasVisiveis, areaId, shiftId, functionId, status, mes, criticidade],
  );

  const emailUsuario = user?.email ?? "usuário autenticado";

  async function exportar(d: NonNullable<Drilldown>, formato: "XLSX" | "CSV") {
    if (exportando) return;
    const tabelas: Tabela[] = [d.tabela, ...(d.extras ?? [])];
    const total = tabelas.reduce((s, t) => s + t.linhas.length, 0);
    if (total === 0) {
      toast.info("Nenhum registro para os filtros aplicados.");
      return;
    }
    setExportando(true);
    try {
      const params = parametrosPainel(d.indicador, filtrosAtivos, emailUsuario, rotulosFiltros);
      const nome = `Painel — ${d.indicador}`;
      if (formato === "XLSX") exportarXlsx(tabelas, params, nome);
      else exportarCsvComCabecalho(tabelas[0]!, params, nome);
      await registrarExportacao({
        data: {
          relatorio: `PAINEL_${d.indicador.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`,
          formato,
          filtros: Object.fromEntries(Object.entries(filtrosAtivos).filter(([, v]) => v)),
          totais: Object.fromEntries(tabelas.map((t) => [t.nome, t.linhas.length])),
        },
      });
      toast.success(`${d.indicador}: ${total} registro(s) exportado(s) em ${formato}.`);
    } catch (e) {
      toast.error(`Falha ao exportar: ${e instanceof Error ? e.message : "erro inesperado"}`);
    } finally {
      setExportando(false);
    }
  }

  type CardIndicador = {
    titulo: string;
    valor: number;
    ajuda: string;
    tom?: string | undefined;
    drill: NonNullable<Drilldown>;
  };

  const blocoResumo: CardIndicador[] = [
    {
      titulo: "Colaboradores previstos",
      valor: registrosHoje.length,
      ajuda: "Escalados nas chamadas de hoje",
      drill: {
        titulo: "Colaboradores previstos hoje",
        indicador: "Colaboradores previstos",
        tipo: "tabela",
        tabela: tabRegistros("Previstos hoje", registrosHoje),
      },
    },
    {
      titulo: "Presentes",
      valor: presentesHoje.length,
      ajuda: "Confirmados como presentes",
      tom: "text-success",
      drill: {
        titulo: "Presentes hoje",
        indicador: "Presentes",
        tipo: "tabela",
        tabela: tabRegistros("Presentes hoje", presentesHoje),
      },
    },
    {
      titulo: "Ausentes",
      valor: ausentesHoje.length,
      ajuda: "Faltas, atestados e justificativas",
      tom: ausentesHoje.length > 0 ? "text-high" : undefined,
      drill: {
        titulo: "Ausências de hoje",
        indicador: "Ausentes",
        tipo: "tabela",
        tabela: tabRegistros("Ausentes hoje", ausentesHoje),
      },
    },
    {
      titulo: "Em férias",
      valor: feriasHoje.length,
      ajuda: "Colaboradores em gozo de férias hoje",
      drill: {
        titulo: "Em férias hoje",
        indicador: "Em férias",
        tipo: "ferias",
        itens: feriasHoje,
        tabela: tFerias(feriasHoje),
      },
    },
    {
      titulo: "Afastados",
      valor: afastados.length,
      ajuda: "Cadastro com afastamento vigente",
      drill: {
        titulo: "Colaboradores afastados",
        indicador: "Afastados",
        tipo: "tabela",
        tabela: tab(
          "Afastados",
          ["RE", "Colaborador", "Área", "Turno", "Função"],
          afastados.map((e) => [
            e.re,
            e.nome,
            nomeArea(e.area_id),
            nomeTurno(e.shift_id),
            nomeFuncao(e.function_id),
          ]),
        ),
      },
    },
    {
      titulo: "Chamadas pendentes",
      valor: chamadasPendentesHoje.length,
      ajuda: "Chamadas de hoje ainda sem fechamento",
      tom: chamadasPendentesHoje.length > 0 ? "text-warning" : undefined,
      drill: {
        titulo: "Chamadas de hoje sem fechamento",
        indicador: "Chamadas pendentes",
        tipo: "tabela",
        tabela: tabChamadas("Chamadas pendentes", chamadasPendentesHoje),
      },
    },
  ];

  const blocoPlanejamento: CardIndicador[] = [
    {
      titulo: "Férias programadas",
      valor: ativas.length,
      ajuda: "Programações válidas nos filtros atuais",
      drill: {
        titulo: "Férias programadas",
        indicador: "Férias programadas",
        tipo: "ferias",
        itens: ativas,
        tabela: tFerias(ativas),
      },
    },
    {
      titulo: "Férias críticas",
      valor: criticas.length,
      ajuda: "Com conflito crítico ou bloqueio",
      tom: criticas.length > 0 ? "text-critical" : undefined,
      drill: {
        titulo: "Férias com conflito crítico ou bloqueio",
        indicador: "Férias críticas",
        tipo: "ferias",
        itens: criticas,
        tabela: tFerias(criticas),
      },
    },
    {
      titulo: "Férias a vencer",
      valor: aVencer.linhas.length,
      ajuda: "Saldo próximo do limite legal",
      tom: aVencer.linhas.length > 0 ? "text-high" : undefined,
      drill: {
        titulo: "Férias a vencer",
        indicador: "Férias a vencer",
        tipo: "tabela",
        tabela: aVencer,
      },
    },
    {
      titulo: "Funções-chave sem substituto",
      valor: chaveSemSubstituto.length,
      ajuda: "Cobertura ainda não indicada",
      tom: chaveSemSubstituto.length > 0 ? "text-high" : undefined,
      drill: {
        titulo: "Funções-chave sem substituto indicado",
        indicador: "Funções-chave sem substituto",
        tipo: "ferias",
        itens: chaveSemSubstituto,
        tabela: tFerias(chaveSemSubstituto),
      },
    },
    {
      titulo: "Movimentações temporárias",
      valor: temporariasVigentes.length,
      ajuda: "Empréstimos e coberturas vigentes",
      drill: {
        titulo: "Movimentações temporárias vigentes",
        indicador: "Movimentações temporárias",
        tipo: "movimentacoes",
        itens: temporariasVigentes,
        tabela: tMov(temporariasVigentes),
      },
    },
  ];

  const blocoAcoes: CardIndicador[] = [
    {
      titulo: "Aprovações pendentes",
      valor: pendencias.length,
      ajuda: "Movimentações aguardando decisão",
      tom: pendencias.length > 0 ? "text-warning" : undefined,
      drill: {
        titulo: "Movimentações pendentes de aprovação",
        indicador: "Aprovações pendentes",
        tipo: "movimentacoes",
        itens: pendencias,
        tabela: tMov(pendencias),
      },
    },
    {
      titulo: "Conflitos críticos",
      valor: criticas.length,
      ajuda: "Precisam de tratativa da liderança",
      tom: criticas.length > 0 ? "text-critical" : undefined,
      drill: {
        titulo: "Conflitos críticos de férias",
        indicador: "Conflitos críticos",
        tipo: "ferias",
        itens: criticas,
        tabela: tFerias(criticas),
      },
    },
    {
      titulo: "Bases aguardando validação",
      valor: (lotes.data ?? []).length,
      ajuda: "Importações não processadas",
      tom: (lotes.data ?? []).length > 0 ? "text-warning" : undefined,
      drill: {
        titulo: "Lotes de importação aguardando validação",
        indicador: "Bases aguardando validação",
        tipo: "tabela",
        tabela: tab(
          "Lotes pendentes",
          ["Arquivo", "Fonte", "Situação", "Linhas", "Criado em"],
          (lotes.data ?? []).map((l) => [
            l.arquivo_nome,
            humaniza(l.fonte),
            humaniza(l.status),
            l.total_linhas,
            fmtDataHora(l.created_at),
          ]),
        ),
      },
    },
    {
      titulo: "Chamadas não fechadas",
      valor: chamadasNaoFechadas.length,
      ajuda: "Últimos 30 dias sem fechamento",
      tom: chamadasNaoFechadas.length > 0 ? "text-critical" : undefined,
      drill: {
        titulo: "Chamadas sem fechamento",
        indicador: "Chamadas não fechadas",
        tipo: "tabela",
        tabela: tabChamadas("Chamadas não fechadas", chamadasNaoFechadas),
      },
    },
    {
      titulo: "Movimentações encerrando",
      valor: temporariasEncerrando.length,
      ajuda: "Temporárias que terminam em até 7 dias",
      tom: temporariasEncerrando.length > 0 ? "text-high" : undefined,
      drill: {
        titulo: "Movimentações temporárias próximas do encerramento",
        indicador: "Movimentações encerrando",
        tipo: "movimentacoes",
        itens: temporariasEncerrando,
        tabela: tMov(temporariasEncerrando),
      },
    },
  ];


  const Acoes = ({ drill }: { drill: NonNullable<Drilldown> }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          aria-label={`Ações do indicador ${drill.indicador}`}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onSelect={() => setDrill(drill)}>
          <List className="mr-2 h-4 w-4" /> Ver detalhes
        </DropdownMenuItem>
        <DropdownMenuItem disabled={exportando} onSelect={() => void exportar(drill, "XLSX")}>
          <FileSpreadsheet className="mr-2 h-4 w-4" /> Exportar Excel
        </DropdownMenuItem>
        <DropdownMenuItem disabled={exportando} onSelect={() => void exportar(drill, "CSV")}>
          <Download className="mr-2 h-4 w-4" /> Exportar CSV
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const drillMes = (m: string, itens: VacationFull[]): NonNullable<Drilldown> => ({
    titulo: `Férias iniciadas em ${m}`,
    indicador: `Férias por mês — ${m}`,
    tipo: "ferias",
    itens,
    tabela: tFerias(itens),
  });

  const drillArea = (id: string, itens: VacationFull[]): NonNullable<Drilldown> => ({
    titulo: `Férias — ${nomeArea(id)}`,
    indicador: `Férias por área — ${nomeArea(id)}`,
    tipo: "ferias",
    itens,
    tabela: tFerias(itens),
  });

  const drillGraficoMes: NonNullable<Drilldown> = {
    titulo: "Férias por mês",
    indicador: "Férias por mês",
    tipo: "ferias",
    itens: ativas,
    tabela: tFerias(ativas),
    extras: [tabelaAgregada("Férias por mês", "Mês", porMes.map(([m, i]) => [m, i.length]))],
  };

  const drillGraficoArea: NonNullable<Drilldown> = {
    titulo: "Férias por área",
    indicador: "Férias por área",
    tipo: "ferias",
    itens: ativas,
    tabela: tFerias(ativas),
    extras: [
      tabelaAgregada("Férias por área", "Área", porArea.map(([id, i]) => [nomeArea(id), i.length])),
    ],
  };

  const tabelaCapacidade: Tabela = {
    nome: "Capacidade por função e turno",
    colunas: ["Função", "Função-chave", "Turno", "Efetivo", "Em férias", "Disponível"],
    linhas: capacidade.map((l) => [l.funcao, l.chave ? "Sim" : "Não", l.turno, l.total, l.ferias, l.total - l.ferias]),
  };

  const drillCapacidade: NonNullable<Drilldown> = {
    titulo: `Capacidade por função e turno ${mes ? `(${mes})` : "(mês atual)"}`,
    indicador: "Capacidade por função e turno",
    tipo: "tabela",
    tabela: tabelaCapacidade,
    extras: [tFerias(ativas)],
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Visão Geral · {UNIDADE_PADRAO}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            Olá, <span className="capitalize">{(emailUsuario ?? "").split("@")[0]?.split(/[.\s]/)[0] || "usuário"}</span>. Confira as pendências e os principais indicadores da operação.
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Todos os indicadores são clicáveis e rastreáveis até o registro de origem e sua
            trilha de auditoria.
          </p>
        </div>

        <Card>
          <CardContent className="grid gap-3 py-4 sm:grid-cols-3 lg:grid-cols-7">
            <Filtro label="Unidade" value={unidade} onChange={setUnidade} options={unidades.map((u) => ({ v: u, l: u }))} />
            <Filtro
              label="Área"
              value={areaId}
              onChange={setAreaId}
              options={areasVisiveis.map((a) => ({ v: a.id, l: a.nome }))}
            />
            <Filtro
              label="Turno"
              value={shiftId}
              onChange={setShiftId}
              options={turnos.map((t) => ({ v: t.id, l: t.nome }))}
            />
            <Filtro
              label="Função"
              value={functionId}
              onChange={setFunctionId}
              options={funcoes.map((f) => ({ v: f.id, l: f.nome }))}
            />
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Mês</Label>
              <Input type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
            </div>
            <Filtro
              label="Status"
              value={status}
              onChange={setStatus}
              options={["PLANEJADA", "APROVADA", "EM_ANDAMENTO", "CONCLUIDA", "CANCELADA"].map((s) => ({
                v: s,
                l: humaniza(s),
              }))}
            />
            <Filtro
              label="Criticidade"
              value={criticidade}
              onChange={setCriticidade}
              options={["INFORMATIVO", "ATENCAO", "CRITICO", "BLOQUEIO"].map((s) => ({
                v: s,
                l: humaniza(s),
              }))}
            />
          </CardContent>
        </Card>

        {carregando ? (
          <p className="text-sm text-muted-foreground">Carregando indicadores…</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {indicadores.map((i) => (
                <div
                  key={i.titulo}
                  role="button"
                  tabIndex={0}
                  onClick={() => setDrill(i.drill)}
                  onKeyDown={(e) => e.key === "Enter" && setDrill(i.drill)}
                  className="cursor-pointer rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/60 hover:bg-accent/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      {i.titulo}
                    </p>
                    <Acoes drill={i.drill} />
                  </div>
                  <p className={`mt-1 text-2xl font-semibold ${i.tom ?? "text-foreground"}`}>
                    {i.valor}
                  </p>
                </div>
              ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader className="flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm">Férias por mês</CardTitle>
                  <Acoes drill={drillGraficoMes} />
                </CardHeader>
                <CardContent className="space-y-2">
                  {porMes.length === 0 && <p className="text-sm text-muted-foreground">Sem dados.</p>}
                  {porMes.map(([m, itens]) => (
                    <button
                      key={m}
                      onClick={() => setDrill(drillMes(m, itens))}
                      className="flex w-full items-center gap-3 rounded-md px-2 py-1 text-left hover:bg-accent"
                    >
                      <span className="w-16 text-xs text-muted-foreground">{m}</span>
                      <span className="h-2 flex-1 overflow-hidden rounded bg-muted">
                        <span
                          className="block h-full bg-primary"
                          style={{
                            width: `${Math.min(100, (itens.length / Math.max(1, ativas.length)) * 100 * 3)}%`,
                          }}
                        />
                      </span>
                      <span className="w-8 text-right text-xs font-medium">{itens.length}</span>
                    </button>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm">Férias por área</CardTitle>
                  <Acoes drill={drillGraficoArea} />
                </CardHeader>
                <CardContent className="space-y-2">
                  {porArea.length === 0 && <p className="text-sm text-muted-foreground">Sem dados.</p>}
                  {porArea.map(([id, itens]) => (
                    <button
                      key={id}
                      onClick={() => setDrill(drillArea(id, itens))}
                      className="flex w-full items-center gap-3 rounded-md px-2 py-1 text-left hover:bg-accent"
                    >
                      <span className="w-40 truncate text-xs text-muted-foreground">
                        {nomeArea(id)}
                      </span>
                      <span className="h-2 flex-1 overflow-hidden rounded bg-muted">
                        <span
                          className="block h-full bg-primary"
                          style={{
                            width: `${Math.min(100, (itens.length / Math.max(1, ativas.length)) * 100 * 3)}%`,
                          }}
                        />
                      </span>
                      <span className="w-8 text-right text-xs font-medium">{itens.length}</span>
                    </button>
                  ))}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm">
                  Capacidade disponível por função e turno {mes ? `(${mes})` : "(mês atual)"}
                </CardTitle>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setMes("")}>
                    Limpar mês
                  </Button>
                  <Acoes drill={drillCapacidade} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs uppercase text-muted-foreground">
                      <tr className="border-b border-border">
                        <th className="py-2 text-left font-medium">Função</th>
                        <th className="py-2 text-left font-medium">Turno</th>
                        <th className="py-2 text-right font-medium">Efetivo</th>
                        <th className="py-2 text-right font-medium">Em férias</th>
                        <th className="py-2 text-right font-medium">Disponível</th>
                      </tr>
                    </thead>
                    <tbody>
                      {capacidade.map((l) => {
                        const disp = l.total - l.ferias;
                        return (
                          <tr
                            key={`${l.funcao}|${l.turno}`}
                            onClick={() =>
                              setDrill({
                                titulo: `Férias — ${l.funcao} · turno ${l.turno}`,
                                indicador: `Capacidade — ${l.funcao} · turno ${l.turno}`,
                                tipo: "ferias",
                                itens: l.itens,
                                tabela: tFerias(l.itens),
                              })
                            }
                            className="cursor-pointer border-b border-border/60 hover:bg-accent/40"
                          >
                            <td className="py-1.5">
                              {l.funcao}{" "}
                              {l.chave && (
                                <Badge variant="secondary" className="ml-1 text-[10px]">
                                  chave
                                </Badge>
                              )}
                            </td>
                            <td className="py-1.5 text-muted-foreground">{l.turno}</td>
                            <td className="py-1.5 text-right">{l.total}</td>
                            <td className="py-1.5 text-right">{l.ferias}</td>
                            <td
                              className={`py-1.5 text-right font-medium ${
                                disp <= 0 ? "text-destructive" : disp === 1 ? "text-amber-500" : ""
                              }`}
                            >
                              {disp}
                            </td>
                          </tr>
                        );
                      })}
                      {capacidade.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-3 text-sm text-muted-foreground">
                            Sem efetivo para os filtros selecionados.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <DrilldownDialog
        data={drill}
        onClose={() => setDrill(null)}
        onAbrirRegistro={setFoco}
        onExportar={(d, f) => void exportar(d, f)}
        exportando={exportando}
        nomeArea={nomeArea}
        nomeTurno={nomeTurno}
        nomeFuncao={nomeFuncao}
      />

      <RegistroDialog
        registro={foco}
        onClose={() => setFoco(null)}
        nomeArea={nomeArea}
        nomeTurno={nomeTurno}
        nomeFuncao={nomeFuncao}
      />
    </AppShell>
  );
}

function Filtro({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { v: string; l: string }[];
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TODOS}>Todos</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.v} value={o.v}>
              {o.l}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
