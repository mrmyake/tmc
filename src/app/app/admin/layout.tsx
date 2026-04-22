import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminShell } from "./_components/AdminShell";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Outer /app layout already redirects anonymous users; if we're here
  // without a user something went wrong. Fall through to 404 for privacy.
  if (!user) notFound();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, first_name")
    .eq("id", user.id)
    .maybeSingle();

  // Spec: non-admins see 404, not 403. No signal that an admin area exists.
  if (!profile || profile.role !== "admin") {
    notFound();
  }

  const firstName =
    profile.first_name?.trim() || user.email?.split("@")[0] || "Admin";

  return <AdminShell firstName={firstName}>{children}</AdminShell>;
}
