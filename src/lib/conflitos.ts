import type { Conflict, Severidade } from "@/lib/sistema";
import { SEVERIDADE_PESO } from "@/lib/sistema";

export function severidadeMax(conflitos: Conflict[] | undefined | null): Severidade | null {
  if (!conflitos || conflitos.length === 0) return null;
  return conflitos.reduce<Severidade>(
    (acc, c) => (SEVERIDADE_PESO[c.severidade] > SEVERIDADE_PESO[acc] ? c.severidade : acc),
    conflitos[0]!.severidade,
  );
}

export function ehCritico(conflitos: Conflict[] | undefined | null) {
  const s = severidadeMax(conflitos);
  return s === "CRITICO" || s === "BLOQUEIO";
}
