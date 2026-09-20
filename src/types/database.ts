/**
 * ============================================================================
 * TALK TO RITIANS - Supabase Database Schema Definitions
 * ============================================================================
 * Generated / Typed representation of the PostgreSQL schema defined in
 * supabase/migrations/20260920000001_database_foundation.sql.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_username: string | null;
          avatar_config: Json;
          profile_completed: boolean;
          college_identity_linked: boolean;
          department: string | null;
          section: string | null;
          class_name: string | null;
          batch: string | null;
          graduation_year: number | null;
          gender: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_username?: string | null;
          avatar_config?: Json;
          profile_completed?: boolean;
          college_identity_linked?: boolean;
          department?: string | null;
          section?: string | null;
          class_name?: string | null;
          batch?: string | null;
          graduation_year?: number | null;
          gender?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          display_username?: string | null;
          avatar_config?: Json;
          profile_completed?: boolean;
          college_identity_linked?: boolean;
          department?: string | null;
          section?: string | null;
          class_name?: string | null;
          batch?: string | null;
          graduation_year?: number | null;
          gender?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      college_identities: {
        Row: {
          id: string;
          user_id: string;
          identity_hash: string;
          name_from_qr: string | null;
          department_from_qr: string | null;
          batch_from_qr: string | null;
          qr_metadata: Json;
          verified_at: string;
          created_at: string;
          unlinked_at: string | null;
          active: boolean;
        };
        Insert: {
          id?: string;
          user_id: string;
          identity_hash: string;
          name_from_qr?: string | null;
          department_from_qr?: string | null;
          batch_from_qr?: string | null;
          qr_metadata?: Json;
          verified_at?: string;
          created_at?: string;
          unlinked_at?: string | null;
          active?: boolean;
        };
        Update: {
          id?: string;
          user_id?: string;
          identity_hash?: string;
          name_from_qr?: string | null;
          department_from_qr?: string | null;
          batch_from_qr?: string | null;
          qr_metadata?: Json;
          verified_at?: string;
          created_at?: string;
          unlinked_at?: string | null;
          active?: boolean;
        };
        Relationships: [];
      };
      anonymous_identities: {
        Row: {
          id: string;
          user_id: string;
          anonymous_username: string;
          avatar_config: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          anonymous_username: string;
          avatar_config?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          anonymous_username?: string;
          avatar_config?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      public_anonymous_profiles: {
        Row: {
          user_id: string;
          anonymous_username: string;
          avatar_config: Json;
        };
        Relationships: [];
      };
    };
    Functions: {
      handle_updated_at: {
        Args: Record<PropertyKey, never>;
        Returns: unknown;
      };
      handle_new_user: {
        Args: Record<PropertyKey, never>;
        Returns: unknown;
      };
      sync_anonymous_identity: {
        Args: Record<PropertyKey, never>;
        Returns: unknown;
      };
    };
  };
}

export type ProfileRow = Database['public']['Tables']['profiles']['Row'];
export type ProfileInsert = Database['public']['Tables']['profiles']['Insert'];
export type ProfileUpdate = Database['public']['Tables']['profiles']['Update'];

export type CollegeIdentityRow = Database['public']['Tables']['college_identities']['Row'];
export type CollegeIdentityInsert = Database['public']['Tables']['college_identities']['Insert'];
export type CollegeIdentityUpdate = Database['public']['Tables']['college_identities']['Update'];

export type AnonymousIdentityRow = Database['public']['Tables']['anonymous_identities']['Row'];
export type AnonymousIdentityInsert = Database['public']['Tables']['anonymous_identities']['Insert'];
export type AnonymousIdentityUpdate = Database['public']['Tables']['anonymous_identities']['Update'];
