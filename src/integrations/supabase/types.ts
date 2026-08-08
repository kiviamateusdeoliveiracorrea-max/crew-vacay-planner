export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      approvals: {
        Row: {
          area_id: string | null
          created_at: string
          decidido_em: string | null
          decidido_por: string | null
          entidade: string
          entidade_id: string
          id: string
          justificativa: string | null
          solicitado_por: string | null
          status: Database["public"]["Enums"]["approval_status"]
          updated_at: string
        }
        Insert: {
          area_id?: string | null
          created_at?: string
          decidido_em?: string | null
          decidido_por?: string | null
          entidade: string
          entidade_id: string
          id?: string
          justificativa?: string | null
          solicitado_por?: string | null
          status?: Database["public"]["Enums"]["approval_status"]
          updated_at?: string
        }
        Update: {
          area_id?: string | null
          created_at?: string
          decidido_em?: string | null
          decidido_por?: string | null
          entidade?: string
          entidade_id?: string
          id?: string
          justificativa?: string | null
          solicitado_por?: string | null
          status?: Database["public"]["Enums"]["approval_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "approvals_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
        ]
      }
      areas: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          unidade: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          unidade?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          unidade?: string
          updated_at?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          acao: string
          created_at: string
          id: string
          justificativa: string | null
          registro_id: string | null
          tabela: string
          usuario_id: string | null
          valor_anterior: Json | null
          valor_posterior: Json | null
        }
        Insert: {
          acao: string
          created_at?: string
          id?: string
          justificativa?: string | null
          registro_id?: string | null
          tabela: string
          usuario_id?: string | null
          valor_anterior?: Json | null
          valor_posterior?: Json | null
        }
        Update: {
          acao?: string
          created_at?: string
          id?: string
          justificativa?: string | null
          registro_id?: string | null
          tabela?: string
          usuario_id?: string | null
          valor_anterior?: Json | null
          valor_posterior?: Json | null
        }
        Relationships: []
      }
      colaboradores: {
        Row: {
          area: string
          ativo: boolean
          created_at: string
          funcao: string
          funcao_chave: boolean
          id: string
          lider: string | null
          nome: string
          re: string | null
          turno: string | null
        }
        Insert: {
          area: string
          ativo?: boolean
          created_at?: string
          funcao: string
          funcao_chave?: boolean
          id?: string
          lider?: string | null
          nome: string
          re?: string | null
          turno?: string | null
        }
        Update: {
          area?: string
          ativo?: boolean
          created_at?: string
          funcao?: string
          funcao_chave?: boolean
          id?: string
          lider?: string | null
          nome?: string
          re?: string | null
          turno?: string | null
        }
        Relationships: []
      }
      coverage_rules: {
        Row: {
          area_id: string | null
          cobertura_area_id: string | null
          created_at: string
          function_id: string | null
          id: string
          max_ferias_simultaneas: number
          min_presentes: number
          shift_id: string | null
          updated_at: string
        }
        Insert: {
          area_id?: string | null
          cobertura_area_id?: string | null
          created_at?: string
          function_id?: string | null
          id?: string
          max_ferias_simultaneas?: number
          min_presentes?: number
          shift_id?: string | null
          updated_at?: string
        }
        Update: {
          area_id?: string | null
          cobertura_area_id?: string | null
          created_at?: string
          function_id?: string | null
          id?: string
          max_ferias_simultaneas?: number
          min_presentes?: number
          shift_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coverage_rules_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coverage_rules_cobertura_area_id_fkey"
            columns: ["cobertura_area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coverage_rules_function_id_fkey"
            columns: ["function_id"]
            isOneToOne: false
            referencedRelation: "functions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coverage_rules_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_movements: {
        Row: {
          aprovador_id: string | null
          area_destino_id: string | null
          area_origem_id: string | null
          created_at: string
          created_by: string | null
          data_efetiva: string
          data_fim: string | null
          employee_id: string
          id: string
          motivo: string | null
          observacao: string | null
          re: string
          shift_destino_id: string | null
          shift_origem_id: string | null
          status: Database["public"]["Enums"]["movement_status"]
          temporaria: boolean
          tipo: Database["public"]["Enums"]["movement_type"]
          updated_at: string
        }
        Insert: {
          aprovador_id?: string | null
          area_destino_id?: string | null
          area_origem_id?: string | null
          created_at?: string
          created_by?: string | null
          data_efetiva: string
          data_fim?: string | null
          employee_id: string
          id?: string
          motivo?: string | null
          observacao?: string | null
          re: string
          shift_destino_id?: string | null
          shift_origem_id?: string | null
          status?: Database["public"]["Enums"]["movement_status"]
          temporaria?: boolean
          tipo: Database["public"]["Enums"]["movement_type"]
          updated_at?: string
        }
        Update: {
          aprovador_id?: string | null
          area_destino_id?: string | null
          area_origem_id?: string | null
          created_at?: string
          created_by?: string | null
          data_efetiva?: string
          data_fim?: string | null
          employee_id?: string
          id?: string
          motivo?: string | null
          observacao?: string | null
          re?: string
          shift_destino_id?: string | null
          shift_origem_id?: string | null
          status?: Database["public"]["Enums"]["movement_status"]
          temporaria?: boolean
          tipo?: Database["public"]["Enums"]["movement_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_movements_area_destino_id_fkey"
            columns: ["area_destino_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_movements_area_origem_id_fkey"
            columns: ["area_origem_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_movements_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_movements_shift_destino_id_fkey"
            columns: ["shift_destino_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_movements_shift_origem_id_fkey"
            columns: ["shift_origem_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          area_id: string | null
          created_at: string
          data_admissao: string | null
          data_desligamento: string | null
          function_id: string | null
          id: string
          legacy_id: string | null
          lider: string | null
          nome: string
          re: string
          shift_id: string | null
          status: Database["public"]["Enums"]["employee_status"]
          unidade: string
          updated_at: string
        }
        Insert: {
          area_id?: string | null
          created_at?: string
          data_admissao?: string | null
          data_desligamento?: string | null
          function_id?: string | null
          id?: string
          legacy_id?: string | null
          lider?: string | null
          nome: string
          re: string
          shift_id?: string | null
          status?: Database["public"]["Enums"]["employee_status"]
          unidade?: string
          updated_at?: string
        }
        Update: {
          area_id?: string | null
          created_at?: string
          data_admissao?: string | null
          data_desligamento?: string | null
          function_id?: string | null
          id?: string
          legacy_id?: string | null
          lider?: string | null
          nome?: string
          re?: string
          shift_id?: string | null
          status?: Database["public"]["Enums"]["employee_status"]
          unidade?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employees_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_function_id_fkey"
            columns: ["function_id"]
            isOneToOne: false
            referencedRelation: "functions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      ferias: {
        Row: {
          colaborador_id: string
          created_at: string
          fim: string
          id: string
          inicio: string
          observacao: string | null
          status: string
          substituto: string | null
        }
        Insert: {
          colaborador_id: string
          created_at?: string
          fim: string
          id?: string
          inicio: string
          observacao?: string | null
          status?: string
          substituto?: string | null
        }
        Update: {
          colaborador_id?: string
          created_at?: string
          fim?: string
          id?: string
          inicio?: string
          observacao?: string | null
          status?: string
          substituto?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ferias_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
        ]
      }
      functions: {
        Row: {
          ativo: boolean
          created_at: string
          funcao_chave: boolean
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          funcao_chave?: boolean
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          funcao_chave?: boolean
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      import_batches: {
        Row: {
          aba: string | null
          aplicado_em: string | null
          aprovado_por: string | null
          arquivo_nome: string
          created_at: string
          created_by: string | null
          id: string
          mapeamento: Json
          resumo: Json
          status: Database["public"]["Enums"]["import_status"]
          total_linhas: number
          updated_at: string
        }
        Insert: {
          aba?: string | null
          aplicado_em?: string | null
          aprovado_por?: string | null
          arquivo_nome: string
          created_at?: string
          created_by?: string | null
          id?: string
          mapeamento?: Json
          resumo?: Json
          status?: Database["public"]["Enums"]["import_status"]
          total_linhas?: number
          updated_at?: string
        }
        Update: {
          aba?: string | null
          aplicado_em?: string | null
          aprovado_por?: string | null
          arquivo_nome?: string
          created_at?: string
          created_by?: string | null
          id?: string
          mapeamento?: Json
          resumo?: Json
          status?: Database["public"]["Enums"]["import_status"]
          total_linhas?: number
          updated_at?: string
        }
        Relationships: []
      }
      import_mappings: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          mapeamento: Json
          nome: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          mapeamento: Json
          nome: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          mapeamento?: Json
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      import_rows: {
        Row: {
          aplicado: boolean
          aplicar: boolean
          batch_id: string
          classificacao: Database["public"]["Enums"]["import_row_class"]
          created_at: string
          dados: Json
          diferencas: Json
          employee_id: string | null
          erros: string[] | null
          id: string
          linha: number
          setor_decisao: string | null
          setor_decisao_fim: string | null
        }
        Insert: {
          aplicado?: boolean
          aplicar?: boolean
          batch_id: string
          classificacao: Database["public"]["Enums"]["import_row_class"]
          created_at?: string
          dados: Json
          diferencas?: Json
          employee_id?: string | null
          erros?: string[] | null
          id?: string
          linha: number
          setor_decisao?: string | null
          setor_decisao_fim?: string | null
        }
        Update: {
          aplicado?: boolean
          aplicar?: boolean
          batch_id?: string
          classificacao?: Database["public"]["Enums"]["import_row_class"]
          created_at?: string
          dados?: Json
          diferencas?: Json
          employee_id?: string | null
          erros?: string[] | null
          id?: string
          linha?: number
          setor_decisao?: string | null
          setor_decisao_fim?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_rows_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          nome: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          nome?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          nome?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      shifts: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_area_permissions: {
        Row: {
          area_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          area_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          area_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_area_permissions_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vacation_conflicts: {
        Row: {
          created_at: string
          detalhes: Json
          dias_coincidentes: number | null
          id: string
          mensagem: string
          movement_id: string | null
          outro_vacation_id: string | null
          overlap_fim: string | null
          overlap_inicio: string | null
          reconhecido: boolean
          reconhecido_em: string | null
          reconhecido_por: string | null
          regra: string
          severidade: Database["public"]["Enums"]["conflict_severity"]
          vacation_id: string
        }
        Insert: {
          created_at?: string
          detalhes?: Json
          dias_coincidentes?: number | null
          id?: string
          mensagem: string
          movement_id?: string | null
          outro_vacation_id?: string | null
          overlap_fim?: string | null
          overlap_inicio?: string | null
          reconhecido?: boolean
          reconhecido_em?: string | null
          reconhecido_por?: string | null
          regra: string
          severidade: Database["public"]["Enums"]["conflict_severity"]
          vacation_id: string
        }
        Update: {
          created_at?: string
          detalhes?: Json
          dias_coincidentes?: number | null
          id?: string
          mensagem?: string
          movement_id?: string | null
          outro_vacation_id?: string | null
          overlap_fim?: string | null
          overlap_inicio?: string | null
          reconhecido?: boolean
          reconhecido_em?: string | null
          reconhecido_por?: string | null
          regra?: string
          severidade?: Database["public"]["Enums"]["conflict_severity"]
          vacation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vacation_conflicts_movement_id_fkey"
            columns: ["movement_id"]
            isOneToOne: false
            referencedRelation: "employee_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vacation_conflicts_outro_vacation_id_fkey"
            columns: ["outro_vacation_id"]
            isOneToOne: false
            referencedRelation: "vacations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vacation_conflicts_vacation_id_fkey"
            columns: ["vacation_id"]
            isOneToOne: false
            referencedRelation: "vacations"
            referencedColumns: ["id"]
          },
        ]
      }
      vacations: {
        Row: {
          area_id_snapshot: string | null
          created_at: string
          created_by: string | null
          employee_id: string
          fim: string
          id: string
          inicio: string
          observacao: string | null
          shift_id_snapshot: string | null
          status: Database["public"]["Enums"]["vacation_status"]
          substituto_employee_id: string | null
          substituto_nome: string | null
          updated_at: string
        }
        Insert: {
          area_id_snapshot?: string | null
          created_at?: string
          created_by?: string | null
          employee_id: string
          fim: string
          id?: string
          inicio: string
          observacao?: string | null
          shift_id_snapshot?: string | null
          status?: Database["public"]["Enums"]["vacation_status"]
          substituto_employee_id?: string | null
          substituto_nome?: string | null
          updated_at?: string
        }
        Update: {
          area_id_snapshot?: string | null
          created_at?: string
          created_by?: string | null
          employee_id?: string
          fim?: string
          id?: string
          inicio?: string
          observacao?: string | null
          shift_id_snapshot?: string | null
          status?: Database["public"]["Enums"]["vacation_status"]
          substituto_employee_id?: string | null
          substituto_nome?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vacations_area_id_snapshot_fkey"
            columns: ["area_id_snapshot"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vacations_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vacations_shift_id_snapshot_fkey"
            columns: ["shift_id_snapshot"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vacations_substituto_employee_id_fkey"
            columns: ["substituto_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_area: {
        Args: { _area_id: string; _user_id: string }
        Returns: boolean
      }
      employee_area_on: {
        Args: { _data: string; _employee_id: string }
        Returns: string
      }
      employee_shift_on: {
        Args: { _data: string; _employee_id: string }
        Returns: string
      }
      has_any_role: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_manager: { Args: { _user_id: string }; Returns: boolean }
      recalc_related_conflicts: {
        Args: { _employee_id: string }
        Returns: undefined
      }
      recalc_vacation_conflicts: {
        Args: { _vacation_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "ADMIN" | "ANALISTA" | "LIDER" | "COORDENADOR" | "GERENTE"
      approval_status: "PENDENTE" | "APROVADO" | "REJEITADO"
      conflict_severity: "INFORMATIVO" | "ATENCAO" | "CRITICO" | "BLOQUEIO"
      employee_status: "ATIVO" | "DESLIGADO" | "AFASTADO"
      import_row_class:
        | "NOVO_COLABORADOR"
        | "ATUALIZACAO_CADASTRAL"
        | "MUDANCA_DE_SETOR"
        | "MUDANCA_DE_TURNO"
        | "MUDANCA_DE_FUNCAO"
        | "DESLIGAMENTO"
        | "DUPLICIDADE"
        | "DADO_INVALIDO"
        | "SEM_ALTERACAO"
      import_status:
        | "RASCUNHO"
        | "VALIDADO"
        | "APROVADO"
        | "APLICADO"
        | "CANCELADO"
      movement_status: "PENDENTE" | "APROVADA" | "REJEITADA" | "CANCELADA"
      movement_type:
        | "TRANSFERENCIA_DEFINITIVA"
        | "EMPRESTIMO_TEMPORARIO"
        | "COBERTURA_DE_FERIAS"
        | "TROCA_DE_TURNO"
        | "RETORNO_A_ORIGEM"
      vacation_status:
        | "PLANEJADA"
        | "APROVADA"
        | "EM_ANDAMENTO"
        | "CONCLUIDA"
        | "CANCELADA"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["ADMIN", "ANALISTA", "LIDER", "COORDENADOR", "GERENTE"],
      approval_status: ["PENDENTE", "APROVADO", "REJEITADO"],
      conflict_severity: ["INFORMATIVO", "ATENCAO", "CRITICO", "BLOQUEIO"],
      employee_status: ["ATIVO", "DESLIGADO", "AFASTADO"],
      import_row_class: [
        "NOVO_COLABORADOR",
        "ATUALIZACAO_CADASTRAL",
        "MUDANCA_DE_SETOR",
        "MUDANCA_DE_TURNO",
        "MUDANCA_DE_FUNCAO",
        "DESLIGAMENTO",
        "DUPLICIDADE",
        "DADO_INVALIDO",
        "SEM_ALTERACAO",
      ],
      import_status: [
        "RASCUNHO",
        "VALIDADO",
        "APROVADO",
        "APLICADO",
        "CANCELADO",
      ],
      movement_status: ["PENDENTE", "APROVADA", "REJEITADA", "CANCELADA"],
      movement_type: [
        "TRANSFERENCIA_DEFINITIVA",
        "EMPRESTIMO_TEMPORARIO",
        "COBERTURA_DE_FERIAS",
        "TROCA_DE_TURNO",
        "RETORNO_A_ORIGEM",
      ],
      vacation_status: [
        "PLANEJADA",
        "APROVADA",
        "EM_ANDAMENTO",
        "CONCLUIDA",
        "CANCELADA",
      ],
    },
  },
} as const
