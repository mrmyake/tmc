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
  tmc: {
    Tables: {
      access_config: {
        Row: {
          group_extended_id: string | null
          group_staff_id: string | null
          group_standard_id: string | null
          id: string
          lockdown: boolean
          schedule_closed_id: string | null
          schedule_extended_id: string | null
          schedule_staff_id: string | null
          schedule_standard_id: string | null
          updated_at: string
        }
        Insert: {
          group_extended_id?: string | null
          group_staff_id?: string | null
          group_standard_id?: string | null
          id: string
          lockdown?: boolean
          schedule_closed_id?: string | null
          schedule_extended_id?: string | null
          schedule_staff_id?: string | null
          schedule_standard_id?: string | null
          updated_at?: string
        }
        Update: {
          group_extended_id?: string | null
          group_staff_id?: string | null
          group_standard_id?: string | null
          id?: string
          lockdown?: boolean
          schedule_closed_id?: string | null
          schedule_extended_id?: string | null
          schedule_staff_id?: string | null
          schedule_standard_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      access_credentials: {
        Row: {
          access_ends_at: string | null
          access_group: string | null
          akiles_magic_link_id: string | null
          akiles_member_id: string | null
          akiles_pin_id: string | null
          created_at: string
          last_error: string | null
          last_synced_at: string | null
          profile_id: string
          updated_at: string
        }
        Insert: {
          access_ends_at?: string | null
          access_group?: string | null
          akiles_magic_link_id?: string | null
          akiles_member_id?: string | null
          akiles_pin_id?: string | null
          created_at?: string
          last_error?: string | null
          last_synced_at?: string | null
          profile_id: string
          updated_at?: string
        }
        Update: {
          access_ends_at?: string | null
          access_group?: string | null
          akiles_magic_link_id?: string | null
          akiles_member_id?: string | null
          akiles_pin_id?: string | null
          created_at?: string
          last_error?: string | null
          last_synced_at?: string | null
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_credentials_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      access_device_tokens: {
        Row: {
          akiles_member_id: string
          akiles_token_id: string
          created_at: string
          device_label: string | null
          id: string
          issued_at: string
          last_error: string | null
          last_seen_at: string | null
          platform: string
          profile_id: string
          revoke_requested_at: string | null
          revoked_at: string | null
          updated_at: string
        }
        Insert: {
          akiles_member_id: string
          akiles_token_id: string
          created_at?: string
          device_label?: string | null
          id?: string
          issued_at?: string
          last_error?: string | null
          last_seen_at?: string | null
          platform: string
          profile_id: string
          revoke_requested_at?: string | null
          revoked_at?: string | null
          updated_at?: string
        }
        Update: {
          akiles_member_id?: string
          akiles_token_id?: string
          created_at?: string
          device_label?: string | null
          id?: string
          issued_at?: string
          last_error?: string | null
          last_seen_at?: string | null
          platform?: string
          profile_id?: string
          revoke_requested_at?: string | null
          revoked_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_device_tokens_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      account_deletions: {
        Row: {
          akiles_member_id: string | null
          attempts: number
          cancelled_at: string | null
          completed_at: string | null
          created_at: string
          email_at_request: string
          id: string
          is_test: boolean
          last_attempt_at: string | null
          last_error: Json
          mailerlite_subscriber_id: string | null
          member_code: string
          mollie_customer_id: string | null
          mollie_subscription_ids: string[]
          profile_id: string | null
          purge_after: string
          reason: string | null
          requested_at: string
          requested_via: string
          status: string
          step_status: Json
          updated_at: string
        }
        Insert: {
          akiles_member_id?: string | null
          attempts?: number
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          email_at_request: string
          id?: string
          is_test?: boolean
          last_attempt_at?: string | null
          last_error?: Json
          mailerlite_subscriber_id?: string | null
          member_code: string
          mollie_customer_id?: string | null
          mollie_subscription_ids?: string[]
          profile_id?: string | null
          purge_after: string
          reason?: string | null
          requested_at?: string
          requested_via: string
          status?: string
          step_status?: Json
          updated_at?: string
        }
        Update: {
          akiles_member_id?: string | null
          attempts?: number
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          email_at_request?: string
          id?: string
          is_test?: boolean
          last_attempt_at?: string | null
          last_error?: Json
          mailerlite_subscriber_id?: string | null
          member_code?: string
          mollie_customer_id?: string | null
          mollie_subscription_ids?: string[]
          profile_id?: string | null
          purge_after?: string
          reason?: string | null
          requested_at?: string
          requested_via?: string
          status?: string
          step_status?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_deletions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_audit_log: {
        Row: {
          action: string
          actor_label: string
          admin_id: string | null
          created_at: string
          details: Json | null
          id: string
          target_id: string
          target_type: string
        }
        Insert: {
          action: string
          actor_label: string
          admin_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          target_id: string
          target_type: string
        }
        Update: {
          action?: string
          actor_label?: string
          admin_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          target_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_log_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      akiles_oauth_token: {
        Row: {
          access_token: string | null
          access_token_expires_at: string | null
          created_at: string
          id: string
          last_refresh_error: string | null
          last_refreshed_at: string | null
          refresh_claim_until: string | null
          refresh_token: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          access_token_expires_at?: string | null
          created_at?: string
          id: string
          last_refresh_error?: string | null
          last_refreshed_at?: string | null
          refresh_claim_until?: string | null
          refresh_token?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          access_token_expires_at?: string | null
          created_at?: string
          id?: string
          last_refresh_error?: string | null
          last_refreshed_at?: string | null
          refresh_claim_until?: string | null
          refresh_token?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      announcements: {
        Row: {
          audience: string
          author_id: string
          body: string
          created_at: string
          expires_at: string | null
          id: string
          published_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          audience?: string
          author_id: string
          body?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          published_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          audience?: string
          author_id?: string
          body?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          published_at?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_settings: {
        Row: {
          booking_window_days: number
          cancellation_notice_days: number
          cancellation_window_hours: number
          check_in_enabled: boolean
          check_in_pillars: string[]
          check_in_required_for_cap: boolean
          fair_use_daily_max: number
          free_trial_end_at: string | null
          free_trial_start_at: string | null
          id: string
          no_show_block_days: number
          no_show_release_minutes: number
          no_show_strike_threshold: number
          no_show_strike_window_days: number
          updated_at: string
          vrij_trainen_booking_enabled: boolean
          vrij_trainen_cancel_window_minutes: number
          vrij_trainen_max_concurrent: number
          waitlist_confirmation_minutes: number
        }
        Insert: {
          booking_window_days?: number
          cancellation_notice_days?: number
          cancellation_window_hours?: number
          check_in_enabled?: boolean
          check_in_pillars?: string[]
          check_in_required_for_cap?: boolean
          fair_use_daily_max?: number
          free_trial_end_at?: string | null
          free_trial_start_at?: string | null
          id?: string
          no_show_block_days?: number
          no_show_release_minutes?: number
          no_show_strike_threshold?: number
          no_show_strike_window_days?: number
          updated_at?: string
          vrij_trainen_booking_enabled?: boolean
          vrij_trainen_cancel_window_minutes?: number
          vrij_trainen_max_concurrent?: number
          waitlist_confirmation_minutes?: number
        }
        Update: {
          booking_window_days?: number
          cancellation_notice_days?: number
          cancellation_window_hours?: number
          check_in_enabled?: boolean
          check_in_pillars?: string[]
          check_in_required_for_cap?: boolean
          fair_use_daily_max?: number
          free_trial_end_at?: string | null
          free_trial_start_at?: string | null
          id?: string
          no_show_block_days?: number
          no_show_release_minutes?: number
          no_show_strike_threshold?: number
          no_show_strike_window_days?: number
          updated_at?: string
          vrij_trainen_booking_enabled?: boolean
          vrij_trainen_cancel_window_minutes?: number
          vrij_trainen_max_concurrent?: number
          waitlist_confirmation_minutes?: number
        }
        Relationships: []
      }
      bookings: {
        Row: {
          attended_at: string | null
          booked_at: string
          cancellation_reason: string | null
          cancelled_at: string | null
          credits_used: number
          drop_in_payment_id: string | null
          drop_in_price_cents: number
          id: string
          iso_week: number
          iso_year: number
          membership_id: string | null
          no_show_at: string | null
          pillar: string
          profile_id: string
          reminder_sent_at: string | null
          session_date: string
          session_id: string
          slot_end_at: string | null
          slot_start_at: string | null
          status: string
        }
        Insert: {
          attended_at?: string | null
          booked_at?: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          credits_used?: number
          drop_in_payment_id?: string | null
          drop_in_price_cents?: number
          id?: string
          iso_week: number
          iso_year: number
          membership_id?: string | null
          no_show_at?: string | null
          pillar: string
          profile_id: string
          reminder_sent_at?: string | null
          session_date: string
          session_id: string
          slot_end_at?: string | null
          slot_start_at?: string | null
          status?: string
        }
        Update: {
          attended_at?: string | null
          booked_at?: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          credits_used?: number
          drop_in_payment_id?: string | null
          drop_in_price_cents?: number
          id?: string
          iso_week?: number
          iso_year?: number
          membership_id?: string | null
          no_show_at?: string | null
          pillar?: string
          profile_id?: string
          reminder_sent_at?: string | null
          session_date?: string
          session_id?: string
          slot_end_at?: string | null
          slot_start_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "class_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "v_session_availability"
            referencedColumns: ["id"]
          },
        ]
      }
      catalogue: {
        Row: {
          age_category: string
          billing_cycle_weeks: number | null
          commit_24m_discount_factor: number | null
          commit_months: number | null
          covered_pillars: string[]
          created_at: string
          credits: number | null
          display_name: string
          display_order: number
          early_member_commit_months: number | null
          early_member_eligible: boolean
          early_member_price_cents: number | null
          early_member_price_lock: boolean
          extended_access_mode: string | null
          family: string | null
          frequency_cap: number | null
          id: string
          is_active: boolean
          kind: string
          price_cents: number
          price_cents_24m_computed: number | null
          price_cents_24m_override: number | null
          purchasable: boolean
          revenue_category: string
          slug: string
          updated_at: string
          validity_months: number | null
          vat_rate_bp: number
        }
        Insert: {
          age_category?: string
          billing_cycle_weeks?: number | null
          commit_24m_discount_factor?: number | null
          commit_months?: number | null
          covered_pillars?: string[]
          created_at?: string
          credits?: number | null
          display_name: string
          display_order?: number
          early_member_commit_months?: number | null
          early_member_eligible?: boolean
          early_member_price_cents?: number | null
          early_member_price_lock?: boolean
          extended_access_mode?: string | null
          family?: string | null
          frequency_cap?: number | null
          id?: string
          is_active?: boolean
          kind: string
          price_cents: number
          price_cents_24m_computed?: number | null
          price_cents_24m_override?: number | null
          purchasable?: boolean
          revenue_category: string
          slug: string
          updated_at?: string
          validity_months?: number | null
          vat_rate_bp: number
        }
        Update: {
          age_category?: string
          billing_cycle_weeks?: number | null
          commit_24m_discount_factor?: number | null
          commit_months?: number | null
          covered_pillars?: string[]
          created_at?: string
          credits?: number | null
          display_name?: string
          display_order?: number
          early_member_commit_months?: number | null
          early_member_eligible?: boolean
          early_member_price_cents?: number | null
          early_member_price_lock?: boolean
          extended_access_mode?: string | null
          family?: string | null
          frequency_cap?: number | null
          id?: string
          is_active?: boolean
          kind?: string
          price_cents?: number
          price_cents_24m_computed?: number | null
          price_cents_24m_override?: number | null
          purchasable?: boolean
          revenue_category?: string
          slug?: string
          updated_at?: string
          validity_months?: number | null
          vat_rate_bp?: number
        }
        Relationships: []
      }
      check_ins: {
        Row: {
          access_type: string
          booking_id: string | null
          check_in_method: string
          checked_in_at: string
          checked_in_by: string | null
          checked_in_date: string | null
          created_at: string
          id: string
          notes: string | null
          pillar: string
          profile_id: string
          session_id: string | null
        }
        Insert: {
          access_type: string
          booking_id?: string | null
          check_in_method: string
          checked_in_at?: string
          checked_in_by?: string | null
          checked_in_date?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          pillar: string
          profile_id: string
          session_id?: string | null
        }
        Update: {
          access_type?: string
          booking_id?: string | null
          check_in_method?: string
          checked_in_at?: string
          checked_in_by?: string | null
          checked_in_date?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          pillar?: string
          profile_id?: string
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "check_ins_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_ins_checked_in_by_fkey"
            columns: ["checked_in_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_ins_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_ins_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "class_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_ins_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "v_session_availability"
            referencedColumns: ["id"]
          },
        ]
      }
      checkout_intents: {
        Row: {
          acquisition_campaign: string | null
          acquisition_content: string | null
          acquisition_medium: string | null
          acquisition_source: string | null
          catalogue_slug: string
          city: string | null
          commit_24m: boolean
          conversion_error: string | null
          converted_at: string | null
          created_at: string
          early_member_intent: boolean
          email: string | null
          expires_at: string
          extended_access: boolean
          first_charge_cents: number
          first_name: string | null
          first_touch_at: string | null
          ga_client_id: string | null
          ga_session_id: string | null
          id: string
          kind: string
          last_name: string | null
          login_token_expires_at: string | null
          login_token_hash: string | null
          login_token_used_at: string | null
          mode: string
          mollie_customer_id: string | null
          mollie_payment_id: string | null
          order_id: string | null
          paid_at: string | null
          paid_but_failed: boolean | null
          phone: string | null
          postal_code: string | null
          pricing_snapshot: Json
          profile_id: string | null
          return_target: string | null
          signup_path: string | null
          status: string
          status_token_hash: string
          street_address: string | null
          updated_at: string
        }
        Insert: {
          acquisition_campaign?: string | null
          acquisition_content?: string | null
          acquisition_medium?: string | null
          acquisition_source?: string | null
          catalogue_slug: string
          city?: string | null
          commit_24m?: boolean
          conversion_error?: string | null
          converted_at?: string | null
          created_at?: string
          early_member_intent?: boolean
          email?: string | null
          expires_at?: string
          extended_access?: boolean
          first_charge_cents: number
          first_name?: string | null
          first_touch_at?: string | null
          ga_client_id?: string | null
          ga_session_id?: string | null
          id?: string
          kind: string
          last_name?: string | null
          login_token_expires_at?: string | null
          login_token_hash?: string | null
          login_token_used_at?: string | null
          mode: string
          mollie_customer_id?: string | null
          mollie_payment_id?: string | null
          order_id?: string | null
          paid_at?: string | null
          paid_but_failed?: boolean | null
          phone?: string | null
          postal_code?: string | null
          pricing_snapshot: Json
          profile_id?: string | null
          return_target?: string | null
          signup_path?: string | null
          status?: string
          status_token_hash: string
          street_address?: string | null
          updated_at?: string
        }
        Update: {
          acquisition_campaign?: string | null
          acquisition_content?: string | null
          acquisition_medium?: string | null
          acquisition_source?: string | null
          catalogue_slug?: string
          city?: string | null
          commit_24m?: boolean
          conversion_error?: string | null
          converted_at?: string | null
          created_at?: string
          early_member_intent?: boolean
          email?: string | null
          expires_at?: string
          extended_access?: boolean
          first_charge_cents?: number
          first_name?: string | null
          first_touch_at?: string | null
          ga_client_id?: string | null
          ga_session_id?: string | null
          id?: string
          kind?: string
          last_name?: string | null
          login_token_expires_at?: string | null
          login_token_hash?: string | null
          login_token_used_at?: string | null
          mode?: string
          mollie_customer_id?: string | null
          mollie_payment_id?: string | null
          order_id?: string | null
          paid_at?: string | null
          paid_but_failed?: boolean | null
          phone?: string | null
          postal_code?: string | null
          pricing_snapshot?: Json
          profile_id?: string | null
          return_target?: string | null
          signup_path?: string | null
          status?: string
          status_token_hash?: string
          street_address?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkout_intents_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_intents_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      class_pillars: {
        Row: {
          age_category: string
          code: string
          description_nl: string | null
          display_order: number
          name_nl: string
        }
        Insert: {
          age_category: string
          code: string
          description_nl?: string | null
          display_order?: number
          name_nl: string
        }
        Update: {
          age_category?: string
          code?: string
          description_nl?: string | null
          display_order?: number
          name_nl?: string
        }
        Relationships: []
      }
      class_sessions: {
        Row: {
          age_category: string
          blocks_free_training: boolean
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          capacity: number | null
          class_type_id: string
          created_at: string
          end_at: string
          id: string
          notes: string | null
          occurrence_start_at: string
          pillar: string
          rescheduled_at: string | null
          rescheduled_by: string | null
          start_at: string
          status: string
          template_id: string | null
          trainer_id: string
          trainer_overridden_at: string | null
          trainer_overridden_by: string | null
          updated_at: string
        }
        Insert: {
          age_category: string
          blocks_free_training?: boolean
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          capacity?: number | null
          class_type_id: string
          created_at?: string
          end_at: string
          id?: string
          notes?: string | null
          occurrence_start_at: string
          pillar: string
          rescheduled_at?: string | null
          rescheduled_by?: string | null
          start_at: string
          status?: string
          template_id?: string | null
          trainer_id: string
          trainer_overridden_at?: string | null
          trainer_overridden_by?: string | null
          updated_at?: string
        }
        Update: {
          age_category?: string
          blocks_free_training?: boolean
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          capacity?: number | null
          class_type_id?: string
          created_at?: string
          end_at?: string
          id?: string
          notes?: string | null
          occurrence_start_at?: string
          pillar?: string
          rescheduled_at?: string | null
          rescheduled_by?: string | null
          start_at?: string
          status?: string
          template_id?: string | null
          trainer_id?: string
          trainer_overridden_at?: string | null
          trainer_overridden_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_sessions_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_sessions_class_type_id_fkey"
            columns: ["class_type_id"]
            isOneToOne: false
            referencedRelation: "class_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_sessions_pillar_fkey"
            columns: ["pillar"]
            isOneToOne: false
            referencedRelation: "class_pillars"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "class_sessions_rescheduled_by_fkey"
            columns: ["rescheduled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_sessions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "schedule_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_sessions_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_sessions_trainer_overridden_by_fkey"
            columns: ["trainer_overridden_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      class_types: {
        Row: {
          age_category: string
          color: string | null
          created_at: string
          default_capacity: number | null
          default_duration_minutes: number
          description: string | null
          id: string
          is_active: boolean
          name: string
          pillar: string
          sanity_id: string | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          age_category: string
          color?: string | null
          created_at?: string
          default_capacity?: number | null
          default_duration_minutes?: number
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          pillar: string
          sanity_id?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          age_category?: string
          color?: string | null
          created_at?: string
          default_capacity?: number | null
          default_duration_minutes?: number
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          pillar?: string
          sanity_id?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_types_pillar_fkey"
            columns: ["pillar"]
            isOneToOne: false
            referencedRelation: "class_pillars"
            referencedColumns: ["code"]
          },
        ]
      }
      crowdfunding_backers: {
        Row: {
          amount: number
          created_at: string | null
          email: string
          id: string
          mollie_payment_id: string | null
          name: string
          payment_status: string | null
          phone: string | null
          show_on_wall: boolean | null
          tier_id: string
          tier_name: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          email: string
          id?: string
          mollie_payment_id?: string | null
          name: string
          payment_status?: string | null
          phone?: string | null
          show_on_wall?: boolean | null
          tier_id: string
          tier_name: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          email?: string
          id?: string
          mollie_payment_id?: string | null
          name?: string
          payment_status?: string | null
          phone?: string | null
          show_on_wall?: boolean | null
          tier_id?: string
          tier_name?: string
        }
        Relationships: []
      }
      crowdfunding_stats: {
        Row: {
          id: number
          total_backers: number | null
          total_raised: number | null
          updated_at: string | null
        }
        Insert: {
          id?: number
          total_backers?: number | null
          total_raised?: number | null
          updated_at?: string | null
        }
        Update: {
          id?: number
          total_backers?: number | null
          total_raised?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      crowdfunding_tiers: {
        Row: {
          id: string
          slots_claimed: number | null
        }
        Insert: {
          id: string
          slots_claimed?: number | null
        }
        Update: {
          id?: string
          slots_claimed?: number | null
        }
        Relationships: []
      }
      device_push_tokens: {
        Row: {
          created_at: string
          id: string
          platform: string
          profile_id: string
          token: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          platform: string
          profile_id: string
          token: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          platform?: string
          profile_id?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_push_tokens_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      early_member_pools: {
        Row: {
          closes_at: string
          created_at: string
          opens_at: string
          pool: string
        }
        Insert: {
          closes_at: string
          created_at?: string
          opens_at: string
          pool: string
        }
        Update: {
          closes_at?: string
          created_at?: string
          opens_at?: string
          pool?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          actor_id: string | null
          actor_type: string
          created_at: string
          id: string
          payload: Json
          subject_id: string | null
          subject_type: string | null
          type: string
        }
        Insert: {
          actor_id?: string | null
          actor_type: string
          created_at?: string
          id?: string
          payload?: Json
          subject_id?: string | null
          subject_type?: string | null
          type: string
        }
        Update: {
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          id?: string
          payload?: Json
          subject_id?: string | null
          subject_type?: string | null
          type?: string
        }
        Relationships: []
      }
      exercises: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          video_url: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          video_url?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          video_url?: string | null
        }
        Relationships: []
      }
      guest_bookings: {
        Row: {
          booked_at: string
          booked_by: string
          cancelled_at: string | null
          guest_email: string
          guest_name: string
          guest_pass_id: string
          id: string
          reminder_sent: boolean
          session_id: string
          status: string
        }
        Insert: {
          booked_at?: string
          booked_by: string
          cancelled_at?: string | null
          guest_email: string
          guest_name: string
          guest_pass_id: string
          id?: string
          reminder_sent?: boolean
          session_id: string
          status?: string
        }
        Update: {
          booked_at?: string
          booked_by?: string
          cancelled_at?: string | null
          guest_email?: string
          guest_name?: string
          guest_pass_id?: string
          id?: string
          reminder_sent?: boolean
          session_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_bookings_booked_by_fkey"
            columns: ["booked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_bookings_guest_pass_id_fkey"
            columns: ["guest_pass_id"]
            isOneToOne: false
            referencedRelation: "guest_passes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_bookings_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "class_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_bookings_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "v_session_availability"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_passes: {
        Row: {
          created_at: string
          id: string
          membership_id: string | null
          passes_allocated: number
          passes_used: number
          period_end: string
          period_start: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          membership_id?: string | null
          passes_allocated: number
          passes_used?: number
          period_end: string
          period_start: string
          profile_id: string
        }
        Update: {
          created_at?: string
          id?: string
          membership_id?: string | null
          passes_allocated?: number
          passes_used?: number
          period_end?: string
          period_start?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_passes_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_passes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_lines: {
        Row: {
          catalogue_slug: string | null
          description: string
          gross_cents: number
          id: string
          invoice_id: string
          line_no: number
          net_cents: number
          quantity: number
          revenue_category: string | null
          unit_net_cents: number
          vat_cents: number
          vat_rate_bp: number
        }
        Insert: {
          catalogue_slug?: string | null
          description: string
          gross_cents: number
          id?: string
          invoice_id: string
          line_no: number
          net_cents: number
          quantity?: number
          revenue_category?: string | null
          unit_net_cents: number
          vat_cents: number
          vat_rate_bp: number
        }
        Update: {
          catalogue_slug?: string | null
          description?: string
          gross_cents?: number
          id?: string
          invoice_id?: string
          line_no?: number
          net_cents?: number
          quantity?: number
          revenue_category?: string | null
          unit_net_cents?: number
          vat_cents?: number
          vat_rate_bp?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "v_invoice_credit_state"
            referencedColumns: ["invoice_id"]
          },
        ]
      }
      invoice_series: {
        Row: {
          code: string
          created_at: string
          fiscal_year: number
          id: string
          is_test: boolean
          next_number: number
          prefix: string
        }
        Insert: {
          code: string
          created_at?: string
          fiscal_year: number
          id?: string
          is_test: boolean
          next_number?: number
          prefix: string
        }
        Update: {
          code?: string
          created_at?: string
          fiscal_year?: number
          id?: string
          is_test?: boolean
          next_number?: number
          prefix?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          bill_to_city: string | null
          bill_to_company: string | null
          bill_to_country: string | null
          bill_to_email: string | null
          bill_to_name: string | null
          bill_to_postal_code: string | null
          bill_to_street: string | null
          bill_to_vat_number: string | null
          created_at: string
          created_by_profile_id: string | null
          credit_of_invoice_id: string | null
          currency: string
          fiscal_year: number
          id: string
          invoice_number: string | null
          is_test: boolean
          issued_at: string | null
          notes: string | null
          number: number | null
          order_id: string | null
          payment_id: string | null
          pdf_generated_at: string | null
          pdf_path: string | null
          profile_id: string
          series_id: string
          status: string
          subtotal_net_cents: number | null
          total_gross_cents: number | null
          updated_at: string
          vat_total_cents: number | null
        }
        Insert: {
          bill_to_city?: string | null
          bill_to_company?: string | null
          bill_to_country?: string | null
          bill_to_email?: string | null
          bill_to_name?: string | null
          bill_to_postal_code?: string | null
          bill_to_street?: string | null
          bill_to_vat_number?: string | null
          created_at?: string
          created_by_profile_id?: string | null
          credit_of_invoice_id?: string | null
          currency?: string
          fiscal_year: number
          id?: string
          invoice_number?: string | null
          is_test: boolean
          issued_at?: string | null
          notes?: string | null
          number?: number | null
          order_id?: string | null
          payment_id?: string | null
          pdf_generated_at?: string | null
          pdf_path?: string | null
          profile_id: string
          series_id: string
          status?: string
          subtotal_net_cents?: number | null
          total_gross_cents?: number | null
          updated_at?: string
          vat_total_cents?: number | null
        }
        Update: {
          bill_to_city?: string | null
          bill_to_company?: string | null
          bill_to_country?: string | null
          bill_to_email?: string | null
          bill_to_name?: string | null
          bill_to_postal_code?: string | null
          bill_to_street?: string | null
          bill_to_vat_number?: string | null
          created_at?: string
          created_by_profile_id?: string | null
          credit_of_invoice_id?: string | null
          currency?: string
          fiscal_year?: number
          id?: string
          invoice_number?: string | null
          is_test?: boolean
          issued_at?: string | null
          notes?: string | null
          number?: number | null
          order_id?: string | null
          payment_id?: string | null
          pdf_generated_at?: string | null
          pdf_path?: string | null
          profile_id?: string
          series_id?: string
          status?: string
          subtotal_net_cents?: number | null
          total_gross_cents?: number | null
          updated_at?: string
          vat_total_cents?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_credit_of_invoice_id_fkey"
            columns: ["credit_of_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_credit_of_invoice_id_fkey"
            columns: ["credit_of_invoice_id"]
            isOneToOne: false
            referencedRelation: "v_invoice_credit_state"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "v_revenue_lines"
            referencedColumns: ["payment_id"]
          },
          {
            foreignKeyName: "invoices_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "invoice_series"
            referencedColumns: ["id"]
          },
        ]
      }
      kiosk_devices: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          label: string
          last_seen_at: string | null
          revoked_at: string | null
          revoked_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          label: string
          last_seen_at?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          last_seen_at?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kiosk_devices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kiosk_devices_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kiosk_pin_attempts: {
        Row: {
          device_id: string
          fail_count: number
          locked_until: string | null
          profile_id: string
          updated_at: string
          window_start: string
        }
        Insert: {
          device_id: string
          fail_count?: number
          locked_until?: string | null
          profile_id: string
          updated_at?: string
          window_start?: string
        }
        Update: {
          device_id?: string
          fail_count?: number
          locked_until?: string | null
          profile_id?: string
          updated_at?: string
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "kiosk_pin_attempts_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "kiosk_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kiosk_pin_attempts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_attributions: {
        Row: {
          analytics_consent: string
          created_at: string
          email: string
          fbclid: string | null
          gbraid: string | null
          gclid: string | null
          id: string
          landing_path: string | null
          source_id: string
          source_type: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          wbraid: string | null
        }
        Insert: {
          analytics_consent?: string
          created_at?: string
          email: string
          fbclid?: string | null
          gbraid?: string | null
          gclid?: string | null
          id?: string
          landing_path?: string | null
          source_id: string
          source_type: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          wbraid?: string | null
        }
        Update: {
          analytics_consent?: string
          created_at?: string
          email?: string
          fbclid?: string | null
          gbraid?: string | null
          gclid?: string | null
          id?: string
          landing_path?: string | null
          source_id?: string
          source_type?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          wbraid?: string | null
        }
        Relationships: []
      }
      member_notes: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          profile_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          profile_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_notes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_change_requests: {
        Row: {
          applied_at: string | null
          created_at: string
          current_recurring_cents: number
          effective_date: string
          failure_reason: string | null
          id: string
          membership_id: string
          mollie_subscription_id: string | null
          new_base_price_cents: number
          new_extended_access_price_cents: number
          new_recurring_cents: number
          pricing_snapshot: Json
          profile_id: string
          requested_by: string | null
          requested_via: string
          status: string
          target_covered_pillars: string[]
          target_extended_access: boolean
          target_family: string
          target_frequency_cap: number | null
          target_slug: string
          updated_at: string
        }
        Insert: {
          applied_at?: string | null
          created_at?: string
          current_recurring_cents: number
          effective_date: string
          failure_reason?: string | null
          id?: string
          membership_id: string
          mollie_subscription_id?: string | null
          new_base_price_cents: number
          new_extended_access_price_cents?: number
          new_recurring_cents: number
          pricing_snapshot: Json
          profile_id: string
          requested_by?: string | null
          requested_via: string
          status?: string
          target_covered_pillars?: string[]
          target_extended_access?: boolean
          target_family: string
          target_frequency_cap?: number | null
          target_slug: string
          updated_at?: string
        }
        Update: {
          applied_at?: string | null
          created_at?: string
          current_recurring_cents?: number
          effective_date?: string
          failure_reason?: string | null
          id?: string
          membership_id?: string
          mollie_subscription_id?: string | null
          new_base_price_cents?: number
          new_extended_access_price_cents?: number
          new_recurring_cents?: number
          pricing_snapshot?: Json
          profile_id?: string
          requested_by?: string | null
          requested_via?: string
          status?: string
          target_covered_pillars?: string[]
          target_extended_access?: boolean
          target_family?: string
          target_frequency_cap?: number | null
          target_slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_change_requests_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_change_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_pauses: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          end_date: string | null
          id: string
          medical_attest_url: string | null
          membership_id: string
          notes: string | null
          reason: string
          requested_by: string | null
          start_date: string
          status: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          end_date?: string | null
          id?: string
          medical_attest_url?: string | null
          membership_id: string
          notes?: string | null
          reason: string
          requested_by?: string | null
          start_date: string
          status?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          end_date?: string | null
          id?: string
          medical_attest_url?: string | null
          membership_id?: string
          notes?: string | null
          reason?: string
          requested_by?: string | null
          start_date?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_pauses_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_pauses_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_pauses_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          age_category: string
          billing_cycle_weeks: number
          cancellation_effective_date: string | null
          cancellation_prior_status: string | null
          cancellation_requested_at: string | null
          cancellation_source: string | null
          commit_end_date: string
          commit_months: number
          covered_pillars: string[]
          created_at: string
          credits_expires_at: string | null
          credits_remaining: number | null
          credits_total: number | null
          crowdfunding_tier_id: string | null
          end_date: string | null
          extended_access: boolean
          extended_access_price_cents: number
          frequency_cap: number | null
          id: string
          lock_in_active: boolean
          lock_in_expired_at: string | null
          lock_in_price_cents: number | null
          lock_in_source: string | null
          mollie_customer_id: string | null
          mollie_subscription_id: string | null
          notes: string | null
          pause_effective_date: string | null
          pause_planned_at: string | null
          plan_type: string
          plan_variant: string | null
          price_per_cycle_cents: number
          profile_id: string
          resume_blocked_reason: string | null
          signup_fee_cents: number
          signup_fee_waiver: string | null
          source: string
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          age_category?: string
          billing_cycle_weeks?: number
          cancellation_effective_date?: string | null
          cancellation_prior_status?: string | null
          cancellation_requested_at?: string | null
          cancellation_source?: string | null
          commit_end_date: string
          commit_months?: number
          covered_pillars?: string[]
          created_at?: string
          credits_expires_at?: string | null
          credits_remaining?: number | null
          credits_total?: number | null
          crowdfunding_tier_id?: string | null
          end_date?: string | null
          extended_access?: boolean
          extended_access_price_cents?: number
          frequency_cap?: number | null
          id?: string
          lock_in_active?: boolean
          lock_in_expired_at?: string | null
          lock_in_price_cents?: number | null
          lock_in_source?: string | null
          mollie_customer_id?: string | null
          mollie_subscription_id?: string | null
          notes?: string | null
          pause_effective_date?: string | null
          pause_planned_at?: string | null
          plan_type: string
          plan_variant?: string | null
          price_per_cycle_cents: number
          profile_id: string
          resume_blocked_reason?: string | null
          signup_fee_cents?: number
          signup_fee_waiver?: string | null
          source?: string
          start_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          age_category?: string
          billing_cycle_weeks?: number
          cancellation_effective_date?: string | null
          cancellation_prior_status?: string | null
          cancellation_requested_at?: string | null
          cancellation_source?: string | null
          commit_end_date?: string
          commit_months?: number
          covered_pillars?: string[]
          created_at?: string
          credits_expires_at?: string | null
          credits_remaining?: number | null
          credits_total?: number | null
          crowdfunding_tier_id?: string | null
          end_date?: string | null
          extended_access?: boolean
          extended_access_price_cents?: number
          frequency_cap?: number | null
          id?: string
          lock_in_active?: boolean
          lock_in_expired_at?: string | null
          lock_in_price_cents?: number | null
          lock_in_source?: string | null
          mollie_customer_id?: string | null
          mollie_subscription_id?: string | null
          notes?: string | null
          pause_effective_date?: string | null
          pause_planned_at?: string | null
          plan_type?: string
          plan_variant?: string | null
          price_per_cycle_cents?: number
          profile_id?: string
          resume_blocked_reason?: string | null
          signup_fee_cents?: number
          signup_fee_waiver?: string | null
          source?: string
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      no_show_strikes: {
        Row: {
          booking_id: string
          created_at: string
          expires_at: string
          id: string
          occurred_at: string
          profile_id: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          expires_at: string
          id?: string
          occurred_at?: string
          profile_id: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          occurred_at?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "no_show_strikes_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "no_show_strikes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      opening_hours: {
        Row: {
          closes_at: string | null
          is_closed: boolean
          opens_at: string | null
          updated_at: string
          weekday: number
        }
        Insert: {
          closes_at?: string | null
          is_closed?: boolean
          opens_at?: string | null
          updated_at?: string
          weekday: number
        }
        Update: {
          closes_at?: string | null
          is_closed?: boolean
          opens_at?: string | null
          updated_at?: string
          weekday?: number
        }
        Relationships: []
      }
      opening_hours_exceptions: {
        Row: {
          closes_at: string | null
          created_at: string
          date: string
          id: string
          is_closed: boolean
          note: string | null
          opens_at: string | null
        }
        Insert: {
          closes_at?: string | null
          created_at?: string
          date: string
          id?: string
          is_closed?: boolean
          note?: string | null
          opens_at?: string | null
        }
        Update: {
          closes_at?: string | null
          created_at?: string
          date?: string
          id?: string
          is_closed?: boolean
          note?: string | null
          opens_at?: string | null
        }
        Relationships: []
      }
      opening_trial_attempts: {
        Row: {
          fail_count: number
          ip: string
          locked_until: string | null
          updated_at: string
          window_start: string
        }
        Insert: {
          fail_count?: number
          ip: string
          locked_until?: string | null
          updated_at?: string
          window_start?: string
        }
        Update: {
          fail_count?: number
          ip?: string
          locked_until?: string | null
          updated_at?: string
          window_start?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          activated_at: string | null
          base_price_cents: number
          billing_cycle_weeks: number | null
          blocked_reason: string | null
          cancelled_at: string | null
          catalogue_slug: string
          class_session_id: string | null
          commit_months: number | null
          created_at: string
          created_by: string
          created_by_profile_id: string | null
          early_member: boolean
          early_member_price_lock: boolean
          expires_at: string
          extended_access: boolean
          extended_access_price_cents: number
          first_charge_cents: number
          ga_client_id: string | null
          ga_session_id: string | null
          id: string
          kind: string
          membership_id: string | null
          mollie_customer_id: string | null
          mollie_payment_id: string | null
          paid_at: string | null
          pricing_snapshot: Json
          profile_id: string
          pt_session_id: string | null
          recurring_cents: number | null
          signup_fee_cents: number
          signup_fee_waiver: string | null
          status: string
          token: string
          updated_at: string
          vat_amount_cents: number | null
        }
        Insert: {
          activated_at?: string | null
          base_price_cents: number
          billing_cycle_weeks?: number | null
          blocked_reason?: string | null
          cancelled_at?: string | null
          catalogue_slug: string
          class_session_id?: string | null
          commit_months?: number | null
          created_at?: string
          created_by: string
          created_by_profile_id?: string | null
          early_member?: boolean
          early_member_price_lock?: boolean
          expires_at: string
          extended_access?: boolean
          extended_access_price_cents?: number
          first_charge_cents: number
          ga_client_id?: string | null
          ga_session_id?: string | null
          id?: string
          kind: string
          membership_id?: string | null
          mollie_customer_id?: string | null
          mollie_payment_id?: string | null
          paid_at?: string | null
          pricing_snapshot: Json
          profile_id: string
          pt_session_id?: string | null
          recurring_cents?: number | null
          signup_fee_cents?: number
          signup_fee_waiver?: string | null
          status?: string
          token?: string
          updated_at?: string
          vat_amount_cents?: number | null
        }
        Update: {
          activated_at?: string | null
          base_price_cents?: number
          billing_cycle_weeks?: number | null
          blocked_reason?: string | null
          cancelled_at?: string | null
          catalogue_slug?: string
          class_session_id?: string | null
          commit_months?: number | null
          created_at?: string
          created_by?: string
          created_by_profile_id?: string | null
          early_member?: boolean
          early_member_price_lock?: boolean
          expires_at?: string
          extended_access?: boolean
          extended_access_price_cents?: number
          first_charge_cents?: number
          ga_client_id?: string | null
          ga_session_id?: string | null
          id?: string
          kind?: string
          membership_id?: string | null
          mollie_customer_id?: string | null
          mollie_payment_id?: string | null
          paid_at?: string | null
          pricing_snapshot?: Json
          profile_id?: string
          pt_session_id?: string | null
          recurring_cents?: number | null
          signup_fee_cents?: number
          signup_fee_waiver?: string | null
          status?: string
          token?: string
          updated_at?: string
          vat_amount_cents?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_class_session_id_fkey"
            columns: ["class_session_id"]
            isOneToOne: false
            referencedRelation: "class_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_class_session_id_fkey"
            columns: ["class_session_id"]
            isOneToOne: false
            referencedRelation: "v_session_availability"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_pt_session_id_fkey"
            columns: ["pt_session_id"]
            isOneToOne: false
            referencedRelation: "pt_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_refunds: {
        Row: {
          amount_cents: number
          id: string
          last_error: string | null
          mollie_refund_id: string | null
          payment_id: string
          requested_at: string
          requested_by: string | null
          status: string
          trial_booking_id: string | null
          updated_at: string
        }
        Insert: {
          amount_cents: number
          id?: string
          last_error?: string | null
          mollie_refund_id?: string | null
          payment_id: string
          requested_at?: string
          requested_by?: string | null
          status?: string
          trial_booking_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          id?: string
          last_error?: string | null
          mollie_refund_id?: string | null
          payment_id?: string
          requested_at?: string
          requested_by?: string | null
          status?: string
          trial_booking_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_refunds_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_refunds_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "v_revenue_lines"
            referencedColumns: ["payment_id"]
          },
          {
            foreignKeyName: "payment_refunds_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_refunds_trial_booking_id_fkey"
            columns: ["trial_booking_id"]
            isOneToOne: false
            referencedRelation: "trial_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_cents: number
          booking_id: string | null
          created_at: string
          description: string | null
          id: string
          is_test: boolean
          kind: string | null
          membership_id: string | null
          method: string | null
          mollie_payment_id: string
          mollie_subscription_id: string | null
          net_amount_cents: number | null
          order_id: string | null
          paid_at: string | null
          profile_id: string | null
          pt_booking_id: string | null
          refunded_amount_cents: number
          refunded_at: string | null
          status: string
          trial_booking_id: string | null
          vat_amount_cents: number | null
          vat_rate_bp: number | null
        }
        Insert: {
          amount_cents: number
          booking_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_test?: boolean
          kind?: string | null
          membership_id?: string | null
          method?: string | null
          mollie_payment_id: string
          mollie_subscription_id?: string | null
          net_amount_cents?: number | null
          order_id?: string | null
          paid_at?: string | null
          profile_id?: string | null
          pt_booking_id?: string | null
          refunded_amount_cents?: number
          refunded_at?: string | null
          status: string
          trial_booking_id?: string | null
          vat_amount_cents?: number | null
          vat_rate_bp?: number | null
        }
        Update: {
          amount_cents?: number
          booking_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_test?: boolean
          kind?: string | null
          membership_id?: string | null
          method?: string | null
          mollie_payment_id?: string
          mollie_subscription_id?: string | null
          net_amount_cents?: number | null
          order_id?: string | null
          paid_at?: string | null
          profile_id?: string | null
          pt_booking_id?: string | null
          refunded_amount_cents?: number
          refunded_at?: string | null
          status?: string
          trial_booking_id?: string | null
          vat_amount_cents?: number | null
          vat_rate_bp?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_pt_booking_id_fkey"
            columns: ["pt_booking_id"]
            isOneToOne: false
            referencedRelation: "pt_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_trial_booking_id_fkey"
            columns: ["trial_booking_id"]
            isOneToOne: false
            referencedRelation: "trial_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          acquisition_campaign: string | null
          acquisition_content: string | null
          acquisition_medium: string | null
          acquisition_source: string | null
          age_category: string
          avatar_url: string | null
          city: string | null
          company_name: string | null
          country: string
          created_at: string
          date_of_birth: string | null
          email: string
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          first_name: string
          first_touch_at: string | null
          health_intake_completed_at: string | null
          health_notes: string | null
          id: string
          is_test: boolean
          last_name: string
          locale: string
          marketing_opt_in: boolean
          member_code: string
          mollie_customer_id: string | null
          phone: string | null
          postal_code: string | null
          role: string
          signup_path: string | null
          street_address: string | null
          updated_at: string
          vat_number: string | null
        }
        Insert: {
          acquisition_campaign?: string | null
          acquisition_content?: string | null
          acquisition_medium?: string | null
          acquisition_source?: string | null
          age_category?: string
          avatar_url?: string | null
          city?: string | null
          company_name?: string | null
          country?: string
          created_at?: string
          date_of_birth?: string | null
          email: string
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          first_name: string
          first_touch_at?: string | null
          health_intake_completed_at?: string | null
          health_notes?: string | null
          id: string
          is_test?: boolean
          last_name: string
          locale?: string
          marketing_opt_in?: boolean
          member_code: string
          mollie_customer_id?: string | null
          phone?: string | null
          postal_code?: string | null
          role?: string
          signup_path?: string | null
          street_address?: string | null
          updated_at?: string
          vat_number?: string | null
        }
        Update: {
          acquisition_campaign?: string | null
          acquisition_content?: string | null
          acquisition_medium?: string | null
          acquisition_source?: string | null
          age_category?: string
          avatar_url?: string | null
          city?: string | null
          company_name?: string | null
          country?: string
          created_at?: string
          date_of_birth?: string | null
          email?: string
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          first_name?: string
          first_touch_at?: string | null
          health_intake_completed_at?: string | null
          health_notes?: string | null
          id?: string
          is_test?: boolean
          last_name?: string
          locale?: string
          marketing_opt_in?: boolean
          member_code?: string
          mollie_customer_id?: string | null
          phone?: string | null
          postal_code?: string | null
          role?: string
          signup_path?: string | null
          street_address?: string | null
          updated_at?: string
          vat_number?: string | null
        }
        Relationships: []
      }
      program_days: {
        Row: {
          day_number: number
          id: string
          label: string | null
          program_id: string
        }
        Insert: {
          day_number: number
          id?: string
          label?: string | null
          program_id: string
        }
        Update: {
          day_number?: number
          id?: string
          label?: string | null
          program_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_days_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "training_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      program_exercises: {
        Row: {
          day_id: string
          exercise_id: string
          id: string
          notes: string | null
          reps_max: number
          reps_min: number
          rest_seconds: number
          sets: number
          slot: string
          tempo_concentric: number
          tempo_eccentric: number
          tempo_pause_bottom: number
          tempo_pause_top: number
        }
        Insert: {
          day_id: string
          exercise_id: string
          id?: string
          notes?: string | null
          reps_max: number
          reps_min: number
          rest_seconds: number
          sets: number
          slot: string
          tempo_concentric: number
          tempo_eccentric: number
          tempo_pause_bottom: number
          tempo_pause_top: number
        }
        Update: {
          day_id?: string
          exercise_id?: string
          id?: string
          notes?: string | null
          reps_max?: number
          reps_min?: number
          rest_seconds?: number
          sets?: number
          slot?: string
          tempo_concentric?: number
          tempo_eccentric?: number
          tempo_pause_bottom?: number
          tempo_pause_top?: number
        }
        Relationships: [
          {
            foreignKeyName: "program_exercises_day_id_fkey"
            columns: ["day_id"]
            isOneToOne: false
            referencedRelation: "program_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      pt_bookings: {
        Row: {
          booked_at: string
          cancelled_at: string | null
          credits_refunded_at: string | null
          credits_used_from: string | null
          id: string
          introducee_name: string | null
          mollie_payment_id: string | null
          price_paid_cents: number
          profile_id: string
          pt_session_id: string
          reminder_sent_at: string | null
          status: string
        }
        Insert: {
          booked_at?: string
          cancelled_at?: string | null
          credits_refunded_at?: string | null
          credits_used_from?: string | null
          id?: string
          introducee_name?: string | null
          mollie_payment_id?: string | null
          price_paid_cents: number
          profile_id: string
          pt_session_id: string
          reminder_sent_at?: string | null
          status?: string
        }
        Update: {
          booked_at?: string
          cancelled_at?: string | null
          credits_refunded_at?: string | null
          credits_used_from?: string | null
          id?: string
          introducee_name?: string | null
          mollie_payment_id?: string | null
          price_paid_cents?: number
          profile_id?: string
          pt_session_id?: string
          reminder_sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "pt_bookings_credits_used_from_fkey"
            columns: ["credits_used_from"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pt_bookings_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pt_bookings_pt_session_id_fkey"
            columns: ["pt_session_id"]
            isOneToOne: false
            referencedRelation: "pt_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      pt_cancellation_requests: {
        Row: {
          created_at: string
          id: string
          profile_id: string
          pt_booking_id: string
          reason: string | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          with_restitution: boolean | null
        }
        Insert: {
          created_at?: string
          id?: string
          profile_id: string
          pt_booking_id: string
          reason?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          with_restitution?: boolean | null
        }
        Update: {
          created_at?: string
          id?: string
          profile_id?: string
          pt_booking_id?: string
          reason?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          with_restitution?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "pt_cancellation_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pt_cancellation_requests_pt_booking_id_fkey"
            columns: ["pt_booking_id"]
            isOneToOne: false
            referencedRelation: "pt_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      pt_programs: {
        Row: {
          catalogue_slug: string
          created_at: string
          id: string
          payment_ref: string | null
          profile_id: string
          status: string
          total_sessions: number
          type: string
        }
        Insert: {
          catalogue_slug: string
          created_at?: string
          id?: string
          payment_ref?: string | null
          profile_id: string
          status?: string
          total_sessions: number
          type: string
        }
        Update: {
          catalogue_slug?: string
          created_at?: string
          id?: string
          payment_ref?: string | null
          profile_id?: string
          status?: string
          total_sessions?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "pt_programs_catalogue_slug_fkey"
            columns: ["catalogue_slug"]
            isOneToOne: false
            referencedRelation: "catalogue"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "pt_programs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pt_sessions: {
        Row: {
          capacity: number
          created_at: string
          duration_min: number
          end_at: string
          format: string | null
          hold_expires_at: string | null
          id: string
          kind: string
          mode: string | null
          notes: string | null
          program_id: string | null
          prospect_email: string | null
          prospect_name: string | null
          prospect_phone: string | null
          reminder_sent_at: string | null
          start_at: string
          status: string
          trainer_id: string
          updated_at: string
        }
        Insert: {
          capacity: number
          created_at?: string
          duration_min: number
          end_at: string
          format?: string | null
          hold_expires_at?: string | null
          id?: string
          kind?: string
          mode?: string | null
          notes?: string | null
          program_id?: string | null
          prospect_email?: string | null
          prospect_name?: string | null
          prospect_phone?: string | null
          reminder_sent_at?: string | null
          start_at: string
          status?: string
          trainer_id: string
          updated_at?: string
        }
        Update: {
          capacity?: number
          created_at?: string
          duration_min?: number
          end_at?: string
          format?: string | null
          hold_expires_at?: string | null
          id?: string
          kind?: string
          mode?: string | null
          notes?: string | null
          program_id?: string | null
          prospect_email?: string | null
          prospect_name?: string | null
          prospect_phone?: string | null
          reminder_sent_at?: string | null
          start_at?: string
          status?: string
          trainer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pt_sessions_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "pt_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pt_sessions_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      pt_settings: {
        Row: {
          cancel_window_hours: number
          session_duration_min: number
          trainer_id: string
          turnaround_min: number
          updated_at: string
        }
        Insert: {
          cancel_window_hours?: number
          session_duration_min?: number
          trainer_id: string
          turnaround_min?: number
          updated_at?: string
        }
        Update: {
          cancel_window_hours?: number
          session_duration_min?: number
          trainer_id?: string
          turnaround_min?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pt_settings_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: true
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_templates: {
        Row: {
          blocks_free_training: boolean
          capacity: number | null
          class_type_id: string
          created_at: string
          day_of_week: number
          duration_minutes: number
          id: string
          is_active: boolean
          name: string | null
          sanity_id: string | null
          start_time: string
          trainer_id: string
          updated_at: string
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          blocks_free_training?: boolean
          capacity?: number | null
          class_type_id: string
          created_at?: string
          day_of_week: number
          duration_minutes?: number
          id?: string
          is_active?: boolean
          name?: string | null
          sanity_id?: string | null
          start_time: string
          trainer_id: string
          updated_at?: string
          valid_from: string
          valid_until?: string | null
        }
        Update: {
          blocks_free_training?: boolean
          capacity?: number | null
          class_type_id?: string
          created_at?: string
          day_of_week?: number
          duration_minutes?: number
          id?: string
          is_active?: boolean
          name?: string | null
          sanity_id?: string | null
          start_time?: string
          trainer_id?: string
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "schedule_templates_class_type_id_fkey"
            columns: ["class_type_id"]
            isOneToOne: false
            referencedRelation: "class_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_templates_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      set_logs: {
        Row: {
          exercise_id: string
          id: string
          notes: string | null
          program_exercise_id: string
          reps: number
          session_id: string
          set_number: number
          weight_kg: number
        }
        Insert: {
          exercise_id: string
          id?: string
          notes?: string | null
          program_exercise_id: string
          reps: number
          session_id: string
          set_number: number
          weight_kg: number
        }
        Update: {
          exercise_id?: string
          id?: string
          notes?: string | null
          program_exercise_id?: string
          reps?: number
          session_id?: string
          set_number?: number
          weight_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "set_logs_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "set_logs_program_exercise_id_fkey"
            columns: ["program_exercise_id"]
            isOneToOne: false
            referencedRelation: "program_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "set_logs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "workout_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_pins: {
        Row: {
          is_active: boolean
          pin_hash: string
          pin_version: number
          profile_id: string
          set_at: string
          set_by: string | null
        }
        Insert: {
          is_active?: boolean
          pin_hash: string
          pin_version?: number
          profile_id: string
          set_at?: string
          set_by?: string | null
        }
        Update: {
          is_active?: boolean
          pin_hash?: string
          pin_version?: number
          profile_id?: string
          set_at?: string
          set_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_pins_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_pins_set_by_fkey"
            columns: ["set_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trainer_hours: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          hours: number
          id: string
          notes: string | null
          rejection_reason: string | null
          status: string
          submitted_at: string
          trainer_id: string
          work_date: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          hours: number
          id?: string
          notes?: string | null
          rejection_reason?: string | null
          status?: string
          submitted_at?: string
          trainer_id: string
          work_date: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          hours?: number
          id?: string
          notes?: string | null
          rejection_reason?: string | null
          status?: string
          submitted_at?: string
          trainer_id?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "trainer_hours_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trainer_hours_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      trainer_presence_windows: {
        Row: {
          created_at: string
          from_time: string
          id: string
          to_time: string
          weekday: number
        }
        Insert: {
          created_at?: string
          from_time: string
          id?: string
          to_time: string
          weekday: number
        }
        Update: {
          created_at?: string
          from_time?: string
          id?: string
          to_time?: string
          weekday?: number
        }
        Relationships: []
      }
      trainers: {
        Row: {
          bio: string | null
          created_at: string
          display_name: string
          display_order: number
          employment_tier: string
          has_health_access: boolean
          hourly_rate_in_cents: number | null
          id: string
          is_active: boolean
          is_pt_available: boolean
          pillar_specialties: string[]
          profile_id: string
          pt_session_rate_cents: number | null
          pt_tier: string
          sanity_id: string | null
          slug: string
          specialties: string[]
          updated_at: string
        }
        Insert: {
          bio?: string | null
          created_at?: string
          display_name: string
          display_order?: number
          employment_tier?: string
          has_health_access?: boolean
          hourly_rate_in_cents?: number | null
          id?: string
          is_active?: boolean
          is_pt_available?: boolean
          pillar_specialties?: string[]
          profile_id: string
          pt_session_rate_cents?: number | null
          pt_tier?: string
          sanity_id?: string | null
          slug: string
          specialties?: string[]
          updated_at?: string
        }
        Update: {
          bio?: string | null
          created_at?: string
          display_name?: string
          display_order?: number
          employment_tier?: string
          has_health_access?: boolean
          hourly_rate_in_cents?: number | null
          id?: string
          is_active?: boolean
          is_pt_available?: boolean
          pillar_specialties?: string[]
          profile_id?: string
          pt_session_rate_cents?: number | null
          pt_tier?: string
          sanity_id?: string | null
          slug?: string
          specialties?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trainers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      training_programs: {
        Row: {
          activated_at: string | null
          archived_at: string | null
          created_at: string
          id: string
          notes: string | null
          profile_id: string
          status: string
          title: string | null
          version: number
        }
        Insert: {
          activated_at?: string | null
          archived_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          profile_id: string
          status?: string
          title?: string | null
          version: number
        }
        Update: {
          activated_at?: string | null
          archived_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          profile_id?: string
          status?: string
          title?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "training_programs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trial_bookings: {
        Row: {
          booked_at: string
          cancel_token: string
          cancellation_reason: string | null
          cancelled_at: string | null
          email: string
          id: string
          is_test: boolean
          mollie_payment_id: string | null
          name: string
          phone: string
          phone_e164: string | null
          price_paid_cents: number
          reminder_sent_at: string | null
          session_id: string
          slot_end_at: string | null
          slot_start_at: string | null
          source: string
          status: string
          trial_code_id: string | null
        }
        Insert: {
          booked_at?: string
          cancel_token?: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          email: string
          id?: string
          is_test?: boolean
          mollie_payment_id?: string | null
          name: string
          phone: string
          phone_e164?: string | null
          price_paid_cents: number
          reminder_sent_at?: string | null
          session_id: string
          slot_end_at?: string | null
          slot_start_at?: string | null
          source?: string
          status?: string
          trial_code_id?: string | null
        }
        Update: {
          booked_at?: string
          cancel_token?: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          email?: string
          id?: string
          is_test?: boolean
          mollie_payment_id?: string | null
          name?: string
          phone?: string
          phone_e164?: string | null
          price_paid_cents?: number
          reminder_sent_at?: string | null
          session_id?: string
          slot_end_at?: string | null
          slot_start_at?: string | null
          source?: string
          status?: string
          trial_code_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trial_bookings_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "class_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trial_bookings_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "v_session_availability"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trial_bookings_trial_code_id_fkey"
            columns: ["trial_code_id"]
            isOneToOne: false
            referencedRelation: "trial_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      trial_code_attempts: {
        Row: {
          fail_count: number
          ip: string
          locked_until: string | null
          updated_at: string
          window_start: string
        }
        Insert: {
          fail_count?: number
          ip: string
          locked_until?: string | null
          updated_at?: string
          window_start?: string
        }
        Update: {
          fail_count?: number
          ip?: string
          locked_until?: string | null
          updated_at?: string
          window_start?: string
        }
        Relationships: []
      }
      trial_code_redemptions: {
        Row: {
          code_id: string
          email_normalized: string
          id: string
          redeemed_at: string
          released_at: string | null
          session_id: string
          trial_booking_id: string
        }
        Insert: {
          code_id: string
          email_normalized: string
          id?: string
          redeemed_at?: string
          released_at?: string | null
          session_id: string
          trial_booking_id: string
        }
        Update: {
          code_id?: string
          email_normalized?: string
          id?: string
          redeemed_at?: string
          released_at?: string | null
          session_id?: string
          trial_booking_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trial_code_redemptions_code_id_fkey"
            columns: ["code_id"]
            isOneToOne: false
            referencedRelation: "trial_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trial_code_redemptions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "class_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trial_code_redemptions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "v_session_availability"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trial_code_redemptions_trial_booking_id_fkey"
            columns: ["trial_booking_id"]
            isOneToOne: true
            referencedRelation: "trial_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      trial_codes: {
        Row: {
          batch_id: string | null
          code: string
          created_at: string
          created_by: string
          id: string
          label: string
          max_uses: number | null
          revoked_at: string | null
          revoked_by: string | null
          scope: string
          uses_count: number
        }
        Insert: {
          batch_id?: string | null
          code: string
          created_at?: string
          created_by: string
          id?: string
          label: string
          max_uses?: number | null
          revoked_at?: string | null
          revoked_by?: string | null
          scope?: string
          uses_count?: number
        }
        Update: {
          batch_id?: string | null
          code?: string
          created_at?: string
          created_by?: string
          id?: string
          label?: string
          max_uses?: number | null
          revoked_at?: string | null
          revoked_by?: string | null
          scope?: string
          uses_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "trial_codes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trial_codes_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trial_requests: {
        Row: {
          created_at: string
          email: string
          experience: string | null
          id: string
          message: string | null
          name: string
          notes: string | null
          phone: string | null
          preference: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          experience?: string | null
          id?: string
          message?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          preference?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          experience?: string | null
          id?: string
          message?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          preference?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      waitlist_entries: {
        Row: {
          confirmation_deadline: string | null
          confirmed_at: string | null
          created_at: string
          expired_at: string | null
          id: string
          position: number
          profile_id: string
          promoted_at: string | null
          session_id: string
        }
        Insert: {
          confirmation_deadline?: string | null
          confirmed_at?: string | null
          created_at?: string
          expired_at?: string | null
          id?: string
          position: number
          profile_id: string
          promoted_at?: string | null
          session_id: string
        }
        Update: {
          confirmation_deadline?: string | null
          confirmed_at?: string | null
          created_at?: string
          expired_at?: string | null
          id?: string
          position?: number
          profile_id?: string
          promoted_at?: string | null
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_entries_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_entries_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "class_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_entries_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "v_session_availability"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_sessions: {
        Row: {
          completed_at: string | null
          day_id: string
          id: string
          profile_id: string
          program_id: string
          started_at: string
        }
        Insert: {
          completed_at?: string | null
          day_id: string
          id?: string
          profile_id: string
          program_id: string
          started_at?: string
        }
        Update: {
          completed_at?: string | null
          day_id?: string
          id?: string
          profile_id?: string
          program_id?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_sessions_day_id_fkey"
            columns: ["day_id"]
            isOneToOne: false
            referencedRelation: "program_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_sessions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_sessions_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "training_programs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_active_strikes: {
        Row: {
          earliest_expiry: string | null
          last_strike_at: string | null
          profile_id: string | null
          strike_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "no_show_strikes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_invoice_credit_state: {
        Row: {
          credit_state: string | null
          credited_gross_cents: number | null
          invoice_id: string | null
          total_gross_cents: number | null
        }
        Relationships: []
      }
      v_member_last_attendance: {
        Row: {
          last_attended_at: string | null
          profile_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "check_ins_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_revenue_lines: {
        Row: {
          credit_excess_cents: number | null
          credited_gross_cents: number | null
          credited_net_cents: number | null
          credited_vat_cents: number | null
          gross_cents: number | null
          is_test: boolean | null
          kind: string | null
          last_credit_issued_at: string | null
          net_cents: number | null
          paid_at: string | null
          payment_id: string | null
          period_month: string | null
          profile_id: string | null
          refunded_at: string | null
          refunded_cents: number | null
          refunded_net_cents: number | null
          refunded_vat_cents: number | null
          revenue_category: string | null
          vat_cents: number | null
          vat_rate_bp: number | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_session_availability: {
        Row: {
          age_category: string | null
          booked_count: number | null
          capacity: number | null
          class_type_id: string | null
          end_at: string | null
          id: string | null
          pillar: string | null
          spots_available: number | null
          start_at: string | null
          status: string | null
          taken_count: number | null
          trainer_id: string | null
          waitlist_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "class_sessions_class_type_id_fkey"
            columns: ["class_type_id"]
            isOneToOne: false
            referencedRelation: "class_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_sessions_pillar_fkey"
            columns: ["pillar"]
            isOneToOne: false
            referencedRelation: "class_pillars"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "class_sessions_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_admin_kpis: {
        Row: {
          active_members: number | null
          active_pauses: number | null
          churn_30d: number | null
          crowdfunding_converted_members: number | null
          crowdfunding_total_backers: number | null
          fill_rate_week_pct: number | null
          mrr_cents: number | null
          new_signups_month: number | null
          new_signups_week: number | null
          no_show_rate_30d_pct: number | null
          refreshed_at: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _checkout_new_token: { Args: never; Returns: string }
      _checkout_token_hash: { Args: { p_token: string }; Returns: string }
      _compute_order_price: {
        Args: {
          p_admin_context?: boolean
          p_commit_24m: boolean
          p_early_member: boolean
          p_extended_access: boolean
          p_slug: string
        }
        Returns: Json
      }
      activate_order: {
        Args: { p_mollie_payment_id: string; p_order_id: string }
        Returns: Json
      }
      activate_training_program: {
        Args: { p_program_id: string }
        Returns: {
          activated_at: string | null
          archived_at: string | null
          created_at: string
          id: string
          notes: string | null
          profile_id: string
          status: string
          title: string | null
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "training_programs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      adjust_membership_credits: {
        Args: {
          p_actor_id?: string
          p_actor_type: string
          p_booking_id?: string
          p_booking_source?: string
          p_delta: number
          p_membership_id: string
          p_reason: string
          p_source: string
        }
        Returns: Json
      }
      admin_book_pt_for_member: {
        Args: {
          p_allow_no_turnaround?: boolean
          p_allow_overlap?: boolean
          p_duration_min?: number
          p_format?: string
          p_introducee_name?: string
          p_payment_mode?: string
          p_profile_id: string
          p_repeat_weeks?: number
          p_start_at: string
          p_trainer_id: string
        }
        Returns: Json
      }
      admin_cancel_class_session: {
        Args: { p_reason: string; p_session_id: string }
        Returns: Json
      }
      admin_cancel_class_sessions_on_date: {
        Args: { p_date: string; p_reason: string }
        Returns: Json
      }
      admin_cancel_membership: {
        Args: {
          p_effective_date?: string
          p_hard_stop?: boolean
          p_membership_id: string
          p_reason: string
        }
        Returns: Json
      }
      admin_cancel_order: { Args: { p_order_id: string }; Returns: Json }
      admin_cancel_trial_booking: {
        Args: { p_id: string; p_reason: string }
        Returns: Json
      }
      admin_correct_customer_email: {
        Args: { p_new_email: string; p_profile_id: string }
        Returns: Json
      }
      admin_create_order: {
        Args: {
          p_commit_24m?: boolean
          p_early_member?: boolean
          p_expires_in_days?: number
          p_extended_access?: boolean
          p_profile_id: string
          p_pt_session_id?: string
          p_slug: string
          p_waive_signup_fee?: boolean
        }
        Returns: Json
      }
      admin_flag_resume_blocked: {
        Args: { p_membership_id: string; p_reason?: string }
        Returns: Json
      }
      admin_pause_membership: {
        Args: {
          p_membership_id: string
          p_pause_effective_date: string
          p_pause_request_id?: string
          p_reason?: string
        }
        Returns: Json
      }
      admin_plan_pt_program: {
        Args: {
          p_intake_start_at?: string
          p_payment_mode?: string
          p_profile_id: string
          p_second_start_at?: string
          p_start_at: string
          p_trainer_id: string
          p_type: string
        }
        Returns: Json
      }
      admin_preview_day_cancellation: {
        Args: { p_date: string }
        Returns: Json
      }
      admin_replace_session_trainer: {
        Args: {
          p_pillar_warning_overridden?: boolean
          p_session_id: string
          p_trainer_id: string
        }
        Returns: Json
      }
      admin_reschedule_class_session: {
        Args: {
          p_duration_min?: number
          p_new_start_at: string
          p_session_id: string
        }
        Returns: Json
      }
      admin_resume_membership: {
        Args: {
          p_membership_id: string
          p_new_subscription_id: string
          p_resume_date?: string
        }
        Returns: Json
      }
      admin_undo_cancellation: {
        Args: { p_membership_id: string }
        Returns: Json
      }
      anonymise_profile: { Args: { p_profile_id: string }; Returns: Json }
      apply_credit_adjustment: {
        Args: {
          p_actor_id?: string
          p_actor_type: string
          p_booking_id?: string
          p_booking_source?: string
          p_delta: number
          p_membership_id: string
          p_reason: string
          p_source: string
        }
        Returns: Json
      }
      audit_actor_label: { Args: { p_profile_id: string }; Returns: string }
      auth_user_id_for_email: { Args: { p_email: string }; Returns: string }
      book_class_session: {
        Args: {
          p_session_id: string
          p_slot_minutes?: number
          p_slot_start_at?: string
        }
        Returns: Json
      }
      book_guest_session: {
        Args: {
          p_guest_email: string
          p_guest_name: string
          p_guest_pass_id: string
          p_session_id: string
        }
        Returns: Json
      }
      book_opening_trial: {
        Args: {
          p_email: string
          p_is_test?: boolean
          p_name: string
          p_phone_e164: string
          p_session_id: string
          p_slot_start_at?: string
        }
        Returns: Json
      }
      booking_gate: {
        Args: {
          p_for_waitlist: boolean
          p_session_id: string
          p_slot_minutes: number
          p_slot_start_at: string
          p_uid: string
        }
        Returns: Record<string, unknown>
      }
      cancel_checkout_intent: {
        Args: { p_intent_id: string; p_mollie_payment_id: string }
        Returns: Json
      }
      cancel_class_booking: { Args: { p_booking_id: string }; Returns: Json }
      cancel_class_session_core: {
        Args: { p_actor_id: string; p_reason: string; p_session_id: string }
        Returns: Json
      }
      cancel_membership_change_request: {
        Args: { p_request_id: string }
        Returns: Json
      }
      cancel_pt: {
        Args: { p_pt_booking_id: string; p_with_restitution?: boolean }
        Returns: Json
      }
      cancel_pt_intake: { Args: { p_pt_session_id: string }; Returns: Json }
      cancel_trial_booking_core: {
        Args: {
          p_actor_id: string
          p_actor_type: string
          p_id: string
          p_reason: string
          p_refund: boolean
        }
        Returns: Json
      }
      checkout_intent_for_retry: {
        Args: { p_status_token: string }
        Returns: Json
      }
      checkout_intent_status: {
        Args: { p_status_token: string }
        Returns: Json
      }
      cleanup_expired_strikes: { Args: never; Returns: number }
      clear_staff_pin: { Args: { p_profile_id: string }; Returns: undefined }
      complete_pt_intake: { Args: { p_pt_session_id: string }; Returns: Json }
      complete_workout_session: {
        Args: { p_session_id: string }
        Returns: Json
      }
      consume_checkout_login_token: {
        Args: { p_login_token: string }
        Returns: Json
      }
      convert_checkout_intent: {
        Args: {
          p_intent_id: string
          p_mollie_payment_id: string
          p_paid_at: string
          p_profile_created: boolean
          p_profile_id: string
        }
        Returns: Json
      }
      create_checkout_intent: {
        Args: {
          p_acquisition?: Json
          p_city: string
          p_commit_24m: boolean
          p_early_member: boolean
          p_email: string
          p_extended_access: boolean
          p_first_name: string
          p_ga_client_id?: string
          p_ga_session_id?: string
          p_last_name: string
          p_mode: string
          p_phone: string
          p_postal_code: string
          p_return_target?: string
          p_slug: string
          p_street_address: string
        }
        Returns: Json
      }
      create_order: {
        Args: {
          p_class_session_id?: string
          p_commit_24m?: boolean
          p_early_member?: boolean
          p_extended_access?: boolean
          p_pt_session_id?: string
          p_slug: string
        }
        Returns: Json
      }
      create_pt_block: {
        Args: {
          p_allow_no_turnaround?: boolean
          p_allow_overlap?: boolean
          p_end_at: string
          p_note?: string
          p_start_at: string
          p_trainer_id?: string
        }
        Returns: Json
      }
      create_trial_code: {
        Args: {
          p_code: string
          p_label: string
          p_max_uses: number
          p_scope?: string
        }
        Returns: Json
      }
      create_trial_codes_batch: {
        Args: {
          p_count: number
          p_label: string
          p_max_uses: number
          p_scope: string
        }
        Returns: Json
      }
      current_user_role: { Args: never; Returns: string }
      delete_pt_block: { Args: { p_pt_session_id: string }; Returns: Json }
      duplicate_training_program: {
        Args: { p_program_id: string }
        Returns: string
      }
      expire_checkout_intents: { Args: never; Returns: number }
      fail_checkout_intent: {
        Args: { p_error_code: string; p_intent_id: string; p_paid_at?: string }
        Returns: Json
      }
      finalize_invoice: {
        Args: { p_invoice_id: string; p_issued_at?: string }
        Returns: Json
      }
      get_admin_kpis: {
        Args: never
        Returns: {
          active_members: number | null
          active_pauses: number | null
          churn_30d: number | null
          crowdfunding_converted_members: number | null
          crowdfunding_total_backers: number | null
          fill_rate_week_pct: number | null
          mrr_cents: number | null
          new_signups_month: number | null
          new_signups_week: number | null
          no_show_rate_30d_pct: number | null
          refreshed_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "vw_admin_kpis"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_campaign_deadline: { Args: never; Returns: string }
      get_campaign_window: { Args: never; Returns: Json }
      get_cancellation_notice_days: { Args: never; Returns: number }
      get_pt_busy: {
        Args: { p_from: string; p_to: string; p_trainer_id: string }
        Returns: {
          blocked_from: string
          blocked_until: string
          end_at: string
          kind: string
          pt_session_id: string
          start_at: string
        }[]
      }
      get_remaining_guest_passes: {
        Args: { p_profile_id: string }
        Returns: number
      }
      has_own_pt_booking: { Args: { p_session_id: string }; Returns: boolean }
      increment_cf_stats:
        | {
            Args: { p_amount: number }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: tmc.increment_cf_stats(p_amount => int4), tmc.increment_cf_stats(p_amount => numeric). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
        | {
            Args: { p_amount: number }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: tmc.increment_cf_stats(p_amount => int4), tmc.increment_cf_stats(p_amount => numeric). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
      increment_cf_tier_slot: {
        Args: { p_tier_id: string }
        Returns: undefined
      }
      is_admin: { Args: never; Returns: boolean }
      is_pt_trainer_for: { Args: { p_trainer_id?: string }; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      is_staff_profile: { Args: { p_profile_id: string }; Returns: boolean }
      is_trainer: { Args: never; Returns: boolean }
      join_waitlist: { Args: { p_session_id: string }; Returns: Json }
      leave_waitlist: { Args: { p_entry_id: string }; Returns: Json }
      list_stale_pending_checkout_intents: {
        Args: { p_limit?: number; p_older_than?: string }
        Returns: {
          id: string
          mode: string
          mollie_payment_id: string
        }[]
      }
      log_set: {
        Args: {
          p_notes?: string
          p_program_exercise_id: string
          p_reps: number
          p_session_id: string
          p_set_number: number
          p_weight_kg: number
        }
        Returns: Json
      }
      mark_checkout_intent_pending: {
        Args: {
          p_intent_id: string
          p_mollie_customer_id: string
          p_mollie_payment_id: string
        }
        Returns: Json
      }
      mark_pt_attendance: {
        Args: { p_pt_booking_id: string; p_status: string }
        Returns: Json
      }
      my_waitlist_entries: {
        Args: never
        Returns: {
          confirmation_deadline: string
          created_at: string
          entry_id: string
          position: number
          promoted_at: string
          rank: number
          session_id: string
          state: string
        }[]
      }
      plan_covers: {
        Args: { p_pillar: string; p_plan_type: string }
        Returns: boolean
      }
      process_due_membership_change_requests: { Args: never; Returns: Json }
      process_due_membership_pauses: { Args: never; Returns: Json }
      promote_waitlist_entries: { Args: never; Returns: Json }
      pt_check_slot: {
        Args: {
          p_check_overlap?: boolean
          p_check_turnaround?: boolean
          p_end: string
          p_exclude_session?: string
          p_start: string
          p_trainer_id: string
          p_turnaround_min: number
        }
        Returns: string
      }
      pt_trainer_settings: {
        Args: { p_trainer_id: string }
        Returns: {
          cancel_window_hours: number
          session_duration_min: number
          turnaround_min: number
        }[]
      }
      redeem_trial_code: {
        Args: {
          p_code: string
          p_email: string
          p_is_test?: boolean
          p_name: string
          p_phone: string
          p_session_id: string
          p_slot_start_at?: string
        }
        Returns: Json
      }
      refresh_admin_kpis: { Args: never; Returns: undefined }
      register_kiosk_pin_attempt: {
        Args: { p_device_id: string; p_profile_id: string }
        Returns: Json
      }
      register_opening_trial_attempt: { Args: { p_ip: string }; Returns: Json }
      register_trial_code_attempt: { Args: { p_ip: string }; Returns: Json }
      replace_checkout_intent_payment: {
        Args: {
          p_intent_id: string
          p_new_payment_id: string
          p_old_payment_id: string
        }
        Returns: Json
      }
      request_membership_cancellation: {
        Args: { p_membership_id: string }
        Returns: {
          cancellation_effective_date: string
          cancellation_requested_at: string
          id: string
          status: string
        }[]
      }
      request_membership_change: {
        Args: {
          p_effective_date: string
          p_extended_access: boolean
          p_membership_id: string
          p_target_slug: string
        }
        Returns: Json
      }
      request_pt_cancellation: {
        Args: { p_pt_booking_id: string; p_reason?: string }
        Returns: Json
      }
      reschedule_pt: {
        Args: {
          p_allow_no_turnaround?: boolean
          p_allow_overlap?: boolean
          p_new_start_at: string
          p_pt_booking_id: string
        }
        Returns: Json
      }
      resolve_pt_cancellation: {
        Args: {
          p_approve: boolean
          p_note?: string
          p_request_id: string
          p_with_restitution?: boolean
        }
        Returns: Json
      }
      revoke_trial_code: { Args: { p_id: string }; Returns: Json }
      rotate_checkout_login_token: {
        Args: { p_intent_id: string }
        Returns: Json
      }
      session_occupancy: {
        Args: { p_exclude_profile?: string; p_session_id: string }
        Returns: number
      }
      sessions_with_participants: {
        Args: { p_session_ids: string[] }
        Returns: string[]
      }
      set_staff_pin: {
        Args: { p_pin: string; p_profile_id: string }
        Returns: number
      }
      start_workout_session: { Args: { p_day_id: string }; Returns: Json }
      submit_health_intake: {
        Args: { p_health_notes: string }
        Returns: undefined
      }
      system_cancel_trial_booking: {
        Args: { p_id: string; p_reason: string }
        Returns: Json
      }
      verify_staff_pin: {
        Args: { p_pin: string; p_profile_id: string }
        Returns: Json
      }
      visitor_cancel_trial_booking: { Args: { p_token: string }; Returns: Json }
      vrij_trainen_availability: {
        Args: { p_date: string }
        Returns: {
          available: number
          blocked: boolean
          booked: number
          quarter_start: string
          session_id: string
        }[]
      }
      vrij_trainen_opening_availability: {
        Args: { p_from: string; p_is_test?: boolean; p_to: string }
        Returns: {
          available: number
          blocked: boolean
          booked: number
          opening_available: number
          opening_booked: number
          quarter_start: string
          session_id: string
        }[]
      }
      vrij_trainen_slot_peak: {
        Args: {
          p_end: string
          p_exclude_booking_id?: string
          p_session_id: string
          p_start: string
        }
        Returns: {
          blocked: boolean
          peak: number
        }[]
      }
      vrij_trainen_trainer_present: {
        Args: { p_end: string; p_start: string }
        Returns: boolean
      }
      vrij_trainen_visitor_availability: {
        Args: { p_from: string; p_to: string }
        Returns: {
          available: number
          blocked: boolean
          booked: number
          quarter_start: string
          session_id: string
        }[]
      }
      waitlist_confirmation_deadline: {
        Args: { p_minutes: number; p_now: string; p_start_at: string }
        Returns: string
      }
      wipe_stale_checkout_intent_pii: {
        Args: { p_older_than?: string }
        Returns: number
      }
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
  tmc: {
    Enums: {},
  },
} as const
