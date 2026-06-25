import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const schema = process.env.DB_SCHEMA ?? "tmc";

// Storage buckets are prefixed per app: `tmc-*`.
export const BUCKETS = {
  avatars: `${schema}-avatars`,
  attestations: `${schema}-medical-attestations`,
} as const;

export function isSupabaseConfigured(): boolean {
  return Boolean(url && serviceKey);
}

// Server-only. RLS is deny-all now, so even "public" reads use the service-role
// key (e.g. the crowdfunding wall). Never import this into a client component.
export function getPublicClient(): SupabaseClient | null {
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    db: { schema },
    auth: { persistSession: false },
  }) as unknown as SupabaseClient;
}

export function getAdminClient(): SupabaseClient | null {
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    db: { schema },
    auth: { persistSession: false },
  }) as unknown as SupabaseClient;
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
