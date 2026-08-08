export type Colaborador = {
  id: string;
  re: string | null;
  nome: string;
  funcao: string;
  area: string;
  turno: string | null;
  lider: string | null;
  funcao_chave: boolean;
  ativo: boolean;
};

export type Feria = {
  id: string;
  colaborador_id: string;
  inicio: string;
  fim: string;
  status: string;
  substituto: string | null;
  observacao: string | null;
};

export type Registro = Feria & { colaborador: Colaborador };

export type Severidade = "critico" | "alerta" | "ok";

export type Conflito = {
  severidade: Exclude<Severidade, "ok">;
  tipo: "mesma-area" | "outra-area";
  mensagem: string;
  outro: Registro;
};

export const overlap = (a: { inicio: string; fim: string }, b: { inicio: string; fim: string }) =>
  a.inicio <= b.fim && b.inicio <= a.fim;

export const normaliza = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();

/** Regras: mesma função sobreposta na MESMA área = crítico.
 *  Mesma função sobreposta em OUTRA área = alerta (crítico se função-chave). */
export function conflitosDe(registro: Registro, todos: Registro[]): Conflito[] {
  const out: Conflito[] = [];
  for (const outro of todos) {
    if (outro.id === registro.id) continue;
    if (normaliza(outro.colaborador.funcao) !== normaliza(registro.colaborador.funcao)) continue;
    if (!overlap(registro, outro)) continue;
    const mesmaArea = normaliza(outro.colaborador.area) === normaliza(registro.colaborador.area);
    if (mesmaArea) {
      out.push({
        severidade: "critico",
        tipo: "mesma-area",
        mensagem: `Mesma função (${registro.colaborador.funcao}) na área ${registro.colaborador.area} — conflito com ${outro.colaborador.nome}`,
        outro,
      });
    } else {
      out.push({
        severidade: registro.colaborador.funcao_chave ? "critico" : "alerta",
        tipo: "outra-area",
        mensagem: `Mesma função em outra área (${outro.colaborador.area}) — ${outro.colaborador.nome}`,
        outro,
      });
    }
  }
  return out;
}

export function mapaConflitos(registros: Registro[]) {
  const mapa = new Map<string, Conflito[]>();
  for (const r of registros) mapa.set(r.id, conflitosDe(r, registros));
  return mapa;
}

export function severidadeDe(conflitos: Conflito[] | undefined): Severidade {
  if (!conflitos || conflitos.length === 0) return "ok";
  return conflitos.some((c) => c.severidade === "critico") ? "critico" : "alerta";
}

export const fmt = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

export const dias = (inicio: string, fim: string) =>
  Math.round((new Date(fim).getTime() - new Date(inicio).getTime()) / 86400000) + 1;
