import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function isSupabaseConfigured(): boolean {
  return Boolean(url && anonKey);
}

export function getPublicClient(): SupabaseClient | null {
  if (!url || !anonKey) return null;
  return createClient(url, anonKey, {
    auth: { persistSession: false },
  });
}

export function getAdminClient(): SupabaseClient | null {
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}

export interface CrowdfundingStats {
  total_raised: number;
  total_backers: number;
}

export interface CrowdfundingTierSlots {
  id: string;
  slots_claimed: number;
}

export interface CrowdfundingBacker {
  id: string;
  created_at: string;
  tier_id: string;
  tier_name: string;
  amount: number;
  name: string;
  show_on_wall: boolean;
  payment_status: string;
}
