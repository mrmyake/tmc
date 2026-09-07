"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "./require-admin";

/** Ledenzoeker voor de handmatige factuur (9.2). Admin-only. */
export async function searchMembersForInvoice(
  query: string,
): Promise<{ id: string; name: string; email: string }[]> {
  const auth = await requireAdmin();
  if (!auth.ok) return [];
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("id, first_name, last_name, email")
    .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,email.ilike.%${query}%`)
    .limit(8);
  return (data ?? []).map((p) => ({
    id: p.id,
    name: `${p.first_name} ${p.last_name}`.trim(),
    email: p.email,
  }));
}
