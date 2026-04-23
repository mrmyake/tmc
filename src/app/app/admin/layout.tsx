import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminShell } from "./_components/AdminShell";

export const dynamic = "force-dynamic";

/**
 * Autorisatie-guard voor `/app/admin/*`. Non-admins worden naar
 * `/app/rooster` geredirect (spec §8) ipv 404 — consistent met de
 * rest van de role-based routing.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, first_name")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "admin") {
    redirect("/app/rooster");
  }

  const firstName =
    profile.first_name?.trim() || user.email?.split("@")[0] || "Admin";

  return <AdminShell firstName={firstName}>{children}</AdminShell>;
}
