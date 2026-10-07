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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      exercises: {
        Row: {
          alternative_exercise_id: string | null
          equipment_type: string
          id: string
          instructions: string
          movement_cue: string | null
          movement_type: string
          name: string
          position_cue: string | null
          setup_cue: string | null
          target: string
          video_url: string | null
        }
        Insert: {
          alternative_exercise_id?: string | null
          equipment_type?: string
          id: string
          instructions?: string
          movement_cue?: string | null
          movement_type: string
          name: string
          position_cue?: string | null
          setup_cue?: string | null
          target?: string
          video_url?: string | null
        }
        Update: {
          alternative_exercise_id?: string | null
          equipment_type?: string
          id?: string
          instructions?: string
          movement_cue?: string | null
          movement_type?: string
          name?: string
          position_cue?: string | null
          setup_cue?: string | null
          target?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exercises_alternative_exercise_id_fkey"
            columns: ["alternative_exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      user_machine_settings: {
        Row: {
          created_at: string
          custom_setting_notes: string | null
          exercise_id: string
          id: string
          pad_notch: string | null
          seat_notch: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          custom_setting_notes?: string | null
          exercise_id: string
          id?: string
          pad_notch?: string | null
          seat_notch?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          custom_setting_notes?: string | null
          exercise_id?: string
          id?: string
          pad_notch?: string | null
          seat_notch?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_machine_settings_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_machine_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          age: number | null
          created_at: string
          custom_exercise_ids: string[]
          equipment_type: string | null
          full_name: string | null
          id: string
          is_custom: boolean
          next_split_day: string
          paddle_customer_id: string | null
          paddle_subscription_id: string | null
          primary_goal: string | null
          subscription_environment: string | null
          subscription_period_end: string | null
          subscription_status: string | null
          subscription_tier: string
          weekly_goal_days: number | null
        }
        Insert: {
          age?: number | null
          created_at?: string
          custom_exercise_ids?: string[]
          equipment_type?: string | null
          full_name?: string | null
          id: string
          is_custom?: boolean
          next_split_day?: string
          paddle_customer_id?: string | null
          paddle_subscription_id?: string | null
          primary_goal?: string | null
          subscription_environment?: string | null
          subscription_period_end?: string | null
          subscription_status?: string | null
          subscription_tier?: string
          weekly_goal_days?: number | null
        }
        Update: {
          age?: number | null
          created_at?: string
          custom_exercise_ids?: string[]
          equipment_type?: string | null
          full_name?: string | null
          id?: string
          is_custom?: boolean
          next_split_day?: string
          paddle_customer_id?: string | null
          paddle_subscription_id?: string | null
          primary_goal?: string | null
          subscription_environment?: string | null
          subscription_period_end?: string | null
          subscription_status?: string | null
          subscription_tier?: string
          weekly_goal_days?: number | null
        }
        Relationships: []
      }
      workout_logs: {
        Row: {
          auto_regulated: boolean
          client_key: string | null
          exercise_id: string
          id: string
          is_personal_record: boolean
          reps_completed: number
          session_id: string | null
          set_number: number
          timestamp: string
          user_id: string
          weight_kg: number
        }
        Insert: {
          auto_regulated?: boolean
          client_key?: string | null
          exercise_id: string
          id?: string
          is_personal_record?: boolean
          reps_completed: number
          session_id?: string | null
          set_number: number
          timestamp?: string
          user_id: string
          weight_kg: number
        }
        Update: {
          auto_regulated?: boolean
          client_key?: string | null
          exercise_id?: string
          id?: string
          is_personal_record?: boolean
          reps_completed?: number
          session_id?: string | null
          set_number?: number
          timestamp?: string
          user_id?: string
          weight_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "workout_logs_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_logs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "workout_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_programs: {
        Row: {
          day_number: number
          equipment_type: string
          exercise_ids_list: string[]
          id: string
          target_reps: number
          target_sets: number
        }
        Insert: {
          day_number: number
          equipment_type: string
          exercise_ids_list: string[]
          id?: string
          target_reps?: number
          target_sets?: number
        }
        Update: {
          day_number?: number
          equipment_type?: string
          exercise_ids_list?: string[]
          id?: string
          target_reps?: number
          target_sets?: number
        }
        Relationships: []
      }
      workout_sessions: {
        Row: {
          auto_regulated: boolean
          completed_at: string
          exercise_names: string[]
          id: string
          program_type: string
          started_at: string
          total_sets: number
          total_volume_kg: number
          user_id: string
        }
        Insert: {
          auto_regulated?: boolean
          completed_at?: string
          exercise_names?: string[]
          id?: string
          program_type: string
          started_at?: string
          total_sets?: number
          total_volume_kg?: number
          user_id: string
        }
        Update: {
          auto_regulated?: boolean
          completed_at?: string
          exercise_names?: string[]
          id?: string
          program_type?: string
          started_at?: string
          total_sets?: number
          total_volume_kg?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_pro: { Args: { _env?: string; _user_id: string }; Returns: boolean }
      is_pro_user: { Args: never; Returns: boolean }
      ensure_user_row: { Args: never; Returns: Json }
      create_user_profile: {
        Args: { p_full_name: string; p_age: number; p_frequency: string; p_primary_goal: string; p_equipment_type: string }
        Returns: string
      }
      save_custom_routine: { Args: { p_exercise_ids: string[] }; Returns: undefined }
      log_workout_set: {
        Args: { p_exercise_id: string; p_weight_kg: number; p_reps_completed: number; p_set_number: number; p_client_key?: string | null }
        Returns: Json
      }
      update_workout_set: { Args: { p_id: string; p_weight_kg: number; p_reps_completed: number }; Returns: Json }
      delete_workout_set: { Args: { p_id: string }; Returns: undefined }
      save_machine_setting: {
        Args: { p_exercise_id: string; p_seat_notch: string; p_pad_notch: string; p_custom_setting_notes: string }
        Returns: undefined
      }
      complete_workout: {
        Args: {
          p_program_type: string
          p_exercise_ids: string[]
          p_log_ids: string[]
          p_started_at: string
          p_split_day?: string | null
          p_auto_regulated?: boolean
          p_end_at_last_set?: boolean
        }
        Returns: Json
      }
      delete_workout_session: { Args: { p_session_id: string }; Returns: Json }
      get_alternative_options: { Args: { p_exercise_id: string; p_exclude?: string[] }; Returns: Json }
      update_training_profile: {
        Args: { p_full_name: string; p_age: number; p_frequency: string; p_primary_goal: string; p_equipment_type: string }
        Returns: Json
      }
      get_exercise_progress: { Args: { p_exercise_id: string; p_tz_offset: number }; Returns: Json }
      delete_account: { Args: { p_password: string }; Returns: Json }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
