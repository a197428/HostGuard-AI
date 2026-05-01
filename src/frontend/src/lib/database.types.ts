export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      agent_memory: {
        Row: {
          content: Json;
          created_at: string;
          embedding: number[] | null;
          id: string;
          level: string;
          scope: string | null;
          updated_at: string;
        };
        Insert: {
          content: Json;
          created_at?: string;
          embedding?: number[] | null;
          id?: string;
          level: string;
          scope?: string | null;
          updated_at?: string;
        };
        Update: {
          content?: Json;
          created_at?: string;
          embedding?: number[] | null;
          id?: string;
          level?: string;
          scope?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      feature_flags: {
        Row: {
          created_at: string;
          enabled: boolean | null;
          id: string;
          name: string;
          owner_ids: string[] | null;
          rollout_percentage: number | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          enabled?: boolean | null;
          id?: string;
          name: string;
          owner_ids?: string[] | null;
          rollout_percentage?: number | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          enabled?: boolean | null;
          id?: string;
          name?: string;
          owner_ids?: string[] | null;
          rollout_percentage?: number | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      llm_calls: {
        Row: {
          created_at: string;
          id: string;
          input_tokens: number;
          latency_ms: number;
          model: string;
          output_tokens: number;
          owner_id: string;
          prompt_id: string;
          prompt_version: string;
          response_status: string;
          review_id: string | null;
          trace_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          input_tokens: number;
          latency_ms: number;
          model: string;
          output_tokens: number;
          owner_id: string;
          prompt_id: string;
          prompt_version: string;
          response_status: string;
          review_id?: string | null;
          trace_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          input_tokens?: number;
          latency_ms?: number;
          model?: string;
          output_tokens?: number;
          owner_id?: string;
          prompt_id?: string;
          prompt_version?: string;
          response_status?: string;
          review_id?: string | null;
          trace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "llm_calls_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "owners";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "llm_calls_review_id_fkey";
            columns: ["review_id"];
            isOneToOne: false;
            referencedRelation: "reviews";
            referencedColumns: ["id"];
          },
        ];
      };
      owner_decisions: {
        Row: {
          created_at: string;
          decision: string;
          id: string;
          metadata: Json | null;
          owner_id: string;
          review_id: string;
          source: string;
          telegram_message_id: number | null;
        };
        Insert: {
          created_at?: string;
          decision: string;
          id?: string;
          metadata?: Json | null;
          owner_id: string;
          review_id: string;
          source?: string;
          telegram_message_id?: number | null;
        };
        Update: {
          created_at?: string;
          decision?: string;
          id?: string;
          metadata?: Json | null;
          owner_id?: string;
          review_id?: string;
          source?: string;
          telegram_message_id?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "owner_decisions_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "owners";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "owner_decisions_review_id_fkey";
            columns: ["review_id"];
            isOneToOne: false;
            referencedRelation: "reviews";
            referencedColumns: ["id"];
          },
        ];
      };
      owners: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          email: string;
          greeting_template: string | null;
          id: string;
          is_deleted: boolean | null;
          telegram_id: number | null;
          tone_of_voice: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          email: string;
          greeting_template?: string | null;
          id?: string;
          is_deleted?: boolean | null;
          telegram_id?: number | null;
          tone_of_voice?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          email?: string;
          greeting_template?: string | null;
          id?: string;
          is_deleted?: boolean | null;
          telegram_id?: number | null;
          tone_of_voice?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      properties: {
        Row: {
          address: string | null;
          created_at: string;
          deleted_at: string | null;
          features: Json | null;
          id: string;
          is_deleted: boolean | null;
          is_monitoring_active: boolean | null;
          monitoring_interval: number | null;
          name: string;
          owner_id: string;
          typical_complaints: string[] | null;
          updated_at: string;
        };
        Insert: {
          address?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          features?: Json | null;
          id?: string;
          is_deleted?: boolean | null;
          is_monitoring_active?: boolean | null;
          monitoring_interval?: number | null;
          name: string;
          owner_id: string;
          typical_complaints?: string[] | null;
          updated_at?: string;
        };
        Update: {
          address?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          features?: Json | null;
          id?: string;
          is_deleted?: boolean | null;
          is_monitoring_active?: boolean | null;
          monitoring_interval?: number | null;
          name?: string;
          owner_id?: string;
          typical_complaints?: string[] | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "properties_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "owners";
            referencedColumns: ["id"];
          },
        ];
      };
      property_urls: {
        Row: {
          created_at: string;
          id: string;
          platform: string;
          property_id: string;
          updated_at: string;
          url: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          platform: string;
          property_id: string;
          updated_at?: string;
          url: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          platform?: string;
          property_id?: string;
          updated_at?: string;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "property_urls_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
        ];
      };
      reviews: {
        Row: {
          appeal_confidence: number | null;
          appeal_text: string | null;
          author_name_hash: string | null;
          created_at: string;
          deleted_at: string | null;
          id: string;
          is_deleted: boolean | null;
          legal_grounds: Json | null;
          owner_id: string;
          platform: string;
          platform_review_id: string;
          property_id: string;
          public_response: string | null;
          public_response_edited: string | null;
          rating: number;
          review_date: string | null;
          sentiment: string | null;
          status: string | null;
          text: string;
          updated_at: string;
          violation_detected: boolean | null;
          violations: Json | null;
        };
        Insert: {
          appeal_confidence?: number | null;
          appeal_text?: string | null;
          author_name_hash?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          is_deleted?: boolean | null;
          legal_grounds?: Json | null;
          owner_id: string;
          platform: string;
          platform_review_id: string;
          property_id: string;
          public_response?: string | null;
          public_response_edited?: string | null;
          rating: number;
          review_date?: string | null;
          sentiment?: string | null;
          status?: string | null;
          text: string;
          updated_at?: string;
          violation_detected?: boolean | null;
          violations?: Json | null;
        };
        Update: {
          appeal_confidence?: number | null;
          appeal_text?: string | null;
          author_name_hash?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          is_deleted?: boolean | null;
          legal_grounds?: Json | null;
          owner_id?: string;
          platform?: string;
          platform_review_id?: string;
          property_id?: string;
          public_response?: string | null;
          public_response_edited?: string | null;
          rating?: number;
          review_date?: string | null;
          sentiment?: string | null;
          status?: string | null;
          text?: string;
          updated_at?: string;
          violation_detected?: boolean | null;
          violations?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "reviews_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "owners";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reviews_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
