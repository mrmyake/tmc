import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CustomerProfile } from "./customer-core";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string | undefined): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/**
 * Haalt een klantprofiel op id voor server components (betaalverzoek-wizard
 * met voorgeselecteerde klant). Bewust geen "use server": dit is geen
 * endpoint. De aanroeper doet zelf eerst requireAdmin(), want deze functie
 * leest via de service-role-client.
 */
export async function getCustomerProfileById(
  id: string,
): Promise<CustomerProfile | null> {
  if (!isUuid(id)) return null;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id, first_name, last_name, email, member_code, role")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    firstName: data.first_name,
    lastName: data.last_name,
    email: data.email,
    memberCode: data.member_code,
    role: data.role,
  };
}
