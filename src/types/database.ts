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
          name: string | null;
          full_name: string | null;
          department: string | null;
          section: string | null;
          class_name: string | null;
          batch: string | null;
          graduation_year: number | null;
          gender: string | null;
          gender_locked_at: string | null;
          ever_verified_identity: boolean;
          first_verified_at: string | null;
          verification_method: string | null;
          verified_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_username?: string | null;
          avatar_config?: Json;
          profile_completed?: boolean;
          college_identity_linked?: boolean;
          name?: string | null;
          full_name?: string | null;
          department?: string | null;
          section?: string | null;
          class_name?: string | null;
          batch?: string | null;
          graduation_year?: number | null;
          gender?: string | null;
          gender_locked_at?: string | null;
          ever_verified_identity?: boolean;
          first_verified_at?: string | null;
          verification_method?: string | null;
          verified_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          display_username?: string | null;
          avatar_config?: Json;
          profile_completed?: boolean;
          college_identity_linked?: boolean;
          name?: string | null;
          full_name?: string | null;
          department?: string | null;
          section?: string | null;
          class_name?: string | null;
          batch?: string | null;
          graduation_year?: number | null;
          gender?: string | null;
          gender_locked_at?: string | null;
          ever_verified_identity?: boolean;
          first_verified_at?: string | null;
          verification_method?: string | null;
          verified_at?: string | null;
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
          verification_method: string | null;
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
          verification_method?: string | null;
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
          verification_method?: string | null;
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
      chat_rooms: {
        Row: {
          id: string;
          user_1: string;
          user_2: string;
          status: string;
          created_at: string;
          ended_at: string | null;
          end_reason: string | null;
          expires_at?: string | null;
          persona_updated_at?: string | null;
          user_1_heartbeat_at?: string | null;
          user_2_heartbeat_at?: string | null;
        };
        Insert: {
          id?: string;
          user_1: string;
          user_2: string;
          status?: string;
          created_at?: string;
          ended_at?: string | null;
          end_reason?: string | null;
          expires_at?: string | null;
          persona_updated_at?: string | null;
          user_1_heartbeat_at?: string | null;
          user_2_heartbeat_at?: string | null;
        };
        Update: {
          id?: string;
          user_1?: string;
          user_2?: string;
          status?: string;
          created_at?: string;
          ended_at?: string | null;
          end_reason?: string | null;
          expires_at?: string | null;
          persona_updated_at?: string | null;
          user_1_heartbeat_at?: string | null;
          user_2_heartbeat_at?: string | null;
        };
        Relationships: [];
      };
      matchmaking_queue: {
        Row: {
          id: string;
          user_id: string;
          joined_at: string;
          status: string;
          heartbeat_at: string;
          matched_room_id: string | null;
          matched_user_id: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          joined_at?: string;
          status?: string;
          heartbeat_at?: string;
          matched_room_id?: string | null;
          matched_user_id?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          joined_at?: string;
          status?: string;
          heartbeat_at?: string;
          matched_room_id?: string | null;
          matched_user_id?: string | null;
        };
        Relationships: [];
      };
      chat_messages: {
        Row: {
          id: string;
          room_id: string;
          sender_id: string;
          content: string;
          created_at: string;
          message_type: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          sender_id: string;
          content: string;
          created_at?: string;
          message_type?: string;
        };
        Update: {
          id?: string;
          room_id?: string;
          sender_id?: string;
          content?: string;
          created_at?: string;
          message_type?: string;
        };
        Relationships: [];
      };
      user_presence: {
        Row: {
          user_id: string;
          last_seen_at: string;
          is_online: boolean;
          available_for_chat_requests: boolean;
          current_page: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          last_seen_at?: string;
          is_online?: boolean;
          available_for_chat_requests?: boolean;
          current_page?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          last_seen_at?: string;
          is_online?: boolean;
          available_for_chat_requests?: boolean;
          current_page?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      chat_requests: {
        Row: {
          id: string;
          requester_id: string;
          recipient_id: string;
          status: string;
          room_id: string | null;
          created_at: string;
          expires_at: string;
          responded_at: string | null;
        };
        Insert: {
          id?: string;
          requester_id: string;
          recipient_id: string;
          status?: string;
          room_id?: string | null;
          created_at?: string;
          expires_at?: string;
          responded_at?: string | null;
        };
        Update: {
          id?: string;
          requester_id?: string;
          recipient_id?: string;
          status?: string;
          room_id?: string | null;
          created_at?: string;
          expires_at?: string;
          responded_at?: string | null;
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
      verify_and_link_college_identity: {
        Args: {
          p_student_ref: string;
          p_name: string;
          p_department: string;
          p_batch: string;
          p_qr_metadata?: Json;
          p_cooldown_hours?: number;
          p_verification_method?: string;
        };
        Returns: Json;
      };
      unlink_college_identity: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      save_anonymous_alias: {
        Args: {
          p_alias: string;
        };
        Returns: Json;
      };
      save_avatar_config: {
        Args: {
          p_config: Json;
        };
        Returns: Json;
      };
      save_profile_data: {
        Args: {
          p_department: string;
          p_section: string;
          p_class_name: string;
          p_batch: string;
          p_graduation_year: number;
          p_gender: string;
        };
        Returns: Json;
      };
      save_gender: {
        Args: {
          p_gender: string;
        };
        Returns: Json;
      };
      update_user_presence: {
        Args: {
          p_is_online?: boolean;
          p_available?: boolean;
          p_current_page?: string;
        };
        Returns: Json;
      };
      get_pending_chat_request: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      accept_chat_request: {
        Args: {
          p_request_id: string;
        };
        Returns: Json;
      };
      reject_chat_request: {
        Args: {
          p_request_id: string;
        };
        Returns: Json;
      };
      cancel_chat_request: {
        Args: {
          p_request_id: string;
        };
        Returns: Json;
      };
      join_matchmaking: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      heartbeat_matchmaking: {
        Args: {
          p_queue_id: string;
        };
        Returns: Json;
      };
      leave_matchmaking: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      send_chat_message: {
        Args: {
          p_room_id: string;
          p_content: string;
        };
        Returns: Json;
      };
      get_room_peer: {
        Args: {
          p_room_id: string;
        };
        Returns: Json;
      };
      end_chat_room: {
        Args: {
          p_room_id: string;
          p_reason: string;
        };
        Returns: Json;
      };
      heartbeat_chat_room: {
        Args: {
          p_room_id: string;
        };
        Returns: Json;
      };
      cleanup_stale_sessions: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      force_leave_active_room: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      check_staff_status: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      get_admin_dashboard_stats: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      get_online_users_admin: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      get_user_admin_details: {
        Args: {
          p_user_id: string;
          p_reason: string;
        };
        Returns: Json;
      };
      get_active_rooms_admin: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      get_room_admin_details: {
        Args: {
          p_room_id: string;
        };
        Returns: Json;
      };
      get_room_moderation_transcript: {
        Args: {
          p_room_id: string;
          p_reason: string;
        };
        Returns: Json;
      };
      send_admin_chat_invite: {
        Args: {
          p_user_id: string;
        };
        Returns: Json;
      };
      create_test_session: {
        Args: {
          p_target_user_id: string;
        };
        Returns: Json;
      };
      get_admin_audit_logs: {
        Args: {
          p_limit?: number;
        };
        Returns: Json;
      };
      set_developer_persona: {
        Args: {
          p_username: string;
          p_avatar_url?: string | null;
        };
        Returns: Json;
      };
      log_admin_action: {
        Args: {
          p_action: string;
          p_target_user_id?: string | null;
          p_room_id?: string | null;
          p_reason?: string | null;
          p_metadata?: Json;
        };
        Returns: string;
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

export type ChatRoomRow = Database['public']['Tables']['chat_rooms']['Row'];
export type ChatRoomInsert = Database['public']['Tables']['chat_rooms']['Insert'];
export type ChatRoomUpdate = Database['public']['Tables']['chat_rooms']['Update'];

export type MatchmakingQueueRow = Database['public']['Tables']['matchmaking_queue']['Row'];
export type MatchmakingQueueInsert = Database['public']['Tables']['matchmaking_queue']['Insert'];
export type MatchmakingQueueUpdate = Database['public']['Tables']['matchmaking_queue']['Update'];

export type ChatMessageRow = Database['public']['Tables']['chat_messages']['Row'];
export type ChatMessageInsert = Database['public']['Tables']['chat_messages']['Insert'];
export type ChatMessageUpdate = Database['public']['Tables']['chat_messages']['Update'];

export type UserPresenceRow = Database['public']['Tables']['user_presence']['Row'];
export type UserPresenceInsert = Database['public']['Tables']['user_presence']['Insert'];
export type UserPresenceUpdate = Database['public']['Tables']['user_presence']['Update'];

export type ChatRequestRow = Database['public']['Tables']['chat_requests']['Row'];
export type ChatRequestInsert = Database['public']['Tables']['chat_requests']['Insert'];
export type ChatRequestUpdate = Database['public']['Tables']['chat_requests']['Update'];
