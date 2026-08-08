# Sistema Gerencial de Férias

Transformar o protótipo atual em um sistema completo, com banco persistente (Lovable Cloud, já ativo), perfis de acesso, movimentações, importação de planilhas, motor de conflitos e auditoria.

O banco já existe com `colaboradores` e `ferias` (194 colaboradores importados). Vamos evoluir para o modelo completo pedido, migrando esses dados para as novas tabelas.

## Entrega em 5 fases

Cada fase termina funcionando no app. Sugiro aprovar a fase 1 e 2 juntas e seguir na sequência.

### Fase 1 — Base de dados e permissões
- Tabelas: `profiles`, `areas`, `shifts`, `functions`, `employees`, `user_area_permissions`, `coverage_rules`, `audit_log`.
- RE/matrícula como identificador único do colaborador.
- Perfis ADMIN, ANALISTA, LIDER, COORDENADOR, GERENTE em tabela de papéis separada (nunca no perfil do usuário).
- RLS no banco para todas as tabelas: leitura e escrita decididas por papel + áreas autorizadas, não por esconder botões.
- Migração dos 194 colaboradores e 17 férias atuais para o novo modelo.
- Tela de administração de usuários, papéis e áreas (só ADMIN).

### Fase 2 — Movimentações e área vigente
- Tabela `employee_movements` com RE, colaborador, setor/turno de origem e destino, data efetiva, tipo, temporária, data final, motivo, aprovador, status, observação.
- Tipos: TRANSFERENCIA_DEFINITIVA, EMPRESTIMO_TEMPORARIO, COBERTURA_DE_FERIAS, TROCA_DE_TURNO, RETORNO_A_ORIGEM.
- Função no banco que devolve área e turno vigentes em qualquer data, respeitando definitivas (a partir da data efetiva) e temporárias (só na janela). Histórico nunca é apagado.
- Módulo Movimentações: lista, filtros, criação, aprovação e cancelamento.

### Fase 3 — Férias, motor de conflitos e aprovações
- Tabelas `vacations`, `vacation_conflicts`, `approvals`.
- Motor de conflitos avaliando: sobreposição parcial, mesma função, área e turno vigentes na data inicial, quantidade mínima por função/turno, função-chave, substituto e sua disponibilidade, regras de cobertura entre áreas, movimentação durante as férias. Férias canceladas são ignoradas.
- Classificação INFORMATIVO, ATENCAO, CRITICO, BLOQUEIO.
- Cada alerta mostra envolvidos, RE, função, área, turno, período de sobreposição, dias coincidentes, regra violada e ação recomendada.
- Fluxo de aprovação: COORDENADOR nas áreas autorizadas, GERENTE nos alertas críticos.

### Fase 4 — Importação de base
- Tabelas `import_batches`, `import_rows` e modelos de mapeamento salvos.
- Assistente em etapas: upload (xlsx, xlsm, csv) → escolher aba → mapear colunas → salvar modelo → prévia → validação → comparação com a base → aprovação → aplicação.
- Classificação por linha: NOVO_COLABORADOR, ATUALIZACAO_CADASTRAL, MUDANCA_DE_SETOR, MUDANCA_DE_TURNO, MUDANCA_DE_FUNCAO, DESLIGAMENTO, DUPLICIDADE, DADO_INVALIDO, SEM_ALTERACAO.
- Ausência no arquivo nunca desliga ninguém. Desligamento só com status/data no arquivo ou aprovação manual.
- Mudança de setor entra como pendência: o usuário decide se é definitiva ou temporária antes de virar movimentação.

### Fase 5 — Painel gerencial e auditoria
- Filtros por unidade, área, turno, função, mês, status e criticidade.
- Indicadores clicáveis, cada um abrindo a lista que o compõe: férias por mês, férias por área, férias críticas, funções-chave impactadas, férias sem substituto, movimentações previstas, movimentações durante férias, pendências de aprovação, capacidade disponível por função e turno.
- Trilha de auditoria completa (inclusão, alteração, aprovação, cancelamento, importação, movimentação) com usuário, data/hora, valor anterior, valor posterior e justificativa, gravada por gatilhos no banco.
- Tela de auditoria com filtros, visível ao ADMIN.

## Testes antes da conclusão
Dados de teste dedicados e verificação dos cenários: conflito na mesma área e turno; conflito entre áreas; função-chave sem substituto; substituto também de férias; transferência definitiva antes das férias; empréstimo temporário vigente; empréstimo encerrado antes das férias; movimentação durante as férias; desligamento com férias futuras; importação de novo colaborador; importação de mudança de setor; duplicidade de RE.

## Detalhes técnicos
- Backend: Lovable Cloud (Postgres + Auth), já conectado. Nenhum dado em array, arquivo estático, localStorage ou mock.
- Papéis em `user_roles` com enum `app_role` e função `has_role` security definer; `user_area_permissions` liga usuário a áreas. Políticas RLS por tabela usando essas funções, com GRANTs explícitos.
- Área/turno vigentes resolvidos por função SQL `area_vigente(employee_id, data)` usada tanto pelo motor de conflitos quanto pelas telas.
- Motor de conflitos em função SQL + server functions do TanStack Start; recálculo ao criar/editar férias e movimentações.
- Leitura de xlsx/xlsm/csv no navegador com SheetJS; as linhas vão para `import_rows` e a aplicação do lote roda no servidor com validação de papel.
- Auditoria por trigger genérica gravando JSON antes/depois em `audit_log`.

## Decisões que preciso confirmar
- Quantidade mínima por função/turno: parametrizável por área em `coverage_rules` (padrão 1 pessoa presente).
- "Unidade": vou adicionar campo de unidade em `areas` para os filtros do painel.
- Primeiro usuário cadastrado vira ADMIN; os demais entram sem papel até serem liberados.
