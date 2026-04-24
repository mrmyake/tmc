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
      admin_audit_log: {
        Row: {
          action: string
          admin_id: string
          created_at: string
          details: Json | null
          id: string
          target_id: string
          target_type: string
        }
        Insert: {
          action: string
          admin_id: string
          created_at?: string
          details?: Json | null
          id?: string
          target_id: string
          target_type: string
        }
        Update: {
          action?: string
          admin_id?: string
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
          admin_checkin_pin_hash: string | null
          booking_window_days: number
          cancellation_window_hours: number
          check_in_enabled: boolean
          check_in_pillars: string[]
          check_in_required_for_cap: boolean
          drop_in_kettlebell_cents: number
          drop_in_kids_cents: number
          drop_in_senior_cents: number
          drop_in_yoga_cents: number
          fair_use_daily_max: number
          id: string
          kids_ten_ride_card_cents: number
          member_pt_discount_percent: number
          no_show_block_days: number
          no_show_release_minutes: number
          no_show_strike_threshold: number
          no_show_strike_window_days: number
          pt_intake_discount_cents: number
          registration_fee_cents: number
          senior_ten_ride_card_cents: number
          ten_ride_card_cents: number
          ten_ride_card_crowdfunding_cents: number
          ten_ride_card_validity_months: number
          updated_at: string
          vrij_trainen_cancel_window_minutes: number
          waitlist_confirmation_minutes: number
        }
        Insert: {
          admin_checkin_pin_hash?: string | null
          booking_window_days?: number
          cancellation_window_hours?: number
          check_in_enabled?: boolean
          check_in_pillars?: string[]
          check_in_required_for_cap?: boolean
          drop_in_kettlebell_cents?: number
          drop_in_kids_cents?: number
          drop_in_senior_cents?: number
          drop_in_yoga_cents?: number
          fair_use_daily_max?: number
          id?: string
          kids_ten_ride_card_cents?: number
          member_pt_discount_percent?: number
          no_show_block_days?: number
          no_show_release_minutes?: number
          no_show_strike_threshold?: number
          no_show_strike_window_days?: number
          pt_intake_discount_cents?: number
          registration_fee_cents?: number
          senior_ten_ride_card_cents?: number
          ten_ride_card_cents?: number
          ten_ride_card_crowdfunding_cents?: number
          ten_ride_card_validity_months?: number
          updated_at?: string
          vrij_trainen_cancel_window_minutes?: number
          waitlist_confirmation_minutes?: number
        }
        Update: {
          admin_checkin_pin_hash?: string | null
          booking_window_days?: number
          cancellation_window_hours?: number
          check_in_enabled?: boolean
          check_in_pillars?: string[]
          check_in_required_for_cap?: boolean
          drop_in_kettlebell_cents?: number
          drop_in_kids_cents?: number
          drop_in_senior_cents?: number
          drop_in_yoga_cents?: number
          fair_use_daily_max?: number
          id?: string
          kids_ten_ride_card_cents?: number
          member_pt_discount_percent?: number
          no_show_block_days?: number
          no_show_release_minutes?: number
          no_show_strike_threshold?: number
          no_show_strike_window_days?: number
          pt_intake_discount_cents?: number
          registration_fee_cents?: number
          senior_ten_ride_card_cents?: number
          ten_ride_card_cents?: number
          ten_ride_card_crowdfunding_cents?: number
          ten_ride_card_validity_months?: number
          updated_at?: string
          vrij_trainen_cancel_window_minutes?: number
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
          pillar: string
          profile_id: string
          reminder_sent_at: string | null
          rental_mat: boolean
          rental_towel: boolean
          session_date: string
          session_id: string
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
          pillar: string
          profile_id: string
          reminder_sent_at?: string | null
          rental_mat?: boolean
          rental_towel?: boolean
          session_date: string
          session_id: string
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
          pillar?: string
          profile_id?: string
          reminder_sent_at?: string | null
          rental_mat?: boolean
          rental_towel?: boolean
          session_date?: string
          session_id?: string
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
            foreignKeyName: "bookings_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "v_active_memberships"
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
          cancellation_reason: string | null
          capacity: number
          class_type_id: string
          created_at: string
          end_at: string
          id: string
          notes: string | null
          pillar: string
          start_at: string
          status: string
          template_id: string | null
          trainer_id: string
          updated_at: string
        }
        Insert: {
          age_category: string
          cancellation_reason?: string | null
          capacity: number
          class_type_id: string
          created_at?: string
          end_at: string
          id?: string
          notes?: string | null
          pillar: string
          start_at: string
          status?: string
          template_id?: string | null
          trainer_id: string
          updated_at?: string
        }
        Update: {
          age_category?: string
          cancellation_reason?: string | null
          capacity?: number
          class_type_id?: string
          created_at?: string
          end_at?: string
          id?: string
          notes?: string | null
          pillar?: string
          start_at?: string
          status?: string
          template_id?: string | null
          trainer_id?: string
          updated_at?: string
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
        ]
      }
      class_types: {
        Row: {
          age_category: string
          default_capacity: number
          default_duration_minutes: number
          description: string | null
          id: string
          is_active: boolean
          name: string
          pillar: string
          sanity_id: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          age_category: string
          default_capacity: number
          default_duration_minutes?: number
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          pillar: string
          sanity_id?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          age_category?: string
          default_capacity?: number
          default_duration_minutes?: number
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          pillar?: string
          sanity_id?: string | null
          slug?: string
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
            foreignKeyName: "guest_passes_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "v_active_memberships"
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
      membership_pauses: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          end_date: string
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
          end_date: string
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
          end_date?: string
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
            foreignKeyName: "membership_pauses_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "v_active_memberships"
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
      membership_plan_catalogue: {
        Row: {
          age_category: string
          billing_cycle_weeks: number
          commit_months: number
          covered_pillars: string[]
          display_name: string
          display_order: number
          frequency_cap: number | null
          id: string
          includes: string[]
          is_active: boolean
          is_highlighted: boolean
          plan_type: string
          plan_variant: string
          price_per_cycle_cents: number
          sanity_id: string | null
          updated_at: string
        }
        Insert: {
          age_category: string
          billing_cycle_weeks?: number
          commit_months?: number
          covered_pillars?: string[]
          display_name: string
          display_order?: number
          frequency_cap?: number | null
          id?: string
          includes?: string[]
          is_active?: boolean
          is_highlighted?: boolean
          plan_type: string
          plan_variant: string
          price_per_cycle_cents: number
          sanity_id?: string | null
          updated_at?: string
        }
        Update: {
          age_category?: string
          billing_cycle_weeks?: number
          commit_months?: number
          covered_pillars?: string[]
          display_name?: string
          display_order?: number
          frequency_cap?: number | null
          id?: string
          includes?: string[]
          is_active?: boolean
          is_highlighted?: boolean
          plan_type?: string
          plan_variant?: string
          price_per_cycle_cents?: number
          sanity_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      memberships: {
        Row: {
          age_category: string
          billing_cycle_weeks: number
          cancellation_effective_date: string | null
          cancellation_requested_at: string | null
          commit_end_date: string
          commit_months: number
          covered_pillars: string[]
          created_at: string
          credits_expires_at: string | null
          credits_remaining: number | null
          credits_total: number | null
          crowdfunding_tier_id: string | null
          end_date: string | null
          frequency_cap: number | null
          id: string
          lock_in_active: boolean
          lock_in_expired_at: string | null
          lock_in_price_cents: number | null
          lock_in_source: string | null
          mollie_customer_id: string | null
          mollie_subscription_id: string | null
          notes: string | null
          plan_type: string
          plan_variant: string | null
          price_per_cycle_cents: number
          profile_id: string
          registration_fee_paid: boolean
          source: string
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          age_category?: string
          billing_cycle_weeks?: number
          cancellation_effective_date?: string | null
          cancellation_requested_at?: string | null
          commit_end_date: string
          commit_months?: number
          covered_pillars?: string[]
          created_at?: string
          credits_expires_at?: string | null
          credits_remaining?: number | null
          credits_total?: number | null
          crowdfunding_tier_id?: string | null
          end_date?: string | null
          frequency_cap?: number | null
          id?: string
          lock_in_active?: boolean
          lock_in_expired_at?: string | null
          lock_in_price_cents?: number | null
          lock_in_source?: string | null
          mollie_customer_id?: string | null
          mollie_subscription_id?: string | null
          notes?: string | null
          plan_type: string
          plan_variant?: string | null
          price_per_cycle_cents: number
          profile_id: string
          registration_fee_paid?: boolean
          source?: string
          start_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          age_category?: string
          billing_cycle_weeks?: number
          cancellation_effective_date?: string | null
          cancellation_requested_at?: string | null
          commit_end_date?: string
          commit_months?: number
          covered_pillars?: string[]
          created_at?: string
          credits_expires_at?: string | null
          credits_remaining?: number | null
          credits_total?: number | null
          crowdfunding_tier_id?: string | null
          end_date?: string | null
          frequency_cap?: number | null
          id?: string
          lock_in_active?: boolean
          lock_in_expired_at?: string | null
          lock_in_price_cents?: number | null
          lock_in_source?: string | null
          mollie_customer_id?: string | null
          mollie_subscription_id?: string | null
          notes?: string | null
          plan_type?: string
          plan_variant?: string | null
          price_per_cycle_cents?: number
          profile_id?: string
          registration_fee_paid?: boolean
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
      payments: {
        Row: {
          amount_cents: number
          booking_id: string | null
          created_at: string
          description: string | null
          id: string
          membership_id: string | null
          method: string | null
          mollie_payment_id: string
          mollie_subscription_id: string | null
          paid_at: string | null
          profile_id: string | null
          pt_booking_id: string | null
          status: string
        }
        Insert: {
          amount_cents: number
          booking_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          membership_id?: string | null
          method?: string | null
          mollie_payment_id: string
          mollie_subscription_id?: string | null
          paid_at?: string | null
          profile_id?: string | null
          pt_booking_id?: string | null
          status: string
        }
        Update: {
          amount_cents?: number
          booking_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          membership_id?: string | null
          method?: string | null
          mollie_payment_id?: string
          mollie_subscription_id?: string | null
          paid_at?: string | null
          profile_id?: string | null
          pt_booking_id?: string | null
          status?: string
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
            foreignKeyName: "payments_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "v_active_memberships"
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
          country: string
          created_at: string
          date_of_birth: string | null
          email: string
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          first_name: string
          first_touch_at: string | null
          has_used_pt_intake_discount: boolean
          health_intake_completed_at: string | null
          health_notes: string | null
          id: string
          last_name: string
          locale: string
          marketing_opt_in: boolean
          member_code: string
          phone: string
          postal_code: string | null
          role: string
          signup_path: string | null
          street_address: string | null
          updated_at: string
        }
        Insert: {
          acquisition_campaign?: string | null
          acquisition_content?: string | null
          acquisition_medium?: string | null
          acquisition_source?: string | null
          age_category?: string
          avatar_url?: string | null
          city?: string | null
          country?: string
          created_at?: string
          date_of_birth?: string | null
          email: string
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          first_name: string
          first_touch_at?: string | null
          has_used_pt_intake_discount?: boolean
          health_intake_completed_at?: string | null
          health_notes?: string | null
          id: string
          last_name: string
          locale?: string
          marketing_opt_in?: boolean
          member_code: string
          phone: string
          postal_code?: string | null
          role?: string
          signup_path?: string | null
          street_address?: string | null
          updated_at?: string
        }
        Update: {
          acquisition_campaign?: string | null
          acquisition_content?: string | null
          acquisition_medium?: string | null
          acquisition_source?: string | null
          age_category?: string
          avatar_url?: string | null
          city?: string | null
          country?: string
          created_at?: string
          date_of_birth?: string | null
          email?: string
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          first_name?: string
          first_touch_at?: string | null
          has_used_pt_intake_discount?: boolean
          health_intake_completed_at?: string | null
          health_notes?: string | null
          id?: string
          last_name?: string
          locale?: string
          marketing_opt_in?: boolean
          member_code?: string
          phone?: string
          postal_code?: string | null
          role?: string
          signup_path?: string | null
          street_address?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pt_bookings: {
        Row: {
          booked_at: string
          cancelled_at: string | null
          credits_used_from: string | null
          id: string
          is_intake_discount: boolean
          mollie_payment_id: string | null
          price_paid_cents: number
          profile_id: string
          pt_session_id: string
          status: string
        }
        Insert: {
          booked_at?: string
          cancelled_at?: string | null
          credits_used_from?: string | null
          id?: string
          is_intake_discount?: boolean
          mollie_payment_id?: string | null
          price_paid_cents: number
          profile_id: string
          pt_session_id: string
          status?: string
        }
        Update: {
          booked_at?: string
          cancelled_at?: string | null
          credits_used_from?: string | null
          id?: string
          is_intake_discount?: boolean
          mollie_payment_id?: string | null
          price_paid_cents?: number
          profile_id?: string
          pt_session_id?: string
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
            foreignKeyName: "pt_bookings_credits_used_from_fkey"
            columns: ["credits_used_from"]
            isOneToOne: false
            referencedRelation: "v_active_memberships"
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
      pt_sessions: {
        Row: {
          capacity: number
          created_at: string
          end_at: string
          format: string
          id: string
          notes: string | null
          start_at: string
          status: string
          trainer_id: string
          updated_at: string
        }
        Insert: {
          capacity: number
          created_at?: string
          end_at: string
          format: string
          id?: string
          notes?: string | null
          start_at: string
          status?: string
          trainer_id: string
          updated_at?: string
        }
        Update: {
          capacity?: number
          created_at?: string
          end_at?: string
          format?: string
          id?: string
          notes?: string | null
          start_at?: string
          status?: string
          trainer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pt_sessions_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_templates: {
        Row: {
          capacity: number
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
          capacity: number
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
          capacity?: number
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
    }
    Views: {
      v_active_memberships: {
        Row: {
          age_category: string | null
          billing_cycle_weeks: number | null
          cancellation_effective_date: string | null
          cancellation_requested_at: string | null
          commit_end_date: string | null
          commit_months: number | null
          covered_pillars: string[] | null
          created_at: string | null
          credits_expires_at: string | null
          credits_remaining: number | null
          credits_total: number | null
          crowdfunding_tier_id: string | null
          end_date: string | null
          frequency_cap: number | null
          id: string | null
          lock_in_active: boolean | null
          lock_in_expired_at: string | null
          lock_in_price_cents: number | null
          lock_in_source: string | null
          mollie_customer_id: string | null
          mollie_subscription_id: string | null
          notes: string | null
          plan_type: string | null
          plan_variant: string | null
          price_per_cycle_cents: number | null
          profile_id: string | null
          registration_fee_paid: boolean | null
          source: string | null
          start_date: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          age_category?: string | null
          billing_cycle_weeks?: number | null
          cancellation_effective_date?: string | null
          cancellation_requested_at?: string | null
          commit_end_date?: string | null
          commit_months?: number | null
          covered_pillars?: string[] | null
          created_at?: string | null
          credits_expires_at?: string | null
          credits_remaining?: number | null
          credits_total?: number | null
          crowdfunding_tier_id?: string | null
          end_date?: string | null
          frequency_cap?: number | null
          id?: string | null
          lock_in_active?: boolean | null
          lock_in_expired_at?: string | null
          lock_in_price_cents?: number | null
          lock_in_source?: string | null
          mollie_customer_id?: string | null
          mollie_subscription_id?: string | null
          notes?: string | null
          plan_type?: string | null
          plan_variant?: string | null
          price_per_cycle_cents?: number | null
          profile_id?: string | null
          registration_fee_paid?: boolean | null
          source?: string | null
          start_date?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          age_category?: string | null
          billing_cycle_weeks?: number | null
          cancellation_effective_date?: string | null
          cancellation_requested_at?: string | null
          commit_end_date?: string | null
          commit_months?: number | null
          covered_pillars?: string[] | null
          created_at?: string | null
          credits_expires_at?: string | null
          credits_remaining?: number | null
          credits_total?: number | null
          crowdfunding_tier_id?: string | null
          end_date?: string | null
          frequency_cap?: number | null
          id?: string | null
          lock_in_active?: boolean | null
          lock_in_expired_at?: string | null
          lock_in_price_cents?: number | null
          lock_in_source?: string | null
          mollie_customer_id?: string | null
          mollie_subscription_id?: string | null
          notes?: string | null
          plan_type?: string | null
          plan_variant?: string | null
          price_per_cycle_cents?: number | null
          profile_id?: string | null
          registration_fee_paid?: boolean | null
          source?: string | null
          start_date?: string | null
          status?: string | null
          updated_at?: string | null
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
      v_weekly_bookings: {
        Row: {
          booking_count: number | null
          iso_week: number | null
          iso_year: number | null
          pillar: string | null
          profile_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      cleanup_expired_strikes: { Args: never; Returns: number }
      current_user_role: { Args: never; Returns: string }
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
      get_remaining_guest_passes: {
        Args: { p_profile_id: string }
        Returns: number
      }
      increment_cf_stats:
        | {
            Args: { p_amount: number }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.increment_cf_stats(p_amount => int4), public.increment_cf_stats(p_amount => numeric). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
        | {
            Args: { p_amount: number }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.increment_cf_stats(p_amount => int4), public.increment_cf_stats(p_amount => numeric). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
      increment_cf_tier_slot: {
        Args: { p_tier_id: string }
        Returns: undefined
      }
      is_admin: { Args: never; Returns: boolean }
      is_trainer: { Args: never; Returns: boolean }
      refresh_admin_kpis: { Args: never; Returns: undefined }
      set_admin_checkin_pin: { Args: { p_pin: string }; Returns: undefined }
      verify_admin_checkin_pin: { Args: { p_pin: string }; Returns: boolean }
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
