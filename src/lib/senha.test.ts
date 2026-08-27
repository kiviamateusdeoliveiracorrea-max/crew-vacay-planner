import { describe, expect, it } from "vitest";
import {
  mascararEmail,
  requisitosSenha,
  senhaValida,
  validarEmail,
  validarNovaSenha,
} from "@/lib/senha";

const EMAIL = "teste.usuario@intralog.com.br";

describe("política de senha", () => {
  it("aceita senha que cumpre todos os requisitos", () => {
    expect(senhaValida("Intralog@2026", EMAIL)).toBe(true);
    expect(validarNovaSenha("Intralog@2026", "Intralog@2026", EMAIL)).toBeNull();
  });

  it("recusa senha curta, sem maiúscula, sem número ou sem especial", () => {
    expect(senhaValida("intra@1", EMAIL)).toBe(false);
    expect(senhaValida("intralog@teste", EMAIL)).toBe(false);
    expect(senhaValida("Intralogteste", EMAIL)).toBe(false);
    expect(senhaValida("Intralog12345", EMAIL)).toBe(false);
  });

  it("recusa espaços no início ou no fim e senha igual ao e-mail", () => {
    expect(requisitosSenha(" Intralog@2026 ", EMAIL).find((r) => r.chave === "espacos")!.atende).toBe(false);
    expect(
      requisitosSenha(EMAIL, EMAIL).find((r) => r.chave === "diferente_email")!.atende,
    ).toBe(false);
  });

  it("não limita o tamanho máximo da senha", () => {
    expect(senhaValida(`Aa1@${"x".repeat(200)}`, EMAIL)).toBe(true);
  });

  it("avisa quando a confirmação é diferente", () => {
    expect(validarNovaSenha("Intralog@2026", "Intralog@2027", EMAIL)).toMatch(/não são iguais/i);
  });

  it("recusa senha vazia", () => {
    expect(validarNovaSenha("", "", EMAIL)).toMatch(/Informe a nova senha/i);
  });
});

describe("e-mail da recuperação", () => {
  it("exige preenchimento e formato válido", () => {
    expect(validarEmail("")).toMatch(/Informe/i);
    expect(validarEmail("teste@")).toMatch(/não parece válido/i);
    expect(validarEmail(EMAIL)).toBeNull();
  });

  it("mascara o e-mail antes de auditar", () => {
    expect(mascararEmail(EMAIL)).toBe("te***********@intralog.com.br");
    expect(mascararEmail(EMAIL)).not.toContain("usuario");
  });
});
