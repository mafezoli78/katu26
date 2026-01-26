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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      conversations: {
        Row: {
          ativo: boolean
          criado_em: string
          id: string
          origem_wave_id: string | null
          place_id: string
          user1_id: string
          user2_id: string
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          id?: string
          origem_wave_id?: string | null
          place_id: string
          user1_id: string
          user2_id: string
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          id?: string
          origem_wave_id?: string | null
          place_id?: string
          user1_id?: string
          user2_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_origem_wave_id_fkey"
            columns: ["origem_wave_id"]
            isOneToOne: false
            referencedRelation: "waves"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_user1_id_fkey"
            columns: ["user1_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_user2_id_fkey"
            columns: ["user2_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      intentions: {
        Row: {
          descricao: string | null
          id: string
          nome: string
        }
        Insert: {
          descricao?: string | null
          id?: string
          nome: string
        }
        Update: {
          descricao?: string | null
          id?: string
          nome?: string
        }
        Relationships: []
      }
      locations: {
        Row: {
          criado_em: string
          criado_por: string | null
          id: string
          latitude: number
          longitude: number
          nome: string
          raio: number
          status_aprovacao: string
        }
        Insert: {
          criado_em?: string
          criado_por?: string | null
          id?: string
          latitude: number
          longitude: number
          nome: string
          raio?: number
          status_aprovacao?: string
        }
        Update: {
          criado_em?: string
          criado_por?: string | null
          id?: string
          latitude?: number
          longitude?: number
          nome?: string
          raio?: number
          status_aprovacao?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      places: {
        Row: {
          ativo: boolean
          atualizado_em: string
          categoria: string | null
          cidade: string | null
          criado_em: string
          dados_brutos: Json | null
          endereco: string | null
          estado: string | null
          id: string
          latitude: number
          longitude: number
          nome: string
          origem: string
          pais: string | null
          provider: string
          provider_id: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          categoria?: string | null
          cidade?: string | null
          criado_em?: string
          dados_brutos?: Json | null
          endereco?: string | null
          estado?: string | null
          id?: string
          latitude: number
          longitude: number
          nome: string
          origem?: string
          pais?: string | null
          provider?: string
          provider_id: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          categoria?: string | null
          cidade?: string | null
          criado_em?: string
          dados_brutos?: Json | null
          endereco?: string | null
          estado?: string | null
          id?: string
          latitude?: number
          longitude?: number
          nome?: string
          origem?: string
          pais?: string | null
          provider?: string
          provider_id?: string
        }
        Relationships: []
      }
      presence: {
        Row: {
          assunto_atual: string | null
          ativo: boolean
          disponivel: boolean
          disponivel_desde: string | null
          disponivel_expira_em: string | null
          id: string
          inicio: string
          intention_id: string
          location_id: string
          ultima_atividade: string
          user_id: string
        }
        Insert: {
          assunto_atual?: string | null
          ativo?: boolean
          disponivel?: boolean
          disponivel_desde?: string | null
          disponivel_expira_em?: string | null
          id?: string
          inicio?: string
          intention_id: string
          location_id: string
          ultima_atividade?: string
          user_id: string
        }
        Update: {
          assunto_atual?: string | null
          ativo?: boolean
          disponivel?: boolean
          disponivel_desde?: string | null
          disponivel_expira_em?: string | null
          id?: string
          inicio?: string
          intention_id?: string
          location_id?: string
          ultima_atividade?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "presence_intention_id_fkey"
            columns: ["intention_id"]
            isOneToOne: false
            referencedRelation: "intentions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presence_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presence_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          atualizado_em: string
          bio: string | null
          criado_em: string
          data_nascimento: string | null
          foto_url: string | null
          id: string
          nome: string | null
        }
        Insert: {
          atualizado_em?: string
          bio?: string | null
          criado_em?: string
          data_nascimento?: string | null
          foto_url?: string | null
          id: string
          nome?: string | null
        }
        Update: {
          atualizado_em?: string
          bio?: string | null
          criado_em?: string
          data_nascimento?: string | null
          foto_url?: string | null
          id?: string
          nome?: string | null
        }
        Relationships: []
      }
      user_interests: {
        Row: {
          criado_em: string
          id: string
          tag: string
          user_id: string
        }
        Insert: {
          criado_em?: string
          id?: string
          tag: string
          user_id: string
        }
        Update: {
          criado_em?: string
          id?: string
          tag?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_interests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      waves: {
        Row: {
          accepted_by: string | null
          criado_em: string
          de_user_id: string
          expires_at: string | null
          id: string
          location_id: string
          para_user_id: string
          status: string
          visualizado: boolean
        }
        Insert: {
          accepted_by?: string | null
          criado_em?: string
          de_user_id: string
          expires_at?: string | null
          id?: string
          location_id: string
          para_user_id: string
          status?: string
          visualizado?: boolean
        }
        Update: {
          accepted_by?: string | null
          criado_em?: string
          de_user_id?: string
          expires_at?: string | null
          id?: string
          location_id?: string
          para_user_id?: string
          status?: string
          visualizado?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "waves_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waves_de_user_id_fkey"
            columns: ["de_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waves_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waves_para_user_id_fkey"
            columns: ["para_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_active_location_id: { Args: never; Returns: string }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
