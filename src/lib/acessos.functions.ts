import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PAPEIS = ["ADMIN", "ANALISTA", "LIDER", "COORDENADOR", "GERENTE"] as const;
type Papel = (typeof PAPEIS)[number];

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function exigirAdmin(userId: string) {
  const db = await admin();
  const [{ data: roles }, { data: perfil }] = await Promise.all([
    db.from("user_roles").select("role").eq("user_id", userId),
    db.from("profiles").select("ativo").eq("id", userId).maybeSingle(),
  ]);
  const ehAdmin = (roles ?? []).some((r) => r.role === "ADMIN") && perfil?.ativo !== false;
  if (!ehAdmin) throw new Error("Somente administradores podem gerenciar acessos.");
  return db;
}

async function auditar(
  acao: string,
  registroId: string,
  usuarioId: string,
  anterior: unknown,
  posterior: unknown,
  justificativa: string,
) {
  const db = await admin();
  await db.from("audit_log").insert({
    tabela: "user_access",
    registro_id: registroId,
    acao,
    usuario_id: usuarioId,
    valor_anterior: (anterior ?? null) as never,
    valor_posterior: (posterior ?? null) as never,
    justificativa,
  });
}

/** Diagnóstico do usuário autenticado + se o bootstrap do 1º admin está liberado. */
export const diagnosticoAcesso = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin();
    const { data: authUser } = await db.auth.admin.getUserById(context.userId);
    const [{ data: perfil }, { data: roles }, { count: totalRoles }] = await Promise.all([
      db.from("profiles").select("id, email, nome, ativo").eq("id", context.userId).maybeSingle(),
      db.from("user_roles").select("role").eq("user_id", context.userId),
      db.from("user_roles").select("*", { count: "exact", head: true }),
    ]);
    return {
      userId: context.userId,
      email: authUser?.user?.email ?? perfil?.email ?? null,
      temPerfil: !!perfil,
      ativo: perfil?.ativo ?? null,
      papeis: (roles ?? []).map((r) => r.role as Papel),
      totalAdministradores: totalRoles ?? 0,
      bootstrapDisponivel: (totalRoles ?? 0) === 0,
    };
  });

/** Promove o usuário autenticado a ADMIN — apenas quando NENHUM perfil existe ainda. */
export const promoverPrimeiroAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin();
    const { count } = await db.from("user_roles").select("*", { count: "exact", head: true });
    if ((count ?? 0) > 0) {
      throw new Error("Já existe pelo menos um usuário com perfil. Peça liberação a um administrador.");
    }

    const { data: authUser } = await db.auth.admin.getUserById(context.userId);
    const email = authUser?.user?.email ?? null;

    const { data: perfilExistente } = await db
      .from("profiles")
      .select("id")
      .eq("id", context.userId)
      .maybeSingle();

    if (!perfilExistente) {
      const { error } = await db.from("profiles").insert({
        id: context.userId,
        email,
        nome: (authUser?.user?.user_metadata?.["nome"] as string) ?? email,
        ativo: true,
      });
      if (error) throw error;
    }

    const { error: eRole } = await db
      .from("user_roles")
      .insert({ user_id: context.userId, role: "ADMIN" });
    if (eRole) throw eRole;

    const { data: unidades } = await db.from("units").select("id");
    const { data: areas } = await db.from("areas").select("id, unit_id");

    const permissoes = [
      ...(unidades ?? []).map((u) => ({
        user_id: context.userId,
        unit_id: u.id,
        area_id: null,
        concedido_por: context.userId,
      })),
      ...(areas ?? [])
        .filter((a) => !a.unit_id)
        .map((a) => ({
          user_id: context.userId,
          unit_id: null,
          area_id: a.id,
          concedido_por: context.userId,
        })),
    ];
    if (permissoes.length) {
      const { error } = await db.from("user_area_permissions").insert(permissoes);
      if (error) throw error;
    }

    await auditar(
      "BOOTSTRAP_ADMIN",
      context.userId,
      context.userId,
      null,
      { email, role: "ADMIN", unidades: (unidades ?? []).length, areas: permissoes.length },
      "Configuração inicial: primeiro administrador do sistema.",
    );

    return { ok: true, email };
  });

export type SolicitacaoPendente = {
  id: string;
  areaId: string | null;
  justificativa: string;
  criadoEm: string;
};

export type UsuarioAcesso = {
  id: string;
  email: string | null;
  nome: string | null;
  ativo: boolean;
  criadoEm: string | null;
  ultimoAcesso: string | null;
  liberadoEm: string | null;
  papeis: Papel[];
  unidades: string[];
  areas: string[];
  concedidoPor: string | null;
  solicitacao: SolicitacaoPendente | null;
};

export const listarUsuarios = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<UsuarioAcesso[]> => {
    const db = await exigirAdmin(context.userId);
    const { data: lista, error } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) throw error;

    const [{ data: perfis }, { data: roles }, { data: perms }, { data: solicitacoes }] =
      await Promise.all([
        db.from("profiles").select("id, email, nome, ativo"),
        db.from("user_roles").select("user_id, role, created_at"),
        db.from("user_area_permissions").select("user_id, area_id, unit_id, concedido_por"),
        db
          .from("access_requests")
          .select("id, user_id, area_id, justificativa, created_at")
          .eq("status", "PENDENTE"),
      ]);

    const emailPorId = new Map((lista.users ?? []).map((u) => [u.id, u.email ?? null]));
    (perfis ?? []).forEach((p) => {
      if (!emailPorId.has(p.id)) emailPorId.set(p.id, p.email);
    });

    return (lista.users ?? []).map((u) => {
      const perfil = (perfis ?? []).find((p) => p.id === u.id);
      const meusPerms = (perms ?? []).filter((p) => p.user_id === u.id);
      const meusRoles = (roles ?? []).filter((r) => r.user_id === u.id);
      const concedente = meusPerms.find((p) => p.concedido_por)?.concedido_por ?? null;
      const sol = (solicitacoes ?? []).find((s) => s.user_id === u.id) ?? null;
      const liberadoEm = meusRoles
        .map((r) => r.created_at)
        .filter(Boolean)
        .sort()[0] as string | undefined;
      return {
        id: u.id,
        email: u.email ?? perfil?.email ?? null,
        nome: perfil?.nome ?? null,
        ativo: perfil?.ativo ?? true,
        criadoEm: u.created_at ?? null,
        ultimoAcesso: u.last_sign_in_at ?? null,
        liberadoEm: liberadoEm ?? null,
        papeis: meusRoles.map((r) => r.role as Papel),
        unidades: meusPerms.filter((p) => !p.area_id && p.unit_id).map((p) => p.unit_id!),
        areas: meusPerms.filter((p) => p.area_id).map((p) => p.area_id!),
        concedidoPor: concedente ? (emailPorId.get(concedente) ?? concedente) : null,
        solicitacao: sol
          ? {
              id: sol.id,
              areaId: sol.area_id,
              justificativa: sol.justificativa,
              criadoEm: sol.created_at,
            }
          : null,
      };
    });
  });


const salvarSchema = z.object({
  userId: z.string().uuid(),
  papeis: z.array(z.enum(PAPEIS)),
  unidades: z.array(z.string().uuid()),
  areas: z.array(z.string().uuid()),
  ativo: z.boolean(),
});

export const salvarAcesso = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => salvarSchema.parse(d))
  .handler(async ({ context, data }) => {
    const db = await exigirAdmin(context.userId);

    if (data.userId === context.userId && !data.papeis.includes("ADMIN")) {
      throw new Error("Você não pode remover o seu próprio perfil ADMIN.");
    }

    const { data: authUser } = await db.auth.admin.getUserById(data.userId);
    const email = authUser?.user?.email ?? null;

    const [{ data: rolesAntes }, { data: permsAntes }, { data: perfilAntes }] = await Promise.all([
      db.from("user_roles").select("role").eq("user_id", data.userId),
      db.from("user_area_permissions").select("area_id, unit_id").eq("user_id", data.userId),
      db.from("profiles").select("ativo").eq("id", data.userId).maybeSingle(),
    ]);

    if (!perfilAntes) {
      await db.from("profiles").insert({ id: data.userId, email, ativo: data.ativo });
    } else {
      await db.from("profiles").update({ ativo: data.ativo }).eq("id", data.userId);
    }

    await db.from("user_roles").delete().eq("user_id", data.userId);
    if (data.papeis.length) {
      const { error } = await db
        .from("user_roles")
        .insert(data.papeis.map((role) => ({ user_id: data.userId, role })));
      if (error) throw error;
    }

    await db.from("user_area_permissions").delete().eq("user_id", data.userId);
    const novas = [
      ...data.unidades.map((unit_id) => ({
        user_id: data.userId,
        unit_id,
        area_id: null,
        concedido_por: context.userId,
      })),
      ...data.areas.map((area_id) => ({
        user_id: data.userId,
        unit_id: null,
        area_id,
        concedido_por: context.userId,
      })),
    ];
    if (novas.length) {
      const { error } = await db.from("user_area_permissions").insert(novas);
      if (error) throw error;
    }

    await auditar(
      "UPDATE",
      data.userId,
      context.userId,
      {
        papeis: (rolesAntes ?? []).map((r) => r.role),
        permissoes: permsAntes ?? [],
        ativo: perfilAntes?.ativo ?? null,
      },
      { email, papeis: data.papeis, unidades: data.unidades, areas: data.areas, ativo: data.ativo },
      "Alteração de perfil e permissões pela tela Usuários e Acessos.",
    );

    return { ok: true };
  });

export const removerAcesso = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const db = await exigirAdmin(context.userId);
    if (data.userId === context.userId) {
      throw new Error("Você não pode remover o seu próprio acesso.");
    }

    const [{ data: rolesAntes }, { data: permsAntes }] = await Promise.all([
      db.from("user_roles").select("role").eq("user_id", data.userId),
      db.from("user_area_permissions").select("area_id, unit_id").eq("user_id", data.userId),
    ]);

    await db.from("user_roles").delete().eq("user_id", data.userId);
    await db.from("user_area_permissions").delete().eq("user_id", data.userId);
    await db.from("profiles").update({ ativo: false }).eq("id", data.userId);

    await auditar(
      "DELETE",
      data.userId,
      context.userId,
      { papeis: (rolesAntes ?? []).map((r) => r.role), permissoes: permsAntes ?? [] },
      { papeis: [], permissoes: [], ativo: false },
      "Remoção de acesso pela tela Usuários e Acessos.",
    );

    return { ok: true };
  });

/* ---------------- Solicitação de acesso ---------------- */

export const areasParaSolicitacao = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const db = await admin();
    const { data } = await db
      .from("areas")
      .select("id, nome, unidade")
      .eq("ativo", true)
      .order("nome");
    return (data ?? []).map((a) => ({ id: a.id, nome: a.nome, unidade: a.unidade }));
  });

export const minhaSolicitacaoAcesso = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin();
    const { data: authUser } = await db.auth.admin.getUserById(context.userId);
    const { data } = await db
      .from("access_requests")
      .select("id, area_id, justificativa, status, created_at, decidido_em, resposta")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return {
      email: authUser?.user?.email ?? null,
      solicitacao: data ?? null,
    };
  });

const solicitarSchema = z.object({
  areaId: z.string().uuid().nullable(),
  justificativa: z.string().trim().min(10).max(1000),
});

export const solicitarAcesso = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => solicitarSchema.parse(d))
  .handler(async ({ context, data }) => {
    const db = await admin();

    const { data: aberta } = await db
      .from("access_requests")
      .select("id")
      .eq("user_id", context.userId)
      .eq("status", "PENDENTE")
      .maybeSingle();
    if (aberta) throw new Error("Você já possui uma solicitação em aberto aguardando aprovação.");

    const { data: papeis } = await db
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if ((papeis ?? []).length) throw new Error("Sua conta já possui perfil de acesso.");

    const { data: authUser } = await db.auth.admin.getUserById(context.userId);
    const email = authUser?.user?.email ?? null;

    const { data: criada, error } = await db
      .from("access_requests")
      .insert({
        user_id: context.userId,
        email,
        area_id: data.areaId,
        justificativa: data.justificativa,
        status: "PENDENTE",
      })
      .select("id, created_at")
      .single();
    if (error) throw error;

    // Notificar administradores
    const { data: admins } = await db.from("user_roles").select("user_id").eq("role", "ADMIN");
    const ids = (admins ?? []).map((a) => a.user_id);
    let emailsAdmins: string[] = [];
    if (ids.length) {
      const { data: perfisAdmin } = await db
        .from("profiles")
        .select("email")
        .in("id", ids)
        .eq("ativo", true);
      emailsAdmins = (perfisAdmin ?? []).map((p) => p.email).filter((e): e is string => !!e);
    }

    await auditar(
      "SOLICITACAO_ACESSO",
      criada.id,
      context.userId,
      null,
      {
        email,
        area_id: data.areaId,
        justificativa: data.justificativa,
        status: "PENDENTE",
        administradores_notificados: emailsAdmins,
      },
      "Solicitação de liberação de acesso enviada para aprovação.",
    );

    return { ok: true, id: criada.id, criadoEm: criada.created_at, administradores: emailsAdmins.length };
  });
